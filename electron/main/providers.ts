// provider 级默认值单一来源（PRD FR-2 + FR-3）
//
// DEFAULT_BASE_URL：导入/表单缺省 baseUrl。custom 无默认，必填。
// DEFAULT_TEST_MODEL：从 healthCheck/headers.ts 迁来，避免导入与检测两处各写一份；
//   headers.ts 改为 re-export 本文件，M3 测试不受影响。

import type { Provider } from './storage/schema'

/** 各 provider 默认 baseUrl（PRD FR-2）。custom 无默认，必填。 */
export const DEFAULT_BASE_URL: Record<Exclude<Provider, 'custom'>, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com'
}

/** 各 provider 默认测试模型（custom 无默认，必填）。M3 联调后定稿。 */
export const DEFAULT_TEST_MODEL: Record<Provider, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-haiku-latest',
  deepseek: 'deepseek-chat',
  custom: ''
}

/** .env 变量名 → provider 映射（仅已知三类；custom 不经 .env）。 */
export const ENV_API_KEY_MAP: Record<string, Exclude<Provider, 'custom'>> = {
  OPENAI_API_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  DEEPSEEK_API_KEY: 'deepseek'
}

/** provider → env 变量前缀（用于关联 *_BASE_URL）。custom 无前缀。 */
export const PROVIDER_ENV_PREFIX: Record<Provider, string | null> = {
  openai: 'OPENAI',
  anthropic: 'ANTHROPIC',
  deepseek: 'DEEPSEEK',
  custom: null
}