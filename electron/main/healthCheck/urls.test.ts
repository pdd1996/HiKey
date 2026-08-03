import { describe, it, expect } from 'vitest'
import { buildPingUrl, buildDeepUrl } from './urls'

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
})