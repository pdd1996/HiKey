// 数据库 schema：类型 + 默认值（数据库设计 §2-§5）
// 字段缺失视为 schemaVersion 0（§5），由 migrate.ts 归一到当前版本。

/** 当前 schema 版本号。低于此值触发迁移。 */
export const SCHEMA_VERSION = 5

// KNOWN_PROVIDERS / Provider 已抽到 shared/providers.ts（跨进程共享单一来源）。
// 此处 re-export 保持现有 `from '../storage/schema'` 引用不变。
import { KNOWN_PROVIDERS, type Provider } from '../../../shared/providers'
export { KNOWN_PROVIDERS, type Provider }

/** secretMode 自描述 encSecret 是密文还是明文（§3.2） */
export type SecretMode = 'safeStorage' | 'plaintext'

/**
 * 检测状态（§3.3）。
 * HTTP 码原样存储（200/400/401/402/429/500/503），非 HTTP 场景用特殊字符串。
 * undefined = 未检测（新 key 或换 secret 后清空）。
 * 用 string 而非联合类型，因为 HTTP 码是开放集（不同 provider 可能返回 403/404/422 等）。
 */
export type KeyStatus = string

/** 上次检测类型（§3.3） */
export type CheckMode = 'ping' | 'deep' | null

/** 单条 key 记录（§3） */
export interface KeyRecord {
  id: string // uuid，主键
  name: string // 非唯一
  provider: Provider
  baseUrl: string // API 根，不含版本路径
  encSecret: string // base64；密文或明文，由 secretMode 区分
  secretMode: SecretMode
  status?: KeyStatus
  lastChecked?: number // ms 时间戳
  lastCheckMode?: CheckMode
  lastDeepCheckedAt?: number // 与 lastChecked 分开
  lastError?: string // 脱敏，绝不包含明文 key
  pingMs?: number // ping 延迟（拿到 HTTP 响应时记录；网络/超时失败留 undefined）
  deepCheck: boolean // 与全局 deepCheckEnabled AND
  testModel: string // custom 无默认，其余 provider 预设
  createdAt: number
  updatedAt: number
  notes?: string // 明确不放 secret
}

/** 全局设置（§4） */
export interface Meta {
  checkIntervalMinutes: number
  /** 定时检测总开关：关则不进行启动首检与定时轮询，手动检测不受影响。默认开。 */
  healthCheckEnabled: boolean
  deepCheckEnabled: boolean
  concurrentChecks: number
  pingTimeoutMs: number
  deepTimeoutMs: number
  allowPlaintextFallback: boolean // 明文降级开关（§7.4）
  plaintextMode: boolean // 当前是否真的处于明文模式
  clipboardClearMs: number
}

/** DB 根对象（§2） */
export interface DbRoot {
  schemaVersion: 5
  keys: KeyRecord[]
  meta: Meta
}

/** §4 默认值 */
export const DEFAULT_META: Meta = {
  checkIntervalMinutes: 15,
  healthCheckEnabled: true,
  deepCheckEnabled: false,
  concurrentChecks: 4,
  pingTimeoutMs: 2000,
  deepTimeoutMs: 2000,
  allowPlaintextFallback: false,
  plaintextMode: false,
  clipboardClearMs: 60000
}

/** 新建库的默认根对象 */
export function defaultDbRoot(): DbRoot {
  return {
    schemaVersion: SCHEMA_VERSION,
    keys: [],
    meta: { ...DEFAULT_META }
  }
}