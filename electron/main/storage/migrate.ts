// schema 迁移（M8.2 改造：v2→v3 旧状态映射为 HTTP 码）
//
// v2→v3 迁移：旧 KeyStatus 值映射为 HTTP 码或删除。
//   valid → 200, invalid → 401, rate_limited → 429, quota_exceeded → 402,
//   unknown → 500, checking/unchecked → 删除（设为 undefined）。
// 迁移失败中止启动、不破坏原库（由 db.ts 保证：仅成功后写回）。

import {
  SCHEMA_VERSION,
  KNOWN_PROVIDERS,
  DEFAULT_META,
  type DbRoot,
  type Meta,
  type KeyRecord
} from './schema'

// 迁移输入按宽松形状处理：历史库 schemaVersion 可能缺失/为 0。
type LooseRoot = {
  schemaVersion?: number
  keys?: unknown[]
  meta?: Partial<Meta>
}

/** 旧 KeyStatus → HTTP 码映射表。不在表中的值（含 undefined）保持不变。 */
const STATUS_MIGRATION: Record<string, string | undefined> = {
  valid: '200',
  invalid: '401',
  rate_limited: '429',
  quota_exceeded: '402',
  unknown: '500',
  checking: undefined,
  unchecked: undefined,
}

/** 迁移并归位。返回是否发生变更（决定是否写回）。 */
export function migrate(root: DbRoot): { changed: boolean } {
  let changed = false
  const loose = root as LooseRoot

  // 防御：确保 keys/meta 结构存在
  if (!Array.isArray(root.keys)) {
    ;(root as { keys: KeyRecord[] }).keys = []
    changed = true
  }
  if (!root.meta || typeof root.meta !== 'object') {
    ;(root as { meta: Meta }).meta = { ...DEFAULT_META }
    changed = true
  }

  const currentVersion = loose.schemaVersion ?? 0

  if (currentVersion < SCHEMA_VERSION) {
    // 未知 provider → custom，写迁移说明（§5.3）
    for (const raw of root.keys) {
      const k = raw as { provider?: string; lastError?: string }
      if (!isKnownProvider(k.provider)) {
        const oldProvider = k.provider ?? '(空)'
        k.provider = 'custom'
        k.lastError = `原 provider=${oldProvider}，已迁移为 custom，请确认 baseUrl/testModel`
        changed = true
      }
    }
    // 回填缺失 meta 字段为默认
    const meta = root.meta as unknown as Record<keyof Meta, unknown>
    for (const key of Object.keys(DEFAULT_META) as (keyof Meta)[]) {
      if (meta[key] === undefined) {
        meta[key] = DEFAULT_META[key]
        changed = true
      }
    }
    // v2→v3：旧 KeyStatus 映射为 HTTP 码
    for (const raw of root.keys) {
      const k = raw as { status?: string }
      if (k.status !== undefined && k.status in STATUS_MIGRATION) {
        const newStatus = STATUS_MIGRATION[k.status]
        if (newStatus === undefined) {
          delete k.status
        } else {
          k.status = newStatus
        }
        changed = true
      }
    }
  }

  // 提升版本号到当前
  if (loose.schemaVersion !== SCHEMA_VERSION) {
    ;(root as { schemaVersion: 3 }).schemaVersion = SCHEMA_VERSION
    changed = true
  }

  return { changed }
}

function isKnownProvider(p: unknown): boolean {
  return (KNOWN_PROVIDERS as readonly string[]).includes(p as string)
}
