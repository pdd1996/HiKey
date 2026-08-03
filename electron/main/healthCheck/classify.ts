// 状态分类纯函数（PRD FR-2 第一级 / 第二级映射 + 数据库设计 §6.1）
//
// 输入：HTTP 状态码 + 已 parse 的响应体（未知形状）。
// 输出：KeyStatus + 脱敏 lastError（只含状态码 + 错误码，无 URL/Authorization/key）。
// 纯函数，不碰网络、不碰 db，可单测。

import type { KeyStatus } from '../storage/schema'
import { extractErrorCode, isQuotaError } from './errorMap'

export interface PingResult {
  status: KeyStatus
  lastError?: string
}

export interface DeepResult {
  status: KeyStatus
  lastError?: string
  deepDone: true
}

/** 脱敏 lastError：`${status} / ${code ?? ''}`，无错误码时仅状态码。 */
function errLabel(httpStatus: number, body: unknown): string {
  const code = extractErrorCode(body)
  return code ? `${httpStatus} / ${code}` : `${httpStatus}`
}

/**
 * 第一级 ping 状态映射（PRD FR-2）。
 * 200→valid；401/403 命中欠费→quota_exceeded，其他→invalid；
 * 402（含无 body）→quota_exceeded；429 命中欠费→quota_exceeded，否则 rate_limited；
 * 5xx→unknown；其余 4xx→unknown（不误判失效）。
 */
export function classifyPing(httpStatus: number, body: unknown): PingResult {
  if (httpStatus === 200) return { status: 'valid' }

  if (httpStatus === 401 || httpStatus === 403) {
    if (isQuotaError(body)) return { status: 'quota_exceeded', lastError: errLabel(httpStatus, body) }
    return { status: 'invalid', lastError: errLabel(httpStatus, body) }
  }

  if (httpStatus === 402) {
    // 402 含无 body → quota_exceeded（PRD：402 一律欠费）
    return { status: 'quota_exceeded', lastError: errLabel(httpStatus, body) }
  }

  if (httpStatus === 429) {
    if (isQuotaError(body)) return { status: 'quota_exceeded', lastError: errLabel(httpStatus, body) }
    return { status: 'rate_limited', lastError: errLabel(httpStatus, body) }
  }

  if (httpStatus >= 500) return { status: 'unknown', lastError: errLabel(httpStatus, body) }

  // 其余 4xx → unknown（不误判失效）
  return { status: 'unknown', lastError: errLabel(httpStatus, body) }
}

/**
 * 第二级 deep 状态映射（PRD FR-2）。
 * 2xx→valid；401/403/402/429 同 ping 规则；
 * 400/404（模型/配置问题）→ 状态保持 valid 不降级，lastError 写固定提示；
 * 5xx→unknown；其余 4xx→unknown。
 */
export function classifyDeep(httpStatus: number, body: unknown): DeepResult {
  if (httpStatus >= 200 && httpStatus < 300) return { status: 'valid', deepDone: true }

  if (httpStatus === 400 || httpStatus === 404) {
    // 模型/配置问题：不降级 ping 的 valid 结论
    return {
      status: 'valid',
      lastError: '深检未通过：模型/配置问题，建议更换 testModel',
      deepDone: true
    }
  }

  if (httpStatus === 401 || httpStatus === 403) {
    if (isQuotaError(body)) {
      return { status: 'quota_exceeded', lastError: errLabel(httpStatus, body), deepDone: true }
    }
    return { status: 'invalid', lastError: errLabel(httpStatus, body), deepDone: true }
  }

  if (httpStatus === 402) {
    return { status: 'quota_exceeded', lastError: errLabel(httpStatus, body), deepDone: true }
  }

  if (httpStatus === 429) {
    if (isQuotaError(body)) {
      return { status: 'quota_exceeded', lastError: errLabel(httpStatus, body), deepDone: true }
    }
    return { status: 'rate_limited', lastError: errLabel(httpStatus, body), deepDone: true }
  }

  if (httpStatus >= 500) {
    return { status: 'unknown', lastError: errLabel(httpStatus, body), deepDone: true }
  }

  // 其余 4xx → unknown（不猜测原因）
  return { status: 'unknown', lastError: errLabel(httpStatus, body), deepDone: true }
}