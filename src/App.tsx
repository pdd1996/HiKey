// M1 占位页：验证主↔渲染桥 + Tailwind 编译
// 真实 Dashboard / Settings / 组件留 M6
function App(): JSX.Element {
  // 调 preload 暴露的桥，验证 contextBridge 通路（ping 为同步返回）
  const pong = window.hikey.ping()

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-3xl font-bold tracking-tight">HiKey</h1>
      <p className="text-muted-foreground">M1 脚手架</p>
      <p className="rounded-md border border-border px-3 py-1.5 text-sm">
        桥接自检: <span className="font-mono text-primary">{pong}</span>
      </p>
    </main>
  )
}

export default App
