// 跨进程共享的 provider 级常量与类型（PRD FR-2 + FR-3）
//
// 主进程与渲染进程共用的纯值/类型单一来源。本文件不得 import 任何 electron/node 模块，
// 以便渲染进程经 @shared 别名直接打包。
//
// KNOWN_PROVIDERS / Provider 以前在 electron/main/storage/schema.ts；
// DEFAULT_BASE_URL / DEFAULT_TEST_MODEL / ENV_API_KEY_MAP / PROVIDER_ENV_PREFIX
// 以前在 electron/main/providers.ts。集中到此处后，原文件改为 re-export，现有引用不变。

/** 已知 provider 白名单。不在其中的历史值（如 gemini）迁移为 custom。 */
export const KNOWN_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'custom'] as const

export type Provider = (typeof KNOWN_PROVIDERS)[number]

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