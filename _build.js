// Procrastination Trap - Build Script
// 策略：便携版直接在中文路径打包；安装版搬到英文临时目录用手写 NSIS 脚本编译
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_DIR = __dirname;
const DIST_DIR = path.join(PROJECT_DIR, 'dist');
const TEMP_BUILD_DIR = 'C:\\temp\\pt-build';
const NSIS_CACHE = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', 'nsis', 'nsis-3.0.4.1');
const MAKENSIS = path.join(NSIS_CACHE, 'Bin', 'makensis.exe');

const APP_NAME = 'Procrastination Trap';
const APP_EXE = 'Procrastination Trap.exe';
const VERSION = '1.0.0';
const PUBLISHER = 'HZY';

// 国内镜像加速
process.env.ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/';
process.env.ELECTRON_BUILDER_BINARIES_MIRROR = 'https://npmmirror.com/mirrors/electron-builder-binaries/';

function cleanCaches() {
    const cacheDirs = ['winCodeSign'];
    for (const dir of cacheDirs) {
        const p = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', dir);
        try { if (fs.existsSync(p)) { fs.rmSync(p, { recursive: true, force: true }); console.log('清理缓存:', dir); } } catch(e) {}
    }
}

function cleanDirs() {
    for (const dir of [DIST_DIR, TEMP_BUILD_DIR]) {
        try { if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); } catch(e) {}
    }
    console.log('清理旧 dist + 临时目录完成');
}

