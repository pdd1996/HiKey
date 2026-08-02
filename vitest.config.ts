import { defineConfig } from 'vitest/config'

// 仅主进程侧单测；环境为 node（electron 通过 vi.mock 注入）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['electron/main/**/*.test.ts']
  }
})