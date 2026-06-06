const { app, BrowserWindow, ipcMain, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// 核心模块
const { StateMachine, STATES } = require('./src/state-machine');
const ProcessBlocker = require('./src/process-blocker');
const HostsFilter = require('./src/hosts-filter');
const ConditionChecker = require('./src/condition-checker');

// 持久化存储
const store = new Store({
  name: 'config',
  defaults: {
    config: {
      conditionType: 'command',
      condition: {
        type: 'command',
        command: 'echo "Hello"',
        expectedExitCode: 0,
        workingDir: process.cwd()
      },
      processBlacklist: ['steam.exe', 'WeChat.exe', 'Douyin.exe'],
      siteBlacklist: ['bilibili.com', 'douyin.com', 'zhihu.com', 'weibo.com'],
      conditionCheckInterval: 5  // 秒
    }
  }
});

// 状态机实例
const stateMachine = new StateMachine();

// 窗口引用
let mainWindow = null;
let lockOverlay = null;

// 反作弊防护
let stopContinuousHostsBlock = null;
let hostBlockInterval = null;

// ==================== 窗口管理 ====================

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 650,
    minWidth: 700,
    minHeight: 500,
    title: 'Procrastination Trap',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false,
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, 'pages', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 锁机中禁止关闭窗口
  mainWindow.on('close', (e) => {
    if (!stateMachine.canClose()) {
      e.preventDefault();
      // 最小化到托盘而非关闭
      mainWindow.minimize();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/**
 * 创建全屏锁机覆盖窗口
 */
function createLockOverlay() {
  if (lockOverlay) return lockOverlay;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  lockOverlay = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    fullscreen: true,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    backgroundColor: '#0a0a1a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  // 通过 data URL 加载覆盖层 HTML
  const overlayHTML = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { background:#0a0a1a; color:#fff; font-family:"Microsoft YaHei",sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh; user-select:none; -webkit-user-select:none; }
      .lock-icon { font-size:80px; margin-bottom:20px; }
      .title { font-size:36px; font-weight:bold; margin-bottom:10px; }
      .subtitle { font-size:16px; color:#888; margin-bottom:30px; }
      .condition-box { background:#1a1a3a; border:1px solid #333; border-radius:12px; padding:20px 40px; margin-bottom:20px; text-align:center; }
      .condition-box .label { font-size:13px; color:#666; margin-bottom:8px; }
      .condition-box .value { font-size:18px; color:#00d4ff; }
      .stats { display:flex; gap:40px; margin:20px 0; }
      .stat { text-align:center; }
      .stat .num { font-size:28px; font-weight:bold; color:#ff6b6b; }
      .stat .label { font-size:12px; color:#666; margin-top:4px; }
      .time { font-size:14px; color:#555; margin:20px 0; }
      .surrender-btn { margin-top:30px; padding:8px 24px; background:transparent; border:1px solid #444; color:#666; border-radius:6px; cursor:pointer; font-size:13px; }
      .surrender-btn:hover { border-color:#ff4444; color:#ff4444; }
    </style></head>
    <body>
      <div class="lock-icon">🔒</div>
      <div class="title">锁机中</div>
      <div class="subtitle" id="conditionText">等待条件达成...</div>
      <div class="condition-box">
        <div class="label">解锁条件</div>
        <div class="value" id="conditionDetail">--</div>
      </div>
      <div class="stats">
        <div class="stat"><div class="num" id="killCount">0</div><div class="label">拦截进程次数</div></div>
        <div class="stat"><div class="num" id="blockedSites">0</div><div class="label">屏蔽网站数</div></div>
      </div>
      <div class="time" id="elapsedTime">已锁定 0 分钟</div>
      <button class="surrender-btn" id="surrenderBtn" onclick="surrender()">服输模式（等待2小时强制解锁）</button>
      <script>
        const { ipcRenderer } = require('electron');
        
        function updateStats() {
          ipcRenderer.invoke('get-lock-state').then(state => {
            document.getElementById('killCount').textContent = state.totalKills || 0;
            document.getElementById('blockedSites').textContent = state.config?.siteBlacklist?.length || 0;
            const mins = Math.floor((state.elapsedSeconds || 0) / 60);
            document.getElementById('elapsedTime').textContent = '已锁定 ' + mins + ' 分钟';
            
            if (state.config?.condition) {
              const c = state.config.condition;
              let detail = '';
              if (c.type === 'command') detail = '运行: ' + c.command;
              else if (c.type === 'file') detail = '文件达标: ' + c.filePath;
              else if (c.type === 'combined') detail = '组合条件';
              document.getElementById('conditionDetail').textContent = detail;
            }
          });
        }

        function surrender() {
          ipcRenderer.invoke('surrender').then(r => {
            if (r.success) {
              document.getElementById('surrenderBtn').textContent = '服输倒计时: ' + formatTime(r.remainingSeconds);
              document.getElementById('surrenderBtn').disabled = true;
            }
          });
        }

        function formatTime(s) {
          const h = Math.floor(s/3600), m = Math.floor((s%3600)/60), sec = s%60;
          return h+':'+String(m).padStart(2,'0')+':'+String(sec).padStart(2,'0');
        }

        ipcRenderer.on('surrender-countdown', (e, data) => {
          document.getElementById('surrenderBtn').textContent = '服输倒计时: ' + formatTime(data.remainingSeconds);
        });

        ipcRenderer.on('process-killed', (e, data) => {
          updateStats();
        });

        updateStats();
        setInterval(updateStats, 5000);
      </script>
    </body></html>`;

  lockOverlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(overlayHTML)}`);

  lockOverlay.on('close', (e) => {
    if (!stateMachine.canClose()) {
      e.preventDefault();
    }
  });

  lockOverlay.on('closed', () => {
    lockOverlay = null;
  });

  return lockOverlay;
}

function closeLockOverlay() {
  if (lockOverlay) {
    lockOverlay.setClosable(true);
    lockOverlay.close();
    lockOverlay = null;
  }
}

// ==================== IPC 处理 ====================

function setupIPC() {
  // 锁机控制
  ipcMain.handle('start-lock', async (event, config) => {
    console.log('[Main] 开始锁机, 配置:', JSON.stringify(config));

    const result = stateMachine.startLock(config);
    if (!result.success) return result;

    // 启动进程屏蔽
    ProcessBlocker.setBlacklist(config.processBlacklist || []);
    ProcessBlocker.onKill((data) => {
      stateMachine.recordKill(data.name);
      if (mainWindow) mainWindow.webContents.send('process-killed', data);
    });
    ProcessBlocker.startScanning(2000);

    // 启动 hosts 屏蔽
    if (config.siteBlacklist && config.siteBlacklist.length > 0) {
      await HostsFilter.blockDomains(config.siteBlacklist);
      // 持续写入（防手动修改）
      stopContinuousHostsBlock = HostsFilter.startContinuousBlock(config.siteBlacklist, 10000);
    }

    // 启动条件检测定时器
    startConditionPolling(config);

    // 创建全屏锁机覆盖层
    createLockOverlay();

    // 禁用 Alt+F4 (Windows)
    globalShortcut.register('Alt+F4', () => {
      // 锁定状态下忽略
    });

    return result;
  });

  ipcMain.handle('unlock', async () => {
    console.log('[Main] 解锁请求');

    const result = stateMachine.unlock();
    if (result.success) {
      await cleanupLock();
    }
    return result;
  });

  ipcMain.handle('surrender', async () => {
    console.log('[Main] 服输请求');

    const result = stateMachine.startSurrender(2);
    return result;
  });

  ipcMain.handle('get-lock-state', () => {
    return stateMachine.getState();
  });

  // 配置管理
  ipcMain.handle('save-config', (event, config) => {
    store.set('config', config);
    return { success: true };
  });

  ipcMain.handle('load-config', () => {
    return store.get('config');
  });

  // 条件检测
  ipcMain.handle('check-condition', async (event, type, params) => {
    return await ConditionChecker.checkCondition({ type, ...params });
  });

  ipcMain.handle('run-command', async (event, command, cwd) => {
    return await ConditionChecker.checkCommand({ command, workingDir: cwd });
  });

  // 窗口控制
  ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize();
  });

  ipcMain.handle('close-window', () => {
    if (stateMachine.canClose()) {
      app.quit();
    }
  });

  // 进程列表
  ipcMain.handle('get-running-processes', async () => {
    return await ProcessBlocker.getRunningProcesses();
  });

  // 状态机事件转发到渲染进程
  stateMachine.onChange((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('lock-state-changed', data);
    }
    if (lockOverlay && !lockOverlay.isDestroyed() && data.type === 'lock-state-changed') {
      if (data.state === STATES.UNLOCKED) {
        closeLockOverlay();
      }
    }
  });

  // 进程被杀转发到渲染进程
  ProcessBlocker.onKill((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('process-killed', data);
    }
    stateMachine.recordKill(data.name);
  });
}

// ==================== 条件检测轮询 ====================

let conditionPollTimer = null;

function startConditionPolling(config) {
  stopConditionPolling();

  const interval = (config.conditionCheckInterval || 5) * 1000;

  conditionPollTimer = setInterval(async () => {
    if (stateMachine.getState().state !== STATES.LOCKED) {
      stopConditionPolling();
      return;
    }

    try {
      const result = await ConditionChecker.checkCondition(config.condition);
      if (result.success) {
        stateMachine.markConditionMet(result);
        stopConditionPolling();
      }

      // 推送进度到渲染进程
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('condition-progress', result);
      }
    } catch (err) {
      console.error('[Main] 条件检测错误:', err);
    }
  }, interval);

  console.log(`[Main] 条件检测已启动，间隔 ${interval}ms`);
}

function stopConditionPolling() {
  if (conditionPollTimer) {
    clearInterval(conditionPollTimer);
    conditionPollTimer = null;
  }
}

// ==================== 清理 ====================

async function cleanupLock() {
  stopConditionPolling();
  ProcessBlocker.stopScanning();

  if (stopContinuousHostsBlock) {
    stopContinuousHostsBlock();
    stopContinuousHostsBlock = null;
  }

  await HostsFilter.unblockDomains();

  globalShortcut.unregister('Alt+F4');

  closeLockOverlay();
}

// ==================== 应用生命周期 ====================

app.whenReady().then(() => {
  setupIPC();
  createMainWindow();
});

app.on('window-all-closed', () => {
  if (!stateMachine.canClose()) return;
  app.quit();
});

app.on('before-quit', async () => {
  await cleanupLock();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

// 阻止多实例
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