function robocopy(src, dest, exclude) {
    // 简单的文件复制（跳过指定目录）
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
        if (exclude && exclude.includes(entry)) continue;
        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        const stat = fs.statSync(srcPath);
        if (stat.isDirectory()) {
            robocopy(srcPath, destPath, exclude);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// ============================================================

console.log('========================================');
console.log('  Procrastination Trap - Build Script');
console.log('========================================\n');

cleanCaches();
cleanDirs();

// ============ Step 1: 便携版 ============
console.log('[1/3] 打包便携版...\n');

process.chdir(PROJECT_DIR);
try {
    const result = execSync('npx electron-builder --win portable --x64', {
        encoding: 'utf-8',
        maxBuffer: 50 * 1024 * 1024,
        timeout: 600000
    });
    console.log(result);
} catch (e) {
    const out = (e.stdout || '').toString();
    const err = (e.stderr || '').toString();
    if (out) console.log(out.slice(-3000));
    if (err) console.log(err.slice(-3000));
}

const winUnpacked = path.join(DIST_DIR, 'win-unpacked');
if (!fs.existsSync(winUnpacked)) {
    console.log('[FAIL] win-unpacked 不存在，便携版打包失败');
    process.exit(1);
}

// 查找便携版 exe
const distFiles = fs.readdirSync(DIST_DIR);
const portableExe = distFiles.find(f => f.endsWith('.exe') && !f.includes('Setup'));
if (portableExe) {
    const stat = fs.statSync(path.join(DIST_DIR, portableExe));
    console.log(`[OK] 便携版: ${portableExe} (${(stat.size / 1024 / 1024).toFixed(1)} MB)\n`);
} else {
    console.log('[OK] 便携版已打包 (win-unpacked)\n');
}

// ============ Step 2: 准备 NSIS 环境 ============
console.log('[2/3] 准备 NSIS...\n');

// 检查 makensis
if (!fs.existsSync(MAKENSIS)) {
    console.log('makensis.exe 未缓存，尝试通过 electron-builder 下载...');
    // 触发 electron-builder 下载 NSIS 工具链
    process.chdir(PROJECT_DIR);
    try {
        execSync('npx electron-builder --win nsis --x64', {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            timeout: 600000
        });
    } catch(e) {
        console.log('  (electron-builder NSIS 流程结束，检查缓存...)');
    }
}

if (!fs.existsSync(MAKENSIS)) {
    console.log('[FAIL] makensis.exe 不存在:', MAKENSIS);
    process.exit(1);
}
console.log('makensis.exe OK:', MAKENSIS);

// ============ Step 3: 生成 NSIS 安装包 ============
console.log('\n[3/3] 编译 NSIS 安装包...\n');

// 复制项目到英文临时目录
console.log('  复制文件到:', TEMP_BUILD_DIR);
robocopy(PROJECT_DIR, TEMP_BUILD_DIR, ['node_modules', 'dist', '_build.js', '.git', '.gitignore']);
// 复制 dist/win-unpacked
const tempDist = path.join(TEMP_BUILD_DIR, 'dist');
const tempUnpacked = path.join(tempDist, 'win-unpacked');
robocopy(winUnpacked, tempUnpacked);

// 生成 ICO 图标 (从 electron-builder 之前的输出或从 PNG 生成)
const iconDir = path.join(DIST_DIR, '.icon-ico');
const iconPath = path.join(iconDir, 'icon.ico');
if (!fs.existsSync(iconPath)) {
    // 用 electron-builder 生成图标
    console.log('  生成图标...');
    try {
        process.chdir(TEMP_BUILD_DIR);
        execSync('npx electron-builder --win portable --x64', {
            encoding: 'utf-8',
            maxBuffer: 50 * 1024 * 1024,
            timeout: 300000
        });
    } catch(e) {}
    // 图标可能在 TEMP_BUILD_DIR/dist/.icon-ico/
    const tempIconPath = path.join(tempDist, '.icon-ico', 'icon.ico');
    if (fs.existsSync(tempIconPath)) {
        fs.mkdirSync(path.dirname(iconPath), { recursive: true });
        fs.copyFileSync(tempIconPath, iconPath);
    }
}

// 生成 NSIS 脚本
const nsiPath = path.join(TEMP_BUILD_DIR, 'installer.nsi');
const setupDistDir = path.join(TEMP_BUILD_DIR, 'dist');
const setupExeName = 'Procrastination Trap-1.0.0-Setup.exe';
const outFile = path.join(setupDistDir, setupExeName);

// Windows路径转NSIS路径（反斜杠需转义）
const winSrcNsis = winUnpacked.replace(/\\/g, '\\\\');
const iconNsis = (iconPath.replace(/\\/g, '\\\\')).replace(/\.ico$/, '') + '.ico';

// 不使用自定义图标以简化（makensis路径含中文会失败）
// 直接在英文路径下用默认图标
const BOM = '\uFEFF';
const nsiLines = [];
nsiLines.push(BOM + '; Procrastination Trap NSIS Installer');
nsiLines.push('!include "MUI2.nsh"');
nsiLines.push('');
nsiLines.push('Name "' + APP_NAME + ' ' + VERSION + '"');
nsiLines.push('OutFile "' + outFile.replace(/\\/g, '\\\\') + '"');
nsiLines.push('InstallDir "$PROGRAMFILES64\\' + APP_NAME + '"');
nsiLines.push('RequestExecutionLevel admin');
nsiLines.push('');
nsiLines.push('!define MUI_ABORTWARNING');
nsiLines.push('!insertmacro MUI_PAGE_DIRECTORY');
nsiLines.push('!insertmacro MUI_PAGE_INSTFILES');
nsiLines.push('!insertmacro MUI_UNPAGE_CONFIRM');
nsiLines.push('!insertmacro MUI_UNPAGE_INSTFILES');
nsiLines.push('!insertmacro MUI_LANGUAGE "SimpChinese"');
nsiLines.push('!insertmacro MUI_LANGUAGE "English"');
nsiLines.push('');
nsiLines.push('Section');
nsiLines.push('  SetOutPath "$INSTDIR"');
nsiLines.push('  File /r "' + winSrcNsis + '\\*.*"');
nsiLines.push('  CreateDirectory "$SMPROGRAMS\\' + APP_NAME + '"');
nsiLines.push('  CreateShortCut "$SMPROGRAMS\\' + APP_NAME + '\\' + APP_NAME + '.lnk" "$INSTDIR\\' + APP_EXE + '"');
nsiLines.push('  CreateShortCut "$SMPROGRAMS\\' + APP_NAME + '\\Uninstall.lnk" "$INSTDIR\\uninstall.exe"');
nsiLines.push('  CreateShortCut "$DESKTOP\\' + APP_NAME + '.lnk" "$INSTDIR\\' + APP_EXE + '"');
nsiLines.push('  WriteUninstaller "$INSTDIR\\uninstall.exe"');
nsiLines.push('  WriteRegStr HKLM "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_NAME + '" "DisplayName" "' + APP_NAME + '"');
nsiLines.push('  WriteRegStr HKLM "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_NAME + '" "UninstallString" "$INSTDIR\\uninstall.exe"');
nsiLines.push('  WriteRegStr HKLM "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_NAME + '" "DisplayVersion" "' + VERSION + '"');
nsiLines.push('  WriteRegStr HKLM "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_NAME + '" "Publisher" "' + PUBLISHER + '"');
nsiLines.push('SectionEnd');
nsiLines.push('');
nsiLines.push('Section "Uninstall"');
nsiLines.push('  Delete "$INSTDIR\\' + APP_EXE + '"');
nsiLines.push('  RMDir /r "$INSTDIR"');
nsiLines.push('  Delete "$SMPROGRAMS\\' + APP_NAME + '\\*.lnk"');
nsiLines.push('  RMDir "$SMPROGRAMS\\' + APP_NAME + '"');
nsiLines.push('  Delete "$DESKTOP\\' + APP_NAME + '.lnk"');
nsiLines.push('  DeleteRegKey HKLM "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\' + APP_NAME + '"');
nsiLines.push('SectionEnd');

fs.writeFileSync(nsiPath, nsiLines.join('\r\n'), 'utf8');
console.log('  NSIS 脚本:', nsiPath);

// 确保输出目录存在
fs.mkdirSync(setupDistDir, { recursive: true });

// 编译 NSIS
console.log('  编译 NSIS...');
const nsisCmd = '"' + MAKENSIS + '" "' + nsiPath + '"';
console.log('  ' + nsisCmd);
const nsisResult = execSync(nsisCmd, {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024,
    timeout: 300000,
    cwd: TEMP_BUILD_DIR
});
console.log(nsisResult);

// 复制安装包到项目 dist
if (fs.existsSync(outFile)) {
    const destSetup = path.join(DIST_DIR, setupExeName);
    fs.copyFileSync(outFile, destSetup);
    const stats = fs.statSync(outFile);
    console.log('\n[OK] NSIS 安装包: ' + setupExeName + ' (' + (stats.size / 1024 / 1024).toFixed(1) + ' MB)');
} else {
    console.log('\n[FAIL] 安装包未生成');
    process.exit(1);
}

// 清理临时目录
try { fs.rmSync(TEMP_BUILD_DIR, { recursive: true, force: true }); } catch(e) {}
console.log('临时目录已清理');

// 最终输出
console.log('\n========================================');
console.log('  BUILD COMPLETE');
console.log('========================================');
console.log('\ndist 目录输出:');
for (const f of fs.readdirSync(DIST_DIR)) {
    const fpath = path.join(DIST_DIR, f);
    const stat = fs.statSync(fpath);
    if (f.endsWith('.exe')) {
        console.log('  ' + f + '  (' + (stat.size / 1024 / 1024).toFixed(1) + ' MB)');
    }
}
