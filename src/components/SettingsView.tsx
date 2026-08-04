// 设置页（PRD §9）：检测间隔滑块(5-1440) / 轮询深检开关 /
// 明文降级开关（safeStorage 不可用且存在明文记录时置灰）/ 立即重检 / 备份。
// 开关类即时保存；间隔滑块在 onValueCommit 保存（避免拖动期间 IPC 刷屏）。

import { useState } from 'react'
import { toast } from 'sonner'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSettings } from '@/providers/SettingsProvider'
import { BackupSection } from '@/components/BackupSection'

const MIN_MIN = 5
const MAX_MIN = 1440

export function SettingsView() {
  const { meta, encryptionAvailable, loading, setSettings } = useSettings()
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

  const intervalValue = intervalDraft ?? meta.checkIntervalMinutes

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6">
      <section className="space-y-4">
        <h2 className="text-base font-semibold">检测</h2>

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
      </section>

      <section className="space-y-4">
        <h2 className="text-base font-semibold">加密与明文</h2>
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
      </section>

      <BackupSection />
    </div>
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