// 确认写入（PRD FR-3 确认写入 + 覆盖语义）
//
// 按 confirm 逐条执行，信任传入的 name/action（schema 中 name/secret 非唯一，重名/重复 secret
// 由用户负责；PRD 验收"同 key 多 names"）。全部内存修改后 syncPlaintextMode + 一次 db.write。
// 不调 checkKey、不碰 scheduler——导入不立即检测，由用户重检/调度（PRD FR-3）。
//
// 覆盖（已确认决策）：仅更新 name/baseUrl/secret，保留 testModel/notes/id/createdAt；
//   secret 重写后 status='unchecked'，清 lastChecked/lastCheckMode/lastDeepCheckedAt/lastError。
// 复用 getDb() 单实例写互斥（M2 契约）。

import { randomUUID } from 'crypto'
import { getDb } from '../storage/db'
import { syncPlaintextMode } from '../storage/plaintext'
import { encryptForStore } from '../crypto'
import { DEFAULT_TEST_MODEL } from '../providers'
import type { KeyRecord } from '../storage/schema'
import type { ConfirmItem, ImportSession } from './types'

export interface ApplyFailure {
  id: string
  reason: string
}

export interface ApplyResult {
  added: number
  overwritten: number
  skipped: number
  failed: number
  failures: ApplyFailure[]
}

/** 按 confirm 逐条执行；全部修改后 syncPlaintextMode + 一次 db.write。不触发检测。 */
export async function applyImport(
  confirms: ConfirmItem[],
  session: ImportSession,
  now: number
): Promise<ApplyResult> {
  const db = getDb()
  const meta = db.data.meta
  const keys = db.data.keys

  let added = 0
  let overwritten = 0
  let skipped = 0
  let failed = 0
  const failures: ApplyFailure[] = []
  let anyWrite = false

  for (const c of confirms) {
    const item = session.items.get(c.id)
    if (!item) {
      failed++
      failures.push({ id: c.id, reason: '未知条目' })
      continue
    }

    if (c.action === 'skip') {
      skipped++
      continue
    }

    // add / force-add：新建记录
    if (c.action === 'add' || c.action === 'force-add') {
      const enc = encryptForStore(item.secret, meta.allowPlaintextFallback)
      if (!enc.ok) {
        failed++
        failures.push({ id: c.id, reason: 'fail-closed：safeStorage 不可用且未开启明文降级' })
        continue
      }
      const rec: KeyRecord = {
        id: randomUUID(),
        name: c.name,
        provider: item.provider,
        baseUrl: item.baseUrl,
        encSecret: enc.encSecret,
        secretMode: enc.mode,
        status: 'unchecked',
        deepCheck: true,
        testModel: DEFAULT_TEST_MODEL[item.provider],
        createdAt: now,
        updatedAt: now,
        notes: ''
      }
      keys.push(rec)
      added++
      anyWrite = true
      continue
    }

    // overwrite：覆盖现有库记录
    if (c.action === 'overwrite') {
      const row = session.rows.find((r) => r.id === c.id)
      const targetId = row?.dupTargetId
      if (!row || row.dupOf !== 'db' || !targetId) {
        failed++
        failures.push({ id: c.id, reason: '无可覆盖的库记录' })
        continue
      }
      const rec = keys.find((k) => k.id === targetId)
      if (!rec) {
        failed++
        failures.push({ id: c.id, reason: '覆盖目标已不存在' })
        continue
      }
      const enc = encryptForStore(item.secret, meta.allowPlaintextFallback)
      if (!enc.ok) {
        failed++
        failures.push({ id: c.id, reason: 'fail-closed：safeStorage 不可用且未开启明文降级' })
        continue
      }
      // 仅更新 name/baseUrl/secret；保留 testModel/notes/id/createdAt
      rec.name = c.name
      rec.baseUrl = item.baseUrl
      rec.encSecret = enc.encSecret
      rec.secretMode = enc.mode
      // secret 已变 → 旧检测结果失效
      rec.status = 'unchecked'
      rec.lastChecked = undefined
      rec.lastCheckMode = undefined
      rec.lastDeepCheckedAt = undefined
      rec.lastError = undefined
      rec.updatedAt = now
      overwritten++
      anyWrite = true
      continue
    }

    // 未知 action
    failed++
    failures.push({ id: c.id, reason: `未知 action：${c.action}` })
  }

  // 有成功写入时：同步 plaintextMode 再原子写回（全 skip 不落盘、不扫描）
  if (anyWrite) {
    syncPlaintextMode(db.data)
    await db.write()
  }

  return { added, overwritten, skipped, failed, failures }
}