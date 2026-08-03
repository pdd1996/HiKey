// 预览编排（PRD FR-3 预览 + 去重）
//
// 顺序遍历 items，对每条跑 classifyItem：
//   new        → row.action='add'，把 name/secret 入 ctx（批次内后续可比对）
//   duplicate  → row.action='skip'，不入集合；dupOf='db' 时 dupTargetId=库记录 id（可覆盖）
// skipped vars → row status='skipped' action='skip' 固定。
// ImportSession.items 保留明文 secret（主进程内存，不外泄）。

import type { KeyRecord } from '../storage/schema'
import { buildDedupContext, classifyItem, addToContext, type DedupContext } from './dedup'
import { maskKey } from './mask'
import type { ParsedItem, SkippedVar, PreviewRow, ImportSession } from './types'

export function buildPreview(
  items: ParsedItem[],
  skipped: SkippedVar[],
  existingKeys: KeyRecord[]
): ImportSession {
  const ctx: DedupContext = buildDedupContext(existingKeys)
  const rows: PreviewRow[] = []
  const itemsMap = new Map<string, ParsedItem>()

  for (const item of items) {
    itemsMap.set(item.id, item)
    const c = classifyItem(item, ctx)
    if (c.status === 'new') {
      rows.push({
        id: item.id,
        name: item.name,
        provider: item.provider,
        baseUrl: item.baseUrl,
        keyMask: maskKey(item.secret),
        status: 'new',
        action: 'add'
      })
      addToContext(item, ctx)
    } else {
      rows.push({
        id: item.id,
        name: item.name,
        provider: item.provider,
        baseUrl: item.baseUrl,
        keyMask: maskKey(item.secret),
        status: 'duplicate',
        dupKind: c.dupKind,
        dupOf: c.dupOf,
        dupTargetId: c.dupTargetId,
        action: 'skip'
      })
      // duplicate 不入集合（已在），避免覆盖批次内首现的判定
    }
  }

  for (const s of skipped) {
    rows.push({
      id: s.id,
      name: s.label,
      provider: '',
      baseUrl: '',
      keyMask: s.valueMask,
      status: 'skipped',
      action: 'skip'
    })
  }

  return { rows, items: itemsMap, skipped }
}