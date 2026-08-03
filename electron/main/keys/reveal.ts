// 显式查看明文（PRD FR-1 明文边界 + FR-4 查看明文）
//
// 按 id 查记录 → 调 crypto.revealSecret（已封装判别联合 + undecryptable）。
// 返回明文给调用方（M5 经 IPC 一次性发渲染进程）。纯函数，不碰剪贴板、不调度
// 定时器——剪贴板清除由 M5 在复制后调 keys/clipboard 模块。明文用完即弃、不缓存。

import { revealSecret } from '../crypto'
import type { DbRoot } from '../storage/schema'
import type { RevealOutcome } from './types'

/** 按 id 取明文。undecryptable（safeStorage 不可用或密文损坏）→ {ok:false, reason:'undecryptable'}。 */
export function revealKey(root: DbRoot, id: string): RevealOutcome {
  const rec = root.keys.find((k) => k.id === id)
  if (!rec) return { ok: false, reason: 'not-found' }
  const r = revealSecret(rec.encSecret, rec.secretMode)
  if (!r.ok) return { ok: false, reason: 'undecryptable' }
  return { ok: true, plaintext: r.plaintext }
}