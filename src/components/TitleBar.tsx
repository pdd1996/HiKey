// TitleBar：顶部应用栏。
//
// 暗色模式适配：原 Electron BrowserWindow 默认带原生 frame，会在 macOS 以外的平台
// 显示一条系统绘制的标题栏（暗色主题下仍可能是白色/亮色），与 .dark 主题冲突。
// 解决：主进程把 titleBarStyle 设为 'hidden'（macOS: 'hiddenInset'），由此处接管：
//   - 整行可拖 [-webkit-app-region:drag]
//   - 右侧控件 [-webkit-app-region:no-drag] 阻止按钮点击被吞
//   - Windows/Linux 额外渲染最小化/最大化/关闭按钮（IPC 走 window.hikey.window.*）
//   - macOS 跳过这套控件，红绿灯由系统保留
// 主题由 .dark class 驱动 globals.css 的 CSS 变量，整条栏自然跟随。

import { Plus, Upload, Activity, Settings, LayoutDashboard, Minus, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ThemeToggle'

export type View = 'dashboard' | 'settings'

interface TitleBarProps {
  view: View
  onViewChange: (v: View) => void
  onAdd: () => void
  onImport: () => void
  onCheckAll: (mode: 'ping' | 'deep') => void
}

// 是否显示自定义窗口控件：仅 Windows/Linux 下隐藏原生 frame 后需要前端接管。
// macOS 用 hiddenInset，红绿灯由系统保留；此处跳过避免重复。
// 注意：渲染进程 sandbox + contextIsolation 下无 Node 的 process 全局，
// 用 navigator.userAgent 判定平台（macOS 含 "Mac"），避免 ReferenceError 导致整页空白。
const IS_MAC = typeof navigator !== 'undefined' && /Mac/i.test(navigator.userAgent)

export function TitleBar({ view, onViewChange, onAdd, onImport, onCheckAll }: TitleBarProps) {
  const showWindowControls = !IS_MAC

  return (
    <div className="flex items-center justify-between gap-4 border-b px-8 py-5 [-webkit-app-region:drag]">
      <div className="flex flex-col gap-1.5 leading-tight">
        <h1 className="text-2xl font-semibold tracking-tight">HiKey</h1>
        <span className="text-xs text-muted-foreground">本地优先的 LLM API Key 管理面板</span>
      </div>
      <div className="flex items-center gap-6 [-webkit-app-region:no-drag]">
        {view === 'dashboard' && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onImport}>
              <Upload className="mr-2 h-4 w-4" /> 导入
            </Button>
            <Button variant="outline" size="sm" onClick={onAdd}>
              <Plus className="mr-2 h-4 w-4" /> 添加
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCheckAll('deep')}
            >
              <Activity className="mr-2 h-4 w-4" /> 一键深检
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1">
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
          <ThemeToggle />
        </div>
        {showWindowControls && <WindowControls />}
      </div>
    </div>
  )
}

/**
 * 自定义最小化/最大化/关闭控件。
 * 仅当主进程 titleBarStyle: 'hidden' 后，Windows/Linux 上没有原生 frame 才需要。
 * 调用 window.hikey.window.* 的 IPC（preload 暴露），保持主进程对窗口生命周期的所有权。
 * hover 配色直接用 Tailwind dark: 变体，无需订阅 ThemeProvider——主题切换不会触发本组件重渲染。
 */
function WindowControls() {
  // 通用按钮基底；idle hover 浅底，关闭按钮走 destructive 语义色。
  const hoverBase = 'h-8 w-8 inline-flex items-center justify-center transition-colors hover:bg-black/5 dark:hover:bg-white/10'
  const hoverClose = 'hover:bg-destructive hover:text-destructive-foreground'

  return (
    <div className="ml-2 flex items-center [-webkit-app-region:no-drag]">
      <button
        type="button"
        aria-label="最小化"
        title="最小化"
        className={hoverBase}
        onClick={() => void window.hikey.window.minimize()}
      >
        <Minus className="h-4 w-4" />
      </button>
      <button
        type="button"
        aria-label="最大化"
        title="最大化"
        className={hoverBase}
        onClick={() => void window.hikey.window.toggleMaximize()}
      >
        <Square className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="关闭"
        title="关闭"
        className={`${hoverBase} ${hoverClose}`}
        onClick={() => void window.hikey.window.close()}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
