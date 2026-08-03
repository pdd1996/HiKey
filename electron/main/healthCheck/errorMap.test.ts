import { describe, it, expect } from 'vitest'
import { extractErrorCode, isQuotaError } from './errorMap'

describe('extractErrorCode', () => {
  it('取 error.code', () => {
    expect(extractErrorCode({ error: { code: 'insufficient_quota' } })).toBe(
      'insufficient_quota'
    )
  })

  it('无 code 取 error.type 兜底', () => {
    expect(extractErrorCode({ error: { type: 'rate_limit_exceeded' } })).toBe(
      'rate_limit_exceeded'
    )
  })

  it('code 优先于 type', () => {
    expect(
      extractErrorCode({ error: { code: 'billing_not_active', type: 'x' } })
    ).toBe('billing_not_active')
  })

  it('大小写归一（大写转小写）', () => {
    expect(extractErrorCode({ error: { code: 'Insufficient_Quota' } })).toBe(
      'insufficient_quota'
    )
  })

  it('无 error → null', () => {
    expect(extractErrorCode({})).toBeNull()
  })

  it('error 为非对象 → null', () => {
    expect(extractErrorCode({ error: 'oops' })).toBeNull()
  })

  it('body 非 object → null', () => {
    expect(extractErrorCode(null)).toBeNull()
    expect(extractErrorCode('string')).toBeNull()
    expect(extractErrorCode(undefined)).toBeNull()
  })

  it('code 为非字符串 → null', () => {
    expect(extractErrorCode({ error: { code: 403 } })).toBeNull()
  })
})

describe('isQuotaError', () => {
  it('insufficient_quota 命中', () => {
    expect(isQuotaError({ error: { code: 'insufficient_quota' } })).toBe(true)
  })

  it('Anthropic 403 billing_not_active 命中', () => {
    expect(isQuotaError({ error: { type: 'billing_not_active' } })).toBe(true)
  })

  it('含 quota 子串命中（如 daily_quota_exceeded）', () => {
    expect(isQuotaError({ error: { code: 'daily_quota_exceeded' } })).toBe(true)
  })

  it('exhausted 命中', () => {
    expect(isQuotaError({ error: { message: 'x', code: 'quota_exhausted' } })).toBe(true)
  })

  it('balance 命中', () => {
    expect(isQuotaError({ error: { type: 'insufficient_balance' } })).toBe(true)
  })

  it('rate_limit_exceeded 不命中', () => {
    expect(isQuotaError({ error: { type: 'rate_limit_exceeded' } })).toBe(false)
  })

  it('invalid_api_key 不命中', () => {
    expect(isQuotaError({ error: { code: 'invalid_api_key' } })).toBe(false)
  })

  it('无 body / 无 error 不命中', () => {
    expect(isQuotaError(null)).toBe(false)
    expect(isQuotaError({})).toBe(false)
    expect(isQuotaError({ error: {} })).toBe(false)
  })
})