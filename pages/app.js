/**
 * Procrastination Trap - 渲染进程
 * 拖延症手动挡锁机 - 前端逻辑
 */

// ==================== DOM 工具 ====================
function $(id) {
  return document.getElementById(id);
}

function $$(sel) {
  return document.querySelectorAll(sel);
}

// ==================== 状态管理 ====================
const APP = {
  config: {
    conditionType: 'command',
    condition: {
      type: 'command',
      command: 'echo Hello World',
      expectedExitCode: 0,
      workingDir: ''
    },
    processBlacklist: ['steam.exe', 'WeChat.exe', 'Douyin.exe'],
    siteBlacklist: ['bilibili.com', 'douyin.com', 'zhihu.com', 'weibo.com'],
    conditionCheckInterval: 5
  },
  lockState: null,
  pollingTimer: null
};

// ==================== Toast 通知 ====================
let toastTimer = null;

function showToast(msg, type = '') {
  const toast = $('toast');
  toast.textContent = msg;
  toast.className = 'toast ' + type + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ==================== 页面导航 ====================
function navigateTo(pageName) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = $('page-' + pageName);
  if (page) page.classList.add('active');

  $$('.nav-btn').forEach(b => b.classList.remove('active'));
  const navBtn = document.querySelector(`.nav-btn[data-page="${pageName}"]`);
  if (navBtn) navBtn.classList.add('active');
}

// ==================== 条件类型切换 ====================
function switchConditionTab(type) {
  APP.config.conditionType = type;
  $$('.cond-tab').forEach(t => t.classList.remove('active'));
  $$('.cond-panel').forEach(p => p.classList.remove('active'));

  const tab = document.querySelector(`.cond-tab[data-cond="${type}"]`);
  if (tab) tab.classList.add('active');

  const panel = $('cond-' + type);
  if (panel) panel.classList.add('active');

  // 更新条件配置
  updateConditionConfig();
}

function updateConditionConfig() {
  const type = APP.config.conditionType;
  switch (type) {
    case 'command':
      APP.config.condition = {
        type: 'command',
        command: $('condCommand').value.trim(),
        expectedExitCode: parseInt($('condExitCode').value) || 0,
        workingDir: $('condWorkDir').value.trim()
      };
      break;
    case 'file':
      APP.config.condition = {
        type: 'file',
        filePath: $('condFilePath').value.trim(),
        minWords: parseInt($('condMinWords').value) || 500
      };
      break;
    case 'web':
      APP.config.condition = {
        type: 'web',
        url: $('condWebUrl').value.trim(),
        requiredMinutes: parseInt($('condWebMinutes').value) || 30
      };
      break;
    case 'combined':
      APP.config.condition = {
        type: 'combined',
        operator: $('condCombineOp').value,
        conditions: [
          { type: 'command', command: $('condCommand').value.trim(), expectedExitCode: parseInt($('condExitCode').value) || 0 },
          { type: 'file', filePath: $('condFilePath').value.trim(), minWords: parseInt($('condMinWords').value) || 500 }
        ]
      };
      break;
  }
}

// ==================== 标签管理 ====================
function renderProcessTags() {
  const container = $('processTagList');
  container.innerHTML = APP.config.processBlacklist.map((p, i) =>
    `<span class="tag">${escapeHTML(p)} <button class="tag-remove" data-index="${i}" data-list="process">×</button></span>`
  ).join('');
}

function renderSiteTags() {
  const container = $('siteTagList');
  container.innerHTML = APP.config.siteBlacklist.map((s, i) =>
    `<span class="tag">${escapeHTML(s)} <button class="tag-remove" data-index="${i}" data-list="site">×</button></span>`
  ).join('');
}

function addTag(listName, inputId) {
  const input = $(inputId);
  const value = input.value.trim();
  if (!value) return;

  if (listName === 'processBlacklist') {
    if (!APP.config.processBlacklist.includes(value)) {
      APP.config.processBlacklist.push(value);
      renderProcessTags();
    }
  } else {
    if (!APP.config.siteBlacklist.includes(value)) {
      APP.config.siteBlacklist.push(value);
      renderSiteTags();
    }
  }
  input.value = '';
  saveConfig();
}

