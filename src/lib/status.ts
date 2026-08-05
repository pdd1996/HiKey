// 状态徽标 / provider 徽标 配色与文案（M8.2 改造：HTTP 码直存）
//
// 状态配色：200 绿 / 4xx 红橙黄 / 5xx 灰 / network_error·timeout 灰。
// 选用软底色（bg-*-100 text-*-700 border-*-200）配合 slate 主题，不破坏 shadcn Badge 基础样式。

import type { Provider } from '@shared/providers'

export interface BadgeStyle {
  label: string
  className: string
}

/** HTTP 码 → 徽标样式。不在表中的码 fallback 到灰色"未知"。 */
const STATUS_STYLES: Record<string, BadgeStyle> = {
  '200':           { label: '成功',     className: 'border-green-200 bg-green-100 text-green-700 dark:border-green-900/60 dark:bg-green-950/40 dark:text-green-300' },
  '400':           { label: '格式错误', className: 'border-red-200 bg-red-100 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300' },
  '401':           { label: '认证失败', className: 'border-red-200 bg-red-100 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300' },
  '402':           { label: '余额不足', className: 'border-orange-200 bg-orange-100 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300' },
  '429':           { label: '请求超限', className: 'border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-900/60 dark:bg-yellow-950/40 dark:text-yellow-300' },
  '500':           { label: '服务器失败', className: 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  '503':           { label: '服务器故障', className: 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'network_error': { label: '网络错误', className: 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  'timeout':       { label: '超时',     className: 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300' },
}

/** 灰色徽标（未检测 / 未知），多处复用故抽常量。 */
const GRAY_BADGE = 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'

/**
 * 取状态徽标样式。undefined = 未检测。
 * 未知码 fallback 到灰色"未知"。
 */
export function statusBadge(status?: string): BadgeStyle {
  if (status === undefined) return { label: '未检测', className: GRAY_BADGE }
  return STATUS_STYLES[status] ?? { label: `未知 (${status})`, className: GRAY_BADGE }
}

export const STATUS_ORDER: string[] = [
  '200', '400', '401', '402', '429', '500', '503', 'network_error', 'timeout',
]

const PROVIDER_LABEL: Record<Provider, string> = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  custom: '自定义',
}

export function providerLabel(provider: Provider): string {
  return PROVIDER_LABEL[provider] ?? provider
}

const PROVIDER_STYLES: Record<Provider, string> = {
  openai: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  anthropic: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-300',
  deepseek: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/40 dark:text-sky-300',
  custom: 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300',
}

export function providerBadgeClass(provider: Provider): string {
  return PROVIDER_STYLES[provider] ?? PROVIDER_STYLES.custom
}