// 错误码提取（M8.2 改造：不再需要 isQuotaError，只保留 extractErrorCode 给 lastError 用）
//
// 取响应体 error.code（无则 error.type），转小写返回。无可用值返回 null。
// body 期望是已 parse 的 JSON 对象；非法形状返回 null。

/**
 * 从响应体取 error.code（无则 error.type），转小写返回。无可用值返回 null。
 * body 期望是已 parse 的 JSON 对象；非法形状返回 null。
 */
export function extractErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const err = (body as { error?: unknown }).error
  if (!err || typeof err !== 'object') return null
  const e = err as { code?: unknown; type?: unknown }
  const raw = e.code ?? e.type
  if (typeof raw !== 'string' || raw.length === 0) return null
  return raw.toLowerCase()
}