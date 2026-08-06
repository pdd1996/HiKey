// URL 拼接（PRD FR-2 端点与 URL 规则）
//
// baseUrl 语义：统一为"API 根地址，不含版本路径"。
//   非 custom：先去尾斜杠，再剥离尾部 /v1，最后由代码追加 /v1（避免 /v1/v1）。
//   custom：原样拼接，不追加版本段（只去尾斜杠），用户自负责填对路径。

import type { Provider } from '../storage/schema'
import { buildDeepBody } from './headers'

/** 去尾斜杠 */
function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '')
}

/** 非 custom：剥离尾部 /v1（用户可能填带版本后缀的根） */
function stripVersionSuffix(url: string): string {
  return url.replace(/\/v1$/i, '')
}

/**
 * ping 端点：非 custom → {root}/v1/models；custom → {用户路径}/models（原样拼接）。
 */
export function buildPingUrl(provider: Provider, baseUrl: string): string {
  const root = trimTrailingSlash(baseUrl)
  if (provider === 'custom') return `${root}/models`
  return `${stripVersionSuffix(root)}/v1/models`
}

/**
 * deep 端点：
 *   openai/deepseek/custom → /chat/completions（custom 原样拼接，不追加 /v1）
 *   anthropic → /v1/messages
 */
export function buildDeepUrl(provider: Provider, baseUrl: string): string {
  const root = trimTrailingSlash(baseUrl)
  if (provider === 'custom') return `${root}/chat/completions`
  if (provider === 'anthropic') return `${stripVersionSuffix(root)}/v1/messages`
  return `${stripVersionSuffix(root)}/v1/chat/completions`
}

/** ping 请求形状。多数 provider 是 GET（无 body）；MiniMax 用 POST chat/completions 当 ping。 */
export interface PingRequest {
  url: string
  method: 'GET' | 'POST'
  body?: string
}

/**
 * 构造 ping 请求。
 * - 多数 provider：`GET /v1/models`（零 token）。
 * - MiniMax 的 `GET /v1/models` 线上返回 404（端点未实现，见 MiniMax-M2#60），无法用于 ping；
 *   改用 `POST /v1/chat/completions`（与 deep 同端点同 body，max_tokens:1）当 ping——
 *   一次 ≤10 token 的真实推理调用即可同时验证"端点可达 + 认证通过 + 模型可用"。
 *   其余 OpenAI 兼容 provider 仍用零成本的 GET /models，不为此增加 token 消耗。
 */
export function buildPingRequest(provider: Provider, baseUrl: string, testModel: string): PingRequest {
  if (provider === 'minimax') {
    return {
      url: buildDeepUrl(provider, baseUrl),
      method: 'POST',
      body: JSON.stringify(buildDeepBody(provider, testModel))
    }
  }
  return { url: buildPingUrl(provider, baseUrl), method: 'GET' }
}