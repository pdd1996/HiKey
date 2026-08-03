// backup handler（PRD §10 backup:export / backup:restore）
//
// export：buildBackup（纯逻辑）→ showSaveDialog → writeFile → 返回 plaintextRecordCount。
// restore：showOpenDialog → 读 → JSON.parse → 明文标记备份（plaintextBackup=true）弹
//   showMessageBox 强制二次确认（PRD FR-6）→ restoreBackup（纯逻辑已测）→ 成功后
//   db.read() 刷新单例 + scheduler.reschedule()（restoreBackup 绕过 Low 直接覆写文件，
//   单例内存已陈旧；meta 的并发/间隔可能随备份改变）。
//
// 接线逻辑：明文二次确认门 + 成功后 reload/reschedule，单测覆盖。

import { restoreBackup } from '../backup/restore'
import { buildBackup } from '../backup/pack'
import type { IpcDeps, ExportResult, RestoreResult } from './types'
import type { HikeyBackup } from '../backup/types'

const OPEN_DIALOG_OPTS: Electron.OpenDialogOptions = {
  title: '选择备份文件',
  filters: [{ name: 'HiKey 备份', extensions: ['hikey-backup'] }],
  properties: ['openFile']
}

const SAVE_DIALOG_OPTS: Electron.SaveDialogOptions = {
  title: '导出备份',
  filters: [{ name: 'HiKey 备份', extensions: ['hikey-backup'] }]
}

/** 明文标记备份的强制二次确认（PRD FR-6：醒目警告 + 强制确认）。 */
const PLAINTEXT_CONFIRM_OPTS: Electron.MessageBoxOptions = {
  type: 'warning',
  title: '明文备份恢复确认',
  message: '该备份为明文导出，任意机器可读',
  detail: '明文标记备份不经过 safeStorage 校验，恢复将直接覆盖当前库。请确认来源可信并已妥善保管。继续？',
  buttons: ['取消', '确认恢复'],
  defaultId: 0,
  cancelId: 0
}

export async function handleExport(deps: IpcDeps): Promise<ExportResult> {
  const backup = buildBackup(deps.db.data)
  const win = deps.getMainWindow()
  const res = await deps.dialog.showSaveDialog(win, SAVE_DIALOG_OPTS)
  if (res.canceled || !res.filePath) {
    return { ok: false, reason: 'cancelled' }
  }
  try {
    await deps.fs.writeFile(res.filePath, JSON.stringify(backup, null, 2))
  } catch (e) {
    return { ok: false, reason: 'write-failed' }
  }
  return { ok: true, plaintextRecordCount: backup.plaintextRecordCount }
}

export async function handleRestore(deps: IpcDeps): Promise<RestoreResult> {
  const win = deps.getMainWindow()
  const res = await deps.dialog.showOpenDialog(win, OPEN_DIALOG_OPTS)
  if (res.canceled || res.filePaths.length === 0) {
    return { ok: false, reason: 'cancelled', message: '已取消', rolledBack: false }
  }

  let raw: string
  try {
    raw = await deps.fs.readFile(res.filePaths[0])
  } catch (e) {
    return { ok: false, reason: 'load-failed', message: `读取备份失败：${(e as Error).message}`, rolledBack: false }
  }

  let b: unknown
  try {
    b = JSON.parse(raw)
  } catch (e) {
    return { ok: false, reason: 'load-failed', message: `备份 JSON 解析失败：${(e as Error).message}`, rolledBack: false }
  }

  // 明文标记备份：强制二次确认（PRD FR-6）。密文备份走 verifier，无需此门。
  if (isPlaintextBackup(b)) {
    const confirm = await deps.dialog.showMessageBox(win, PLAINTEXT_CONFIRM_OPTS)
    if (confirm.response === 0) {
      return { ok: false, reason: 'cancelled', message: '已取消', rolledBack: false }
    }
  }

  const out = await restoreBackup(b, deps.userDataDir, deps.now())
  if (!out.ok) {
    return { ok: false, reason: out.reason, message: out.message, rolledBack: out.rolledBack }
  }

  // 成功：restoreBackup 直接覆写了 hikey-db.json（绕过 Low 单例），必须重新读取刷新
  // 内存缓存，否则后续 handler 操作的是陈旧 db.data。meta 的并发/间隔可能随备份改变，
  // 一并 reschedule。
  await deps.db.read()
  deps.scheduler.reschedule()

  return { ok: true, migrated: out.migrated, reencrypted: out.reencrypted, rolledBack: out.rolledBack }
}

/** 安全判定 plaintextBackup 标记（容错：非对象或字段缺失视为密文备份，交由 restoreBackup 校验）。 */
function isPlaintextBackup(b: unknown): boolean {
  return typeof b === 'object' && b !== null && (b as HikeyBackup).plaintextBackup === true
}