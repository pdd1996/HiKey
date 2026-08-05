// 暗色模式：以 .dark class 驱动 globals.css 的 CSS 变量（tailwind darkMode: 'class'）。
// 偏好持久化到 localStorage，纯渲染层状态——不进主进程加密 DB（主题属 UI 偏好，无需备份）。
// 在 main.tsx 渲染前同步调用 applyTheme()，避免首帧闪白。

export type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'hikey-theme'

export const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

/** 系统当前是否深色。SSR/无 matchMedia 时回退到浅色。 */
export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.(SYSTEM_DARK_QUERY).matches === true
}

/** system 主题解析为实际生效的明/暗。 */
export function resolvedTheme(theme: Theme): 'light' | 'dark' {
  return theme === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : theme
}

/** 读取持久化偏好；缺失或非法回退到 system。 */
export function getStoredTheme(): Theme {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  return v === 'light' || v === 'dark' || v === 'system' ? v : 'system'
}

export function setStoredTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* localStorage 不可用时静默；不影响当次切换 */
  }
}

/** 在 <html> 上增删 .dark class。幂等。 */
export function applyTheme(theme: Theme): 'light' | 'dark' {
  const resolved = resolvedTheme(theme)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  // 让 shadcn 组件（如 Sonner）读取同步的 colorScheme，避免原生控件仍用浅色
  root.style.colorScheme = resolved
  return resolved
}