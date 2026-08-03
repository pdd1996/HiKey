// import handler 测试：pickAndParse 扩展名分流 + 解析错误映射 + 取消；confirm 会话反查。

import { describe, it, expect, vi } from 'vitest'

// applyImport 内部调 getDb() 单例（测试环境未初始化），mock 掉只断言调用。
const { mockApply } = vi.hoisted(() => ({
  mockApply: vi.fn(async () => ({ added: 0, overwritten: 0, skipped: 0, failed: 0, failures: [] }))
}))
vi.mock('../import/apply', () => ({ applyImport: mockApply }))

// buildPreview → dedup → revealSecret（safeStorage），需可逆 mock。
const { mockSafeStorage } = vi.hoisted(() => ({
  mockSafeStorage: {
    isEncryptionAvailable: (): boolean => true,
    encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
    decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8')
  }
}))
vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

import { handlePickAndParse, handleConfirm } from './import'
import { makeDeps } from './testutil'
import type { ConfirmItem } from '../import/types'

describe('handlePickAndParse', () => {
  it('.env 文件 → parseEnvFile + buildPreview，返回 sessionId + rows', async () => {
    const deps = makeDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/k.env'] }) } as never,
      fs: { readFile: async () => 'OPENAI_API_KEY=sk-x\n' } as never
    })
    const out = await handlePickAndParse(deps)
    expect(out).toEqual({ ok: true, sessionId: expect.any(String), rows: expect.any(Array) })
    if (out && out.ok) {
      expect(out.rows.length).toBe(1)
      expect(out.rows[0].status).toBe('new')
      expect(out.rows[0].provider).toBe('openai')
      // 会话已存入内存
      expect(deps.sessions.has(out.sessionId)).toBe(true)
    }
  })

  it('.json 文件 → parseJsonFile', async () => {
    const json = JSON.stringify([{ name: 'n', provider: 'openai', baseUrl: 'https://api.openai.com', key: 'sk-x' }])
    const deps = makeDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/k.json'] }) } as never,
      fs: { readFile: async () => json } as never
    })
    const out = await handlePickAndParse(deps)
    expect(out).toEqual({ ok: true, sessionId: expect.any(String), rows: expect.any(Array) })
    if (out && out.ok) expect(out.rows[0].provider).toBe('openai')
  })

  it('非法 JSON → { ok:false, error }', async () => {
    const deps = makeDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/k.json'] }) } as never,
      fs: { readFile: async () => '!!!not json!!!' } as never
    })
    const out = await handlePickAndParse(deps)
    expect(out).toEqual({ ok: false, error: 'JSON 解析失败' })
  })

  it('JSON 顶层非数组 → { ok:false, error }', async () => {
    const deps = makeDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/k.json'] }) } as never,
      fs: { readFile: async () => '{"a":1}' } as never
    })
    const out = await handlePickAndParse(deps)
    expect(out).toEqual({ ok: false, error: 'JSON 顶层须为数组' })
  })

  it('dialog 取消 → null', async () => {
    const deps = makeDeps({
      dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) } as never
    })
    const out = await handlePickAndParse(deps)
    expect(out).toBeNull()
  })

  it('扩展名非 .env/.json → { ok:false, error }', async () => {
    const deps = makeDeps({
      dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: ['/tmp/k.txt'] }) } as never,
      fs: { readFile: async () => 'whatever' } as never
    })
    const out = await handlePickAndParse(deps)
    expect(out).toEqual({ ok: false, error: '仅支持 .env / .json 文件' })
  })
})

describe('handleConfirm', () => {
  it('sessionId 反查命中 → applyImport 被调 + 会话清理', async () => {
    const sessionId = 'sess-1'
    const fakeSession = { rows: [], items: new Map(), skipped: [] } as never
    const deps = makeDeps()
    deps.sessions.set(sessionId, fakeSession)
    const confirms: ConfirmItem[] = [{ id: 'env-0', name: 'openai-1', action: 'add' }]

    const out = await handleConfirm(deps, sessionId, confirms)
    expect(out).toEqual({ ok: true, result: expect.any(Object) })
    expect(mockApply).toHaveBeenCalledTimes(1)
    expect(mockApply).toHaveBeenCalledWith(confirms, fakeSession, expect.any(Number))
    // 写入完成即清理会话
    expect(deps.sessions.has(sessionId)).toBe(false)
  })

  it('sessionId 缺失 → { ok:false, reason }', async () => {
    const deps = makeDeps()
    mockApply.mockClear()
    const out = await handleConfirm(deps, 'no-such', [])
    expect(out).toEqual({ ok: false, reason: 'session-not-found' })
    expect(mockApply).not.toHaveBeenCalled()
  })
})