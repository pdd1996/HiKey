// 设置页（PRD §9）：检测间隔滑块(5-1440) / 轮询深检开关 /
// 明文降级开关（safeStorage 不可用且存在明文记录时置灰）/ 立即重检 / 备份。
// 开关类即时保存；间隔滑块在 onValueCommit 保存（避免拖动期间 IPC 刷屏）。

import { useState } from 'react'
import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/providers/SettingsProvider'

const MIN_MIN = 5
const MAX_MIN = 1440

export function SettingsView() {
  const { meta, encryptionAvailable, loading, setSettings, exportBackup, restoreBackup } = useSettings()
  const [intervalDraft, setIntervalDraft] = useState<number | null>(null)

  if (loading || !meta) {
    return <div className="p-8 text-center text-muted-foreground">加载设置中…</div>
  }

  // 明文降级开关置灰：safeStorage 不可用且当前处于明文模式（存在明文记录）时不可关
  const plaintextLocked = !encryptionAvailable && meta.plaintextMode === true

  async function applySettings(partial: Parameters<typeof setSettings>[0]) {
    const out = await setSettings(partial)
    if (out.ok) toast.success('设置已保存')
    else toast.error('保存失败', { description: out.reason })
  }

  async function handleExport() {
    const out = await exportBackup()
    if (out.ok) {
      toast.success('已导出加密备份', {
        description: out.plaintextRecordCount > 0 ? `含 ${out.plaintextRecordCount} 条明文标记记录` : undefined,
      })
    } else if (out.reason !== 'cancelled') {
      toast.error('导出失败', { description: out.reason })
    }
  }

  async function handleRestore() {
    const out = await restoreBackup()
    if (out.ok) {
      toast.success('已恢复备份', {
        description: `迁移 ${out.migrated ? '是' : '否'}，重新加密 ${out.reencrypted} 条${out.rolledBack ? '（已回滚）' : ''}`,
      })
    } else if (out.reason !== 'cancelled') {
      toast.error('恢复失败', { description: out.message })
    }
  }

  const intervalValue = intervalDraft ?? meta.checkIntervalMinutes

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <SettingsCard title="检测">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>检测间隔</Label>
            <span className="text-sm text-muted-foreground">{intervalValue} 分钟</span>
          </div>
          <Slider
            value={[intervalValue]}
            min={MIN_MIN}
            max={MAX_MIN}
            step={1}
            onValueChange={(v) => setIntervalDraft(v[0] ?? intervalValue)}
            onValueCommit={(v) => {
              const val = v[0] ?? meta.checkIntervalMinutes
              setIntervalDraft(null)
              void applySettings({ checkIntervalMinutes: val })
            }}
          />
          <p className="text-xs text-muted-foreground">范围 {MIN_MIN}–{MAX_MIN} 分钟。</p>
        </div>

        <ToggleRow
          label="轮询深检"
          desc="开启后每次定时轮询都追加深检（一次模型调用）；关闭则轮询仅测连通性。新增/编辑/手动「深检」不受此限。"
          checked={meta.deepCheckEnabled}
          onCheckedChange={(v) => void applySettings({ deepCheckEnabled: v })}
        />
      </SettingsCard>

      <SettingsCard title="加密与明文">
        <p className="text-xs text-muted-foreground">
          safeStorage 状态：<span className={encryptionAvailable ? 'text-green-600' : 'text-red-600'}>
            {encryptionAvailable ? '可用（密钥以密文存储）' : '不可用（密钥将以明文存储）'}
          </span>
          {meta.plaintextMode && '　· 当前存在明文记录。'}
        </p>
        <ToggleRow
          label="明文降级"
          desc={plaintextLocked
            ? 'safeStorage 不可用且存在明文记录，不可关闭；恢复 safeStorage 后将自动重新加密。'
            : '允许在 safeStorage 不可用时以明文存储 key（不推荐）。'}
          checked={meta.allowPlaintextFallback}
          disabled={plaintextLocked}
          onCheckedChange={(v) => void applySettings({ allowPlaintextFallback: v })}
        />
      </SettingsCard>

      <SettingsCard title="备份">
        <p className="text-xs text-muted-foreground">
          导出经加密的备份文件；从备份恢复时若备份含明文标记记录，主进程将二次确认。
        </p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="mr-2 h-4 w-4" /> 导出备份
          </Button>
          <Button variant="outline" size="sm" onClick={handleRestore}>
            <Upload className="mr-2 h-4 w-4" /> 从备份恢复
          </Button>
        </div>
      </SettingsCard>
    </div>
  )
}

function SettingsCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-5 rounded-lg border bg-card p-6 shadow-sm">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function ToggleRow({
  label, desc, checked, onCheckedChange, disabled,
}: {
  label: string
  desc: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="space-y-0.5">
        <Label>{label}</Label>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  )
}