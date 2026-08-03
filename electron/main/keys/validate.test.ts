import { describe, it, expect } from 'vitest'
import { validateKeyInput } from './validate'
import type { KeyInput } from './types'

function input(over: Partial<KeyInput> = {}): KeyInput {
  return {
    provider: 'openai',
    name: 'openai-1',
    baseUrl: 'https://api.openai.com',
    secret: 'sk-x',
    ...over
  }
}

describe('validateKeyInput', () => {
  it('合法 add 输入通过', () => {
    expect(validateKeyInput(input(), { requireSecret: true }).ok).toBe(true)
  })

  it('合法 update 输入通过（不要求 secret）', () => {
    const r = validateKeyInput(input({ secret: undefined }), { requireSecret: false })
    expect(r.ok).toBe(true)
  })

  it('custom 缺 testModel → 拒绝', () => {
    const r = validateKeyInput(input({ provider: 'custom', testModel: undefined }), { requireSecret: true })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('testModel')
  })

  it('custom 填 testModel → 通过', () => {
    const r = validateKeyInput(input({ provider: 'custom', testModel: 'my-model' }), { requireSecret: true })
    expect(r.ok).toBe(true)
  })

  it('未知 provider → 拒绝', () => {
    const r = validateKeyInput(input({ provider: 'gemini' as KeyInput['provider'] }), { requireSecret: true })
    expect(r.ok).toBe(false)
    expect(r.reason).toBe('未知 provider')
  })

  it('name 空 → 拒绝', () => {
    expect(validateKeyInput(input({ name: '  ' }), { requireSecret: true }).ok).toBe(false)
  })

  it('baseUrl 空 → 拒绝', () => {
    expect(validateKeyInput(input({ baseUrl: '' }), { requireSecret: true }).ok).toBe(false)
  })

  it('add 缺 secret → 拒绝', () => {
    const r = validateKeyInput(input({ secret: undefined }), { requireSecret: true })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('secret')
  })

  it('update 缺 secret → 通过', () => {
    expect(validateKeyInput(input({ secret: undefined }), { requireSecret: false }).ok).toBe(true)
  })
})