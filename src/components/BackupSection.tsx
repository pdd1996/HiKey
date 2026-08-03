// 备份导出/恢复（PRD §9）。均走主进程文件对话框；明文标记备份的二次确认门在主进程，
// 渲染进程只接收最终结果并展示。

import { Download, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useSettings } from '@/providers/SettingsProvider'

export function BackupSection() {
  const { exportBackup, restoreBackup } = useSettings()

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

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">备份</h3>
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
    </div>
  )
}