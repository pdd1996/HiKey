// 导入模块共享类型（PRD FR-3）
//
// 边界：ParsedItem 携带明文 secret，仅存在于主进程内存（导入会话），
// 绝不外泄渲染进程；PreviewRow 为掩码后安全形态，可经 IPC 传渲染进程。

import type { Provider } from '../storage/schema'

/** 解析出的可导入项（主进程内存，携带明文 secret）。 */
export interface ParsedItem {
  id: string // `${source}-${index}`，预览↔确认稳定链接
  name: string // 自动生成或 JSON 提供
  provider: Provider
  baseUrl: string // *_BASE_URL / DEFAULT_BASE_URL / JSON 提供
  secret: string // 明文
  source: 'env' | 'json'
}

/** 被跳过的变量 / 非法项（预览列出，不可导入）。 */
export interface SkippedVar {
  id: string
  label: string // 变量名 / JSON 项标识
  valueMask: string // 掩码值（可见性）
  reason: string // '未识别的变量' / 'provider 非法' / '缺少 key' 等
}

/** 预览行（掩码后，安全发渲染进程）。 */
export interface PreviewRow {
  id: string // 匹配 ParsedItem.id
  name: string // 可编辑
  provider: Provider | '' // '' 仅 skipped 行
  baseUrl: string
  keyMask: string
  status: 'new' | 'duplicate' | 'skipped'
  dupKind?: 'name' | 'secret' | 'name+secret'
  dupOf?: 'db' | 'batch'
  dupTargetId?: string // 仅 dupOf='db'：库记录 id（覆盖目标）
  action: 'add' | 'skip' | 'overwrite' | 'force-add' // 默认按 status
}

/** 用户确认提交的单条决策。 */
export interface ConfirmItem {
  id: string
  name: string // 最终 name（用户可改）
  action: 'add' | 'skip' | 'overwrite' | 'force-add'
}

/** 导入会话：预览行 + 原始项（含明文 secret，主进程内存，不外泄）。 */
export interface ImportSession {
  rows: PreviewRow[]
  items: Map<string, ParsedItem>
  skipped: SkippedVar[] // rows 中也含 skipped 行，此处保留明细供日志
}

/** JSON 解析失败 / 顶层数组缺失等。M5 catch 提示用户。 */
export class ImportParseError extends Error {
  readonly kind: 'invalid-json' | 'not-array'
  constructor(kind: 'invalid-json' | 'not-array', message: string) {
    super(message)
    this.name = 'ImportParseError'
    this.kind = kind
  }
}