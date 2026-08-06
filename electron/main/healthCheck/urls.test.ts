import { describe, it, expect } from 'vitest'
import { buildPingUrl, buildDeepUrl, buildPingRequest } from './urls'

describe('buildPingUrl', () => {
  it('openai 根地址 → /v1/models', () => {
    expect(buildPingUrl('openai', 'https://api.openai.com')).toBe(
      'https://api.openai.com/v1/models'
    )
  })

  it('openai 用户填带 /v1 → 剥离再追加，不出现 /v1/v1', () => {
    expect(buildPingUrl('openai', 'https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/models'
    )
  })

  it('openai 带尾斜杠 + /v1 → 全部归一', () => {
    expect(buildPingUrl('openai', 'https://api.openai.com/v1/')).toBe(
      'https://api.openai.com/v1/models'
    )
  })

  it('anthropic → /v1/models', () => {
    expect(buildPingUrl('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/models'
    )
  })

  it('deepseek → /v1/models', () => {
    expect(buildPingUrl('deepseek', 'https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/v1/models'
    )
  })

  it('custom 原样拼接，不追加版本段', () => {
    expect(buildPingUrl('custom', 'https://myproxy.com/v1')).toBe(
      'https://myproxy.com/v1/models'
    )
  })

  it('custom 根路径 → /models', () => {
    expect(buildPingUrl('custom', 'https://myproxy.com')).toBe(
      'https://myproxy.com/models'
    )
  })

  it('custom 带尾斜杠 → 去斜杠后拼接', () => {
    expect(buildPingUrl('custom', 'https://myproxy.com/v1/')).toBe(
      'https://myproxy.com/v1/models'
    )
  })
})

describe('buildDeepUrl', () => {
  it('openai → /v1/chat/completions', () => {
    expect(buildDeepUrl('openai', 'https://api.openai.com')).toBe(
      'https://api.openai.com/v1/chat/completions'
    )
  })

  it('openai 带 /v1 → 不出现 /v1/v1', () => {
    expect(buildDeepUrl('openai', 'https://api.openai.com/v1')).toBe(
      'https://api.openai.com/v1/chat/completions'
    )
  })

  it('anthropic → /v1/messages', () => {
    expect(buildDeepUrl('anthropic', 'https://api.anthropic.com')).toBe(
      'https://api.anthropic.com/v1/messages'
    )
  })

  it('deepseek → /v1/chat/completions', () => {
    expect(buildDeepUrl('deepseek', 'https://api.deepseek.com')).toBe(
      'https://api.deepseek.com/v1/chat/completions'
    )
  })

  it('custom 原样拼接 /chat/completions，不追加 /v1', () => {
    expect(buildDeepUrl('custom', 'https://myproxy.com/v1')).toBe(
      'https://myproxy.com/v1/chat/completions'
    )
    expect(buildDeepUrl('custom', 'https://myproxy.com')).toBe(
      'https://myproxy.com/chat/completions'
    )
  })

  it('minimax → /v1/chat/completions（与 deep 同端点）', () => {
    expect(buildDeepUrl('minimax', 'https://api.minimaxi.com')).toBe(
      'https://api.minimaxi.com/v1/chat/completions'
    )
  })
})

describe('buildPingRequest', () => {
  it('openai → GET /v1/models，无 body', () => {
    const r = buildPingRequest('openai', 'https://api.openai.com', 'gpt-5.5')
    expect(r).toEqual({ url: 'https://api.openai.com/v1/models', method: 'GET' })
  })

  it('anthropic → GET /v1/models，无 body', () => {
    const r = buildPingRequest('anthropic', 'https://api.anthropic.com', 'claude-sonnet-5')
    expect(r).toEqual({ url: 'https://api.anthropic.com/v1/models', method: 'GET' })
  })

  it('custom → GET {用户路径}/models，无 body', () => {
    const r = buildPingRequest('custom', 'https://myproxy.com/v1', 'my-model')
    expect(r).toEqual({ url: 'https://myproxy.com/v1/models', method: 'GET' })
  })

  it('mimo/qwen/kimi → GET /v1/models，无 body（走标准 OpenAI 兼容 ping）', () => {
    for (const p of ['mimo', 'qwen', 'kimi'] as const) {
      const r = buildPingRequest(p, 'https://api.example.com', 'm')
      expect(r.method).toBe('GET')
      expect(r.body).toBeUndefined()
      expect(r.url.endsWith('/v1/models')).toBe(true)
    }
  })

  it('minimax → POST /v1/chat/completions，body 含 model + max_tokens:1（/v1/models 线上 404 故改走 chat）', () => {
    const r = buildPingRequest('minimax', 'https://api.minimaxi.com', 'MiniMax-M3')
    expect(r.url).toBe('https://api.minimaxi.com/v1/chat/completions')
    expect(r.method).toBe('POST')
    expect(r.body).toBeDefined()
    const body = JSON.parse(r.body!) as Record<string, unknown>
    expect(body['model']).toBe('MiniMax-M3')
    expect(body['max_tokens']).toBe(1)
    expect(Array.isArray(body['messages'])).toBe(true)
  })

  it('minimax baseUrl 带 /v1 → 剥离再追加，不出现 /v1/v1', () => {
    const r = buildPingRequest('minimax', 'https://api.minimaxi.com/v1', 'MiniMax-M3')
    expect(r.url).toBe('https://api.minimaxi.com/v1/chat/completions')
  })
})