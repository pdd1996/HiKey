import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

// 三目标构建：main（主进程）/ preload（预加载）/ renderer（渲染进程）
// 目录按技术栈文档 §7：主进程与 preload 在 electron/，渲染进程在 src/
export default defineConfig({
  main: {
    // lowdb v7 是 ESM-only，主进程输出 CJS，外置成 require() 会抛 ERR_REQUIRE_ESM。
    // 故将其 bundle 进 main 产物（数据库设计 §9 锁定 lowdb v7）。
    plugins: [externalizeDepsPlugin({ exclude: ['lowdb'] })],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/main/index.ts') }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'electron/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src'),
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/index.html') }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src')
      }
    },
    plugins: [react()]
  }
})
