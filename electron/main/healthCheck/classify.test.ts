import { describe, it, expect } from 'vitest'
import { classifyPing, classifyDeep } from './classify'

describe('classifyPing', () => {
  it('200 → valid，无 lastError', () => {
    expect(classifyPing(200, null)).toEqual({ status: 'valid' })
  })

  it('401 非欠费 → invalid', () => {
    const r = classifyPing(401, { error: { code: 'invalid_api_key' } })
    expect(r.status).toBe('invalid')
    expect(r.lastError).toBe('401 / invalid_api_key')
  })

  it('403 命中欠费 → quota_exceeded（Anthropic billing_not_active 走 403）', () => {
    const r = classifyPing(403, { error: { type: 'billing_not_active' } })
    expect(r.status).toBe('quota_exceeded')
    expect(r.lastError).toBe('403 / billing_not_active')
  })

  it('403 非欠费 → invalid', () => {
    const r = classifyPing(403, { error: { code: 'forbidden' } })
    expect(r.status).toBe('invalid')
  })

  it('402 含无 body → quota_exceeded', () => {
    const r = classifyPing(402, null)
    expect(r.status).toBe('quota_exceeded')
    expect(r.lastError).toBe('402')
  })

  it('429 命中欠费 → quota_exceeded', () => {
    const r = classifyPing(429, { error: { code: 'insufficient_quota' } })
    expect(r.status).toBe('quota_exceeded')
  })

  it('429 无欠费码（含无 body） → rate_limited', () => {
    expect(classifyPing(429, null).status).toBe('rate_limited')
    expect(classifyPing(429, { error: { type: 'rate_limit_exceeded' } }).status).toBe(
      'rate_limited'
    )
  })

  it('5xx → unknown', () => {
    expect(classifyPing(500, null).status).toBe('unknown')
    expect(classifyPing(503, null).status).toBe('unknown')
  })

  it('其余 4xx → unknown（不误判失效）', () => {
    expect(classifyPing(404, null).status).toBe('unknown')
    expect(classifyPing(422, null).status).toBe('unknown')
    expect(classifyPing(405, null).status).toBe('unknown')
  })

  it('lastError 脱敏：只含状态码 + code，无 URL/key', () => {
    const r = classifyPing(401, { error: { code: 'invalid_api_key' } })
    expect(r.lastError).not.toContain('sk-')
    expect(r.lastError).toBe('401 / invalid_api_key')
  })
})

describe('classifyDeep', () => {
  it('2xx → valid', () => {
    expect(classifyDeep(200, null)).toEqual({ status: 'valid', deepDone: true })
  })

  it('400 → 状态保持 valid，lastError 写模型/配置提示', () => {
    const r = classifyDeep(400, { error: { code: 'model_not_found' } })
    expect(r.status).toBe('valid')
    expect(r.deepDone).toBe(true)
    expect(r.lastError).toBe('深检未通过：模型/配置问题，建议更换 testModel')
  })

  it('404 → 同 400，不降级 valid', () => {
    const r = classifyDeep(404, null)
    expect(r.status).toBe('valid')
    expect(r.lastError).toBe('深检未通过：模型/配置问题，建议更换 testModel')
  })

  it('401 非欠费 → invalid', () => {
    expect(classifyDeep(401, { error: { code: 'invalid_api_key' } }).status).toBe('invalid')
  })

  it('403 命中欠费 → quota_exceeded', () => {
    expect(
      classifyDeep(403, { error: { type: 'billing_not_active' } }).status
    ).toBe('quota_exceeded')
  })

  it('402 → quota_exceeded', () => {
    expect(classifyDeep(402, null).status).toBe('quota_exceeded')
  })

  it('429 命中欠费 → quota_exceeded；否则 rate_limited', () => {
    expect(
      classifyDeep(429, { error: { code: 'insufficient_quota' } }).status
    ).toBe('quota_exceeded')
    expect(classifyDeep(429, null).status).toBe('rate_limited')
  })

  it('5xx → unknown', () => {
    expect(classifyDeep(500, null).status).toBe('unknown')
  })

  it('其余 4xx → unknown', () => {
    expect(classifyDeep(422, null).status).toBe('unknown')
    expect(classifyDeep(405, null).status).toBe('unknown')
  })

  it('deepDone 始终为 true', () => {
    expect(classifyDeep(200, null).deepDone).toBe(true)
    expect(classifyDeep(500, null).deepDone).toBe(true)
    expect(classifyDeep(400, null).deepDone).toBe(true)
  })
})