function removeTag(listName, index) {
  APP.config[listName].splice(index, 1);
  if (listName === 'processBlacklist') renderProcessTags();
  else renderSiteTags();
  saveConfig();
}

function escapeHTML(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== 配置保存 ====================
async function saveConfig() {
  updateConditionConfig();
  if (window.electronAPI) {
    await window.electronAPI.saveConfig(APP.config);
  }
}

async function loadConfig() {
  if (window.electronAPI) {
    try {
      const saved = await window.electronAPI.loadConfig();
      if (saved) {
        APP.config = { ...APP.config, ...saved };
      }
    } catch (e) {
      console.warn('加载配置失败:', e);
    }
  }

  // 恢复 UI
  $('condCommand').value = APP.config.condition.command || '';
  $('condWorkDir').value = APP.config.condition.workingDir || '';
  $('condExitCode').value = APP.config.condition.expectedExitCode ?? 0;
  $('condFilePath').value = APP.config.condition.filePath || '';
  $('condMinWords').value = APP.config.condition.minWords || 500;
  $('condWebUrl').value = APP.config.condition.url || '';
  $('condWebMinutes').value = APP.config.condition.requiredMinutes || 30;

  renderProcessTags();
  renderSiteTags();
}

// ==================== 锁机操作 ====================
async function startLock() {
  updateConditionConfig();

  if (APP.config.conditionType === 'command' && !APP.config.condition.command) {
    showToast('请设置解锁命令', 'error');
    return;
  }
  if (APP.config.conditionType === 'file' && !APP.config.condition.filePath) {
    showToast('请设置文件路径', 'error');
    return;
  }

  if (!window.electronAPI) {
    showToast('请在 Electron 环境中运行', 'error');
    return;
  }

  const result = await window.electronAPI.startLock(APP.config);
  if (result.success) {
    showToast('🔒 锁机已开始！', 'success');
    $('setupStatus').textContent = '🔒 锁机中...';
    $('setupStatus').className = 'status-badge locked';
    $('btnStartLock').disabled = true;
    $('btnStartLock').textContent = '⏳ 锁机中...';
  } else {
    showToast(result.message || '锁机启动失败', 'error');
  }
}

async function confirmUnlock() {
  if (!window.electronAPI) return;

  const result = await window.electronAPI.unlock();
  if (result.success) {
    $('modalConditionMet').classList.remove('show');
    showUnlockCelebration(result);
    saveHistory(result);
  }
}

function showUnlockCelebration(result) {
  const mins = Math.floor(result.elapsedSeconds / 60);
  const hrs = Math.floor(mins / 60);
  const minsRem = mins % 60;
  const timeStr = hrs > 0 ? `${hrs}小时${minsRem}分钟` : `${mins}分钟`;

  $('unlockElapsed').textContent = timeStr;
  $('unlockKills').textContent = result.totalKills || 0;
  navigateTo('unlocked');
}

async function saveHistory(result) {
  const history = JSON.parse(localStorage.getItem('pt_history') || '[]');
  history.unshift({
    date: new Date().toISOString(),
    elapsedSeconds: result.elapsedSeconds,
    totalKills: result.totalKills,
    condition: APP.config.condition,
    processBlacklist: [...APP.config.processBlacklist],
    siteBlacklist: [...APP.config.siteBlacklist],
    wasSurrender: result.wasSurrender || false
  });
  // 只保留最近50条
  if (history.length > 50) history.length = 50;
  localStorage.setItem('pt_history', JSON.stringify(history));
}

function renderHistory() {
  const container = $('historyList');
  const history = JSON.parse(localStorage.getItem('pt_history') || '[]');

  if (history.length === 0) {
    container.innerHTML = '<p class="empty-state">暂无锁机记录，开始你的第一次锁机吧！</p>';
    return;
  }

  container.innerHTML = history.map(h => {
    const date = new Date(h.date);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
    const mins = Math.floor(h.elapsedSeconds / 60);
    const hrs = Math.floor(mins / 60);
    const minsRem = mins % 60;
    const timeStr = hrs > 0 ? `${hrs}h${minsRem}m` : `${minsRem}m`;
    const conditionStr = h.condition?.type === 'command'
      ? '命令: ' + (h.condition.command || '').substring(0, 30)
      : h.condition?.type === 'file'
        ? '文件: ' + ((h.condition.filePath || '').split('\\').pop() || '')
        : h.condition?.type || '未知';

    return `<div class="history-item">
      <div class="hi-left">
        <div class="hi-date">${dateStr} ${h.wasSurrender ? '🏳️ 服输' : '🎉 完成'}</div>
        <div class="hi-condition">${conditionStr}</div>
      </div>
      <div class="hi-stats">
        <div class="hi-stat">
          <div class="hi-stat-val">${timeStr}</div>
          <div class="hi-stat-label">锁机时长</div>
        </div>
        <div class="hi-stat">
          <div class="hi-stat-val">${h.totalKills || 0}</div>
          <div class="hi-stat-label">拦截次数</div>
        </div>
      </div>
    </div>`;
  }).join('');
}

// ==================== 测试命令 ====================
async function testCommand() {
  const command = $('condCommand').value.trim();
  if (!command) {
    showToast('请输入命令', 'error');
    return;
  }
  if (!window.electronAPI) {
    showToast('请在 Electron 环境中运行', 'error');
    return;
  }

  const resultBox = $('testCommandResult');
  resultBox.textContent = '⏳ 正在执行...';
  resultBox.className = 'test-result show';
  resultBox.style.display = 'block';

  try {
    const result = await window.electronAPI.runCommand(
      command,
      $('condWorkDir').value.trim()
    );

    let text = '';
    if (result.success) {
      text = `✅ 命令执行成功!\n退出码: ${result.exitCode}\n`;
      resultBox.className = 'test-result success show';
    } else {
      text = `❌ 命令执行失败\n退出码: ${result.exitCode} (期望: ${result.expectedExitCode})\n`;
      resultBox.className = 'test-result error show';
    }
    if (result.stdout) text += `\n--- 输出 ---\n${result.stdout}`;
    if (result.stderr) text += `\n--- 错误 ---\n${result.stderr}`;

    resultBox.textContent = text;
    resultBox.style.display = 'block';
  } catch (err) {
    resultBox.textContent = '执行出错: ' + err.message;
    resultBox.className = 'test-result error show';
    resultBox.style.display = 'block';
  }
}

// ==================== 测试文件 ====================
async function testFile() {
  const filePath = $('condFilePath').value.trim();
  if (!filePath) {
    showToast('请输入文件路径', 'error');
    return;
  }
  if (!window.electronAPI) {
    showToast('请在 Electron 环境中运行', 'error');
    return;
  }

  const resultBox = $('testFileResult');
  resultBox.textContent = '⏳ 正在检查...';
  resultBox.className = 'test-result show';
  resultBox.style.display = 'block';

  try {
    const result = await window.electronAPI.checkCondition('file', {
      filePath,
      minWords: parseInt($('condMinWords').value) || 500
    });

    resultBox.style.display = 'block';
    if (result.success) {
      resultBox.textContent = `✅ ${result.message}\n字数: ${result.wordCount}\n最后修改: ${result.lastModified || '未知'}`;
      resultBox.className = 'test-result success show';
    } else {
      resultBox.textContent = `⏳ ${result.message}`;
      resultBox.className = 'test-result show';
    }
  } catch (err) {
    resultBox.textContent = '检查出错: ' + err.message;
    resultBox.className = 'test-result error show';
    resultBox.style.display = 'block';
  }
}

// ==================== 事件监听 ====================
function setupEventListeners() {
  // 导航按钮
  $$('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      navigateTo(page);
      if (page === 'history') renderHistory();
    });
  });

  // 条件标签切换
  $$('.cond-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchConditionTab(tab.dataset.cond);
    });
  });

  // 条件输入变化时自动保存
  ['condCommand', 'condWorkDir', 'condExitCode', 'condFilePath',
   'condMinWords', 'condWebUrl', 'condWebMinutes', 'condCombineOp'].forEach(id => {
    const el = $(id);
    if (el) {
      el.addEventListener('change', saveConfig);
      el.addEventListener('blur', saveConfig);
    }
  });

  // 添加进程
  $('btnAddProcess').addEventListener('click', () => addTag('processBlacklist', 'newProcess'));
  $('newProcess').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTag('processBlacklist', 'newProcess');
  });

  // 添加网站
  $('btnAddSite').addEventListener('click', () => addTag('siteBlacklist', 'newSite'));
  $('newSite').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTag('siteBlacklist', 'newSite');
  });

  // 标签移除（事件委托）
  $('processTagList').addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) {
      const index = parseInt(e.target.dataset.index);
      removeTag('processBlacklist', index);
    }
  });
  $('siteTagList').addEventListener('click', (e) => {
    if (e.target.classList.contains('tag-remove')) {
      const index = parseInt(e.target.dataset.index);
      removeTag('siteBlacklist', index);
    }
  });

  // 开始锁机
  $('btnStartLock').addEventListener('click', startLock);

  // 测试命令
  $('btnTestCommand').addEventListener('click', testCommand);

  // 测试文件
  $('btnTestFile').addEventListener('click', testFile);

  // 确认解锁
  $('btnConfirmUnlock').addEventListener('click', confirmUnlock);

  // 回到首页
  $('btnBackToSetup').addEventListener('click', () => {
    resetSetupUI();
    navigateTo('setup');
  });

  // 弹出加载进程建议列表
  $('newProcess').addEventListener('focus', async () => {
    if (window.electronAPI) {
      try {
        const processes = await window.electronAPI.getRunningProcesses();
        const datalist = $('processSuggestions');
        datalist.innerHTML = [...new Set(processes)]
          .sort()
          .map(p => `<option value="${p}">`)
          .join('');
      } catch (e) {}
    }
  });
}

