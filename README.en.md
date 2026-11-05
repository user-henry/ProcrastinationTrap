**English** | [简体中文](README.md)

# Procrastination Trap

> A Windows productivity tool that you lock yourself, and that only unlocks once you finish a task you defined.
> Unlike a Pomodoro timer that "unlocks when time is up", this one "unlocks when your conditions are met".

**Use your willpower as the lock, and your actions as the key.**

---

## Core mechanism

```
Open the app → set unlock conditions → click "Start lock"
    ↓
The app blocks games / entertainment sites / non-essential software
    ↓
You can only do real work → finish the conditions → automatic detection → unlock
or
Give up → "surrender mode": wait 2 hours for a forced unlock
```

## Three kinds of unlock conditions

| Type | Example | Detection |
|------|---------|-----------|
| Command line | `pytest` returns 0 | Run the command and check the exit code |
| File content | `report.md` has more than 500 words | Word count of the file |
| Website dwell time | 30 minutes on a study site | Window title monitoring (requires an extension) |
| Combined condition | Any combination of the above | AND / OR logic |

## Locking behaviour

- **Process blacklist**: scans and force-terminates blacklisted processes every 2 seconds (Steam, WeChat, etc.)
- **Website blacklist**: edits the `hosts` file and flushes the DNS cache
- **Full-screen overlay**: a full-screen, always-on-top notice while locked
- **Anti-close**: Alt+F4 and window closing are blocked while locked

## Tech stack

- **Framework**: Electron 31
- **Process management**: `taskkill` + Windows API
- **Network filtering**: `hosts` file modification + `ipconfig /flushdns`
- **Condition detection**: Node.js `child_process.exec()` + `fs`
- **Storage**: `electron-store` (JSON)

## Project structure

```
ProcrastinationTrap/
├── main.js                  # Electron main process
├── preload.js               # Preload script (contextBridge)
├── package.json
├── src/
│   ├── process-blocker.js   # Process blacklist blocking
│   ├── hosts-filter.js      # Hosts file management
│   ├── condition-checker.js # Condition checker
│   └── state-machine.js     # Lock state machine
└── pages/
    ├── index.html           # Main UI
    ├── app.js               # Renderer logic
    └── styles.css           # Stylesheet
```

## Running

```bash
# Development mode
npm start

# Packaging
npm run build        # NSIS installer
npm run build:portable  # Portable build
```

## Requirements

- Windows 10 / 11
- **Administrator privileges** (to modify hosts / kill processes)
- Administrator rights are requested on first launch

## Anti-cheating

| Cheating method | Countermeasure |
|---------|---------|
| Close the app | Closing the window is blocked while locked |
| Edit the hosts file | Rewritten every 10 seconds |
| Alt+F4 | Global hotkey interception |
| Change the system clock | Timing is based on uptime |

---

**Disclaimer**: This software works by modifying the system `hosts` file and terminating processes. Use it at your own risk, and only after understanding how it works.
