import { Plus, Upload, Activity, Settings, LayoutDashboard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export type View = 'dashboard' | 'settings'

interface TitleBarProps {
  view: View
  onViewChange: (v: View) => void
  onAdd: () => void
  onImport: () => void
  onCheckAll: (mode: 'ping' | 'deep') => void
}

export function TitleBar({ view, onViewChange, onAdd, onImport, onCheckAll }: TitleBarProps) {
  return (
    <div className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex flex-col gap-1 leading-tight">
        <h1 className="text-lg font-semibold">HiKey</h1>
        <span className="text-xs text-muted-foreground">本地优先的 LLM API Key 管理面板</span>
      </div>
      <div className="flex items-center gap-2">
        {view === 'dashboard' && (
          <>
            <Button variant="outline" size="sm" onClick={onImport}>
              <Upload className="mr-2 h-4 w-4" /> 导入
            </Button>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" /> 添加
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onCheckAll('deep')
                toast.info('已触发一键深检')
              }}
            >
              <Activity className="mr-2 h-4 w-4" /> 一键深检
            </Button>
          </>
        )}
        <Button
          variant={view === 'dashboard' ? 'ghost' : 'secondary'}
          size="icon"
          onClick={() => onViewChange('dashboard')}
          title="Dashboard"
        >
          <LayoutDashboard className="h-4 w-4" />
        </Button>
        <Button
          variant={view === 'settings' ? 'ghost' : 'secondary'}
          size="icon"
          onClick={() => onViewChange('settings')}
          title="设置"
        >
          <Settings className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}