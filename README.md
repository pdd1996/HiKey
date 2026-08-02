# HiKey

本地优先、零云端的 LLM API Key 管理面板，带自动健康检测。

> 当前阶段：M1 脚手架（项目初始化、依赖、electron-vite/builder 配置、空白窗口跑通）。

## 技术栈

- Electron + electron-vite（main/preload/renderer 三目标构建）
- React 18 + TypeScript
- shadcn/ui + Tailwind CSS + Radix
- lowdb（JSON 存储，零 native 依赖）
- Electron safeStorage（Windows DPAPI）

完整技术选型与依赖清单见 `docs/技术栈.md`，产品需求见 `docs/PRD.md`，数据模型见 `docs/数据库设计.md`。

## 开发

```bash
npm install      # 安装依赖
npm run dev      # 启动开发（热更新）
npm run build    # 构建到 out/
npm run package  # 构建并打包为 Windows NSIS 安装包
npm run typecheck
```
