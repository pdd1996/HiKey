// SettingsContext：Meta + 加密可用性 + checkAll。
//
// 职责：初始 settings.get() + system.isEncryptionAvailable()；封装 settings.set（仅可写字段）；
//       "立即重检"复用 keys.checkAll（经 useKeys），但设置页也可直接调 window.hikey.keys.checkAll。
// plaintextMode 为派生值，仅展示不可写（M5 validateMeta 拒绝直接设）。

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Meta } from '@main/storage/schema'
import type { SetSettingsResult } from '@main/ipc/types'

type WritableMeta = Pick<Meta, 'checkIntervalMinutes' | 'deepCheckEnabled' | 'deepCheckOnEveryPoll' | 'allowPlaintextFallback'>

interface SettingsContextValue {
  meta: Meta | null
  encryptionAvailable: boolean
  loading: boolean
  refresh: () => Promise<void>
  setSettings: (partial: Partial<WritableMeta>) => Promise<SetSettingsResult>
  exportBackup: () => ReturnType<Window['hikey']['backup']['export']>
  restoreBackup: () => ReturnType<Window['hikey']['backup']['restore']>
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [meta, setMeta] = useState<Meta | null>(null)
  const [encryptionAvailable, setEncryptionAvailable] = useState(true)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const [m, enc] = await Promise.all([
        window.hikey.settings.get(),
        window.hikey.system.isEncryptionAvailable(),
      ])
      setMeta(m)
      setEncryptionAvailable(enc)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const setSettings = useCallback(async (partial: Partial<WritableMeta>) => {
    const out = await window.hikey.settings.set(partial)
    if (out.ok) await refresh()
    return out
  }, [refresh])

  const value: SettingsContextValue = {
    meta,
    encryptionAvailable,
    loading,
    refresh,
    setSettings,
    exportBackup: () => window.hikey.backup.export(),
    restoreBackup: () => window.hikey.backup.restore(),
  }

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}