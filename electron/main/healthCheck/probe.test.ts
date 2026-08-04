// probe 单测：mock fetch 验证 200/401/网络错误/超时四种映射 + pingMs 计时。

import { describe, it, expect, vi } from 'vitest'
import { probeKey, type ProbeInput } from './probe'
import type { FetchImpl } from './checker'

/** mock fetch：按调用序列返回 {status, body}。 */
function fetchSeq(...responses: { status: number; body?: unknown }[]): FetchImpl {
  let i = 0
  return vi.fn(async () => {
    const r = responses[i++] ?? { status: 200 }
    return { status: r.status, json: async () => r.body ?? null } as unknown as Response
  }) as unknown as FetchImpl
}

/** mock fetch：永不主动 resolve，仅响应 signal abort（模拟超时/网络中断）。 */
function fetchHangOnSignal(): FetchImpl {
  return vi.fn(
    async (_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })
  ) as unknown as FetchImpl
}

function base(over: Partial<ProbeInput> = {}): ProbeInput {
  return {
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    secret: 'sk-test',
    pingTimeoutMs: 2000,
    ...over
  }
}

describe('probeKey', () => {
  it('200 → 200 + pingMs', async () => {
    let t = 1000
    const clock = () => (t += 150) // t0=1150，fetch 后 t1=1300 → 150
    const out = await probeKey(base({ fetchImpl: fetchSeq({ status: 200, body: { data: [] } }), clock }))
    expect(out).toEqual({ ok: true, status: '200', pingMs: 150 })
  })

  it('401 invalid_api_key → 401 + lastError', async () => {
    const out = await probeKey(base({ fetchImpl: fetchSeq({ status: 401, body: { error: { code: 'invalid_api_key' } } }) }))
    expect(out.ok).toBe(true)
    if (out.ok) {
      expect(out.status).toBe('401')
      expect(out.lastError).toBe('401 / invalid_api_key')
    }
  })

  it('402 → 402', async () => {
    const out = await probeKey(base({ fetchImpl: fetchSeq({ status: 402, body: null }) }))
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.status).toBe('402')
  })

  it('429 非欠费 → 429', async () => {
    const out = await probeKey(base({ fetchImpl: fetchSeq({ status: 429, body: { error: { message: 'slow down' } } }) }))
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.status).toBe('429')
  })

  it('网络错误（fetch reject 非 abort）→ { ok:false, reason:"network" }', async () => {
    const f = vi.fn(async () => {
      throw new TypeError('fetch failed')
    }) as unknown as FetchImpl
    const out = await probeKey(base({ fetchImpl: f }))
    expect(out).toEqual({ ok: false, reason: 'network' })
  })

  it('超时（signal abort）→ { ok:false, reason:"timeout" }', async () => {
    const out = await probeKey(base({ fetchImpl: fetchHangOnSignal(), pingTimeoutMs: 10 }))
    expect(out).toEqual({ ok: false, reason: 'timeout' })
  })

  it('不注入 clock → pingMs undefined', async () => {
    const out = await probeKey(base({ fetchImpl: fetchSeq({ status: 200 }) }))
    expect(out.ok).toBe(true)
    if (out.ok) expect(out.pingMs).toBeUndefined()
  })

  it('custom provider → buildPingUrl 走 /models（不附 /v1）', async () => {
    const f = vi.fn(async (url: string) => {
      expect(url).toBe('https://myproxy.com/models')
      return { status: 200, json: async () => null } as unknown as Response
    }) as unknown as FetchImpl
    const out = await probeKey(base({ provider: 'custom', baseUrl: 'https://myproxy.com', fetchImpl: f }))
    expect(out.ok).toBe(true)
    expect(f).toHaveBeenCalledTimes(1)
  })
})