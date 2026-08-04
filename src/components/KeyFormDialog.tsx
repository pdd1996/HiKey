// 添加/编辑 Key 共用表单（PRD §9）。
//
// 字段：provider / name / baseUrl（按 provider 预填）/ key / notes +
//      高级项 testModel（所有 provider 可改，custom 必填）+ deepCheck。
// provider 切换时 baseUrl/testModel 自动套用该 provider 默认值（custom 留空必填）。
// 编辑模式 secret 留空=不改；添加模式 secret 必填。
// 保存后主进程自动 checkNow（M5 已接线），这里只关弹窗 + toast。

import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { ChevronDown, ChevronRight, Check, X, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useKeys } from '@/providers/KeysProvider'
import { DEFAULT_BASE_URL, DEFAULT_TEST_MODEL, KNOWN_PROVIDERS } from '@shared/providers'
import { providerLabel, statusBadge } from '@/lib/status'
import type { Provider } from '@shared/providers'
import type { KeyInput } from '@main/keys/types'
import type { SafeKeyView } from '@main/keys/types'
import type { ProbeResult } from '@main/ipc/types'

interface KeyFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'add' | 'edit'
  editKey?: SafeKeyView
}

function defaultBaseUrl(provider: Provider): string {
  return provider === 'custom' ? '' : DEFAULT_BASE_URL[provider]
}
function defaultTestModel(provider: Provider): string {
  return DEFAULT_TEST_MODEL[provider]
}

const schema = z
  .object({
    provider: z.enum(['openai', 'anthropic', 'deepseek', 'custom']),
    name: z.string().trim().min(1, '名称不能为空'),
    baseUrl: z.string().trim().min(1, 'baseUrl 不能为空'),
    secret: z.string(),
    notes: z.string(),
    testModel: z.string(),
    deepCheck: z.boolean(),
  })
  .superRefine((val, ctx) => {
    if (val.provider === 'custom' && val.testModel.trim() === '') {
      ctx.addIssue({ code: 'custom', path: ['testModel'], message: 'custom 必填 testModel' })
    }
  })

type FormValues = z.infer<typeof schema>

