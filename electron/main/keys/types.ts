// keys 模块类型（PRD FR-4 列表与详情管理 + FR-1 剪贴板）
//
// CRUD/reveal/list 的输入输出 + 剪贴板编排依赖。
// 纯逻辑：CRUD/reveal/list 接受 DbRoot 内存对象，不调 getDb()；调用方（M5）负责取库 + 写回。

import type { KeyRecord, Provider, SecretMode } from '../storage/schema'

/** 新增/编辑表单输入（PRD FR-4）。secret 在 add 时必填，update 时可选（只改元数据则不传）。 */
export interface KeyInput {
  provider: Provider
  name: string
  baseUrl: string
  /** 明文 secret；update 时缺省表示不改 secret。 */
  secret?: string
  notes?: string
  /** 测试模型；custom 必填，其余 provider 缺省取 DEFAULT_TEST_MODEL。 */
  testModel?: string
  /** 深检开关；缺省 true。 */
  deepCheck?: boolean
}

/** 列表项：剥 encSecret 后的安全视图（PRD FR-4 列表展示，不含明文）。 */
export type SafeKeyView = Omit<KeyRecord, 'encSecret' | 'secretMode'> & {
  /** secretMode 保留，UI 据此提示"明文记录" */
  secretMode: SecretMode
}

export type CrudRejectReason = 'not-found' | 'fail-closed' | 'invalid-input'

export interface AddOutcome {
  ok: boolean
  id?: string
  reason?: CrudRejectReason
}
export interface UpdateOutcome {
  ok: boolean
  reason?: CrudRejectReason
}
export interface RemoveOutcome {
  ok: boolean
  reason?: 'not-found'
}

export type RevealOutcome =
  | { ok: true; plaintext: string }
  | { ok: false; reason: 'not-found' | 'undecryptable' }

/** 剪贴板清除编排的注入依赖（全部副作用外置，便于 vitest fake timers 测）。 */
export interface ClipboardDeps {
  /** 读取当前剪贴板文本 */
  readClipboard: () => string
  /** 清空剪贴板 */
  clearClipboard: () => void
  /** 定时器（测试用 fake timers 覆盖） */
  setTimeout: (fn: () => void, ms: number) => unknown
  /** 延迟毫秒（FR-1 = 60000） */
  delayMs: number
}