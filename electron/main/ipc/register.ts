// IPC 注册：把 15 个通道接到 ipcMain.handle，并从真实 Electron 构造 IpcDeps。
//
// registerIpcHandlers(deps)：每个通道 ipcMain.handle(channel, (_e, ...args) => handler(deps, ...args))。
// createIpcDeps(parts)：用 Electron 真实副作用填充 dialog/fs/clipboard/now/setTimeout，
//   db/scheduler/userDataDir/getMainWindow/sendStatus/sessions 由 index.ts 传入。
// makeSendStatus(getMainWindow)：scheduler.onUpdate → 剥 encSecret → webContents.send。

import { ipcMain, dialog, clipboard, type BrowserWindow } from 'electron'
import { promises as fs } from 'fs'
import { Channels, type IpcDeps } from './types'
import { toSafeView, handleList, handleAdd, handleUpdate, handleRemove, handleReveal, handleCheckNow, handleCheckAll, handleProbe } from './keys'
import { handleIsEncryptionAvailable } from './system'
import { handlePickAndParse, handleConfirm } from './import'
import { handleExport, handleRestore } from './backup'
import { handleGet, handleSet } from './settings'
import type { Low } from 'lowdb'
import type { DbRoot, KeyRecord } from '../storage/schema'
import type { Scheduler } from '../healthCheck/scheduler'
import type { ImportSession } from '../import/types'

/** 构造 sendStatus：scheduler.onUpdate 落点——剥 encSecret 后经主窗口下发渲染进程。 */
export function makeSendStatus(getMainWindow: () => BrowserWindow | undefined): (id: string, record: KeyRecord) => void {
  return (id, record) => {
    const win = getMainWindow()
    if (!win || win.isDestroyed()) return
    win.webContents.send(Channels.statusUpdate, { id, record: toSafeView(record) })
  }
}

/** index.ts 持有的进程级部件（Electron 副作用由本函数填充）。 */
export interface IpcDepsParts {
  db: Low<DbRoot>
  scheduler: Scheduler
  userDataDir: string
  getMainWindow: () => BrowserWindow | undefined
  sendStatus: (id: string, record: KeyRecord) => void
  sessions: Map<string, ImportSession>
}

/** 用真实 Electron 副作用补齐 IpcDeps。 */
export function createIpcDeps(parts: IpcDepsParts): IpcDeps {
  return {
    db: parts.db,
    scheduler: parts.scheduler,
    userDataDir: parts.userDataDir,
    sessions: parts.sessions,
    dialog: {
      showOpenDialog: (win, opts) => (win ? dialog.showOpenDialog(win, opts) : dialog.showOpenDialog(opts)),
      showSaveDialog: (win, opts) => (win ? dialog.showSaveDialog(win, opts) : dialog.showSaveDialog(opts)),
      showMessageBox: (win, opts) => (win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts))
    },
    fs: {
      readFile: (path) => fs.readFile(path, 'utf8'),
      writeFile: (path, data) => fs.writeFile(path, data, 'utf8')
    },
    clipboard: {
      writeText: (text) => clipboard.writeText(text),
      readText: () => clipboard.readText(),
      clear: () => clipboard.clear()
    },
    getMainWindow: parts.getMainWindow,
    sendStatus: parts.sendStatus,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    now: () => Date.now()
  }
}

/** 注册全部 IPC handler。幂等（重复注册会抛错，正常只调一次）。 */
export function registerIpcHandlers(deps: IpcDeps): void {
  ipcMain.handle(Channels.systemIsEncryptionAvailable, () => handleIsEncryptionAvailable(deps))
  ipcMain.handle(Channels.keysList, () => handleList(deps))
  ipcMain.handle(Channels.keysAdd, (_e, input) => handleAdd(deps, input))
  ipcMain.handle(Channels.keysUpdate, (_e, id, input) => handleUpdate(deps, id, input))
  ipcMain.handle(Channels.keysRemove, (_e, id) => handleRemove(deps, id))
  ipcMain.handle(Channels.keysReveal, (_e, id) => handleReveal(deps, id))
  ipcMain.handle(Channels.keysCheckNow, (_e, id, mode) => handleCheckNow(deps, id, mode))
  ipcMain.handle(Channels.keysCheckAll, (_e, mode) => handleCheckAll(deps, mode))
  ipcMain.handle(Channels.keysProbe, (_e, input) => handleProbe(deps, input))
  ipcMain.handle(Channels.importPickAndParse, () => handlePickAndParse(deps))
  ipcMain.handle(Channels.importConfirm, (_e, sessionId, confirms) => handleConfirm(deps, sessionId, confirms))
  ipcMain.handle(Channels.backupExport, () => handleExport(deps))
  ipcMain.handle(Channels.backupRestore, () => handleRestore(deps))
  ipcMain.handle(Channels.settingsGet, () => handleGet(deps))
  ipcMain.handle(Channels.settingsSet, (_e, partial) => handleSet(deps, partial))
}