export function KeyFormDialog({ open, onOpenChange, mode, editKey }: KeyFormDialogProps) {
  const { addKey, updateKey, probe } = useKeys()
  const [advanced, setAdvanced] = useState(false)
  const [testState, setTestState] = useState<{ phase: 'idle' | 'pending' | 'done'; result?: ProbeResult }>({
    phase: 'idle'
  })
  const isEdit = mode === 'edit'

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      provider: 'openai',
      name: '',
      baseUrl: DEFAULT_BASE_URL.openai,
      secret: '',
      notes: '',
      testModel: DEFAULT_TEST_MODEL.openai,
      deepCheck: true,
    },
  })

  // 打开时按模式填充
  useEffect(() => {
    if (!open) return
    setTestState({ phase: 'idle' })
    if (isEdit && editKey) {
      form.reset({
        provider: editKey.provider,
        name: editKey.name,
        baseUrl: editKey.baseUrl,
        secret: '',
        notes: editKey.notes ?? '',
        testModel: editKey.testModel,
        deepCheck: editKey.deepCheck,
      })
    } else {
      form.reset({
        provider: 'openai',
        name: '',
        baseUrl: DEFAULT_BASE_URL.openai,
        secret: '',
        notes: '',
        testModel: DEFAULT_TEST_MODEL.openai,
        deepCheck: true,
      })
    }
  }, [open, isEdit, editKey, form])

  // provider 切换（仅用户主动切换时触发，不覆盖编辑初始值）
  const provider = form.watch('provider')
  const secretValue = form.watch('secret')
  // 编辑模式留空 secret = 不改 key，无明文无法测试 → 禁用测试按钮
  const testDisabled = isEdit && secretValue.trim() === ''
  function handleProviderChange(v: Provider) {
    form.setValue('provider', v)
    form.setValue('baseUrl', defaultBaseUrl(v))
    form.setValue('testModel', defaultTestModel(v))
  }

  // 测试：用当前表单明文跑一次 ping，不入库。校验 baseUrl/secret 非空后调 probe。
  // 注意：onClick 用 void handleTest()，没有 handleSubmit 的错误边界包裹，
  // 必须自己 try/catch，否则 probe reject 会卡死 pending 状态 + unhandled rejection。
  async function handleTest() {
    const baseUrl = form.getValues('baseUrl').trim()
    const secret = form.getValues('secret').trim()
    if (!baseUrl) {
      form.setError('baseUrl', { message: 'baseUrl 不能为空' })
      return
    }
    if (!secret) {
      form.setError('secret', { message: '先填 API Key 才能测试' })
      return
    }
    setTestState({ phase: 'pending' })
    try {
      const result = await probe({ provider: form.getValues('provider'), baseUrl, secret })
      setTestState({ phase: 'done', result })
      if (result.ok && result.status === '200') {
        toast.success('测试通过', { description: result.pingMs != null ? `有效 (${result.pingMs} ms)` : '有效' })
      } else if (result.ok) {
        toast.error(statusBadge(result.status).label, { description: result.lastError })
      } else if (result.reason === 'timeout') {
        toast.error('请求超时', {
          description: result.pingMs != null ? `${result.pingMs} ms` : undefined,
        })
      } else {
        toast.error('网络错误')
      }
    } catch (err) {
      // IPC 异常或主进程抛错：复位 pending，避免按钮卡死
      setTestState({ phase: 'idle' })
      toast.error('测试失败', { description: err instanceof Error ? err.message : '未知错误' })
    }
  }

  async function onSubmit(values: FormValues) {
    // 添加模式 secret 必填；编辑模式留空=不改
    if (!isEdit && values.secret.trim() === '') {
      form.setError('secret', { message: '添加时 key 必填' })
      return
    }

    const input: KeyInput = {
      provider: values.provider,
      name: values.name.trim(),
      baseUrl: values.baseUrl.trim(),
      notes: values.notes.trim() || undefined,
      testModel: values.testModel.trim() || undefined,
      deepCheck: values.deepCheck,
    }
    if (values.secret.trim() !== '') input.secret = values.secret

    const out = isEdit ? await updateKey(editKey!.id, input) : await addKey(input)

    if (out.ok) {
      toast.success(isEdit ? '已更新并触发重检' : '已添加并触发检测')
      onOpenChange(false)
    } else {
      toast.error(isEdit ? '更新失败' : '添加失败', {
        description: out.reason ?? '未知原因',
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑 Key' : '添加 Key'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改并保存后将自动触发一次检测。' : '保存后将自动触发一次检测。'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>供应商</Label>
              <Select
                value={form.watch('provider')}
                onValueChange={(v) => handleProviderChange(v as Provider)}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KNOWN_PROVIDERS.map((p) => (
                    <SelectItem key={p} value={p}>{providerLabel(p)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>名称</Label>
              <Input {...form.register('name')} />
              {form.formState.errors.name && (
                <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>baseUrl</Label>
            <Input {...form.register('baseUrl')} placeholder="https://api.example.com" />
            {form.formState.errors.baseUrl && (
              <p className="text-sm text-destructive">{form.formState.errors.baseUrl.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>API Key{isEdit && '（留空则不修改）'}</Label>
            <Input type="password" {...form.register('secret')} placeholder="sk-..." />
            {form.formState.errors.secret && (
              <p className="text-sm text-destructive">{form.formState.errors.secret.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>备注</Label>
            <Input {...form.register('notes')} placeholder="可选" />
          </div>

          {/* 高级项 */}
          <button
            type="button"
            className="flex items-center text-sm text-muted-foreground hover:text-foreground"
            onClick={() => setAdvanced((a) => !a)}
          >
            {advanced ? <ChevronDown className="mr-1 h-4 w-4" /> : <ChevronRight className="mr-1 h-4 w-4" />}
            高级
          </button>
          {advanced && (
            <div className="space-y-4 rounded-md border p-4">
              <div className="space-y-2">
                <Label>testModel{provider === 'custom' && '（必填）'}</Label>
                <Input {...form.register('testModel')} placeholder="gpt-4o-mini" />
                {form.formState.errors.testModel && (
                  <p className="text-sm text-destructive">{form.formState.errors.testModel.message}</p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <Label>深度检测（该 key）</Label>
                <Switch
                  checked={form.watch('deepCheck')}
                  onCheckedChange={(v) => form.setValue('deepCheck', v)}
                />
              </div>
            </div>
          )}

          {/* 测试结果内嵌条 */}
          {testState.phase !== 'idle' && (
            <TestResultBar phase={testState.phase} result={testState.result} />
          )}
          {testDisabled && testState.phase !== 'pending' && (
            <p className="text-xs text-muted-foreground">先填 API Key 才能测试</p>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="mr-auto"
              disabled={form.formState.isSubmitting || testState.phase === 'pending' || testDisabled}
              onClick={() => void handleTest()}
            >
              {testState.phase === 'pending' ? '测试中…' : '测试'}
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 测试结果内嵌条：按 HTTP 码配色 + 文案（复用 statusBadge 保持与列表徽标一致）。
 * 200 绿 / 4xx 红橙黄 / 5xx 灰 / network_error·timeout 灰。
 */
function TestResultBar({
  phase,
  result
}: {
  phase: 'idle' | 'pending' | 'done'
  result?: ProbeResult
}) {
  if (phase === 'pending') {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm text-gray-600">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        测试中…
      </div>
    )
  }
  if (!result) return null

  if (result.ok) {
    const badge = statusBadge(result.status)
    const ms = result.pingMs != null ? ` (${result.pingMs} ms)` : ''
    const icon =
      result.status === '200' ? (
        <Check className="h-3.5 w-3.5" />
      ) : (
        <X className="h-3.5 w-3.5" />
      )
    const label =
      result.status === '200'
        ? `有效${ms}`
        : result.status === '401'
          ? '认证失败'
          : badge.label
    return (
      <div className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${badge.className}`}>
        {icon}
        <span>{label}</span>
        {result.lastError && <span className="opacity-70">· {result.lastError}</span>}
      </div>
    )
  }

  // ok:false → 网络错误 / 请求超时（灰）
  const ms = result.pingMs != null ? ` (${result.pingMs} ms)` : ''
  return (
    <div className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm text-gray-600">
      <X className="h-3.5 w-3.5" />
      {result.reason === 'timeout' ? `请求超时${ms}` : '网络错误'}
    </div>
  )
}