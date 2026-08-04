// 时间 / 检测模式格式化（渲染进程展示用）

import type { CheckMode } from '@main/storage/schema'

/** ms 时间戳 → "2026-08-03 14:05"；undefined → "—" */
export function formatTime(ms: number | undefined): string {
  if (!ms) return '—'
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 相对时间："刚刚" / "3 分钟前" / "2 小时前" / "3 天前" / 退化到绝对时间 */
export function formatRelative(ms: number | undefined, now: number = Date.now()): string {
  if (!ms) return '—'
  const diff = Math.max(0, now - ms)
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return '刚刚'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} 分钟前`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} 小时前`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} 天前`
  return formatTime(ms)
}

export function formatCheckMode(mode: CheckMode | undefined): string {
  if (mode === 'ping') return 'Ping'
  if (mode === 'deep') return '深检'
  return '—'
}

/** ping 延迟：undefined/NaN → '—'，否则 `${ms}ms`。 */
export function formatPingMs(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return '—'
  return `${Math.round(ms)}ms`
}