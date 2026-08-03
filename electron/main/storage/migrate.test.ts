import { describe, it, expect } from 'vitest'
import { migrate } from './migrate'
import {
  SCHEMA_VERSION,
  DEFAULT_META,
  type DbRoot,
  type KeyRecord
} from './schema'

// 历史库形状：schemaVersion 缺失/为 0、provider 含 gemini、status 含 checking。
function legacyRoot(): DbRoot {
  return {
    schemaVersion: 0 as DbRoot['schemaVersion'],
    keys: [
      {
        id: 'k1',
        name: 'gemini-key',
        provider: 'gemini' as KeyRecord['provider'],
        baseUrl: 'https://generativelanguage.googleapis.com',
        encSecret: 'plain-or-cipher',
        secretMode: 'safeStorage',
        status: 'checking',
        deepCheck: true,
        testModel: 'gemini-1.5',
        createdAt: 1,
        updatedAt: 1
      }
    ],
    meta: { ...DEFAULT_META, checkIntervalMinutes: undefined as unknown as number }
  } as DbRoot
}

describe('migrate', () => {
  it('schemaVersion 0 + gemini + checking → 迁移为 custom、归位 unchecked、版本升到 2', () => {
    const root = legacyRoot()
    const { changed } = migrate(root)
    expect(changed).toBe(true)
    expect(root.schemaVersion).toBe(SCHEMA_VERSION)
    const k = root.keys[0]
    expect(k.provider).toBe('custom')
    expect(k.status).toBe('unchecked')
    expect(k.lastError).toContain('原 provider=gemini')
    expect(k.lastError).toContain('已迁移为 custom')
  })

  it('回填缺失 meta 字段为默认值', () => {
    const root = legacyRoot()
    migrate(root)
    expect(root.meta.checkIntervalMinutes).toBe(DEFAULT_META.checkIntervalMinutes)
  })

  it('已是当前版本且无 checking → changed=false（不写回）', () => {
    const root: DbRoot = {
      schemaVersion: SCHEMA_VERSION,
      keys: [
        {
          id: 'k',
          name: 'n',
          provider: 'openai',
          baseUrl: 'https://api.openai.com',
          encSecret: 'x',
          secretMode: 'safeStorage',
          status: 'valid',
          deepCheck: true,
          testModel: 'gpt-4o-mini',
          createdAt: 1,
          updatedAt: 1
        }
      ],
      meta: { ...DEFAULT_META }
    }
    expect(migrate(root).changed).toBe(false)
    expect(root.keys[0].status).toBe('valid')
  })

  it('当前版本但仍含遗留 checking → 归位为 unchecked 且 changed=true', () => {
    const root: DbRoot = {
      schemaVersion: SCHEMA_VERSION,
      keys: [
        {
          id: 'k',
          name: 'n',
          provider: 'openai',
          baseUrl: 'https://api.openai.com',
          encSecret: 'x',
          secretMode: 'safeStorage',
          status: 'checking',
          deepCheck: true,
          testModel: 'gpt-4o-mini',
          createdAt: 1,
          updatedAt: 1
        }
      ],
      meta: { ...DEFAULT_META }
    }
    expect(migrate(root).changed).toBe(true)
    expect(root.keys[0].status).toBe('unchecked')
  })
})