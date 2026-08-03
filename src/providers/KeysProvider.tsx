// KeysContext：渲染进程 key 列表单一状态来源。
//
// 职责：初始 keys.list() 拉全量；订阅 onStatusUpdate 按 id 打补丁（checking/终态均下发）；
//       封装 add/update/remove/checkNow/checkAll/reveal；维护 provider/状态筛选与 provider 字母序排序。
// 导入（pickAndParse/confirm）由 ImportDialog 自管 session，confirm 后调 refresh() 重拉。
//
// PRD §9：默认排序 provider 字母序（同 provider 相邻）；筛选与排序独立。

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { SafeKeyView, KeyInput, AddOutcome, UpdateOutcome, RemoveOutcome, RevealOutcome } from '@main/keys/types'
import type { KeyStatus } from '@main/storage/schema'
import type { Provider } from '@shared/providers'

interface KeysContextValue {
  keys: SafeKeyView[]
  loading: boolean
  // 筛选
  providerFilter: Provider | 'all'
  statusFilter: KeyStatus | 'all'
  setProviderFilter: (p: Provider | 'all') => void
  setStatusFilter: (s: KeyStatus | 'all') => void
  visibleKeys: SafeKeyView[]
  // 操作
  refresh: () => Promise<void>
  addKey: (input: KeyInput) => Promise<AddOutcome>
  updateKey: (id: string, input: KeyInput) => Promise<UpdateOutcome>
  removeKey: (id: string) => Promise<RemoveOutcome>
  checkNow: (id: string) => Promise<void>
  checkAll: () => Promise<void>
  reveal: (id: string) => Promise<RevealOutcome>
}

const KeysContext = createContext<KeysContextValue | null>(null)

export function KeysProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<SafeKeyView[]>([])
  const [loading, setLoading] = useState(true)
  const [providerFilter, setProviderFilter] = useState<Provider | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<KeyStatus | 'all'>('all')

  const refresh = useCallback(async () => {
    try {
      const list = await window.hikey.keys.list()
      setKeys(list)
    } finally {
      setLoading(false)
    }
  }, [])

  // 初始拉全量 + 订阅 status:update 按行打补丁
  useEffect(() => {
    void refresh()
    const unsubscribe = window.hikey.onStatusUpdate(({ id, record }) => {
      setKeys((prev) => {
        const idx = prev.findIndex((k) => k.id === id)
        if (idx === -1) return prev // 新增项由 addKey 成功后 refresh 处理，避免乱序
        const next = prev.slice()
        next[idx] = record
        return next
      })
    })
    return unsubscribe
  }, [refresh])

  const addKey = useCallback(async (input: KeyInput) => {
    const out = await window.hikey.keys.add(input)
    if (out.ok) await refresh()
    return out
  }, [refresh])

  const updateKey = useCallback(async (id: string, input: KeyInput) => {
    const out = await window.hikey.keys.update(id, input)
    if (out.ok) await refresh()
    return out
  }, [refresh])

  const removeKey = useCallback(async (id: string) => {
    const out = await window.hikey.keys.remove(id)
    if (out.ok) setKeys((prev) => prev.filter((k) => k.id !== id))
    return out
  }, [])

  const checkNow = useCallback((id: string) => window.hikey.keys.checkNow(id), [])
  const checkAll = useCallback(() => window.hikey.keys.checkAll(), [])
  const reveal = useCallback((id: string) => window.hikey.keys.reveal(id), [])

  // 排序：provider 字母序（稳定），筛选独立
  const visibleKeys = useMemo(() => {
    const filtered = keys.filter((k) => {
      if (providerFilter !== 'all' && k.provider !== providerFilter) return false
      if (statusFilter !== 'all' && k.status !== statusFilter) return false
      return true
    })
    return [...filtered].sort((a, b) => a.provider.localeCompare(b.provider))
  }, [keys, providerFilter, statusFilter])

  const value: KeysContextValue = {
    keys,
    loading,
    providerFilter,
    statusFilter,
    setProviderFilter,
    setStatusFilter,
    visibleKeys,
    refresh,
    addKey,
    updateKey,
    removeKey,
    checkNow,
    checkAll,
    reveal,
  }

  return <KeysContext.Provider value={value}>{children}</KeysContext.Provider>
}

export function useKeys(): KeysContextValue {
  const ctx = useContext(KeysContext)
  if (!ctx) throw new Error('useKeys must be used within KeysProvider')
  return ctx
}