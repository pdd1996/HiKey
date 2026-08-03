# HiKey

本地优先、零云端的 LLM API Key 管理面板，带自动健康检测。

> 当前阶段：M6（UI 全链路完成，dev 跑通；待打包验收 M7）。
> M1–M5（脚手架 / 存储+加密 / 健康检测 / 导入 / IPC+preload）已完成，后端 296 用例通过。

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

> `npm run dev` 经 `scripts/dev.mjs` 包装：启动前清除 `ELECTRON_RUN_AS_NODE`（VS Code 集成终端会继承该变量，使 electron 退化为纯 Node 而崩），故在 VS Code 终端与外部终端均可直接运行。

### 国内网络加速（可选）

Electron 与 electron-builder 的二进制下载较慢时，在安装/打包命令前内联注入镜像环境变量（Git Bash；cmd 需 `set X=Y &&` 形式）：

```bash
# 首次安装
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm install
# 打包
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm run package
```

> 不放入 `.npmrc`：npm 11+ 会对未识别的 key 报警告，内联注入只在需要的命令生效，不污染 dev/typecheck。
