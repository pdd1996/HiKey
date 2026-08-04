// 状态分类纯函数（M8.2 改造：直接返回 HTTP 码，不再做归一化映射）
//
// 输入：HTTP 状态码 + 已 parse 的响应体（未知形状）。
// 输出：HTTP 码字符串 + 脱敏 lastError（只含状态码 + 错误码，无 URL/Authorization/key）。
// 纯函数，不碰网络、不碰 db，可单测。

import { extractErrorCode } from './errorMap'

export interface PingResult {
  status: string
  lastError?: string
}

export interface DeepResult {
  status: string
  lastError?: string
  deepDone: true
}

/** 脱敏 lastError：`${status} / ${code ?? ''}`，无错误码时仅状态码。 */
function errLabel(httpStatus: number, body: unknown): string {
  const code = extractErrorCode(body)
  return code ? `${httpStatus} / ${code}` : `${httpStatus}`
}

/**
 * ping 分类：返回 HTTP 状态码字符串。2xx 归一为 '200'（成功统一标识）。
 * 2xx 无 lastError；非 2xx 带 lastError（脱敏状态码 + 错误码）。
 */
export function classifyPing(httpStatus: number, body: unknown): PingResult {
  if (httpStatus >= 200 && httpStatus < 300) return { status: '200' }
  return { status: String(httpStatus), lastError: errLabel(httpStatus, body) }
}

/**
 * deep 分类：返回 HTTP 状态码字符串。2xx 归一为 '200'。
 * 2xx 无 lastError；非 2xx 带 lastError。
 */
export function classifyDeep(httpStatus: number, body: unknown): DeepResult {
  if (httpStatus >= 200 && httpStatus < 300) return { status: '200', deepDone: true }
  return { status: String(httpStatus), lastError: errLabel(httpStatus, body), deepDone: true }
}