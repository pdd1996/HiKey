// 增改删（PRD FR-4 列表与详情管理）
//
// add/update/remove：内存修改 + syncPlaintextMode，调用方负责 db.write()（与
// import/apply.ts 一致，纯逻辑不碰 db 实例）。不触发检测——M5 IPC 保存后调 checkNow。
//
// update secret 语义：仅当传入新 secret 时重加密 + 重置 status='unchecked' + 清
// lastChecked/lastCheckMode/lastDeepCheckedAt/lastError（与 import 覆盖一致）；
// secret 未传则保留旧 secret + 旧 status（M5 保存后 checkNow 刷新）。
// fail-closed：safeStorage 不可用 + 未开降级 → 拒绝写新 secret，不改库。

import { randomUUID } from 'crypto'
import { encryptForStore } from '../crypto'
import { syncPlaintextMode } from '../storage/plaintext'
import { DEFAULT_TEST_MODEL } from '../providers'
import type { DbRoot, KeyRecord } from '../storage/schema'
import { validateKeyInput } from './validate'
import type { KeyInput, AddOutcome, UpdateOutcome, RemoveOutcome } from './types'

/** 新增 key。 */
export function addKey(root: DbRoot, input: KeyInput, now: number): AddOutcome {
  const v = validateKeyInput(input, { requireSecret: true })
  if (!v.ok) return { ok: false, reason: 'invalid-input' }

  const enc = encryptForStore(input.secret!, root.meta.allowPlaintextFallback)
  if (!enc.ok) return { ok: false, reason: 'fail-closed' }

  const rec: KeyRecord = {
    id: randomUUID(),
    name: input.name.trim(),
    provider: input.provider,
    baseUrl: input.baseUrl.trim(),
    encSecret: enc.encSecret,
    secretMode: enc.mode,
    status: 'unchecked',
    deepCheck: input.deepCheck ?? true,
    testModel: input.testModel?.trim() || DEFAULT_TEST_MODEL[input.provider],
    createdAt: now,
    updatedAt: now,
    notes: input.notes ?? ''
  }
  root.keys.push(rec)
  syncPlaintextMode(root)
  return { ok: true, id: rec.id }
}

/** 编辑 key。secret 未传则只改元数据。 */
export function updateKey(root: DbRoot, id: string, input: KeyInput, now: number): UpdateOutcome {
  const v = validateKeyInput(input, { requireSecret: false })
  if (!v.ok) return { ok: false, reason: 'invalid-input' }

  const rec = root.keys.find((k) => k.id === id)
  if (!rec) return { ok: false, reason: 'not-found' }

  // 先算新 secret（若有）；fail-closed 在改动前拒绝，避免半更新（元数据已改、secret 未动）
  let newEnc: ReturnType<typeof encryptForStore> | null = null
  if (input.secret && input.secret.trim()) {
    newEnc = encryptForStore(input.secret, root.meta.allowPlaintextFallback)
    if (!newEnc.ok) return { ok: false, reason: 'fail-closed' }
  }

  // 元数据更新（保留 id/createdAt）
  rec.name = input.name.trim()
  rec.provider = input.provider
  rec.baseUrl = input.baseUrl.trim()
  rec.testModel = input.testModel?.trim() || DEFAULT_TEST_MODEL[input.provider]
  rec.notes = input.notes ?? rec.notes
  rec.deepCheck = input.deepCheck ?? rec.deepCheck

  // 重加密 + 重置检测状态（与 import 覆盖一致）；newEnc 非 null 即表示有新 secret 且已加密成功
  if (newEnc) {
    rec.encSecret = newEnc.encSecret
    rec.secretMode = newEnc.mode
    rec.status = 'unchecked'
    rec.lastChecked = undefined
    rec.lastCheckMode = undefined
    rec.lastDeepCheckedAt = undefined
    rec.lastError = undefined
  }

  rec.updatedAt = now
  syncPlaintextMode(root)
  return { ok: true }
}

/** 删除 key。 */
export function removeKey(root: DbRoot, id: string): RemoveOutcome {
  const idx = root.keys.findIndex((k) => k.id === id)
  if (idx === -1) return { ok: false, reason: 'not-found' }
  root.keys.splice(idx, 1)
  syncPlaintextMode(root)
  return { ok: true }
}