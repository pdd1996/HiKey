// 表单"测试"按钮探测：用未加密的表单输入跑一次 ping，不入库、不落状态、不改 lastChecked。
//
// 复用 checker.ts 的 fetchWithTimeout + buildPingUrl/buildHeaders/classifyPing，
// 保证 ping 语义与保存后 scheduler 触发的 ping 完全一致。只跑 ping，不跑 deep。
// 纯函数，无 db 依赖；fetch 实现与 clock 由参数注入，便于 vitest 控制。

import { buildPingUrl } from './urls'
import { buildHeaders } from './headers'
import { classifyPing } from './classify'
import { fetchWithTimeout, type FetchImpl } from './checker'
import type { Provider } from '../storage/schema'

export type ProbeInput = {
  provider: Provider
  baseUrl: string
  secret: string
  pingTimeoutMs: number
  /** 默认 globalThis.fetch；测试可注入 mock。 */
  fetchImpl?: FetchImpl
  signal?: AbortSignal
  /** 延迟计时注入；未注入则不记录 pingMs。 */
  clock?: () => number
}

/**
 * 探测结果。
 * - ok:true  → 拿到 HTTP 响应，status 来自 classifyPing，pingMs 为往返延迟。
 * - ok:false → 网络错误或超时（reason 区分），pingMs 仍记录往返（即便失败）。
 */
export type ProbeResult =
  | { ok: true; status: string; pingMs?: number; lastError?: string }
  | { ok: false; reason: 'network' | 'timeout'; pingMs?: number }

/**
 * 用表单明文配置跑一次 ping。不写库、不创建 KeyRecord。
 */
export async function probeKey(input: ProbeInput): Promise<ProbeResult> {
  const fetchImpl = input.fetchImpl ?? globalThis.fetch
  const t0 = input.clock?.()
  const res = await fetchWithTimeout(
    buildPingUrl(input.provider, input.baseUrl),
    { method: 'GET', headers: buildHeaders(input.provider, input.secret) },
    input.pingTimeoutMs,
    fetchImpl,
    input.signal
  )
  const pingMs = input.clock ? Math.max(0, (input.clock() ?? 0) - (t0 ?? 0)) : undefined

  if (!res.ok) {
    return { ok: false, reason: res.kind, pingMs }
  }
  const ping = classifyPing(res.status, res.body)
  return { ok: true, status: ping.status, pingMs, lastError: ping.lastError }
}