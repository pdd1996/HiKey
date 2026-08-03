// .env 解析（PRD FR-3）
//
// 用 dotenv.parse 处理引号/注释/空行。仅识别 OPENAI/ANTHROPIC/DEEPSEEK 三类 _API_KEY，
// 关联对应 *_BASE_URL（缺失用 DEFAULT_BASE_URL）；name 按 {provider}-{序号} 自动生成。
// 其余变量（孤立 *_BASE_URL、未知 *_API_KEY、无关变量）→ skipped 并列出。
//
// index 按 dotenv.parse 返回的原始 entry 顺序递增，items 与 skipped 共享 index 序列
// 以保证 ParsedItem.id（env-{index}）唯一。

import { parse as dotenvParse } from 'dotenv'
import { ENV_API_KEY_MAP, PROVIDER_ENV_PREFIX, DEFAULT_BASE_URL } from '../providers'
import type { Provider } from '../storage/schema'
import { maskKey } from './mask'
import type { ParsedItem, SkippedVar } from './types'

export interface EnvParseResult {
  items: ParsedItem[]
  skipped: SkippedVar[]
}

// *_BASE_URL 变量名 → provider（用于关联/孤立判定）
const BASE_URL_VAR_MAP: Record<string, Provider> = Object.fromEntries(
  (Object.keys(PROVIDER_ENV_PREFIX) as Provider[])
    .filter((p) => PROVIDER_ENV_PREFIX[p] !== null)
    .map((p) => [`${PROVIDER_ENV_PREFIX[p]}_BASE_URL`, p])
) as Record<string, Provider>

/** 解析 .env 文件内容（已读入字符串）。 */
export function parseEnvFile(content: string): EnvParseResult {
  const parsed = dotenvParse(content) as Record<string, string>
  const items: ParsedItem[] = []
  const skipped: SkippedVar[] = []
  // 每 provider 已生成的 name 序号（用于 {provider}-{序号}）
  const seq: Record<string, number> = {}

  // 先确定哪些 provider 有 _API_KEY（用于判定 *_BASE_URL 是关联还是孤立）
  const providersWithKey = new Set<Provider>()
  for (const key of Object.keys(parsed)) {
    const p = ENV_API_KEY_MAP[key]
    if (p) providersWithKey.add(p)
  }

  let index = 0
  for (const [key, value] of Object.entries(parsed)) {
    // 已知 *_API_KEY → 生成 item
    const provider = ENV_API_KEY_MAP[key]
    if (provider) {
      const prefix = PROVIDER_ENV_PREFIX[provider]!
      const baseUrlRaw = parsed[`${prefix}_BASE_URL`]
      const baseUrl =
        baseUrlRaw && baseUrlRaw.trim().length > 0 ? baseUrlRaw : DEFAULT_BASE_URL[provider]
      const n = (seq[provider] ?? 0) + 1
      seq[provider] = n
      items.push({
        id: `env-${index}`,
        name: `${provider}-${n}`,
        provider,
        baseUrl,
        secret: value,
        source: 'env'
      })
      index++
      continue
    }

    // *_BASE_URL：对应 _API_KEY 存在 → 关联消费（不产生行）；孤立 → skipped
    const baseProvider = BASE_URL_VAR_MAP[key]
    if (baseProvider) {
      if (providersWithKey.has(baseProvider)) {
        // 关联消费，不产出行（也不消耗 index）
        continue
      }
      skipped.push({
        id: `env-${index}`,
        label: key,
        valueMask: maskKey(value),
        reason: '未识别的变量'
      })
      index++
      continue
    }

    // 其余未知变量 → skipped
    skipped.push({
      id: `env-${index}`,
      label: key,
      valueMask: maskKey(value),
      reason: '未识别的变量'
    })
    index++
  }

  return { items, skipped }
}