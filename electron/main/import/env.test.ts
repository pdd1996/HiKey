import { describe, it, expect } from 'vitest'
import { parseEnvFile } from './env'

describe('parseEnvFile', () => {
  it('已知 *_API_KEY + *_BASE_URL 关联', () => {
    const r = parseEnvFile('OPENAI_API_KEY=sk-abc\nOPENAI_BASE_URL=https://gw.example.com\n')
    expect(r.items).toHaveLength(1)
    const it = r.items[0]
    expect(it.provider).toBe('openai')
    expect(it.secret).toBe('sk-abc')
    expect(it.baseUrl).toBe('https://gw.example.com')
    expect(it.name).toBe('openai-1')
    expect(it.id).toBe('env-0')
    expect(r.skipped).toHaveLength(0)
  })

  it('缺 *_BASE_URL → DEFAULT_BASE_URL', () => {
    const r = parseEnvFile('OPENAI_API_KEY=sk-abc\n')
    expect(r.items[0].baseUrl).toBe('https://api.openai.com')
  })

  it('多 provider 各自序号独立', () => {
    const r = parseEnvFile(
      'OPENAI_API_KEY=sk-a\nANTHROPIC_API_KEY=sk-b\nDEEPSEEK_API_KEY=sk-c\n'
    )
    expect(r.items).toHaveLength(3)
    const byP = Object.fromEntries(r.items.map((i) => [i.provider, i.name]))
    expect(byP).toEqual({ openai: 'openai-1', anthropic: 'anthropic-1', deepseek: 'deepseek-1' })
  })

  it('同 provider 多条 → 序号递增（dotenv 同 key 取最后值，故用不同写法不现实；此处测多 provider）', () => {
    // dotenv 对同 key 取最后值，所以同 provider 同变量名只产生一项；
    // 但不同 provider 的序号互不影响已在上例覆盖。
    const r = parseEnvFile('OPENAI_API_KEY=sk-a\nDEEPSEEK_API_KEY=sk-d\nOPENAI_BASE_URL=https://x\n')
    expect(r.items.map((i) => i.name)).toEqual(['openai-1', 'deepseek-1'])
  })

  it('引号/注释/空行由 dotenv 处理', () => {
    const r = parseEnvFile('# comment\nOPENAI_API_KEY="sk-x" # trailing\n\n')
    expect(r.items[0].secret).toBe('sk-x')
  })

  it('未知变量 + 孤立 *_BASE_URL → skipped', () => {
    const r = parseEnvFile('FOO=bar\nOPENAI_BASE_URL=https://x\nNODE_ENV=dev\n')
    expect(r.items).toHaveLength(0)
    expect(r.skipped).toHaveLength(3)
    const labels = r.skipped.map((s) => s.label)
    expect(labels).toEqual(['FOO', 'OPENAI_BASE_URL', 'NODE_ENV'])
    for (const s of r.skipped) {
      expect(s.reason).toBe('未识别的变量')
      expect(s.id).toMatch(/^env-\d+$/)
    }
    // skipped 值掩码
    expect(r.skipped[0].valueMask).toBe('••••') // 'bar' len=3 ≤8
  })

  it('id 唯一：items 与 skipped 共享 index 序列', () => {
    const r = parseEnvFile('FOO=bar\nOPENAI_API_KEY=sk-a\n')
    const ids = [r.skipped[0].id, r.items[0].id]
    expect(ids).toEqual(['env-0', 'env-1'])
  })
})