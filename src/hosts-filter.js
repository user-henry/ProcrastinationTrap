const fs = require('fs');
const { exec } = require('child_process');
const path = require('path');

/**
 * Hosts 文件过滤器模块
 * 通过修改 C:\Windows\System32\drivers\etc\hosts 屏蔽娱乐网站
 */

const HOSTS_PATH = 'C:\\Windows\\System32\\drivers\\etc\\hosts';
const MARKER_START = '# === ProcrastinationTrap BLOCK START ===';
const MARKER_END = '# === ProcrastinationTrap BLOCK END ===';

/**
 * 读取 hosts 文件内容
 */
function readHosts() {
  try {
    return fs.readFileSync(HOSTS_PATH, 'utf-8');
  } catch (err) {
    console.error('[HostsFilter] 读取 hosts 失败:', err.message);
    return null;
  }
}

/**
 * 写入 hosts 文件（需要管理员权限）
 */
function writeHosts(content) {
  try {
    fs.writeFileSync(HOSTS_PATH, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('[HostsFilter] 写入 hosts 失败:', err.message);
    return false;
  }
}

/**
 * 刷新 DNS 缓存
 */
function flushDNS() {
  return new Promise((resolve) => {
    exec('ipconfig /flushdns', (err, stdout) => {
      if (err) {
        console.warn('[HostsFilter] DNS 刷新失败:', err.message);
        resolve(false);
      } else {
        console.log('[HostsFilter] DNS 缓存已刷新');
        resolve(true);
      }
    });
  });
}

/**
 * 添加网站黑名单
 * @param {string[]} domains - 要屏蔽的域名列表
 */
async function blockDomains(domains) {
  if (!domains || domains.length === 0) return false;

  let content = readHosts();
  if (content === null) return false;

  // 移除旧的屏蔽块
  const markerStartIdx = content.indexOf(MARKER_START);
  const markerEndIdx = content.indexOf(MARKER_END);
  if (markerStartIdx !== -1 && markerEndIdx !== -1) {
    content = content.substring(0, markerStartIdx) + content.substring(markerEndIdx + MARKER_END.length);
  }

  // 构建新的屏蔽块
  let block = '\n' + MARKER_START + '\n';
  for (const domain of domains) {
    const d = domain.trim();
    if (d.length === 0) continue;
    block += `127.0.0.1 ${d}\n`;
    block += `127.0.0.1 www.${d}\n`;
  }
  block += MARKER_END + '\n';

  content = content.trimEnd() + block;

  const success = writeHosts(content);
  if (success) {
    await flushDNS();
  }
  return success;
}

/**
 * 移除网站黑名单（恢复 hosts）
 */
async function unblockDomains() {
  let content = readHosts();
  if (content === null) return false;

  const markerStartIdx = content.indexOf(MARKER_START);
  const markerEndIdx = content.indexOf(MARKER_END);

  if (markerStartIdx === -1 || markerEndIdx === -1) {
    // 没有屏蔽块，直接返回成功
    await flushDNS();
    return true;
  }

  content = content.substring(0, markerStartIdx) + content.substring(markerEndIdx + MARKER_END.length);
  // 清理多余空行
  content = content.replace(/\n{3,}/g, '\n\n');

  const success = writeHosts(content);
  if (success) {
    await flushDNS();
  }
  return success;
}

/**
 * 持续写入 hosts（防止用户手动修改，每 10 秒覆盖一次）
 * 返回停止函数
 */
function startContinuousBlock(domains, intervalMs = 10000) {
  const timer = setInterval(async () => {
    await blockDomains(domains);
  }, intervalMs);
  console.log(`[HostsFilter] 持续屏蔽已启动，间隔 ${intervalMs}ms`);
  return () => {
    clearInterval(timer);
    console.log('[HostsFilter] 持续屏蔽已停止');
  };
}

module.exports = {
  blockDomains,
  unblockDomains,
  startContinuousBlock,
  flushDNS,
  HOSTS_PATH
};
