// 状态徽标 / provider 徽标 配色与文案（PRD §9）
//
// 状态配色：checking 蓝 / valid 绿 / invalid 红 / rate_limited 黄 /
//           quota_exceeded 橙 / unknown·unchecked 灰。
// 选用软底色（bg-*-100 text-*-700 border-*-200）配合 slate 主题，不破坏 shadcn Badge 基础样式。

import type { KeyStatus } from '@main/storage/schema'
import type { Provider } from '@shared/providers'

export interface BadgeStyle {
  label: string
  className: string
}

const STATUS_STYLES: Record<KeyStatus, BadgeStyle> = {
  checking: {
    label: '检测中',
    className: 'border-blue-200 bg-blue-100 text-blue-700',
  },
  valid: {
    label: '有效',
    className: 'border-green-200 bg-green-100 text-green-700',
  },
  invalid: {
    label: '无效',
    className: 'border-red-200 bg-red-100 text-red-700',
  },
  rate_limited: {
    label: '限流',
    className: 'border-yellow-200 bg-yellow-100 text-yellow-700',
  },
  quota_exceeded: {
    label: '配额超限',
    className: 'border-orange-200 bg-orange-100 text-orange-700',
  },
  unknown: {
    label: '未知',
    className: 'border-gray-200 bg-gray-100 text-gray-600',
  },
  unchecked: {
    label: '未检测',
    className: 'border-gray-200 bg-gray-100 text-gray-600',
  },
}

export function statusBadge(status: KeyStatus): BadgeStyle {
  return STATUS_STYLES[status] ?? STATUS_STYLES.unknown
}

export const STATUS_ORDER: KeyStatus[] = [
  'checking',
  'valid',
  'invalid',
  'rate_limited',
  'quota_exceeded',
  'unknown',
  'unchecked',
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
  openai: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  anthropic: 'border-amber-200 bg-amber-50 text-amber-700',
  deepseek: 'border-sky-200 bg-sky-50 text-sky-700',
  custom: 'border-purple-200 bg-purple-50 text-purple-700',
}

export function providerBadgeClass(provider: Provider): string {
  return PROVIDER_STYLES[provider] ?? PROVIDER_STYLES.custom
}