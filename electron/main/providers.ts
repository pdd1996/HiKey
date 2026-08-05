// provider 级默认值单一来源（PRD FR-2 + FR-3）已抽到 shared/providers.ts，
// 供渲染进程经 @shared 别名直接 import。本文件 re-export 保持主进程现有
// `from '../providers'` / `from './providers'` 引用不变。
//
// DEFAULT_BASE_URL：导入/表单缺省 baseUrl。custom 无默认，必填。
// DEFAULT_TEST_MODEL：从 healthCheck/headers.ts 迁来，避免导入与检测两处各写一份；
//   headers.ts 仍 `export { DEFAULT_TEST_MODEL } from '../providers'`，M3 测试不受影响。

export {
  DEFAULT_BASE_URL,
  DEFAULT_TEST_MODEL,
  TEST_MODEL_OPTIONS,
  ENV_API_KEY_MAP,
  PROVIDER_ENV_PREFIX,
  KNOWN_PROVIDERS,
  type Provider
} from '../../shared/providers'