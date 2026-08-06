// keys handler（PRD §10 keys:list/add/update/remove/reveal/checkNow/checkAll）
//
// 薄胶水：取库（deps.db.data）→ 调纯逻辑 → db.write() → 返回。
//   add/update：成功后 scheduler.checkNow(id)（PRD 场景 C 保存即检测）。
//   reveal：取明文 → clipboard.writeText + scheduleClipboardClear（delayMs=meta.clipboardClearMs）
//     → 返回明文（决策 3：PRD §10 无独立 keys:copy 通道，reveal 即复制 + 60s 清除时机）。
//   checkNow/checkAll：纯转发调度器。
//
// 接线逻辑集中在 reveal 的剪贴板编排，其余为转发。reveal 单测覆盖剪贴板接线。

import { listKeys } from '../keys/list'
import { addKey, updateKey, removeKey } from '../keys/crud'
import { revealKey } from '../keys/reveal'
import { scheduleClipboardClear } from '../keys/clipboard'
import { probeKey } from '../healthCheck/probe'
import type { IpcDeps } from './types'
import type { KeyInput, AddOutcome, UpdateOutcome, RemoveOutcome, RevealOutcome } from '../keys/types'
import type { KeyRecord, Provider } from '../storage/schema'
import type { SafeKeyView } from '../keys/types'
import type { CheckModeArg } from '../healthCheck/checker'
import type { ProbeResult } from '../healthCheck/probe'

/** 单条记录剥 encSecret 后的安全视图（status:update 载荷用，避免明文密文下发渲染进程）。 */
export function toSafeView(record: KeyRecord): SafeKeyView {
  const { encSecret: _enc, ...view } = record
  return view as SafeKeyView
}

export function handleList(deps: IpcDeps): SafeKeyView[] {
  return listKeys(deps.db.data)
}

export async function handleAdd(deps: IpcDeps, input: KeyInput): Promise<AddOutcome> {
  const out = addKey(deps.db.data, input, deps.now())
  if (!out.ok || !out.id) return out
  await deps.db.write()
  // 保存即检测（PRD 场景 C）。录入态只 ping（轻），深检留给运营态手动触发。
  deps.scheduler.checkNow(out.id, 'ping')
  return out
}

export async function handleUpdate(deps: IpcDeps, id: string, input: KeyInput): Promise<UpdateOutcome> {
  const out = updateKey(deps.db.data, id, input, deps.now())
  if (!out.ok) return out
  await deps.db.write()
  deps.scheduler.checkNow(id, 'ping')
  return out
}

export async function handleRemove(deps: IpcDeps, id: string): Promise<RemoveOutcome> {
  const out = removeKey(deps.db.data, id)
  if (!out.ok) return out
  await deps.db.write()
  return out
}

/**
 * 显式查看明文 + 复制 + 60s 比对清除（PRD FR-1 + §10 keys:reveal）。
 * 取明文 → 写剪贴板 → 排定 60s 后比对清除 → 返回明文给渲染进程一次性显示。
 * reveal 失败（not-found/undecryptable）不动剪贴板。
 */
export function handleReveal(deps: IpcDeps, id: string): RevealOutcome {
  const out = revealKey(deps.db.data, id)
  if (!out.ok) return out
  // 复制到剪贴板 + 排定清除（决策 3）
  deps.clipboard.writeText(out.plaintext)
  scheduleClipboardClear(out.plaintext, {
    readClipboard: () => deps.clipboard.readText(),
    clearClipboard: () => deps.clipboard.clear(),
    setTimeout: deps.setTimeout,
    delayMs: deps.db.data.meta.clipboardClearMs
  })
  return out
}

export function handleCheckNow(deps: IpcDeps, id: string, mode: CheckModeArg = 'ping'): void {
  deps.scheduler.checkNow(id, mode)
}

export function handleCheckAll(deps: IpcDeps, mode: CheckModeArg = 'ping'): void {
  deps.scheduler.checkAll(mode)
}

/**
 * 表单"测试"：用明文配置跑一次 ping，不入库、不创建记录、不改 lastChecked。
 * timeout 取 meta.pingTimeoutMs；fetch 用 globalThis.fetch（与 scheduler 默认一致）；
 * clock 复用注入的 now（便于测试）。结果由渲染进程内嵌卡片 + toast 展示。
 */
export async function handleProbe(
  deps: IpcDeps,
  input: { provider: Provider; baseUrl: string; secret: string; testModel?: string }
): Promise<ProbeResult> {
  return probeKey({
    provider: input.provider,
    baseUrl: input.baseUrl,
    secret: input.secret,
    testModel: input.testModel,
    pingTimeoutMs: deps.db.data.meta.pingTimeoutMs,
    fetchImpl: globalThis.fetch,
    clock: deps.now
  })
}