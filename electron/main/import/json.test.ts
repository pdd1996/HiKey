import { describe, it, expect } from 'vitest'
import { parseJsonFile } from './json'
import { ImportParseError } from './types'

describe('parseJsonFile', () => {
  it('合法数组 → items', () => {
    const r = parseJsonFile(
      JSON.stringify([
        { name: 'work', provider: 'openai', baseUrl: 'https://gw', key: 'sk-1' }
      ])
    )
    expect(r.items).toHaveLength(1)
    expect(r.items[0]).toMatchObject({
      name: 'work',
      provider: 'openai',
      baseUrl: 'https://gw',
      secret: 'sk-1',
      source: 'json'
    })
    expect(r.items[0].id).toBe('json-0')
  })

  it('provider 非法 → skipped', () => {
    const r = parseJsonFile(JSON.stringify([{ provider: 'gemini', key: 'sk', baseUrl: '', name: 'x' }]))
    expect(r.items).toHaveLength(0)
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0].reason).toBe('provider 非法或缺失')
  })

  it('缺 key / key 空串 → skipped', () => {
    const r = parseJsonFile(
      JSON.stringify([
        { provider: 'openai', name: 'a', baseUrl: '' },
        { provider: 'openai', name: 'b', baseUrl: '', key: '   ' }
      ])
    )
    expect(r.items).toHaveLength(0)
    expect(r.skipped).toHaveLength(2)
    expect(r.skipped.every((s) => s.reason === '缺少 key')).toBe(true)
  })

  it('name 空 → {provider}-{序号}', () => {
    const r = parseJsonFile(JSON.stringify([{ provider: 'openai', key: 'sk', baseUrl: 'https://x' }]))
    expect(r.items[0].name).toBe('openai-1')
  })

  it('baseUrl 空：openai → DEFAULT_BASE_URL；custom → 空串', () => {
    const r = parseJsonFile(
      JSON.stringify([
        { provider: 'openai', name: 'a', key: 'sk', baseUrl: '' },
        { provider: 'custom', name: 'b', key: 'sk', baseUrl: '' }
      ])
    )
    expect(r.items[0].baseUrl).toBe('https://api.openai.com')
    expect(r.items[1].baseUrl).toBe('')
  })

  it('同 provider 序号递增（name 空时）', () => {
    const r = parseJsonFile(
      JSON.stringify([
        { provider: 'openai', key: 'sk1', baseUrl: 'https://x' },
        { provider: 'openai', key: 'sk2', baseUrl: 'https://x' }
      ])
    )
    expect(r.items.map((i) => i.name)).toEqual(['openai-1', 'openai-2'])
  })

  it('非法 JSON → 抛 ImportParseError(invalid-json)', () => {
    expect(() => parseJsonFile('{not valid')).toThrow(ImportParseError)
    try {
      parseJsonFile('{not valid')
    } catch (e) {
      expect((e as ImportParseError).kind).toBe('invalid-json')
    }
  })

  it('顶层非数组 → 抛 ImportParseError(not-array)', () => {
    expect(() => parseJsonFile('{"a":1}')).toThrow(ImportParseError)
    try {
      parseJsonFile('{"a":1}')
    } catch (e) {
      expect((e as ImportParseError).kind).toBe('not-array')
    }
  })
})