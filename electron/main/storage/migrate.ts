// schema 迁移 + 启动归位（数据库设计 §5 + §6.3）
//
// §5：启动读 schemaVersion（字段缺失视为 0），低于当前（2）则迁移并写回；
//     未知 provider（如历史 gemini）标记为 custom 并在 lastError 写迁移说明；
//     迁移失败中止启动、不破坏原库（由 db.ts 保证：仅成功后写回）。
// §6.3：每次启动无条件将遗留 checking 归位为 unchecked（上次检测未完成，结果未知）。

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
  }

  // 提升版本号到当前
  if (loose.schemaVersion !== SCHEMA_VERSION) {
    ;(root as { schemaVersion: 2 }).schemaVersion = SCHEMA_VERSION
    changed = true
  }

  // 归位：遗留 checking → unchecked（§6.3，每次启动无条件）
  for (const raw of root.keys) {
    const k = raw as { status?: string }
    if (k.status === 'checking') {
      k.status = 'unchecked'
      changed = true
    }
  }

  return { changed }
}

function isKnownProvider(p: unknown): boolean {
  return (KNOWN_PROVIDERS as readonly string[]).includes(p as string)
}