import { describe, it, expect, vi, beforeEach } from 'vitest'
import { checkKey, fetchWithTimeout, type FetchImpl } from './checker'
import type { KeyRecord, Meta } from '../storage/schema'

// mock electron safeStorage：默认可用、可逆，与 crypto.test 同范式。
const { mockSafeStorage } = vi.hoisted(() => {
  const state = { available: true }
  return {
    mockSafeStorage: {
      isEncryptionAvailable: () => state.available,
      encryptString: (s: string) => Buffer.from(s, 'utf8').toString('base64'),
      decryptString: (s: string) => Buffer.from(s, 'base64').toString('utf8'),
      _setAvailable: (v: boolean) => {
        state.available = v
      }
    }
  }
})
vi.mock('electron', () => ({ safeStorage: mockSafeStorage }))

const NOW = 1_700_000_000_000

function rec(over: Partial<KeyRecord> = {}): KeyRecord {
  return {
    id: 'k1',
    name: 'n',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    encSecret: Buffer.from('sk-secret', 'utf8').toString('base64'),
    secretMode: 'safeStorage',
    status: 'unchecked',
    deepCheck: true,
    testModel: 'gpt-4o-mini',
    createdAt: 1,
    updatedAt: 1,
    ...over
  }
}

function meta(over: Partial<Meta> = {}): Meta {
  return {
    checkIntervalMinutes: 15,
    healthCheckEnabled: true,
    deepCheckEnabled: true,
    concurrentChecks: 4,
    pingTimeoutMs: 2000,
    deepTimeoutMs: 2000,
    allowPlaintextFallback: false,
    plaintextMode: false,
    clipboardClearMs: 60000,
    ...over
  }
}

