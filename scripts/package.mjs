// 打包脚本：先 electron-vite build，再 electron-builder 出 NSIS 安装包。
//
// 固化国内镜像源，避免 electron-builder 从 GitHub 下载 Electron 二进制时
// 网络超时（.npmrc 的 registry 只影响 npm install，不影响 @electron/get 拉
// Electron 二进制）。已设置的同名环境变量优先，方便切回官方源或自建镜像。
//
// 行为与 `electron-vite build && electron-builder` 一致，stdio 直通、退出码透传。
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const evBin = fileURLToPath(new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url))
const ebBin = fileURLToPath(new URL('../node_modules/electron-builder/out/cli/cli.js', import.meta.url))

// 仅当用户未自行设置时填默认国内镜像
const env = { ...process.env }
env.ELECTRON_MIRROR ??= 'https://npmmirror.com/mirrors/electron/'
env.ELECTRON_BUILDER_BINARIES_MIRROR ??= 'https://npmmirror.com/mirrors/electron-builder-binaries/'

// 透传额外 CLI 参数给 electron-builder，如 `npm run package -- --dir`
const ebArgs = ['--config', 'electron-builder.yml', ...process.argv.slice(2)]

function run(exe, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { stdio: 'inherit', env })
    child.on('exit', code => (code === 0 ? resolve() : reject(new Error(`${exe} exited with ${code}`))))
    child.on('error', reject)
  })
}

try {
  await run(process.execPath, [evBin, 'build'])
  await run(process.execPath, [ebBin, ...ebArgs])
} catch (e) {
  console.error(e.message)
  process.exit(1)
}