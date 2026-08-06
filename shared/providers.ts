// 跨进程共享的 provider 级常量与类型（PRD FR-2 + FR-3）
//
// 主进程与渲染进程共用的纯值/类型单一来源。本文件不得 import 任何 electron/node 模块，
// 以便渲染进程经 @shared 别名直接打包。
//
// KNOWN_PROVIDERS / Provider 以前在 electron/main/storage/schema.ts；
// DEFAULT_BASE_URL / DEFAULT_TEST_MODEL / ENV_API_KEY_MAP / PROVIDER_ENV_PREFIX
// 以前在 electron/main/providers.ts。集中到此处后，原文件改为 re-export，现有引用不变。

/** 已知 provider 白名单。不在其中的历史值（如 gemini）迁移为 custom。 */
export const KNOWN_PROVIDERS = ['openai', 'anthropic', 'deepseek', 'mimo', 'qwen', 'kimi', 'minimax', 'custom'] as const

export type Provider = (typeof KNOWN_PROVIDERS)[number]

/** 各 provider 默认 baseUrl（PRD FR-2）。custom 无默认，必填。 */
export const DEFAULT_BASE_URL: Record<Exclude<Provider, 'custom'>, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com',
  mimo: 'https://api.xiaomimimo.com',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode',
  kimi: 'https://api.moonshot.cn',
  minimax: 'https://api.minimaxi.com'
}

/** 各 provider 默认测试模型（custom 无默认，必填）。M3 联调后定稿。 */
export const DEFAULT_TEST_MODEL: Record<Provider, string> = {
  openai: 'gpt-5.5',
  anthropic: 'claude-sonnet-5',
  deepseek: 'deepseek-v4-flash',
  mimo: 'mimo-v2.5-pro',
  qwen: 'qwen3.8-max',
  kimi: 'kimi-k2.7-code',
  minimax: 'MiniMax-M3',
  custom: ''
}

/**
 * 各 provider 内置测试模型名单（custom 无名单，用户自由填写）。
 * 名单顺序即下拉展示顺序；DEFAULT_TEST_MODEL 的值必在对应名单内。
 * 模型名随时可能因 provider 下线而过期，以"可配置 + 集中维护内置名单"为准。
 */
export const TEST_MODEL_OPTIONS: Record<Exclude<Provider, 'custom'>, string[]> = {
  openai: ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'gpt-5.5'],
  anthropic: ['claude-fable-5', 'claude-opus-5', 'claude-sonnet-5', 'claude-haiku-4-5-20251001'],
  deepseek: ['deepseek-v4-flash', 'deepseek-v4-pro'],
  mimo: ['mimo-v2.5', 'mimo-v2.5-pro'],
  qwen: ['qwen3.8-max'],
  kimi: ['kimi-k3', 'kimi-k2.7-code'],
  minimax: ['MiniMax-M3']
}

/** .env 变量名 → provider 映射（custom 不经 .env）。 */
export const ENV_API_KEY_MAP: Record<string, Exclude<Provider, 'custom'>> = {
  OPENAI_API_KEY: 'openai',
  ANTHROPIC_API_KEY: 'anthropic',
  DEEPSEEK_API_KEY: 'deepseek',
  MIMO_API_KEY: 'mimo',
  DASHSCOPE_API_KEY: 'qwen',
  MOONSHOT_API_KEY: 'kimi',
  MINIMAX_API_KEY: 'minimax'
}

/** provider → env 变量前缀（用于关联 *_BASE_URL）。custom 无前缀。 */
export const PROVIDER_ENV_PREFIX: Record<Provider, string | null> = {
  openai: 'OPENAI',
  anthropic: 'ANTHROPIC',
  deepseek: 'DEEPSEEK',
  mimo: 'MIMO',
  qwen: 'DASHSCOPE',
  kimi: 'MOONSHOT',
  minimax: 'MINIMAX',
  custom: null
}