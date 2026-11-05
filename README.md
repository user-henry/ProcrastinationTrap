**简体中文** | [English](README.en.md)

# Procrastination Trap

> 一款你自己主动上锁、必须完成自定义任务才能解锁的 Windows 效率工具。
> 不是番茄钟那种"时间到就解锁"，而是"你设定的条件达成才解锁"。

**用你的意志力做"锁"，用你的行动做"钥匙"。**

---

## 核心机制

```
用户打开软件 → 设定解锁条件 → 点击"开始锁机"
    ↓
软件屏蔽游戏/娱乐网站/非必要软件
    ↓
用户只能做正事 → 完成设定条件 → 自动检测 → 解锁
或
无法完成 → "服输模式"：等待 2 小时强行解锁
```

## 三种解锁条件

| 类型 | 示例 | 检测方式 |
|------|------|---------|
| 命令行 | `pytest` 返回 0 | 运行命令，检查退出码 |
| 文件内容 | `report.md` 写了超过 500 字 | 文件字数统计 |
| 网页停留 | 学习网站停留 30 分钟 | 窗口标题监控（需扩展） |
| 组合条件 | 以上任意组合 | AND / OR 逻辑 |

## 锁机行为

- **进程黑名单**：每 2 秒扫描并强制结束黑名单进程（Steam、微信等）
- **网站黑名单**：修改 `hosts` 文件 + 刷新 DNS 缓存
- **全屏覆盖窗**：锁机时全屏置顶提示
- **反关闭**：锁机期间禁止 Alt+F4 和关闭窗口

## 技术栈

- **框架**：Electron 31
- **进程管理**：`taskkill` + Windows API
- **网络过滤**：`hosts` 文件修改 + `ipconfig /flushdns`
- **条件检测**：Node.js `child_process.exec()` + `fs`
- **存储**：`electron-store` (JSON)

## 项目结构

```
ProcrastinationTrap/
├── main.js                  # Electron 主进程
├── preload.js               # 预加载脚本 (contextBridge)
├── package.json
├── src/
│   ├── process-blocker.js   # 进程黑名单屏蔽
│   ├── hosts-filter.js      # Hosts 文件管理
│   ├── condition-checker.js # 条件检测器
│   └── state-machine.js     # 锁机状态机
└── pages/
    ├── index.html           # 主界面
    ├── app.js               # 渲染进程逻辑
    └── styles.css           # 样式表
```

## 运行

```bash
# 开发模式
npm start

# 打包
npm run build        # NSIS 安装包
npm run build:portable  # 便携版
```

## 要求

- Windows 10 / 11
- **需要管理员权限**（修改 hosts / 杀进程）
- 首次启动时会请求管理员权限

## 防作弊

| 作弊方式 | 防御措施 |
|---------|---------|
| 关软件 | 锁机时禁止关闭窗口 |
| 修改 hosts | 每 10 秒覆盖写入 |
| Alt+F4 | 全局快捷键拦截 |
| 修改系统时间 | 基于运行时间计时 |

---

**免责声明**：本软件通过修改系统 hosts 文件和终止进程来实现功能，请自行承担使用风险。建议在了解其工作原理后使用。
