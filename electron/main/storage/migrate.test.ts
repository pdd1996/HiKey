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
  it('schemaVersion 0 + gemini + checking → 迁移为 custom、删除 status、版本升到 5', () => {
    const root = legacyRoot()
    const { changed } = migrate(root)
    expect(changed).toBe(true)
    expect(root.schemaVersion).toBe(SCHEMA_VERSION)
    const k = root.keys[0]
    expect(k.provider).toBe('custom')
    expect(k.status).toBeUndefined()
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
          status: '200',
          deepCheck: true,
          testModel: 'gpt-4o-mini',
          createdAt: 1,
          updatedAt: 1
        }
      ],
      meta: { ...DEFAULT_META }
    }
    expect(migrate(root).changed).toBe(false)
    expect(root.keys[0].status).toBe('200')
  })

  describe('v3→v4 合并 deepCheck 开关', () => {
    function v3Root(metaOver: Record<string, unknown>): DbRoot {
      return {
        schemaVersion: 3 as DbRoot['schemaVersion'],
        keys: [],
        meta: {
          checkIntervalMinutes: 15,
          deepCheckEnabled: true,
          deepCheckOnEveryPoll: false,
          concurrentChecks: 4,
          pingTimeoutMs: 2000,
          deepTimeoutMs: 2000,
          allowPlaintextFallback: false,
          plaintextMode: false,
          clipboardClearMs: 60000,
          ...metaOver
        }
      } as unknown as DbRoot
    }

    it('deepCheckEnabled=true + deepCheckOnEveryPoll=true → 合并为 true，删除 deepCheckOnEveryPoll', () => {
      const root = v3Root({ deepCheckOnEveryPoll: true })
      migrate(root)
      expect(root.schemaVersion).toBe(SCHEMA_VERSION)
      expect(root.meta.deepCheckEnabled).toBe(true)
      expect('deepCheckOnEveryPoll' in root.meta).toBe(false)
    })

    it('deepCheckOnEveryPoll=false → 合并为 false，删除 deepCheckOnEveryPoll', () => {
      const root = v3Root({ deepCheckEnabled: true, deepCheckOnEveryPoll: false })
      migrate(root)
      expect(root.meta.deepCheckEnabled).toBe(false)
      expect('deepCheckOnEveryPoll' in root.meta).toBe(false)
    })
  })

  describe('v4→v5 定时检测总开关', () => {
    function v4Root(metaOver: Record<string, unknown>): DbRoot {
      return {
        schemaVersion: 4 as DbRoot['schemaVersion'],
        keys: [],
        meta: {
          checkIntervalMinutes: 15,
          healthCheckEnabled: true,
          deepCheckEnabled: true,
          concurrentChecks: 4,
          pingTimeoutMs: 2000,
          deepTimeoutMs: 2000,
          allowPlaintextFallback: false,
          plaintextMode: false,
          clipboardClearMs: 60000,
          ...metaOver
        }
      } as unknown as DbRoot
    }

    it('v4 库 deepCheckEnabled=true（无 deepCheckOnEveryPoll）→ 迁移后仍为 true，不被 v3→v4 块误改', () => {
      const root = v4Root({ deepCheckEnabled: true })
      migrate(root)
      expect(root.schemaVersion).toBe(SCHEMA_VERSION)
      expect(root.meta.deepCheckEnabled).toBe(true)
      expect('deepCheckOnEveryPoll' in root.meta).toBe(false)
    })

    it('v4 库缺 healthCheckEnabled → 回填为 true（默认开）', () => {
      const root = v4Root({})
      delete (root.meta as unknown as Record<string, unknown>).healthCheckEnabled
      migrate(root)
      expect(root.meta.healthCheckEnabled).toBe(true)
    })

    it('v4 库显式 healthCheckEnabled=false → 保留为 false', () => {
      const root = v4Root({ healthCheckEnabled: false })
      migrate(root)
      expect(root.meta.healthCheckEnabled).toBe(false)
    })
  })
})