// IPC 层共享类型 + 通道名 + 可注入依赖（PRD §10）
//
// M5 是薄胶水层：handler 取库 → 调纯逻辑 → 写库 → 返回，混入 Electron 副作用
// （ipcMain/dialog/clipboard/app.getPath/webContents.send）。副作用抽成 IpcDeps
// 可注入，沿用 keys/clipboard 的 ClipboardDeps + scheduler 的 SchedulerHooks 注入套路。
//
// 测试策略（混合注入）：只对有真实接线逻辑的 handler 写单测（keys:reveal 剪贴板接线、
// import:pickAndParse 解析分流、backup:restore 明文二次确认门 + 成功后 db.read、
// settings:set reschedule + allowPlaintextFallback 关闭门），纯转发 handler 不单测。

import type { Low } from 'lowdb'
import type { BrowserWindow } from 'electron'
import type { DbRoot, KeyRecord, Meta } from '../storage/schema'
import type { ImportSession, ConfirmItem, PreviewRow } from '../import/types'
import type { ApplyResult } from '../import/apply'
import type { KeyInput, SafeKeyView, AddOutcome, UpdateOutcome, RemoveOutcome, RevealOutcome } from '../keys/types'
import type { RestoreRejectReason } from '../backup/types'
import type { CheckModeArg } from '../healthCheck/checker'

/** re-export 供 preload/renderer 复用（status:update 载荷类型）。 */
export type { SafeKeyView } from '../keys/types'

/**
 * 调度器最小接口（handler 只用 checkNow/checkAll/reschedule）。
 * 用接口而非 Scheduler 具体类，便于测试注入 MockScheduler（Scheduler 含私有成员，
 * 结构上不兼容普通对象）。
 */
export interface SchedulerLike {
  checkNow(id: string, mode?: CheckModeArg): void
  checkAll(mode?: CheckModeArg): void
  reschedule(): void
  start(): void
  stop(): void
}

/** 通道名常量（主↔渲染共用，避免拼写漂移）。 */
export const Channels = {
  systemIsEncryptionAvailable: 'system:isEncryptionAvailable',
  keysList: 'keys:list',
  keysAdd: 'keys:add',
  keysUpdate: 'keys:update',
  keysRemove: 'keys:remove',
  keysReveal: 'keys:reveal',
  keysCheckNow: 'keys:checkNow',
  keysCheckAll: 'keys:checkAll',
  importPickAndParse: 'import:pickAndParse',
  importConfirm: 'import:confirm',
  backupExport: 'backup:export',
  backupRestore: 'backup:restore',
  statusUpdate: 'status:update',
  settingsGet: 'settings:get',
  settingsSet: 'settings:set'
} as const

/** dialog 子集接口（仅暴露 handler 用到的方法，便于测试 mock）。 */
export interface DialogApi {
  showOpenDialog(
    win: BrowserWindow | undefined,
    opts: Electron.OpenDialogOptions
  ): Promise<Electron.OpenDialogReturnValue>
  showSaveDialog(
    win: BrowserWindow | undefined,
    opts: Electron.SaveDialogOptions
  ): Promise<Electron.SaveDialogReturnValue>
  showMessageBox(
    win: BrowserWindow | undefined,
    opts: Electron.MessageBoxOptions
  ): Promise<Electron.MessageBoxReturnValue>
}

/** fs 子集接口（仅暴露 handler 用到的方法）。 */
export interface FsApi {
  readFile(path: string): Promise<string>
  writeFile(path: string, data: string): Promise<void>
}

/** clipboard 子集接口（reveal 复制 + 60s 比对清除用）。 */
export interface ClipboardApi {
  writeText(text: string): void
  readText(): string
  clear(): void
}

/**
 * handler 层全部依赖。真实运行时由 register.ts 从 Electron 构造并注入；
 * 测试用 mock 填充副作用字段，db/scheduler 用内存假实例。
 */
export interface IpcDeps {
  db: Low<DbRoot>
  scheduler: SchedulerLike
  /** app.getPath('userData')，备份恢复需要。 */
  userDataDir: string
  /** 导入会话内存存储（pickAndParse 写入 / confirm 反查）。 */
  sessions: Map<string, ImportSession>
  // —— 可注入副作用（测试 mock）——
  dialog: DialogApi
  fs: FsApi
  clipboard: ClipboardApi
  /** 取主窗口（dialog 父窗口；可能尚未创建）。 */
  getMainWindow: () => BrowserWindow | undefined
  /** scheduler.onUpdate 回调最终落点：剥 encSecret 后 webContents.send。 */
  sendStatus: (id: string, record: KeyRecord) => void
  /** 剪贴板定时器（测试用 fake timers 覆盖）。 */
  setTimeout: (fn: () => void, ms: number) => unknown
  /** 当前时间戳（addKey/updateKey/applyImport/restoreBackup 需要）。 */
  now: () => number
}

// —— 各 handler 返回类型（与 preload/renderer 共享）——

/** import:pickAndParse 结果：成功返会话+预览行；解析失败返 error；用户取消返 null。 */
export type PickAndParseResult =
  | { ok: true; sessionId: string; rows: PreviewRow[] }
  | { ok: false; error: string }
  | null

/** import:confirm 结果：成功返 ApplyResult；sessionId 缺失返错误。 */
export type ConfirmResult =
  | { ok: true; result: ApplyResult }
  | { ok: false; reason: string }

/** backup:export 结果。 */
export type ExportResult =
  | { ok: true; plaintextRecordCount: number }
  | { ok: false; reason: 'cancelled' | 'write-failed' }

/** backup:restore 结果（扩展 restoreBackup 的拒绝原因，叠加取消/读取失败）。 */
export type RestoreResult =
  | { ok: true; migrated: boolean; reencrypted: number; rolledBack: boolean }
  | { ok: false; reason: RestoreRejectReason | 'cancelled' | 'load-failed'; message: string; rolledBack: boolean }

/** settings:set 结果。 */
export type SetSettingsResult = { ok: true } | { ok: false; reason: string }

/**
 * preload 暴露给渲染进程的完整 API（window.hikey）。
 * 与上方通道一一对应；preload 端的薄切片 + renderer 端的类型引用都基于此。
 */
export interface HikeyApi {
  system: {
    isEncryptionAvailable(): Promise<boolean>
  }
  keys: {
    list(): Promise<SafeKeyView[]>
    add(input: KeyInput): Promise<AddOutcome>
    update(id: string, input: KeyInput): Promise<UpdateOutcome>
    remove(id: string): Promise<RemoveOutcome>
    reveal(id: string): Promise<RevealOutcome>
    checkNow(id: string, mode?: CheckModeArg): Promise<void>
    checkAll(mode?: CheckModeArg): Promise<void>
  }
  import: {
    pickAndParse(): Promise<PickAndParseResult>
    confirm(sessionId: string, confirms: ConfirmItem[]): Promise<ConfirmResult>
  }
  backup: {
    export(): Promise<ExportResult>
    restore(): Promise<RestoreResult>
  }
  settings: {
    get(): Promise<Meta>
    set(partial: Partial<Meta>): Promise<SetSettingsResult>
  }
  /** 订阅状态变更，返回取消订阅函数。 */
  onStatusUpdate(cb: (payload: { id: string; record: SafeKeyView }) => void): () => void
}