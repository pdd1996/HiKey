import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

// 主进程入口（M1 脚手架）
// 业务模块（crypto/storage/healthCheck/scheduler/importer/backup/ipc）留待各自里程碑

// 单实例锁：lowdb 写单一 userData/hikey-db.json，双实例并发写会互相覆盖
// （PRD 零云端、单机定位）。第二实例直接聚焦已有窗口并退出。
const gotTheLock = app.requestSingleInstanceLock()
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

  app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
      // macOS：点 dock 图标时若无窗口则重建
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // 关窗即退出，不做托盘常驻（PRD 非目标）
  app.on('window-all-closed', () => {
    app.quit()
  })
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