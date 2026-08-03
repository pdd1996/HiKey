// 请求 headers + 深检 body + 常量（PRD FR-2）
//
// anthropic 用 x-api-key + anthropic-version 头；其余三类用 Authorization: Bearer。
// anthropic-version 为代码常量（非用户配置），随 HiKey 版本升级跟进。

import type { Provider } from '../storage/schema'

/** Anthropic API 版本头常量（PRD：非用户配置）。 */
export const ANTHROPIC_VERSION = '2023-06-01'

/** 各 provider 默认测试模型（custom 无默认，必填）。M3 联调后定稿。 */
export const DEFAULT_TEST_MODEL: Record<Provider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  deepseek: 'deepseek-chat',
  custom: ''
}

/** 构造请求 headers。 */
export function buildHeaders(provider: Provider, apiKey: string): Record<string, string> {
  if (provider === 'anthropic') {
    return {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json'
    }
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json'
  }
}

/** 构造深检请求体（max_tokens:1，消耗 ≤10 token）。 */
export function buildDeepBody(provider: Provider, model: string): Record<string, unknown> {
  const messages = [{ role: 'user', content: 'ping' }]
  if (provider === 'anthropic') {
    // Anthropic /v1/messages：model + max_tokens + messages
    return { model, max_tokens: 1, messages }
  }
  // OpenAI 兼容（openai/deepseek/custom）：model + messages + max_tokens
  return { model, messages, max_tokens: 1 }
}