// ==================== 重置 UI ====================
function resetSetupUI() {
  $('btnStartLock').disabled = false;
  $('btnStartLock').textContent = '🔒 开始锁机';
  $('setupStatus').textContent = '就绪';
  $('setupStatus').className = 'status-badge ready';
}

// ==================== Electron IPC 事件监听 ====================
function setupElectronListeners() {
  if (!window.electronAPI) {
    console.warn('[P-Trap] 未检测到 electronAPI（非 Electron 环境）');
    return;
  }

  // 锁机状态变化
  window.electronAPI.onLockStateChanged((data) => {
    console.log('[P-Trap] 锁机状态变化:', data.state);

    switch (data.state) {
      case 'locked':
        $('setupStatus').textContent = '🔒 锁机中...';
        $('setupStatus').className = 'status-badge locked';
        $('btnStartLock').disabled = true;
        $('btnStartLock').textContent = '⏳ 锁机中...';
        showToast('锁机已生效！进程和网站已被屏蔽', 'success');
        break;

      case 'condition_met':
        $('modalConditionMsg').textContent = data.result?.message || '所有解锁条件已经达成';
        $('modalConditionMet').classList.add('show');
        showToast('🎉 条件已达成！可以解锁了', 'success');
        break;

      case 'surrendering':
        showToast('🏳️ 服输模式：等待 2 小时后强制解锁', 'error');
        break;

      case 'unlocked':
        resetSetupUI();
        showToast('已解锁！', 'success');
        break;

      case 'idle':
        resetSetupUI();
        break;
    }
  });

  // 进程被杀
  window.electronAPI.onProcessKilled((data) => {
    // 可以实时显示，这里仅记录
  });

  // 条件检测进度
  window.electronAPI.onConditionProgress((data) => {
    // 可在锁机覆盖层中显示进度
  });

  // 服输倒计时
  window.electronAPI.onSurrenderCountdown((data) => {
    // 倒计时更新
  });
}

// ==================== 初始化 ====================
async function init() {
  console.log('[P-Trap] 初始化开始, readyState:', document.readyState);

  setupEventListeners();
  setupElectronListeners();
  await loadConfig();

  // 检查当前锁机状态
  if (window.electronAPI) {
    try {
      const state = await window.electronAPI.getLockState();
      if (state && state.state === 'locked') {
        $('setupStatus').textContent = '🔒 锁机中...';
        $('setupStatus').className = 'status-badge locked';
        $('btnStartLock').disabled = true;
        $('btnStartLock').textContent = '⏳ 锁机中...';
      }
      if (state && state.state === 'surrendering') {
        $('setupStatus').textContent = '🏳️ 服输中...';
        $('setupStatus').className = 'status-badge locked';
        $('btnStartLock').disabled = true;
      }
    } catch (e) {}
  }

  navigateTo('setup');
  console.log('[P-Trap] 初始化完成');
}

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
