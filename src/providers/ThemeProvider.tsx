// ThemeProvider：管理 light/dark/system 三态偏好。
// - 持久化到 localStorage（hikey-theme）
// - 在 <html> 上增删 .dark class（驱动 globals.css CSS 变量）
// - system 模式下监听 prefers-color-scheme 变化并跟随
// main.tsx 渲染前已 applyTheme() 防闪白；此处仅在挂载后接管并同步状态。

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  applyTheme,
  getStoredTheme,
  setStoredTheme,
  systemPrefersDark,
  type Theme,
} from '@/lib/theme'

interface ThemeContextValue {
  /** 用户偏好（可能是 system） */
  theme: Theme
  /** 当前实际生效的明/暗，用于按钮图标 */
  resolvedTheme: 'light' | 'dark'
  setTheme: (t: Theme) => void
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => getStoredTheme())
  // system 模式下 resolved 取决于 matchMedia，故单独维护并在系统变化时更新。
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark())

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (theme === 'system') return systemDark ? 'dark' : 'light'
    return theme
  }, [theme, systemDark])

  // 偏好或系统变化 → 同步 class
  useEffect(() => {
    applyTheme(theme)
  }, [theme, resolvedTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    setStoredTheme(t)
  }, [])

  // 快捷切换：light↔dark（system 也按当前生效方向切到对侧）
  const toggle = useCallback(() => {
    setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')
  }, [resolvedTheme, setTheme])

  const value: ThemeContextValue = { theme, resolvedTheme, setTheme, toggle }
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}