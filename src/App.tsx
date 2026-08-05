// M6 App：视图切换 + Providers 包裹 + Toaster + 各对话框编排。
//
// Dashboard：TitleBar（添加/导入/全部重检 + 视图切换）+ FilterBar + KeyTable。
// Settings：TitleBar + SettingsView。
// 对话框状态（add/edit/reveal/delete/import + 选中 key）集中在 AppShell。

import { useState } from 'react'
import { toast } from 'sonner'
import { KeysProvider, useKeys } from '@/providers/KeysProvider'
import { SettingsProvider } from '@/providers/SettingsProvider'
import { Toaster } from '@/components/ui/sonner'
import { TitleBar, type View } from '@/components/TitleBar'
import { FilterBar } from '@/components/FilterBar'
import { KeyTable } from '@/components/KeyTable'
import { SettingsView } from '@/components/SettingsView'
import { KeyFormDialog } from '@/components/KeyFormDialog'
import { RevealDialog } from '@/components/RevealDialog'
import { DeleteConfirmDialog } from '@/components/DeleteConfirmDialog'
import { ImportDialog } from '@/components/ImportDialog'
import type { SafeKeyView } from '@main/keys/types'

function AppShell() {
  const { keys, visibleKeys, loading, checkNow, checkAll } = useKeys()
  const [view, setView] = useState<View>('dashboard')

  const [addOpen, setAddOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [editKey, setEditKey] = useState<SafeKeyView | null>(null)
  const [revealOpen, setRevealOpen] = useState(false)
  const [revealKey, setRevealKey] = useState<SafeKeyView | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SafeKeyView | null>(null)
  const [importOpen, setImportOpen] = useState(false)

  // 一键深检：仅当存在配置了 testModel 的 key 时才触发，否则提示而非误报"已触发"。
  // checkAll 对全量 key 检测（不看筛选），故这里用 keys 而非 visibleKeys 判断。
  const handleCheckAll = (mode: 'ping' | 'deep') => {
    if (mode === 'deep' && !keys.some((k) => k.testModel)) {
      toast.warning('暂无可深检的 Key', { description: '请先为 Key 配置测试模型' })
      return
    }
    void checkAll(mode)
    if (mode === 'deep') toast.info('已触发一键深检')
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <TitleBar
        view={view}
        onViewChange={setView}
        onAdd={() => setAddOpen(true)}
        onImport={() => setImportOpen(true)}
        onCheckAll={handleCheckAll}
      />
      <main className="flex-1 overflow-auto">
        {view === 'dashboard' ? (
          <div className="mx-auto flex max-w-6xl flex-col gap-6 px-8 py-6">
            <FilterBar />
            <KeyTable
              keys={visibleKeys}
              loading={loading}
              onReveal={(k) => { setRevealKey(k); setRevealOpen(true) }}
              onEdit={(k) => { setEditKey(k); setEditOpen(true) }}
              onRemove={(k) => { setDeleteTarget(k); setDeleteOpen(true) }}
              onCheckNow={(id, mode) => checkNow(id, mode)}
            />
          </div>
        ) : (
          <SettingsView />
        )}
      </main>

      <KeyFormDialog open={addOpen} onOpenChange={setAddOpen} mode="add" />
      <KeyFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" editKey={editKey ?? undefined} />
      <RevealDialog open={revealOpen} onOpenChange={setRevealOpen} k={revealKey} />
      <DeleteConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} k={deleteTarget} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </div>
  )
}

export default function App() {
  return (
    <KeysProvider>
      <SettingsProvider>
        <AppShell />
        <Toaster />
      </SettingsProvider>
    </KeysProvider>
  )
}