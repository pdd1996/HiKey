// IPC 测试共享工具：内存假 db + KeyRecord 工厂 + 可注入 IpcDeps 构造器。
// vitest 仅 include electron/main/**/*.test.ts，本文件为辅助模块（非测试）。

import { vi, type Mock } from 'vitest'
import { randomUUID } from 'crypto'
import { DEFAULT_META, type DbRoot, type KeyRecord, type SecretMode } from '../storage/schema'
import type { Low } from 'lowdb'
import type { IpcDeps } from './types'
import type { Scheduler } from '../healthCheck/scheduler'
import type { ImportSession } from '../import/types'
import type { BrowserWindow } from 'electron'

/** 内存假 Low：data 可直接改，write/read 为 Mock 供断言调用次数。 */
export type MockDb = Low<DbRoot> & { write: Mock; read: Mock }

export function makeDb(keys: KeyRecord[] = [], metaOver: Partial<typeof DEFAULT_META> = {}): MockDb {
  const data: DbRoot = { schemaVersion: 2, keys, meta: { ...DEFAULT_META, ...metaOver } }
  return { data, write: vi.fn(async () => {}), read: vi.fn(async () => {}) } as unknown as MockDb
}

/** 造一条 KeyRecord（safeStorage 密文模式默认）。 */
export function makeKey(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: randomUUID(),
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: Buffer.from('sk-secret', 'utf8').toString('base64'),
    secretMode: 'safeStorage' as SecretMode,
    status: 'unchecked',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    ...over
  }
}

/** 假调度器：只记录 checkNow/checkAll/reschedule 调用。 */
export type MockScheduler = {
  checkNow: Mock
  checkAll: Mock
  reschedule: Mock
  start: Mock
  stop: Mock
}

export function makeFakeScheduler(): MockScheduler {
  return {
    checkNow: vi.fn(),
    checkAll: vi.fn(),
    reschedule: vi.fn(),
    start: vi.fn(),
    stop: vi.fn()
  }
}

/**
 * 测试用 IpcDeps：副作用字段均为 Mock（可断言）。结构兼容 IpcDeps（Mock 可调用，
 * 可赋给 () => string 等签名），故可直接传给 handler。
 */
export type MockDeps = {
  db: MockDb
  scheduler: MockScheduler
  userDataDir: string
  sessions: Map<string, ImportSession>
  dialog: { showOpenDialog: Mock; showSaveDialog: Mock; showMessageBox: Mock }
  fs: { readFile: Mock; writeFile: Mock }
  clipboard: { writeText: Mock; readText: Mock; clear: Mock }
  getMainWindow: Mock
  sendStatus: Mock
  setTimeout: IpcDeps['setTimeout']
  now: IpcDeps['now']
}

/** 构造 MockDeps，副作用默认为 vi.fn，可按需 override（顶层字段 + 子对象 partial）。 */
export function makeDeps(over: Partial<MockDeps> & {
  dialog?: Partial<MockDeps['dialog']>
  fs?: Partial<MockDeps['fs']>
  clipboard?: Partial<MockDeps['clipboard']>
} = {}): MockDeps {
  const dialog: MockDeps['dialog'] = {
    showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] })),
    showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: '' })),
    showMessageBox: vi.fn(async () => ({ response: 0, checkboxChecked: false })),
    ...over.dialog
  }
  const fs: MockDeps['fs'] = {
    readFile: vi.fn(async () => ''),
    writeFile: vi.fn(async () => {}),
    ...over.fs
  }
  const clipboard: MockDeps['clipboard'] = {
    writeText: vi.fn(),
    readText: vi.fn(() => ''),
    clear: vi.fn(),
    ...over.clipboard
  }
  return {
    db: over.db ?? makeDb(),
    scheduler: over.scheduler ?? makeFakeScheduler(),
    userDataDir: over.userDataDir ?? '/tmp/hikey-test',
    sessions: over.sessions ?? new Map<string, ImportSession>(),
    dialog,
    fs,
    clipboard,
    getMainWindow: (over.getMainWindow ?? vi.fn(() => undefined)) as unknown as Mock,
    sendStatus: over.sendStatus ?? vi.fn(),
    setTimeout: over.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
    now: over.now ?? (() => 1_700_000_000_000)
  }
}