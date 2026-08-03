// 启动 electron-vite dev，拉起前清除会干扰 Electron 的环境变量。
//
// VS Code 集成终端会继承 ELECTRON_RUN_AS_NODE=1（VS Code 自身是 Electron，
// 该变量让它的子 node 进程以纯 Node 运行）。electron.exe 一旦带上这个变量，
// 也会退化为纯 Node：主进程里 require('electron') 只拿到二进制路径字符串，
// electron.app 为 undefined，启动即崩在 app.requestSingleInstanceLock()。
//
// 这里清掉变量后，用 node 直起 electron-vite 的 bin（不经 shell，避免
// Node 24 的 DEP0190 警告），行为与 `electron-vite dev` 完全一致，
// stdio 直通、退出码透传，保证 `npm run dev` 在任意终端都能跑。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

delete process.env.ELECTRON_RUN_AS_NODE

const bin = fileURLToPath(new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url))

const child = spawn(process.execPath, [bin, 'dev'], {
  stdio: 'inherit',
  env: { ...process.env }
})

child.on('exit', code => process.exit(code ?? 0))