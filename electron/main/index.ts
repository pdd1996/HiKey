import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

// 主进程入口（M1 脚手架）
// 业务模块（crypto/storage/healthCheck/scheduler/importer/backup/ipc）留待各自里程碑
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

  // 禁止外部导航：所有外部链接交由系统浏览器，不在应用内打开
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发环境载 Vite dev server，生产环境载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

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
