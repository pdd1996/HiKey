import { app, BrowserWindow, dialog, shell } from 'electron'
import { join } from 'path'
import { initStorage, getDb } from './storage/db'
import { createScheduler, type Scheduler } from './healthCheck/scheduler'
import { createIpcDeps, registerIpcHandlers, makeSendStatus } from './ipc/register'

// 主进程入口
// M1 脚手架 → M2 storage/crypto → M3 healthCheck/scheduler → M5 IPC 接线。
// 业务纯逻辑见各子模块；本文件只编排启动顺序 + 注册 IPC。

// 单实例锁：lowdb 写单一 userData/hikey-db.json，双实例并发写会互相覆盖
// （PRD 零云端、单机定位）。第二实例直接聚焦已有窗口并退出。
const gotTheLock = app.requestSingleInstanceLock()

// 健康检测调度器（M3）；M5 注入 onUpdate 钩子驱动 status:update。
let scheduler: Scheduler | undefined
// 主窗口引用（sendStatus / dialog 父窗口用）。
let mainWindow: BrowserWindow | undefined

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

    // 取主窗口的惰性闭包：sendStatus / dialog 在窗口创建前后都可能被调用。
    const getMainWindow = () => mainWindow

    // scheduler.onUpdate → 剥 encSecret → webContents.send('status:update')（M5）。
    const sendStatus = makeSendStatus(getMainWindow)
    scheduler = createScheduler(undefined, { onUpdate: sendStatus })

    // 注册 IPC handler（PRD §10 全部 14 通道）。窗口加载前注册，避免 invoke 竞态。
    const deps = createIpcDeps({
      db: getDb(),
      scheduler,
      userDataDir: app.getPath('userData'),
      getMainWindow,
      sendStatus,
      sessions: new Map()
    })
    registerIpcHandlers(deps)

    // 创建窗口（先于 scheduler.start：首检的 onUpdate 才能到达渲染进程）。
    mainWindow = createWindow()

    // 启动健康检测调度器（启动即首检一轮，再按 meta.checkIntervalMinutes 轮询）。
    scheduler.start()

    app.on('activate', () => {
      // macOS：点 dock 图标时若无窗口则重建
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
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

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    title: 'HiKey',
    // 隐藏原生标题栏：让渲染进程的 TitleBar 接管顶部 UI（HiKey 大标题、视图切换、
    // 一键深检、设置、主题切换等按钮已在 src/components/TitleBar.tsx 实现）。
    // 这样原生 frame 不会在不同主题下出现违和的白色条，且能跟随 .dark class 自动变色。
    // 拖动/最大化行为由 macOS 自动处理，Windows/Linux 需前端额外处理（见 TitleBar.tsx）。
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 14 } : undefined,
    // 窗口/任务栏图标：dev 直指源文件，生产指向 resources/icons/icon.ico。
    icon: join(__dirname, '../../resources/icons/icon.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      // 安全基线（技术栈 §4.2，M1 即落地）
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.on('ready-to-show', () => {
    win.show()
  })

  // 禁止应用内打开新窗口：仅放行 http/https 交系统浏览器，拒绝 file://、
  // 自定义协议等被转发给系统，防止渲染进程被注入内容时打开非预期协议。
  win.webContents.setWindowOpenHandler((details) => {
    const url = details.url
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  // 拦截渲染进程发起的页内导航（不影响主进程自身 loadURL/loadFile）
  win.webContents.on('will-navigate', (event, url) => {
    event.preventDefault()
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url)
    }
  })

  // 开发环境载 Vite dev server，生产环境载打包产物
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}