// 单 key 检测编排（M8.2 改造：状态改为 HTTP 码直存）
//
// 纯逻辑：fetch 实现与时间戳均由参数注入，可在 vitest 完全控制状态流转。
// 本函数只计算最终结果，由调度器落库。不碰 db、不碰 Date.now。

import type { KeyRecord, Meta, CheckMode } from '../storage/schema'
import { revealSecret } from '../crypto'
import { buildPingUrl, buildDeepUrl } from './urls'
import { buildHeaders, buildDeepBody } from './headers'
import { classifyPing, classifyDeep } from './classify'

export type CheckTrigger = 'add' | 'edit' | 'manual' | 'poll'
export type FetchImpl = typeof globalThis.fetch

/** 检测模式：ping=仅连通性；deep=ping 通过后再跑深检。与 trigger 解耦。 */
export type CheckModeArg = 'ping' | 'deep'

export interface CheckOutcome {
  status: string
  lastChecked: number
  lastCheckMode: CheckMode
  lastDeepCheckedAt?: number
  lastError?: string
  pingMs?: number // ping 拿到 HTTP 响应时的延迟（ms）；未注入 clock 或网络失败时 undefined
}

/** fetch 结果：成功拿到响应（含非 2xx），或失败。失败带 kind 区分超时与网络错误（probe 复用）。 */
export type FetchRes =
  | { ok: true; status: number; body: unknown }
  | { ok: false; kind: 'network' | 'timeout' }

/**
 * 带超时的 fetch。合并外部 signal（调度器取消用）与本地超时 controller。
 * 本地 timer 到期 → kind='timeout'；其余 catch 到的错误（含外部 abort）→ kind='network'。
 * 成功时（含非 2xx）返回 status+body，调用方再走 classify。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchImpl,
  externalSignal?: AbortSignal
): Promise<FetchRes> {
  const local = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    local.abort()
  }, timeoutMs)
  // 外部取消转发到本地
  if (externalSignal) {
    if (externalSignal.aborted) local.abort()
    else externalSignal.addEventListener('abort', () => local.abort(), { once: true })
  }
  try {
    const res = await fetchImpl(url, { ...init, signal: local.signal })
    let body: unknown = null
    try {
      body = await res.json()
    } catch {
      body = null
    }
    return { ok: true, status: res.status, body }
  } catch {
    return { ok: false, kind: timedOut ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 单 key 检测全流程。
 * @param now   调用方注入的时间戳（避免依赖 Date.now）
 * @param mode   检测模式：'ping' 仅连通；'deep' ping 通过后跑深检（仅看 testModel，
 *               bypass deepCheckEnabled/record.deepCheck 两个开关——
 *               那些开关只在 scheduler 选 poll 的 mode 时生效）
 * @param signal 调度器的 per-key 取消信号（可选）
 * @param clock  延迟计时注入（避免依赖 Date.now）；未注入则不记录 pingMs
 */
export async function checkKey(
  record: KeyRecord,
  meta: Meta,
  trigger: CheckTrigger,
  fetchImpl: FetchImpl,
  now: number,
  mode: CheckModeArg = 'deep',
  signal?: AbortSignal,
  clock?: () => number
): Promise<CheckOutcome> {
  // 1. 解密 secret；失败 → 500（本地问题），不发网络
  const revealed = revealSecret(record.encSecret, record.secretMode)
  if (!revealed.ok) {
    return {
      status: '500',
      lastChecked: now,
      lastCheckMode: 'ping',
      lastError: '无法解密旧记录'
    }
  }
  const apiKey = revealed.plaintext

  // 2. ping（同时计时延迟）
  const t0 = clock?.()
  const pingRes = await fetchWithTimeout(
    buildPingUrl(record.provider, record.baseUrl),
    { method: 'GET', headers: buildHeaders(record.provider, apiKey) },
    meta.pingTimeoutMs,
    fetchImpl,
    signal
  )
  const pingMs = clock && pingRes.ok ? Math.max(0, clock() - (t0 ?? 0)) : undefined
  if (!pingRes.ok) {
    return { status: pingRes.kind === 'timeout' ? 'timeout' : 'network_error', lastChecked: now, lastCheckMode: 'ping', pingMs }
  }
  const ping = classifyPing(pingRes.status, pingRes.body)
  if (ping.status !== '200') {
    return {
      status: ping.status,
      lastChecked: now,
      lastCheckMode: 'ping',
      lastError: ping.lastError,
      pingMs
    }
  }

  // 3. 深检前置：mode='ping' 直接返回；mode='deep' 仅看 testModel
  if (mode === 'ping') {
    return { status: '200', lastChecked: now, lastCheckMode: 'ping', pingMs }
  }
  if (!record.testModel) {
    return {
      status: '200',
      lastChecked: now,
      lastCheckMode: 'ping',
      lastError: '深检需要 testModel',
      pingMs
    }
  }

  // 4. deep
  const deepRes = await fetchWithTimeout(
    buildDeepUrl(record.provider, record.baseUrl),
    {
      method: 'POST',
      headers: buildHeaders(record.provider, apiKey),
      body: JSON.stringify(buildDeepBody(record.provider, record.testModel))
    },
    meta.deepTimeoutMs,
    fetchImpl,
    signal
  )
  if (!deepRes.ok) {
    // 深检超时/网络异常；记录深检已尝试。
    // pingMs 是 ping 的延迟，与深检超时无关——带出去会让列表"超时 / 244ms"自相矛盾，
    // 故按 schema 约定（网络/超时失败留 undefined）丢弃。
    return { status: deepRes.kind === 'timeout' ? 'timeout' : 'network_error', lastChecked: now, lastCheckMode: 'deep', lastDeepCheckedAt: now, pingMs: undefined }
  }
  const deep = classifyDeep(deepRes.status, deepRes.body)
  return {
    status: deep.status,
    lastChecked: now,
    lastCheckMode: 'deep',
    lastDeepCheckedAt: now,
    lastError: deep.lastError,
    pingMs
  }
}