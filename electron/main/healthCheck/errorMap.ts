// 错误码映射表（PRD FR-2 错误码匹配规则）
//
// 取响应体 error.code（无则 error.type），与欠费类关键字表做大小写不敏感
// substring 匹配；命中即判 quota_exceeded。
//
// ⚠️ 待定项：本表 PRD 标注"M3 真实 Key 联调定稿"。先落 PRD 已列关键字，
//    联调时只改 QUOTA_KEYWORDS 即可。

/** 欠费类关键字表（大小写不敏感 substring 匹配）。 */
export const QUOTA_KEYWORDS = [
  'insufficient_quota',
  'billing_not_active',
  'quota',
  'exhausted',
  'balance'
]

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

/** 命中欠费类关键字 → true。code 含任一关键字子串即命中。 */
export function isQuotaError(body: unknown): boolean {
  const code = extractErrorCode(body)
  if (!code) return false
  return QUOTA_KEYWORDS.some((kw) => code.includes(kw))
}