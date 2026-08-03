// JSON 解析（PRD FR-3）
//
// 顶层须为数组 [{ name, provider, baseUrl, key }]。
// provider 不在 KNOWN_PROVIDERS / key 非空缺失 → skipped 并列出。
// name 空 → {provider}-{序号}；baseUrl 空 → DEFAULT_BASE_URL（custom → ''）。
// 非法 JSON / 顶层非数组 → 抛 ImportParseError，由 M5 catch 提示。

import { KNOWN_PROVIDERS } from '../storage/schema'
import type { Provider } from '../storage/schema'
import { DEFAULT_BASE_URL } from '../providers'
import { maskKey } from './mask'
import { ImportParseError, type ParsedItem, type SkippedVar } from './types'

export interface JsonParseResult {
  items: ParsedItem[]
  skipped: SkippedVar[]
}

function isProvider(v: unknown): v is Provider {
  return typeof v === 'string' && (KNOWN_PROVIDERS as readonly string[]).includes(v)
}

/** 解析 JSON 文件内容（已读入字符串）。 */
export function parseJsonFile(content: string): JsonParseResult {
  let data: unknown
  try {
    data = JSON.parse(content)
  } catch (e) {
    throw new ImportParseError('invalid-json', `JSON 解析失败：${String((e as Error).message ?? e)}`)
  }
  if (!Array.isArray(data)) {
    throw new ImportParseError('not-array', 'JSON 顶层须为数组 [{ name, provider, baseUrl, key }]')
  }

  const items: ParsedItem[] = []
  const skipped: SkippedVar[] = []
  const seq: Record<string, number> = {}

  data.forEach((raw, index) => {
    const id = `json-${index}`
    const obj = (raw ?? {}) as Record<string, unknown>
    const providerRaw = obj['provider']
    const keyRaw = obj['key']

    // provider 非法
    if (!isProvider(providerRaw)) {
      skipped.push({
        id,
        label: `JSON 项 #${index}`,
        valueMask: typeof keyRaw === 'string' ? maskKey(keyRaw) : '',
        reason: 'provider 非法或缺失'
      })
      return
    }
    // key 非空字符串
    if (typeof keyRaw !== 'string' || keyRaw.trim().length === 0) {
      skipped.push({
        id,
        label: `JSON 项 #${index}`,
        valueMask: '',
        reason: '缺少 key'
      })
      return
    }

    const provider = providerRaw
    const nameRaw = typeof obj['name'] === 'string' ? (obj['name'] as string).trim() : ''
    const n = (seq[provider] ?? 0) + 1
    seq[provider] = n
    const name = nameRaw.length > 0 ? nameRaw : `${provider}-${n}`

    const baseUrlRaw = typeof obj['baseUrl'] === 'string' ? (obj['baseUrl'] as string).trim() : ''
    const baseUrl =
      baseUrlRaw.length > 0
        ? baseUrlRaw
        : provider === 'custom'
          ? ''
          : DEFAULT_BASE_URL[provider]

    items.push({ id, name, provider, baseUrl, secret: keyRaw, source: 'json' })
  })

  return { items, skipped }
}