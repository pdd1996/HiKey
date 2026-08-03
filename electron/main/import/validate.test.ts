import { describe, it, expect } from 'vitest'
import { validateImportFile, MAX_IMPORT_BYTES } from './validate'

describe('validateImportFile', () => {
  it('.env / .json / .ENV 后缀通过', () => {
    expect(validateImportFile({ name: 'keys.env', size: 100 }).ok).toBe(true)
    expect(validateImportFile({ name: 'keys.json', size: 100 }).ok).toBe(true)
    expect(validateImportFile({ name: 'KEYS.ENV', size: 100 }).ok).toBe(true)
    expect(validateImportFile({ name: '.env', size: 100 }).ok).toBe(true)
  })

  it('非 .env/.json → ext 拒绝', () => {
    expect(validateImportFile({ name: 'keys.txt', size: 100 })).toEqual({ ok: false, reason: 'ext' })
    expect(validateImportFile({ name: 'keys', size: 100 })).toEqual({ ok: false, reason: 'ext' })
    expect(validateImportFile({ name: 'keys.yaml', size: 100 })).toEqual({ ok: false, reason: 'ext' })
  })

  it('size ≤ 1MB 通过', () => {
    expect(validateImportFile({ name: 'keys.env', size: MAX_IMPORT_BYTES }).ok).toBe(true)
  })

  it('size > 1MB → size 拒绝', () => {
    expect(validateImportFile({ name: 'keys.json', size: MAX_IMPORT_BYTES + 1 })).toEqual({
      ok: false,
      reason: 'size'
    })
  })
})