import { describe, it, expect } from 'vitest'
import { validateBackupShape } from './validate'
import { defaultDbRoot } from '../storage/schema'
import type { HikeyBackup } from './types'

// 不依赖 safeStorage 的纯函数测试，直接构造合法 verifier 字符串占位
const FAKE_VERIFIER = 'base64-verifier-blob'

function cipherBackup(over: Partial<HikeyBackup> = {}): HikeyBackup {
  return {
    schemaVersion: 2,
    keys: [],
    meta: defaultDbRoot().meta,
    verifier: FAKE_VERIFIER,
    plaintextBackup: false,
    plaintextRecordCount: 0,
    ...over
  }
}

function plainBackup(over: Partial<HikeyBackup> = {}): HikeyBackup {
  return {
    schemaVersion: 2,
    keys: [],
    meta: defaultDbRoot().meta,
    verifier: null,
    plaintextBackup: true,
    plaintextRecordCount: 0,
    ...over
  }
}

describe('validateBackupShape', () => {
  it('合法密文组合通过', () => {
    expect(validateBackupShape(cipherBackup()).ok).toBe(true)
  })

  it('合法明文标记组合通过', () => {
    expect(validateBackupShape(plainBackup()).ok).toBe(true)
  })

  it('verifier 非 null + plaintextBackup=true → 拒绝', () => {
    const r = validateBackupShape(cipherBackup({ plaintextBackup: true }))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('verifier 非 null')
  })

  it('verifier=null + plaintextBackup=false → 拒绝', () => {
    const r = validateBackupShape(cipherBackup({ verifier: null }))
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('缺 verifier')
  })

  it('verifier=null + plaintextBackup 缺失 → 拒绝', () => {
    const b = cipherBackup()
    delete (b as Partial<HikeyBackup>).plaintextBackup
    const r = validateBackupShape(b)
    expect(r.ok).toBe(false)
  })

  it('verifier 为空字符串但 plaintextBackup=false → 拒绝', () => {
    const r = validateBackupShape(cipherBackup({ verifier: '' }))
    expect(r.ok).toBe(false)
  })

  it('缺 keys → 拒绝', () => {
    const b = cipherBackup()
    delete (b as { keys?: unknown[] }).keys
    expect(validateBackupShape(b).ok).toBe(false)
  })

  it('缺 schemaVersion → 拒绝', () => {
    const b = cipherBackup()
    delete (b as { schemaVersion?: number }).schemaVersion
    expect(validateBackupShape(b).ok).toBe(false)
  })

  it('plaintextRecordCount 非数字 → 拒绝', () => {
    const b = cipherBackup({ plaintextRecordCount: 'x' as unknown as number })
    expect(validateBackupShape(b).ok).toBe(false)
  })

  it('根非对象 → 拒绝', () => {
    expect(validateBackupShape(null).ok).toBe(false)
    expect(validateBackupShape('x').ok).toBe(false)
  })
})