const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * 进程黑名单屏蔽模块
 * 每隔指定间隔扫描系统进程，杀死黑名单中的进程
 */

// 黑名单进程列表（进程名，不含路径）
let blacklist = [];
let scanInterval = null;
let onKillCallback = null;

/**
 * 获取当前所有运行进程列表（Windows）
 */
function getRunningProcesses() {
  return new Promise((resolve, reject) => {
    exec('tasklist /FO CSV /NH', { encoding: 'buffer' }, (err, stdout) => {
      if (err) {
        // 尝试 PowerShell 备用
        exec('powershell -Command "Get-Process | Select-Object -ExpandProperty ProcessName"', (err2, stdout2) => {
          if (err2) return reject(err2);
          const processes = stdout2
            .split('\n')
            .map(p => p.trim().toLowerCase())
            .filter(p => p.length > 0)
            .map(p => p.endsWith('.exe') ? p : p + '.exe');
          resolve(processes);
        });
        return;
      }
      const lines = stdout.toString().split('\n');
      const processes = [];
      for (const line of lines) {
        const match = line.match(/^"([^"]+)"/);
        if (match) {
          processes.push(match[1].toLowerCase());
        }
      }
      resolve(processes);
    });
  });
}

/**
 * 杀死指定进程
 */
function killProcess(processName) {
  return new Promise((resolve) => {
    exec(`taskkill /F /IM "${processName}" /T`, (err, stdout, stderr) => {
      if (err) {
        // 进程可能已经不存在，不算错误
        resolve({ killed: false, name: processName, error: stderr });
      } else {
        resolve({ killed: true, name: processName });
      }
    });
  });
}

/**
 * 执行一次黑名单扫描
 */
async function scanAndKill() {
  if (blacklist.length === 0) return [];

  try {
    const running = await getRunningProcesses();
    const killed = [];

    for (const target of blacklist) {
      const targetLower = target.toLowerCase().trim();
      if (running.includes(targetLower)) {
        const result = await killProcess(target);
        if (result.killed) {
          killed.push(target);
          if (onKillCallback) {
            onKillCallback({ name: target, time: new Date().toISOString() });
          }
        }
      }
    }

    return killed;
  } catch (err) {
    console.error('[ProcessBlocker] 扫描失败:', err.message);
    return [];
  }
}

/**
 * 启动黑名单扫描定时器
 */
function startScanning(intervalMs = 2000) {
  stopScanning();
  scanInterval = setInterval(() => {
    scanAndKill();
  }, intervalMs);
  console.log(`[ProcessBlocker] 扫描已启动，间隔 ${intervalMs}ms，黑名单: ${blacklist.join(', ') || '(空)'}`);
}

/**
 * 停止扫描
 */
function stopScanning() {
  if (scanInterval) {
    clearInterval(scanInterval);
    scanInterval = null;
    console.log('[ProcessBlocker] 扫描已停止');
  }
}

/**
 * 更新黑名单
 */
function setBlacklist(list) {
  blacklist = list.map(p => p.trim()).filter(p => p.length > 0);
  console.log('[ProcessBlocker] 黑名单已更新:', blacklist.join(', ') || '(空)');
}

/**
 * 设置进程被杀回调
 */
function onKill(handler) {
  onKillCallback = handler;
}

module.exports = {
  getRunningProcesses,
  killProcess,
  scanAndKill,
  startScanning,
  stopScanning,
  setBlacklist,
  onKill
};
