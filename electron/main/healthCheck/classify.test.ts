import { describe, it, expect } from 'vitest'
import { classifyPing, classifyDeep } from './classify'

describe('classifyPing', () => {
  it('200 → 200，无 lastError', () => {
    expect(classifyPing(200, null)).toEqual({ status: '200' })
  })

  it('401 → 401', () => {
    const r = classifyPing(401, { error: { code: 'invalid_api_key' } })
    expect(r.status).toBe('401')
    expect(r.lastError).toBe('401 / invalid_api_key')
  })

  it('403 命中欠费（Anthropic billing_not_active 走 403） → 403', () => {
    const r = classifyPing(403, { error: { type: 'billing_not_active' } })
    expect(r.status).toBe('403')
    expect(r.lastError).toBe('403 / billing_not_active')
  })

  it('403 非欠费 → 403', () => {
    const r = classifyPing(403, { error: { code: 'forbidden' } })
    expect(r.status).toBe('403')
  })

  it('402 含无 body → 402', () => {
    const r = classifyPing(402, null)
    expect(r.status).toBe('402')
    expect(r.lastError).toBe('402')
  })

  it('429 命中欠费 → 429', () => {
    const r = classifyPing(429, { error: { code: 'insufficient_quota' } })
    expect(r.status).toBe('429')
  })

  it('429 无欠费码（含无 body） → 429', () => {
    expect(classifyPing(429, null).status).toBe('429')
    expect(classifyPing(429, { error: { type: 'rate_limit_exceeded' } }).status).toBe(
      '429'
    )
  })

  it('5xx → 对应状态码', () => {
    expect(classifyPing(500, null).status).toBe('500')
    expect(classifyPing(503, null).status).toBe('503')
  })

  it('其余 4xx → 对应状态码', () => {
    expect(classifyPing(404, null).status).toBe('404')
    expect(classifyPing(422, null).status).toBe('422')
    expect(classifyPing(405, null).status).toBe('405')
  })

  it('lastError 脱敏：只含状态码 + code，无 URL/key', () => {
    const r = classifyPing(401, { error: { code: 'invalid_api_key' } })
    expect(r.lastError).not.toContain('sk-')
    expect(r.lastError).toBe('401 / invalid_api_key')
  })
})

describe('classifyDeep', () => {
  it('2xx → 200', () => {
    expect(classifyDeep(200, null)).toEqual({ status: '200', deepDone: true })
  })

  it('400 → 400 + lastError', () => {
    const r = classifyDeep(400, { error: { code: 'model_not_found' } })
    expect(r.status).toBe('400')
    expect(r.deepDone).toBe(true)
    expect(r.lastError).toBe('400 / model_not_found')
  })

  it('404 → 404 + lastError', () => {
    const r = classifyDeep(404, null)
    expect(r.status).toBe('404')
    expect(r.lastError).toBe('404')
  })

  it('401 → 401', () => {
    expect(classifyDeep(401, { error: { code: 'invalid_api_key' } }).status).toBe('401')
  })

  it('403 命中欠费 → 403', () => {
    expect(
      classifyDeep(403, { error: { type: 'billing_not_active' } }).status
    ).toBe('403')
  })

  it('402 → 402', () => {
    expect(classifyDeep(402, null).status).toBe('402')
  })

  it('429 命中欠费 → 429；否则 429', () => {
    expect(
      classifyDeep(429, { error: { code: 'insufficient_quota' } }).status
    ).toBe('429')
    expect(classifyDeep(429, null).status).toBe('429')
  })

  it('5xx → 对应状态码', () => {
    expect(classifyDeep(500, null).status).toBe('500')
  })

  it('其余 4xx → 对应状态码', () => {
    expect(classifyDeep(422, null).status).toBe('422')
    expect(classifyDeep(405, null).status).toBe('405')
  })

  it('deepDone 始终为 true', () => {
    expect(classifyDeep(200, null).deepDone).toBe(true)
    expect(classifyDeep(500, null).deepDone).toBe(true)
    expect(classifyDeep(400, null).deepDone).toBe(true)
  })
})