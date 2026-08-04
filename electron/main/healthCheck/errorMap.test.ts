import { describe, it, expect } from 'vitest'
import { extractErrorCode } from './errorMap'

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