/** 构造按调用序列返回不同响应的 mock fetch。 */
function fetchSeq(...responses: { status: number; body?: unknown }[]): FetchImpl {
  let i = 0
  return vi.fn(async () => {
    const r = responses[i++] ?? { status: 200 }
    return { status: r.status, json: async () => r.body ?? null } as unknown as Response
  }) as unknown as FetchImpl
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('checkKey', () => {
  it('openai ping+deep 全通过 → 200 + deep 模式', async () => {
    const f = fetchSeq({ status: 200, body: { data: [] } }, { status: 200 })
    const out = await checkKey(rec(), meta(), 'manual', f, NOW)
    expect(out.status).toBe('200')
    expect(out.lastCheckMode).toBe('deep')
    expect(out.lastDeepCheckedAt).toBe(NOW)
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('ping 401 → 401，不发 deep（fetch 只调 1 次）', async () => {
    const f = fetchSeq({ status: 401, body: { error: { code: 'invalid_api_key' } } })
    const out = await checkKey(rec(), meta(), 'manual', f, NOW)
    expect(out.status).toBe('401')
    expect(out.lastCheckMode).toBe('ping')
    expect(out.lastError).toBe('401 / invalid_api_key')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('mode=ping + 全局 deepCheckEnabled=true → 仅 ping（mode 决定，不看开关）', async () => {
    const f = fetchSeq({ status: 200 })
    const out = await checkKey(rec(), meta(), 'manual', f, NOW, 'ping')
    expect(out.status).toBe('200')
    expect(out.lastCheckMode).toBe('ping')
    expect(out.lastDeepCheckedAt).toBeUndefined()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('mode=deep 强制深检：bypass deepCheckEnabled/record.deepCheck', async () => {
    // 两个开关全关，mode=deep 仍跑深检
    const f = fetchSeq({ status: 200 }, { status: 200 })
    const out = await checkKey(
      rec({ deepCheck: false }),
      meta({ deepCheckEnabled: false }),
      'poll',
      f,
      NOW,
      'deep'
    )
    expect(out.lastCheckMode).toBe('deep')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('mode=deep + testModel 空 → ping 200 但跳过深检 + 提示', async () => {
    const f = fetchSeq({ status: 200 })
    const out = await checkKey(
      rec({ provider: 'custom', baseUrl: 'https://myproxy.com', testModel: '' }),
      meta(),
      'manual',
      f,
      NOW,
      'deep'
    )
    expect(out.status).toBe('200')
    expect(out.lastCheckMode).toBe('ping')
    expect(out.lastError).toBe('深检需要 testModel')
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('poll + mode=ping → 仅 ping；poll + mode=deep → 深检（poll 门控由 scheduler 选 mode）', async () => {
    const fNo = fetchSeq({ status: 200 })
    const outNo = await checkKey(rec(), meta(), 'poll', fNo, NOW, 'ping')
    expect(outNo.lastCheckMode).toBe('ping')
    expect(fNo).toHaveBeenCalledTimes(1)

    const fYes = fetchSeq({ status: 200 }, { status: 200 })
    const outYes = await checkKey(rec(), meta(), 'poll', fYes, NOW, 'deep')
    expect(outYes.lastCheckMode).toBe('deep')
    expect(fYes).toHaveBeenCalledTimes(2)
  })

  it('manual + 默认 mode=deep → 深检（开关不挡手动）', async () => {
    const f = fetchSeq({ status: 200 }, { status: 200 })
    const out = await checkKey(rec(), meta({ deepCheckEnabled: false }), 'manual', f, NOW)
    expect(out.lastCheckMode).toBe('deep')
  })

  it('safeStorage 不可用 + safeStorage 密文 → 500 + 无法解密旧记录，不发网络', async () => {
    mockSafeStorage._setAvailable(false)
    const f = fetchSeq({ status: 200 })
    const out = await checkKey(rec(), meta(), 'manual', f, NOW)
    expect(out.status).toBe('500')
    expect(out.lastError).toBe('无法解密旧记录')
    expect(f).not.toHaveBeenCalled()
    mockSafeStorage._setAvailable(true)
  })

  it('明文降级记录照常检测（plaintext 直取明文）', async () => {
    const f = fetchSeq({ status: 200 }, { status: 200 })
    const out = await checkKey(
      rec({ secretMode: 'plaintext', encSecret: 'sk-plain' }),
      meta(),
      'manual',
      f,
      NOW
    )
    expect(out.status).toBe('200')
    expect(out.lastCheckMode).toBe('deep')
  })

  it('ping 超时 → timeout', async () => {
    // fetch 永不主动 resolve，仅响应 signal abort
    const f = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    ) as unknown as FetchImpl
    const out = await checkKey(rec(), meta({ pingTimeoutMs: 10 }), 'manual', f, NOW)
    expect(out.status).toBe('timeout')
    expect(out.lastCheckMode).toBe('ping')
  })

  it('deep 超时 → timeout + pingMs undefined（避免列表"超时 / 244ms"自相矛盾）', async () => {
    // ping 先成功（带 clock 计时 244ms），deep 永不 resolve → 本地 timer abort
    const neverResolve = async (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
    const f = vi.fn(async (url: string, init: RequestInit) => {
      // 第一次（ping）正常返回 200；第二次（deep）挂起等 abort
      if (url.includes('/models')) return { status: 200, json: async () => ({ data: [] }) } as unknown as Response
      return neverResolve(url, init)
    }) as unknown as FetchImpl
    let t = 1000
    const clock = () => (t += 244) // ping 段计时，确保无修复时 pingMs 会非空
    const out = await checkKey(rec(), meta({ deepTimeoutMs: 10 }), 'manual', f, NOW, 'deep', undefined, clock)
    expect(out.status).toBe('timeout')
    expect(out.lastCheckMode).toBe('deep')
    expect(out.pingMs).toBeUndefined()
  })

  it('deep 400 → 400 + lastError', async () => {
    const f = fetchSeq({ status: 200 }, { status: 400, body: { error: { code: 'model_not_found' } } })
    const out = await checkKey(rec(), meta(), 'manual', f, NOW)
    expect(out.status).toBe('400')
    expect(out.lastCheckMode).toBe('deep')
    expect(out.lastError).toBe('400 / model_not_found')
  })

  it('ping 402 无 body → 402', async () => {
    const f = fetchSeq({ status: 402, body: null })
    const out = await checkKey(rec(), meta(), 'manual', f, NOW)
    expect(out.status).toBe('402')
    expect(out.lastCheckMode).toBe('ping')
  })

  it('时间戳用注入的 now，不依赖 Date.now', async () => {
    const f = fetchSeq({ status: 200 })
    const out = await checkKey(rec(), meta(), 'manual', f, 12345, 'ping')
    expect(out.lastChecked).toBe(12345)
  })

  it('注入 clock → pingMs = 两次 clock() 之差（ping 成功）', async () => {
    const f = fetchSeq({ status: 200, body: { data: [] } })
    let t = 1000
    const clock = () => (t += 150) // 首调 t0=1150，fetch 后 t1=1300 → 150ms
    const out = await checkKey(rec(), meta(), 'manual', f, NOW, 'ping', undefined, clock)
    expect(out.pingMs).toBe(150)
  })

  it('不注入 clock → pingMs undefined', async () => {
    const f = fetchSeq({ status: 200 })
    const out = await checkKey(rec(), meta(), 'manual', f, NOW, 'ping')
    expect(out.pingMs).toBeUndefined()
  })

  it('ping 网络失败（超时）→ pingMs undefined，即便注入 clock', async () => {
    const f = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    ) as unknown as FetchImpl
    const clock = vi.fn(() => 1000)
    const out = await checkKey(rec(), meta({ pingTimeoutMs: 10 }), 'manual', f, NOW, 'ping', undefined, clock)
    expect(out.status).toBe('timeout')
    expect(out.pingMs).toBeUndefined()
  })
})

describe('fetchWithTimeout 失败 kind', () => {
  it('timer 到期 → { ok:false, kind:"timeout" }', async () => {
    const f = vi.fn(
      async (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
        })
    ) as unknown as FetchImpl
    const res = await fetchWithTimeout('https://x', {}, 10, f)
    expect(res).toEqual({ ok: false, kind: 'timeout' })
  })

  it('网络错误（fetch reject 非 abort）→ { ok:false, kind:"network" }', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as FetchImpl
    const res = await fetchWithTimeout('https://x', {}, 2000, f)
    expect(res).toEqual({ ok: false, kind: 'network' })
  })
})