import { describe, it, expect } from 'vitest'
import {
  ANTHROPIC_VERSION,
  DEFAULT_TEST_MODEL,
  buildHeaders,
  buildDeepBody
} from './headers'

describe('ANTHROPIC_VERSION', () => {
  it('为代码常量 2023-06-01', () => {
    expect(ANTHROPIC_VERSION).toBe('2023-06-01')
  })
})

describe('DEFAULT_TEST_MODEL', () => {
  it('custom 为空串（必填）', () => {
    expect(DEFAULT_TEST_MODEL.custom).toBe('')
  })

  it('其余三项非空', () => {
    expect(DEFAULT_TEST_MODEL.openai).toBe('gpt-5.5')
    expect(DEFAULT_TEST_MODEL.anthropic).toBe('claude-sonnet-5')
    expect(DEFAULT_TEST_MODEL.deepseek).toBe('deepseek-v4-flash')
  })
})

describe('buildHeaders', () => {
  it('anthropic → x-api-key + anthropic-version，无 Authorization', () => {
    const h = buildHeaders('anthropic', 'sk-ant')
    expect(h['x-api-key']).toBe('sk-ant')
    expect(h['anthropic-version']).toBe(ANTHROPIC_VERSION)
    expect(h['Authorization']).toBeUndefined()
  })

  it('openai/deepseek/custom → Authorization: Bearer，无 anthropic 头', () => {
    for (const p of ['openai', 'deepseek', 'custom'] as const) {
      const h = buildHeaders(p, 'sk-x')
      expect(h['Authorization']).toBe('Bearer sk-x')
      expect(h['x-api-key']).toBeUndefined()
      expect(h['anthropic-version']).toBeUndefined()
    }
  })

  it('所有 provider 含 content-type: application/json', () => {
    for (const p of ['openai', 'anthropic', 'deepseek', 'custom'] as const) {
      expect(buildHeaders(p, 'sk-x')['content-type']).toBe('application/json')
    }
  })
})

describe('buildDeepBody', () => {
  it('openai 系：model + messages + max_tokens:1', () => {
    const b = buildDeepBody('openai', 'gpt-4o-mini') as Record<string, unknown>
    expect(b['model']).toBe('gpt-4o-mini')
    expect(b['max_tokens']).toBe(1)
    expect(Array.isArray(b['messages'])).toBe(true)
  })

  it('anthropic：model + max_tokens:1 + messages', () => {
    const b = buildDeepBody('anthropic', 'claude-3-5-haiku-latest') as Record<string, unknown>
    expect(b['model']).toBe('claude-3-5-haiku-latest')
    expect(b['max_tokens']).toBe(1)
    expect(Array.isArray(b['messages'])).toBe(true)
  })

  it('messages 内容为单条 user ping', () => {
    const b = buildDeepBody('deepseek', 'deepseek-chat') as {
      messages: { role: string; content: string }[]
    }
    expect(b.messages).toHaveLength(1)
    expect(b.messages[0]).toEqual({ role: 'user', content: 'ping' })
  })
})