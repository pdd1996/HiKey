// 掩码 + 去重 hash（PRD FR-3）
//
// maskKey：预览用，绝不外泄明文。len=0→''；len≤8→'••••'；否则 first3 + •••• + last4。
// secretHash：去重比对用 sha256(trim(secret))，避免明文常驻去重集合（仅存 hash 于会话内存）。

import { createHash } from 'crypto'

/** 掩码 secret：trim 后 len=0→''；len≤8→'••••'；否则 first3+••••+last4。 */
export function maskKey(secret: string): string {
  const s = secret.trim()
  if (s.length === 0) return ''
  if (s.length <= 8) return '••••'
  return `${s.slice(0, 3)}••••${s.slice(-4)}`
}

/** sha256(trim(secret))。去重比对用。 */
export function secretHash(secret: string): string {
  return createHash('sha256').update(secret.trim()).digest('hex')
}