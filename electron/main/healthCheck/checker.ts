// 单 key 检测编排（PRD FR-2 + 数据库设计 §6.1）
//
// 纯逻辑：fetch 实现与时间戳均由参数注入，可在 vitest 完全控制状态流转。
// status=checking 由调度器在调用 checkKey 前写库；本函数只计算最终结果，
// 由调度器落库。本函数不碰 db、不碰 Date.now。

import type { KeyRecord, Meta, KeyStatus, CheckMode } from '../storage/schema'
import { revealSecret } from '../crypto'
import { buildPingUrl, buildDeepUrl } from './urls'
import { buildHeaders, buildDeepBody } from './headers'
import { classifyPing, classifyDeep } from './classify'

export type CheckTrigger = 'add' | 'edit' | 'manual' | 'poll'
export type FetchImpl = typeof globalThis.fetch

export interface CheckOutcome {
  status: KeyStatus
  lastChecked: number
  lastCheckMode: CheckMode
  lastDeepCheckedAt?: number
  lastError?: string
}

/** fetch 结果：成功拿到响应（含非 2xx），或网络/超时/abort 失败。 */
type FetchRes = { ok: true; status: number; body: unknown } | { ok: false }

/**
 * 带超时的 fetch。合并外部 signal（调度器取消用）与本地超时 controller。
 * 任一触发 → 抛 AbortError → 调用方归 unknown。
 */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: FetchImpl,
  externalSignal?: AbortSignal
): Promise<FetchRes> {
  const local = new AbortController()
  const timer = setTimeout(() => local.abort(), timeoutMs)
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
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

/** 深检前置条件（PRD FR-2 + 数据库设计 §6.2）。 */
function shouldDeepCheck(record: KeyRecord, meta: Meta, trigger: CheckTrigger): boolean {
  if (!meta.deepCheckEnabled) return false
  if (!record.deepCheck) return false
  if (trigger === 'poll' && !meta.deepCheckOnEveryPoll) return false
  // custom 必填 testModel；空则跳过深检（用户决策）
  if (!record.testModel) return false
  return true
}

/**
 * 单 key 检测全流程。
 * @param now   调用方注入的时间戳（避免依赖 Date.now）
 * @param signal 调度器的 per-key 取消信号（可选）
 */
export async function checkKey(
  record: KeyRecord,
  meta: Meta,
  trigger: CheckTrigger,
  fetchImpl: FetchImpl,
  now: number,
  signal?: AbortSignal
): Promise<CheckOutcome> {
  // 1. 解密 secret；失败 → unknown，不发网络（PRD FR-1 旧密文读取）
  const revealed = revealSecret(record.encSecret, record.secretMode)
  if (!revealed.ok) {
    return {
      status: 'unknown',
      lastChecked: now,
      lastCheckMode: 'ping',
      lastError: '无法解密旧记录'
    }
  }
  const apiKey = revealed.plaintext

  // 2. ping
  const pingRes = await fetchWithTimeout(
    buildPingUrl(record.provider, record.baseUrl),
    { method: 'GET', headers: buildHeaders(record.provider, apiKey) },
    meta.pingTimeoutMs,
    fetchImpl,
    signal
  )
  if (!pingRes.ok) {
    return { status: 'unknown', lastChecked: now, lastCheckMode: 'ping' }
  }
  const ping = classifyPing(pingRes.status, pingRes.body)
  if (ping.status !== 'valid') {
    return {
      status: ping.status,
      lastChecked: now,
      lastCheckMode: 'ping',
      lastError: ping.lastError
    }
  }

  // 3. 深检前置
  if (!shouldDeepCheck(record, meta, trigger)) {
    return { status: 'valid', lastChecked: now, lastCheckMode: 'ping' }
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
    // 深检超时/网络异常 → unknown；记录深检已尝试
    return { status: 'unknown', lastChecked: now, lastCheckMode: 'deep', lastDeepCheckedAt: now }
  }
  const deep = classifyDeep(deepRes.status, deepRes.body)
  return {
    status: deep.status,
    lastChecked: now,
    lastCheckMode: 'deep',
    lastDeepCheckedAt: now,
    lastError: deep.lastError
  }
}