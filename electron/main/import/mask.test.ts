import { describe, it, expect } from 'vitest'
import { maskKey, secretHash } from './mask'

describe('maskKey', () => {
  it('first3 + •••• + last4', () => {
    expect(maskKey('sk-abcdef1234567890')).toBe('sk-••••7890')
  })

  it('len=0 → 空串', () => {
    expect(maskKey('')).toBe('')
    expect(maskKey('   ')).toBe('')
  })

  it('len≤8 → 全掩码', () => {
    expect(maskKey('short')).toBe('••••')
    expect(maskKey('12345678')).toBe('••••')
  })

  it('len=9 → first3 + •••• + last3+4', () => {
    expect(maskKey('123456789')).toBe('123••••6789')
  })

  it('trim 后判定长度', () => {
    expect(maskKey('  sk-abcdef1234567890  ')).toBe('sk-••••7890')
  })
})

describe('secretHash', () => {
  it('trim 归一：前后空白不影响 hash', () => {
    expect(secretHash('sk-x')).toBe(secretHash(' sk-x '))
    expect(secretHash('sk-x')).toBe(secretHash('sk-x\t\n'))
  })

  it('不同 secret → 不同 hash', () => {
    expect(secretHash('sk-x')).not.toBe(secretHash('sk-y'))
  })

  it('返回 sha256 hex（64 字符）', () => {
    expect(secretHash('sk-x')).toMatch(/^[0-9a-f]{64}$/)
  })
})