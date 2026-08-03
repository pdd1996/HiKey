// 去重核心（PRD FR-3 去重规则）
//
// 两维：name 维 = "provider|name" 完全相等；secret 维 = sha256(trim(secret)) 相等（只存 hash）。
// 对照基准：现有 DB 记录（dupOf='db'）+ 批次内先出现项（dupOf='batch'）。
//   db 命中靠 nameToId/hashToId（库记录 id）；批次内命中只入 nameSet/secretHashSet，
//   故 classifyItem 据是否有 nameToId/hashToId 命中区分 db vs batch。
// name+secret 同时命中不同库记录时，以 name 命中记录为覆盖目标。

import type { KeyRecord } from '../storage/schema'
import { revealSecret } from '../crypto'
import { secretHash } from './mask'
import type { ParsedItem } from './types'

export interface DedupContext {
  nameSet: Set<string> // "provider|name"
  secretHashSet: Set<string> // sha256(trim(secret))
  nameToId: Map<string, string> // name key → 库记录 id（db 命中）
  hashToId: Map<string, string> // hash → 库记录 id（db 命中）
}

function nameKey(provider: string, name: string): string {
  return `${provider}|${name}`
}

/**
 * 用现有库记录初始化 ctx。
 * revealSecret 取明文做 hash；undecryptable（safeStorage 不可用/密文损坏）→ secret 维跳过，name 维仍入。
 */
export function buildDedupContext(existingKeys: KeyRecord[]): DedupContext {
  const nameSet = new Set<string>()
  const secretHashSet = new Set<string>()
  const nameToId = new Map<string, string>()
  const hashToId = new Map<string, string>()

  for (const k of existingKeys) {
    const nk = nameKey(k.provider, k.name)
    nameSet.add(nk)
    nameToId.set(nk, k.id)
    const revealed = revealSecret(k.encSecret, k.secretMode)
    if (revealed.ok) {
      const h = secretHash(revealed.plaintext)
      secretHashSet.add(h)
      hashToId.set(h, k.id)
    }
    // undecryptable：secret 维无法比对，跳过（仅 name 维可比对）
  }

  return { nameSet, secretHashSet, nameToId, hashToId }
}

export interface ItemClassify {
  status: 'new' | 'duplicate'
  dupKind?: 'name' | 'secret' | 'name+secret'
  dupOf?: 'db' | 'batch'
  dupTargetId?: string // 仅 dupOf='db'
}

/**
 * 单条 item 对照 ctx 判定。不修改 ctx（批次内入集合由 preview 编排决定）。
 */
export function classifyItem(item: ParsedItem, ctx: DedupContext): ItemClassify {
  const nk = nameKey(item.provider, item.name)
  const h = secretHash(item.secret)
  const nameHit = ctx.nameSet.has(nk)
  const secretHit = ctx.secretHashSet.has(h)

  if (!nameHit && !secretHit) {
    return { status: 'new' }
  }

  // db 命中：nameToId 或 hashToId 有对应记录
  const dbNameId = ctx.nameToId.get(nk)
  const dbHashId = ctx.hashToId.get(h)
  const isDb = dbNameId !== undefined || dbHashId !== undefined

  const dupKind: 'name' | 'secret' | 'name+secret' =
    nameHit && secretHit ? 'name+secret' : nameHit ? 'name' : 'secret'

  if (isDb) {
    // name 命中优先作为覆盖目标
    const dupTargetId = dbNameId ?? dbHashId!
    return { status: 'duplicate', dupKind, dupOf: 'db', dupTargetId }
  }

  // 仅批次内命中
  return { status: 'duplicate', dupKind, dupOf: 'batch' }
}

/** 把一条 new item 的 name/secret 加入 ctx（批次内后续可比对）。 */
export function addToContext(item: ParsedItem, ctx: DedupContext): void {
  ctx.nameSet.add(nameKey(item.provider, item.name))
  ctx.secretHashSet.add(secretHash(item.secret))
  // 批次内不入 nameToId/hashToId（无库记录 id），保证 classifyItem 区分 db vs batch
}