const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 锁机控制
  startLock: (config) => ipcRenderer.invoke('start-lock', config),
  unlock: () => ipcRenderer.invoke('unlock'),
  surrender: () => ipcRenderer.invoke('surrender'),
  getLockState: () => ipcRenderer.invoke('get-lock-state'),

  // 配置管理
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  loadConfig: () => ipcRenderer.invoke('load-config'),

  // 条件检测
  checkCondition: (type, params) => ipcRenderer.invoke('check-condition', type, params),
  runCommand: (command, cwd) => ipcRenderer.invoke('run-command', command, cwd),

  // 文件监听
  watchFile: (filePath) => ipcRenderer.invoke('watch-file', filePath),
  stopWatchFile: (filePath) => ipcRenderer.invoke('stop-watch-file', filePath),
  onFileChanged: (callback) => ipcRenderer.on('file-changed', (event, data) => callback(data)),

  // 事件监听（从主进程推送）
  onLockStateChanged: (callback) => ipcRenderer.on('lock-state-changed', (event, data) => callback(data)),
  onProcessKilled: (callback) => ipcRenderer.on('process-killed', (event, data) => callback(data)),
  onConditionProgress: (callback) => ipcRenderer.on('condition-progress', (event, data) => callback(data)),
  onSurrenderCountdown: (callback) => ipcRenderer.on('surrender-countdown', (event, data) => callback(data)),

  // 窗口控制
  minimizeWindow: () => ipcRenderer.invoke('minimize-window'),
  closeWindow: () => ipcRenderer.invoke('close-window'),

  // 系统信息
  getRunningProcesses: () => ipcRenderer.invoke('get-running-processes')
});
