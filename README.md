# HiKey

[![中文](https://img.shields.io/badge/语言-中文-blue.svg)](README.md)
[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.en.md)

> 本地优先、零云端的 LLM API Key 管理面板，带自动健康检测。

[![版本](https://img.shields.io/badge/version-1.0.1-blue.svg)]()
[![测试](https://img.shields.io/badge/tests-296%20passing-brightgreen.svg)]()
[![平台](https://img.shields.io/badge/platform-Windows-blue?logo=windows)]()
[![许可证](https://img.shields.io/badge/license-MIT-green.svg)]()

---

## 截图

![主界面](screenshots/main.png)
*主界面——Key 列表与状态一览*

![设置面板](screenshots/setting.png)
*设置面板——主题、健康检测等配置*

---

## 功能概览

| 功能 | 说明 |
|------|------|
| 🔐 **安全存储** | 基于 Electron `safeStorage`（Windows DPAPI）加密存储 API Key，无需主密码，OS 级加密 |
| ❤️ **健康检测** | 一键检测所有 Key 的健康状态，按 provider 错误码区分 **有效 / 失效 / 限流 / 欠费** |
| 📥 **批量导入** | 支持 `.env` / JSON 批量导入，自动归类 provider，识别重复项并预览确认 |
| 📤 **备份与恢复** | 密文导出备份（保持 `safeStorage` 加密），支持同机恢复，防止数据丢失 |
| 🏢 **多 Provider 支持** | OpenAI、Anthropic、DeepSeek、Custom（兼容 OpenAI 协议的任意服务） |
| 🌗 **暗色模式** | 跟随系统或手动切换，完整适配所有 UI 组件 |
| 🪟 **自定义标题栏** | 原生窗口控件 + 自定义标题栏，统一的 Windows 桌面体验 |

---

## 快速开始

### 前置要求

- Node.js 18+
- npm 9+
- Windows 10+（当前仅支持 Windows）

### 安装与开发

```bash
# 克隆仓库
git clone https://github.com/your-username/hikey.git
cd hikey

# 安装依赖
npm install

# 启动开发模式（热更新）
npm run dev

# 类型检查
npm run typecheck

# 运行测试
npm test
```

### 构建与打包

```bash
# 构建到 out/
npm run build

# 构建并打包为 Windows NSIS 安装包
npm run package
```

> `npm run dev` 经 `scripts/dev.mjs` 包装：启动前自动清除 `ELECTRON_RUN_AS_NODE` 环境变量（VS Code 集成终端会继承该变量，使 Electron 退化为纯 Node 而崩溃），故在 VS Code 终端与外部终端均可直接运行。

---

## 项目结构

```
HiKey/
├── electron/
│   ├── main/              # 主进程
│   │   ├── index.ts       # 入口：窗口管理、应用生命周期
│   │   ├── crypto.ts      # safeStorage 加密/解密
│   │   ├── providers.ts   # Provider 定义与配置
│   │   ├── storage/        # lowdb JSON 存储层
│   │   ├── keys/           # Key CRUD 逻辑
│   │   ├── healthCheck/    # 健康检测引擎
│   │   ├── import/         # 导入解析（.env / JSON）
│   │   ├── ipc/            # IPC 处理器
│   │   └── backup/         # 备份导出/恢复
│   ├── preload/            # preload 脚本（contextBridge）
│   │   ├── index.ts        # 入口
│   │   ├── api.ts          # 通用 API 桥接
│   │   ├── keys.ts         # Key 操作桥接
│   │   ├── settings.ts     # 设置桥接
│   │   ├── import.ts       # 导入桥接
│   │   ├── backup.ts       # 备份桥接
│   │   ├── window.ts       # 窗口控制桥接
│   │   └── system.ts       # 系统信息桥接
├── src/
│   ├── main.tsx            # React 入口
│   ├── App.tsx             # 根组件（路由/布局）
│   ├── components/         # UI 组件
│   │   ├── ui/             # shadcn/ui 基础组件
│   │   ├── KeyTable.tsx    # Key 列表
│   │   ├── KeyRow.tsx      # Key 行
│   │   ├── KeyFormDialog.tsx  # 新增/编辑对话框
│   │   ├── ImportDialog.tsx   # 导入对话框
│   │   ├── ImportPreviewTable.tsx  # 导入预览
│   │   ├── SettingsView.tsx    # 设置面板
│   │   ├── FilterBar.tsx       # 筛选栏
│   │   ├── StatusBadge.tsx     # 状态徽标
│   │   ├── ProviderBadge.tsx   # Provider 徽标
│   │   ├── RevealDialog.tsx    # 查看 Key 明文
│   │   ├── DeleteConfirmDialog.tsx  # 删除确认
│   │   ├── TitleBar.tsx        # 自定义标题栏
│   │   └── ThemeToggle.tsx     # 主题切换
│   ├── providers/          # React Context
│   │   ├── KeysProvider.tsx     # Key 状态管理
│   │   ├── SettingsProvider.tsx # 设置管理
│   │   └── ThemeProvider.tsx    # 主题管理
│   ├── lib/                # 工具函数
│   │   ├── format.ts       # 格式化
│   │   ├── status.ts       # 状态映射
│   │   ├── theme.ts        # 主题工具
│   │   └── utils.ts        # 通用工具
│   └── styles/
│       └── globals.css     # 全局样式
├── shared/                 # 主进程与渲染进程共享类型
├── docs/
│   ├── PRD.md              # 产品需求文档
│   ├── 技术栈.md            # 技术选型与依赖清单
│   └── 数据库设计.md         # 数据模型
├── scripts/
│   ├── dev.mjs             # 开发启动脚本
│   └── package.mjs         # 打包脚本
└── resources/              # 应用资源（图标等）
```

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Electron + electron-vite（main / preload / renderer 三目标构建） |
| 前端 | React 18 + TypeScript |
| UI | shadcn/ui + Tailwind CSS + Radix |
| 存储 | lowdb（JSON 文件存储，零 native 依赖） |
| 加密 | Electron safeStorage（Windows DPAPI） |
| 测试 | Vitest |
| 打包 | electron-builder（Windows NSIS） |

完整技术选型与依赖清单见 [docs/技术栈.md](docs/技术栈.md)，产品需求见 [docs/PRD.md](docs/PRD.md)，数据模型见 [docs/数据库设计.md](docs/数据库设计.md)。

---

## 安全模型

HiKey 遵循 **本地优先、零云端** 的安全原则：

1. **OS 级加密**：API Key 通过 Electron `safeStorage` 加密存储，密钥由 Windows DPAPI 管理，应用本身不接触主密钥
2. **无主密码**：不引入额外的主密码层——你登录 Windows 就是解锁
3. **密文备份**：备份导出时保持 `safeStorage` 加密状态，密文仅限本机恢复
4. **明文降级**：当 `safeStorage` 不可用时（如 Linux/WSL），自动降级为明文存储并标记，导出时给出警告
5. **零云端依赖**：所有数据存储在本地 JSON 文件，无任何数据上传

---

## 国内网络加速（可选）

Electron 与 electron-builder 的二进制下载较慢时，在安装/打包命令前内联注入镜像环境变量（Git Bash；cmd 需 `set X=Y &&` 形式）：

```bash
# 首次安装
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm install

# 打包
ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ npm run package
```

> 不放入 `.npmrc`：npm 11+ 会对未识别的 key 报警告，内联注入只在需要的命令生效，不污染 dev/typecheck。

---

## 开发状态

- ✅ M1–M5：脚手架 / 存储+加密 / 健康检测 / 导入 / IPC+preload — **已完成**
- ✅ M6：UI 全链路 + dev 跑通 + Windows NSIS 打包验证 — **已完成**
- 🔄 M7：验收测试与稳定性 — **进行中**
- 📊 后端测试：**296 用例通过**

---

## 许可证

本项目采用 MIT 许可证。详见 [LICENSE](LICENSE) 文件。
