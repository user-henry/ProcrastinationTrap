const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * 条件检测器模块
 * 检测用户设定的解锁条件是否达成
 */

/**
 * 运行命令行并检查退出码
 * @param {object} params - { command, expectedExitCode, workingDir, timeout }
 */
function checkCommand(params) {
  return new Promise((resolve) => {
    const { command, expectedExitCode = 0, workingDir = process.cwd(), timeout = 0 } = params;

    const options = {
      cwd: workingDir,
      timeout: timeout || 300000, // 默认 5 分钟超时
      shell: 'cmd.exe'
    };

    exec(command, options, (err, stdout, stderr) => {
      const exitCode = err ? err.code : 0;
      const success = exitCode === expectedExitCode;

      resolve({
        type: 'command',
        command,
        success,
        exitCode,
        expectedExitCode,
        stdout: stdout ? stdout.slice(-500) : '',  // 只保留最后500字符
        stderr: stderr ? stderr.slice(-500) : '',
        message: success
          ? `命令 "${command}" 执行成功 (exitCode: ${exitCode})`
          : `命令 "${command}" 执行失败 (exitCode: ${exitCode}, 期望: ${expectedExitCode})`
      });
    });
  });
}

/**
 * 统计文本字数（中英文混合）
 */
function countWords(text) {
  if (!text) return 0;
  // 中文：按字符数计
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  // 英文/数字：按空格分词
  const englishWords = text
    .replace(/[\u4e00-\u9fff]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 0).length;
  return chineseChars + englishWords;
}

/**
 * 检查文件内容条件
 * @param {object} params - { filePath, condition: 'wordCount >= N' | 'modified', minWords }
 */
function checkFileContent(params) {
  return new Promise((resolve) => {
    const { filePath, minWords = 500 } = params;

    try {
      if (!fs.existsSync(filePath)) {
        resolve({
          type: 'file',
          filePath,
          success: false,
          wordCount: 0,
          minWords,
          message: `文件不存在: ${filePath}`
        });
        return;
      }

      const stat = fs.statSync(filePath);
      const content = fs.readFileSync(filePath, 'utf-8');
      const wordCount = countWords(content);
      const success = wordCount >= minWords;

      resolve({
        type: 'file',
        filePath,
        success,
        wordCount,
        minWords,
        lastModified: stat.mtime.toISOString(),
        message: success
          ? `文件 ${path.basename(filePath)} 已达到 ${wordCount} 字 (目标: ${minWords})`
          : `文件 ${path.basename(filePath)} 当前 ${wordCount} 字，还需 ${minWords - wordCount} 字`
      });
    } catch (err) {
      resolve({
        type: 'file',
        filePath,
        success: false,
        wordCount: 0,
        minWords,
        message: `读取文件失败: ${err.message}`
      });
    }
  });
}

/**
 * 检查网页/应用停留时间条件
 * @param {object} params - { url, requiredMinutes }
 * 注意：网页停留检测依赖浏览器扩展或 Windows 窗口标题监控
 * 这里提供一个简单的窗口标题检测实现
 */
function checkWebCondition(params) {
  // 这个功能在纯 Electron 中较难实现，需要浏览器扩展配合
  // MVP 阶段提供占位实现
  return new Promise((resolve) => {
    const { url, requiredMinutes = 30 } = params;
    resolve({
      type: 'web',
      url,
      requiredMinutes,
      success: false,
      message: '网页条件检测需要浏览器扩展配合，MVP 阶段暂不支持自动检测'
    });
  });
}

/**
 * 检查组合条件（AND / OR）
 * @param {object} params - { operator: 'AND'|'OR', conditions: [...] }
 */
async function checkCombined(params) {
  const { operator = 'AND', conditions = [] } = params;
  const results = [];

  for (const cond of conditions) {
    let result;
    switch (cond.type) {
      case 'command':
        result = await checkCommand(cond.params || cond);
        break;
      case 'file':
        result = await checkFileContent(cond.params || cond);
        break;
      case 'web':
        result = await checkWebCondition(cond.params || cond);
        break;
      default:
        result = { success: false, message: `未知条件类型: ${cond.type}` };
    }
    results.push(result);
  }

  const success = operator === 'AND'
    ? results.every(r => r.success)
    : results.some(r => r.success);

  return {
    type: 'combined',
    operator,
    success,
    results,
    message: success
      ? `所有条件已满足 (${operator})`
      : `${operator === 'AND' ? '还有条件未满足' : '所有条件均未满足'}`
  };
}

/**
 * 单次检查入口（根据条件类型分发）
 */
async function checkCondition(conditionConfig) {
  if (!conditionConfig || !conditionConfig.type) {
    return { success: false, message: '无效的条件配置' };
  }

  switch (conditionConfig.type) {
    case 'command':
      return await checkCommand(conditionConfig);
    case 'file':
      return await checkFileContent(conditionConfig);
    case 'web':
      return await checkWebCondition(conditionConfig);
    case 'combined':
      return await checkCombined(conditionConfig);
    default:
      return { success: false, message: `未知条件类型: ${conditionConfig.type}` };
  }
}

module.exports = {
  checkCondition,
  checkCommand,
  checkFileContent,
  checkWebCondition,
  checkCombined,
  countWords
};
