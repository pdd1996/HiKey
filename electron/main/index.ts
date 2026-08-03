import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { initStorage } from './storage/db'
import { createScheduler, type Scheduler } from './healthCheck/scheduler'

// 主进程入口（M1 脚手架）
// 业务模块（importer/backup/ipc）留待各自里程碑；M2 已落地 crypto/storage，M3 落地 healthCheck/scheduler。

// 单实例锁：lowdb 写单一 userData/hikey-db.json，双实例并发写会互相覆盖
// （PRD 零云端、单机定位）。第二实例直接聚焦已有窗口并退出。
const gotTheLock = app.requestSingleInstanceLock()

// M3 健康检测调度器：app.whenReady 后启动（启动即首检 + 按间隔轮询），
// 关窗停止（best-effort 丢弃未完成检测）。IPC 接入留 M5。
let scheduler: Scheduler | undefined

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows()
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(async () => {
    // 初始化存储（lowdb 读写 + schema 迁移 + 归位）。失败则中止启动、不破坏原库（§5）。
    try {
      await initStorage(app.getPath('userData'))
    } catch (err) {
      dialog.showMessageBoxSync({
        type: 'error',
        title: 'HiKey',
        message: '数据库初始化失败',
        detail: `迁移或读写异常，已中止启动以保护原库。请从备份恢复。\n\n${String(err)}`
      })
      app.quit()
      return
    }

    createWindow()

    // 启动健康检测调度器（启动即首检一轮，再按 meta.checkIntervalMinutes 轮询）。
    // M5 接 IPC 后传入 onUpdate 回调驱动 status:update；M3 仅留空钩子。
    scheduler = createScheduler()
    scheduler.start()

    app.on('activate', () => {
      // macOS：点 dock 图标时若无窗口则重建
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // 关窗即退出，不做托盘常驻（PRD 非目标）。退出前停止调度器，best-effort 丢弃未完成检测。
  app.on('window-all-closed', () => {
    scheduler?.stop()
    app.quit()
  })

  // 兜底：经菜单/Ctrl+Q 等非窗口路径退出时也停止调度器（stop 幂等）。
  app.on('before-quit', () => scheduler?.stop())
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'HiKey',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 安全基线（技术栈 §4.2，M1 即落地）
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 禁止应用内打开新窗口：仅放行 http/https 交系统浏览器，拒绝 file://、
  // 自定义协议等被转发给系统，防止渲染进程被注入内容时打开非预期协议。
  mainWindow.webContents.setWindowOpenHandler((details) => {
    const url = details.url
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 拦截渲染进程发起的页内导航（不影响主进程自身 loadURL/loadFile）
  mainWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
  })

  // 开发环境载 Vite dev server，生产环境载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}