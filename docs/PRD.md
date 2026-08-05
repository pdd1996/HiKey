# HiKey 产品需求文档（PRD）

| 项 | 内容 |
|---|---|
| 文档版本 | v1.10 |
| 更新日期 | 2026-08-02 |
| 状态 | MVP 规划中，待进 M1 |
| 修订说明 | v1.1 补充状态判定、导入去重、并发/超时预算、明文降级、剪贴板、备份与脱敏规则；v1.2 细化 429 无错误体处理、重检并发规则、恢复前自动备份、剪贴板比对位置、测试模型口径、明文降级旧记录行为、M7 验收引用；v1.3 修正 401/403 欠费误判、单条记录 secretMode、testModel 示例类型、深检触发收窄、anthropic-version 改代码常量、场景 D/UI 文案同步、验收补预备份与跨机拒绝；v1.4 补深检前置条件（全局+单条开关）、明文记录重加密路径、402 歧义修正、状态迁移措辞修正、明文降级开关空转、深检关闭验收分支；v1.5 修 Gemini 深检 body 与错误码、baseUrl 统一根地址、深检状态覆盖顺序、明文降级状态机闭环、数据模型补字段、跨机恢复识别、原子写、testModel 可配范围、取消粒度、错误码匹配规则、P3 笔误；v1.6 彻底移除 Gemini provider，provider 收为四类；v1.7 修 baseUrl 自动剥离版本后缀、plaintext 备份同机可恢复+重加密、checking 蓝色徽标、启动归位遗留 checking、custom 必须支持 /models、schemaVersion 迁移与未知 provider 处理；v1.8 schemaVersion 升 2（修 gemini 迁移死代码）、custom 恢复原样拼接不追加 /v1、safeStorage 不可用时明文标记备份、删 /v1beta、深检补其余 4xx->unknown；v1.9 修明文标记备份与"密文限同机"表述矛盾、恢复后立即执行 schema 迁移、缺失 schemaVersion 视为 0；v1.10 删除明文备份强制校验所有 plaintext（误拒合法混合库）、导出时检测库内 plaintext 记录并警告、补备份畸形字段组合校验、跨机恢复验收表述修正 |

## 1. 产品概述

### 1.1 背景
个人开发者普遍持有多个 LLM 服务商的 API Key（OpenAI、Anthropic、DeepSeek 等），管理散乱：存在 `.env`、贴在便签里、散落各项目目录。更痛的是，Key 常常"不知道哪个还能用"——失效、限流、欠费都靠手动登录各家后台才发现。

### 1.2 问题陈述
现有工具无法覆盖以下真实痛点：
- **Key 活性不可知**：密码管理器（1Password / Bitwarden）只会"存"，不检测 Key 是否还能调用。
- **后台分散**：各厂商控制台互相独立，要知道每个 Key 状态需逐个登录。
- **隐私顾虑**：Doppler / Infisical 等 SaaS 需把 Key 上传云端，许多个人开发者不愿把 Key 传上去。

### 1.3 产品愿景
**一个本地优先、零云端、能自动检测 Key 健康度的 LLM API Key 管理面板。** 让个人开发者在桌面应用里一目了然看到所有 Key 的状态，不再手动排查。

### 1.4 定位
个人开发者本地工具。不做团队/企业功能，不做跨设备同步，不碰云端。

## 2. 目标用户

**主画像：个人开发者（独立开发 / 副业 / 学习者）**
- 持有 5~50 个 LLM API Key，跨多个服务商
- 在本地写代码、调 API，Key 主要在本地使用
- 对"把 Key 传上云端"有顾虑，偏好本地工具
- 不愿为 Key 管理单独付费/部署复杂系统

## 3. 目标与非目标

### 3.1 MVP 目标
- 本地安全存储多个服务商的 API Key，无需主密码（OS 级加密）
- 自动检测每个 Key 的健康状态（有效 / 失效 / 限流 / 欠费），按 provider 错误码区分限流与欠费
- 支持 `.env` / JSON 批量导入，导入时识别重复项并预览，降低首批迁移成本
- 支持备份导出/恢复（密文保持 safeStorage 加密），防止本机数据丢失
- 单机 Windows 桌面应用，零云端依赖

### 3.2 非目标（明确不做）
- 成本/用量聚合（留 v2，依赖本地代理记录调用 token）
- 本地聚合代理网关 / Key 轮询切换（留 v2）
- 跨设备同步（与"本地优先"定位冲突）
- 团队共享、权限、审计（不做，个人工具）
- 托盘常驻、自动更新（不做）
- 自动导入浏览器密码库（不做）

## 4. 用户场景

### 场景 A：首次迁移
开发者有十几个 Key 散在 `.env` 文件里。打开 HiKey -> 导入 `.env` -> 自动归类各 provider -> 预览确认（重复项被标出）-> 一键写入 -> 点"全部重检" -> 看到哪些 Key 还活着、哪些已失效。

### 场景 B：日常巡检
每隔一段时间打开 HiKey，Dashboard 直接展示所有 Key 状态徽标（绿/红/黄/橙/灰），一眼定位失效或欠费的 Key，决定续费或弃用。

### 场景 C：新增 Key
拿到一个新 Key -> 点"添加" -> 选 provider、填 name/base_url/key -> 保存 -> 自动立即检测一次 -> 状态徽标变绿即放心使用。

### 场景 D：临时查看明文
需要把某 Key 贴进代码 -> 列表点"查看" -> 二次确认 -> 明文显示一次 -> 复制后由主进程在 60 秒后比对剪贴板内容，若仍为本次复制的 key 才清除（避免误清期间复制的其他内容）；UI 同时提示系统剪贴板历史可能仍保留。

## 5. 功能需求

### FR-1 加密存储
| 项 | 说明 |
|---|---|
| 加密方式 | Electron `safeStorage`（Windows 走 DPAPI，保护范围为同一 Windows 用户；不承诺与 Chrome/Edge 的 App-Bound Encryption 同级） |
| 用户负担 | 无主密码，登 Windows 即解锁 |
| 存储内容 | Key 的 secret 字段加密；name/provider/base_url/status 等明文；notes 不用于存放密钥 |
| 记录加密模式 | 每条记录带 `secretMode: "safeStorage" \| "plaintext"`，自描述该条 secret 是密文还是明文，读取时按记录自身模式处理，不依赖全局开关推断；新增记录时：safeStorage 可用则强制 `safeStorage`（即使用户误开降级也不主动明文存），仅 safeStorage 不可用且用户已显式开启明文降级时才写 `plaintext` |
| 重加密 | safeStorage 恢复可用时，自动将存量 `secretMode: "plaintext"` 记录重加密为 `safeStorage` 并改写 `secretMode`；单条重加密失败则保留明文、`lastError` 记录原因、UI 警告"N 条记录仍为明文"，不静默继续；重加密过程不可中断库的读取；全部重加密完成后 `plaintextMode` 置回 false、常驻警告消失 |
| 可用性检查 | 首启检测 `safeStorage.isEncryptionAvailable()`；不可用时默认 fail-closed：拒绝写入新 secret 并提示修复；用户可在设置中显式开启明文降级（默认关，开启后 DB 写入 `plaintextMode: true`，界面常驻醒目警告）；**safeStorage 不可用时，明文降级开关可开但不可关（置灰）**，UI 说明"safeStorage 不可用，无法重加密，关闭请先修复 safeStorage"；`plaintextMode` 与常驻警告保持到存量 plaintext 记录数归零（即 safeStorage 恢复后自动重加密完成） |
| 旧密文读取 | safeStorage 不可用（或降级模式）下，已加密的旧记录无法解密时，状态标记为 `unknown`，`lastError` 写"无法解密旧记录"，界面明确报错，不崩溃、不返回乱码；用户可删除或重新录入 |
| 明文边界 | 明文只在 `keys:reveal` 时经 IPC 一次性返回渲染进程；主进程用完即弃、不缓存；渲染进程不得缓存/持久化，关闭查看弹窗即释放引用 |
| 剪贴板 | 复制后应用在 60 秒后尝试清除剪贴板；**清除前由主进程比对剪贴板当前内容是否仍等于本次复制的明文 key，一致才清除，否则不动**（避免误清用户期间复制的其他内容）；UI 文案明确说明系统剪贴板历史可能仍保留，不承诺"即弃" |
| 安全设置 | `contextIsolation: true` / `nodeIntegration: false` / `sandbox: true`；启用 CSP，禁止外部导航与远程内容加载 |
| 扩展口子 | 架构预留"可选主密码层"，MVP 不实现 |

### FR-2 健康检测（两级）
**端点与 URL 规则**
- `baseUrl` 语义：统一为"API 根地址，不含版本路径"（如 `https://api.openai.com`，不含 `/v1`）；**非 custom 的 provider：程序先去尾斜杠，再自动剥离尾部已知版本后缀（`/v1`），最后由代码追加 `/v1`**，避免用户填 `https://api.openai.com/v1` 拼出 `/v1/v1/models`
- 默认值：openai=`https://api.openai.com`，anthropic=`https://api.anthropic.com`，deepseek=`https://api.deepseek.com`，custom=用户填写（OpenAI 兼容端点）
- custom 拼接规则：**原样拼接，不追加版本段**。程序只去尾斜杠，用户填什么路径就拼什么（填 `https://myproxy.com/v1` -> `/v1/models`；填 `https://myproxy.com` -> `/models`）。理由：custom 是用户自填的未知端点，可能走 /v1 也可能走根路径，强制追加 /v1 会排除根路径端点，由用户负责填对
- custom 前置要求：必须是 OpenAI 兼容端点，支持 `GET {用户填的路径}/models`，否则 ping 返回 404/405 时标 unknown（不破坏深检只在 ping=valid 后执行的规则）
- 错误码匹配规则：取响应体 `error.code`（无则取 `error.type`），与欠费类关键字表做大小写不敏感 substring 匹配；命中即判 quota_exceeded；该映射表集中维护，M3 联调定稿

**第一级：ping（零 token 成本）**
- OpenAI 兼容-非 custom（openai/deepseek）：`GET {baseUrl}/v1/models`，`Authorization: Bearer`
- Custom：`GET {用户baseUrl}/models`（原样拼接），`Authorization: Bearer`
- Anthropic：`GET {baseUrl}/v1/models`，`x-api-key` + `anthropic-version: 2023-06-01`
- 状态映射：200->valid（仅代表端点可达、认证通过，额度状态由二级确认）；401/403 且错误码命中欠费类 `insufficient_quota/billing_not_active/quota/exhausted/balance`->quota_exceeded（Anthropic 的 `billing_not_active` 常走 403，需解析错误体避免误判失效）；401/403 其他情况->invalid；402（含无 body）或 429 且错误码命中欠费类->quota_exceeded；429 且无法解析错误码（含无 body）->rate_limited（默认，不猜测欠费）；5xx/超时/网络异常->unknown；其余 4xx->unknown（不误判失效）

**第二级：深度检测（消耗极少量 token）**
- 执行前提：**仅在 ping=valid 后执行**；ping 非 valid（invalid/rate_limited/quota_exceeded/unknown）则直接结束、不深检，避免对限流/失效 key 雪上加霜
- 触发时机：新增/编辑保存后、手动"立即检测"时触发（始终深检，不受开关限制）；**默认轮询只做一级 ping，不触发深度检测**（避免规则歧义和深检次数失控）；"状态迁移不反向触发深检"（即 ping 改变状态后不会因此自动追加一次深检，深检本身也改状态，避免字面矛盾）；用户可在设置开启"轮询深检"开关（见调度），开启后每轮对满足前置条件的记录追加深检
- 前置条件：轮询深检执行需同时满足"全局 `deepCheckEnabled` 开 + 该记录 `deepCheck=true` + ping=valid"，否则轮询只做 ping；新增/编辑/手动触发的深检不受 `deepCheckEnabled` 限制；新增记录的 `deepCheck` 默认 true
- OpenAI：`POST {baseUrl}/v1/chat/completions`，body 含 `model`、`messages`、`max_tokens: 1`
- Anthropic：`POST {baseUrl}/v1/messages`，headers 含 `x-api-key` + `anthropic-version`，body 含 `model`、`max_tokens: 1`、`messages`
- DeepSeek：`POST {baseUrl}/v1/chat/completions`，默认测试模型 `deepseek-chat`
- Custom：用户填 baseUrl 和 testModel，请求体同 OpenAI；端点原样拼接 `{用户baseUrl}/chat/completions`（不追加 /v1）
- 测试模型：每条记录 `testModel` 可配（所有 provider 均可在表单"高级项"编辑，非仅 Custom）；Custom 必填（无默认），其他 provider 预填默认但可改；MVP 首版暂定名单 `gpt-4o-mini` / `claude-3-5-haiku-latest` / `deepseek-chat`，M3 真实 Key 联调后定稿；模型名随时可能因 provider 下线而过期，以"可配置 + 集中维护内置名单"为准
- 二级映射（按错误性质分类）：
  - 2xx -> valid
  - 401/403 且错误码命中欠费类 -> quota_exceeded；401/403 其他 -> invalid
  - 402（含无 body）或 429 且错误码命中欠费类 -> quota_exceeded；429 无法解析错误码（含无 body）-> rate_limited
  - **400/404（模型不存在、请求格式错）-> 配置问题，不降级 ping 的 valid 结论**：状态保持 valid，`lastError` 写"深检未通过：模型/配置问题，建议更换 testModel"
  - 5xx/超时/网络异常 -> unknown
  - 其余 4xx（405/409/422 等未明确覆盖的）-> unknown（不猜测原因）

**调度**
- 应用启动后开始调度；关窗即退出，不做托盘常驻
- 默认 15 分钟轮询一次（可配，范围 5~1440 分钟）；每轮默认只做一级 ping，深度检测按上述触发时机执行
- 设置提供"轮询深检"开关（`deepCheckEnabled`，默认关），开启后每轮对满足前置条件（记录 `deepCheck=true` + ping=valid）的记录追加深度检测；关闭则轮询仅 ping
- 并发上限默认 4，同一 Key 不重叠检测；轮询场景：上一轮未完成时跳过本轮（静默）；手动"立即全部重检"：取消当前轮所有未完成检测并重新发起，按钮显示"重检中"；单条"立即检测"：仅取消该 Key 自身的在飞检测，不影响其他 Key
- status 枚举新增 `checking`：检测进行中显示为 checking，避免按钮"重检中"但状态还停在旧值；检测完成或超时后写入最终状态
- 启动归位：应用启动时，将所有遗留 `checking` 状态归位为 `unchecked`（上次检测未完成，结果未知），避免重启后卡在 checking
- 检测是 best-effort：关窗时未完成的检测直接丢弃，不损坏数据，下次打开重新检测
- 单条检测总预算 ≤ 5s：ping ≤ 2s，深度 ≤ 2s，其余为调度开销；超时归 unknown
- 支持"立即全部重检" / 单条"立即检测"
- UI 标注"深度检测输出 1 token，总消耗取决于请求体，通常 < 10 token"

### FR-3 批量导入
- 支持 `.env`：解析 `OPENAI_API_KEY=` / `ANTHROPIC_API_KEY=` / `DEEPSEEK_API_KEY=` 等；`*_BASE_URL` 变量可关联为对应条目的 baseUrl；未知变量默认跳过并在预览中列出；**name 生成规则**：.env 无 name 字段，按 `{provider}-{序号}` 自动生成（如 `openai-1`），用户可在预览中改
- 支持 JSON：`[{ "name": "...", "provider": "...", "baseUrl": "...", "key": "..." }]`
- 导入前预览：列出 name/provider/baseUrl/key 掩码，并标记"新增 / 重复 / 跳过"
- 去重规则：同一 provider+name 视为重复；secret 去空白后相同视为重复（去重 hash 仅存在于本次导入会话的主进程内存）
- 默认策略：重复项跳过；用户可在预览中逐条改为"覆盖"或"强制新增"
- 覆盖语义：覆盖时更新 name/baseUrl/testModel/notes，并重写 secret（触发重加密按当前 secretMode 处理）；强制新增允许同一 secret 在不同 name 下重复存在（用户自行负责）
- 通过主进程文件选择框选择文件，限制 `.env`/`.json` 且 ≤ 1MB
- 导入时不立即检测，写入后由用户点"重检"或等调度器

### FR-4 列表与详情管理
- 列表展示：name / provider / 状态徽标 / 最后检测时间 / 检测模式（深检/仅 ping）/ lastError 脱敏信息（tooltip）
- 状态徽标：蓝(checking) / 绿(valid) / 红(invalid) / 黄(rate_limited) / 橙(quota_exceeded) / 灰(unknown/unchecked)
- 操作：新增 / 编辑 / 删除（删除需二次确认）/ 显式查看明文（带二次确认）
- 添加/编辑表单：provider、name、baseUrl（按 provider 预填默认）、key、notes；**测试模型为所有 provider 的高级项**（Custom 必填，其他预填默认可改）；高级项可编辑 deepCheck
- 默认排序：按 provider 字母序（同 provider 的 key 自然相邻，视觉上即"分组感"，不画分组标题）
- 筛选：按 provider、按状态（与排序独立，可叠加：筛选后结果仍按 provider 排序）
- 不做折叠分组视图（若后续确有需求，再加可选的分组模式切换）

### FR-5 设置
- 检测间隔（分钟，5~1440，默认 15）
- 定时检测总开关（`healthCheckEnabled`，默认开；关闭后不进行启动首检与定时轮询，手动「立即检测 / 一键深检」不受影响）
- 轮询深检开关（`deepCheckEnabled`，默认关；开启后每次定时轮询追加深检，关闭则轮询仅 ping；新增/编辑/手动深检不受此限）
- 明文降级开关（默认关，开启需二次确认；**仅当 `safeStorage.isEncryptionAvailable()` 返回 false 时显示且可开**；safeStorage 不可用时该开关开启后不可关闭（置灰），需 safeStorage 恢复并完成重加密后才回到可关状态）
- 立即全部重检按钮

### FR-6 备份与恢复
- 备份格式：`.hikey-backup` 为 JSON 打包（含 `schemaVersion` + `keys` + `meta` + `verifier` + `plaintextBackup` + `plaintextRecordCount`），M3 定稿内部结构
- 字段组合校验：恢复时校验备份内 `verifier` 与 `plaintextBackup` 的组合合法性；非法组合（如 verifier=null 但 plaintextBackup 缺失/false，或 plaintextBackup=true 但 verifier 非 null）直接拒绝恢复并报错
- safeStorage 不可用时的备份：导出时无法生成 verifier，改为生成"明文标记备份"（`verifier=null` + `plaintextBackup=true`）；恢复时跳过 verifier 校验，强制二次确认 + 醒目警告"明文导出，任意机器可读"
- 导出时 plaintext 检测：**无论密文备份还是明文标记备份，导出时都扫描库内 secretMode=plaintext 的记录**；存在则在备份内写 `plaintextRecordCount: N`，UI 提示"备份包含 N 条明文记录，请妥善保管"；安全值 0 时不提示
- 导出：主进程将当前库打包为 `.hikey-backup` 文件；safeStorage 可用时密文受 safeStorage 保护，限同一 Windows 用户本机恢复；safeStorage 不可用时为明文标记备份（见上条），视为明文导出，任意机器可读，需用户自行保管
- 恢复识别：恢复时先检查备份标记；**明文标记备份（plaintextBackup=true）跳过 verifier，强制二次确认后恢复**；**密文备份先尝试用本机 safeStorage 解密 verifier；跨机（失败）整体拒绝，同机（通过）允许恢复**；恢复后含 plaintext 记录时自动触发重加密（plaintext 记录可读，safeStorage 密文记录保留按旧密文读取规则标 unknown 并提示，不拒绝恢复）
- 恢复：通过主进程打开对话框选择备份文件；**覆盖当前库前先自动导出一份预备份到 `userData/backups/hikey-db.pre-restore.{timestamp}.hikey-backup`**，保留最近 3 个，使恢复可撤销
- 预备份边界：当前库可读但预备份失败时中止恢复（避免无后悔药地覆盖）；**当前库已损坏时允许跳过预备份继续恢复**，否则恢复功能会被坏库卡死，而"库坏了想恢复"恰恰是最需要恢复的场景
- 原子写入：恢复采用 temp + rename + fsync 原子写（先写 `.tmp` 再 rename 覆盖），崩溃在中途则旧库完好，不留下半截数据
- **恢复后迁移：恢复写入完成后立即执行 schema 迁移**（处理旧备份 schemaVersion<2 且含 gemini 等未知 provider 的情况），不等下次启动；迁移失败则回滚到恢复前状态并报错
- 不做跨设备同步；跨机迁移依赖 v2 的可选主密码层

## 6. 非功能需求

| 维度 | 要求 |
|---|---|
| 性能 | 启动 < 2s；列表渲染百条无卡顿；单条检测总预算 ≤ 5s（ping ≤ 2s，深度 ≤ 2s）；全部重检并发上限默认 4 |
| 安全 | 见 FR-1；启用 CSP 与安全 WebPreferences；导入文件经主进程对话框选择，不接受渲染进程传入的任意路径；日志与 lastError 脱敏，不含 URL query、Authorization 或明文 Key |
| 兼容 | Windows 10/11 x64 |
| 体积 | 安装包 < 200MB（Electron 基线） |
| 可靠 | 检测超时/网络异常不误判 Key 失效（5xx/超时->unknown）；429 需结合错误码区分限流与欠费 |
| 隐私 | 零云端，所有数据本地；网络仅指向用户配置的 provider 端点 |

## 7. 技术架构

> **单一事实来源：** 技术选型的完整理由、依赖清单、进程职责、项目结构详见 [`技术栈.md`](./技术栈.md)。本节仅放概要，详细定义以该文档为准。

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron |
| 构建 | electron-vite（main/preload/renderer 三目标） |
| 打包 | electron-builder（Windows NSIS） |
| 前端 | React + TypeScript |
| UI 组件 | shadcn/ui + Tailwind + Radix |
| 数据库 | lowdb（JSON 文件存储，零 native 依赖） |
| 加密 | Electron safeStorage（Windows DPAPI） |
| 导入解析 | dotenv（.env）+ 原生 JSON.parse |
| 备份 | `.hikey-backup` 单文件（JSON 打包，MVP 不做额外口令加密） |
| 错误码映射 | 集中维护 provider 状态码/错误码 -> 状态枚举的映射表 |

**进程职责**
- 主进程：加解密、lowdb 读写、健康检测、调度、导入解析、备份恢复、IPC；文件选择/保存对话框全部在主进程
- preload：contextBridge 暴露最小安全 API
- 渲染进程：纯 React UI，不直接接触明文 Key；明文仅在显式"查看"时经 IPC 接收一次

## 8. 数据模型

> **单一事实来源：** 字段的完整定义、状态流转、加密降级状态机、备份恢复流程详见 [`数据库设计.md`](./数据库设计.md)。本节仅放概要 + 示例，详细定义以该文档为准，避免两处重复维护。

数据库文件：`app.getPath('userData')/hikey-db.json`（Windows: `%APPDATA%/HiKey/`）

**keys 数组（单条记录）**
```json
{
  "id": "uuid",
  "name": "用户起的名",
  "provider": "openai | anthropic | deepseek | custom",
  "baseUrl": "https://api.openai.com",
  "encSecret": "safeStorage 加密后的密文",
  "secretMode": "safeStorage | plaintext",
  "status": "checking | valid | invalid | rate_limited | quota_exceeded | unknown | unchecked",
  "lastChecked": 1691000000000,
  "lastCheckMode": "ping | deep | null",
  "lastDeepCheckedAt": 1691000000000,
  "lastError": "脱敏后的错误码/原因，不含 URL/Authorization/Key",
  "deepCheck": true,
  "testModel": "gpt-4o-mini",
  "createdAt": 1691000000000,
  "updatedAt": 1691000000000,
  "notes": ""
}
```

**数据库根对象**
```json
{
  "schemaVersion": 2,
  "keys": [ ... ],
  "meta": { ... }
}
```

**schema 迁移策略**
- 启动时读取 `schemaVersion`，**字段缺失视为 0**；低于当前版本（2）则自动迁移并写回；迁移失败则中止启动、提示用户从备份恢复，不破坏原库
- 未知 provider 处理（如 v1.6 前历史库里的 `gemini` 记录）：迁移时标记为 `custom` 并在 `lastError` 写"原 provider={old}，已迁移为 custom，请确认 baseUrl/testModel"，UI 提示用户手动处理；用户也可删除该记录

**meta 对象（设置）**
```json
{
  "checkIntervalMinutes": 15,
  "healthCheckEnabled": true,
  "deepCheckEnabled": false,
  "concurrentChecks": 4,
  "pingTimeoutMs": 2000,
  "deepTimeoutMs": 2000,
  "allowPlaintextFallback": false,
  "plaintextMode": false,
  "clipboardClearMs": 60000
}
```

## 9. 界面与交互流程

**主界面：Dashboard**
- 顶部：标题 + "添加" + "导入" + "全部重检" 按钮
- 筛选条：provider 下拉 / 状态下拉
- 主体：Key 列表（表格行），每行含 name / provider 徽标 / 状态徽标 / 最后检测时间 / 检测模式 / 操作（查看/编辑/删除）
- 状态变更通过 IPC 事件 `status:update` 实时刷新

**添加/编辑 Key**：弹窗表单——provider 选择、name、baseUrl（按 provider 预填默认）、key 输入、notes；测试模型为所有 provider 的高级项（Custom 必填，其他预填默认可改）；高级项可编辑 deepCheck。保存后自动检测一次。

**导入对话框**：主进程文件选择 -> 解析 -> 预览表格（name/provider/baseUrl/key 掩码、重复标记）-> 用户逐条确认 -> 写入。

**查看明文**：点"查看" -> 二次确认弹窗 -> 显示明文 + 复制按钮 -> 关闭即弃（渲染进程不缓存）；复制后由主进程在 60 秒后比对剪贴板内容，仍为本次复制的 key 才清除，否则不动；UI 提示系统剪贴板历史可能保留。

**设置页**：定时检测总开关、检测间隔滑块、轮询深检开关、明文降级开关、立即重检。

**备份**：设置页提供导出加密备份、从备份恢复，均走主进程文件对话框。

## 10. IPC API（preload 暴露）

| 方法 | 说明 |
|---|---|
| `system:isEncryptionAvailable()` | 首启检查 safeStorage |
| `keys:list()` | 列表，不含明文与敏感错误信息 |
| `keys:add(input)` / `keys:update(id, input)` / `keys:remove(id)` | 增改删 |
| `keys:reveal(id)` | 显式触发，经 IPC 一次性返回明文；渲染进程不得缓存 |
| `keys:checkNow(id)` / `keys:checkAll()` | 检测 |
| `import:pickAndParse()` | 主进程弹出文件选择框并解析，返回预览列表，不写入 |
| `import:confirm(items)` | 确认写入 |
| `backup:export()` / `backup:restore()` | 主进程保存/打开对话框，导出/恢复备份 |
| `onStatusUpdate(cb)` | 订阅状态变更 |
| `settings:get()` / `settings:set(partial)` | 设置读写 |

## 11. 里程碑

| 阶段 | 内容 |
|---|---|
| M1 脚手架 | 项目初始化、依赖、electron-vite/builder 配置、空白窗口跑通 |
| M2 存储+加密 | safeStorage 封装 + lowdb 读写 + 加解密往返自测 + fail-closed/明文降级策略 |
| M3 健康检测 | 四类 provider 两级检测 + 错误码映射 + 并发与超时预算 + 调度器，真实 Key 验证 |
| M4 导入 | .env/JSON 解析 + 去重规则 + 预览 + 确认写入 |
| M5 IPC+preload | handler 注册、contextBridge 安全 API、主进程文件选择框 |
| M6 UI+打包 | Dashboard/导入/设置/备份全链路 + Windows 打包验证 |
| M7 验收 | 按第 13 节验收标准逐项验证：状态判定、去重、脱敏、备份恢复（含库损坏）、明文降级（含旧密文读取） |

## 12. 风险与待定项

| 项 | 说明 |
|---|---|
| safeStorage 不可用 | Windows 上极少见；默认 fail-closed 拒绝明文写入；用户显式开启明文降级后，DB 标记 `plaintextMode` 且 UI 常驻警告；safeStorage 不可用时开关不可关，需恢复后自动重加密才归零 |
| 深度检测消耗 token | 默认轮询只 ping，仅在新增/编辑/手动触发时深检；开启"轮询深检"后轮询也深检（记录 `deepCheck=true` + ping=valid 才执行）；50 个 Key 若开启轮询深检约 4800 次/天，成本不可忽略；用户可关闭该开关保持轮询仅 ping |
| 深检语义 | 深检只在 ping=valid 后执行；400/404（模型/配置问题）不降级 valid，仅写 lastError；401/403/402/429 按错误码改状态；模型/配置问题与 key 问题分开展示 |
| provider API 变更 | 测试模型和端点可能变更（如 `gpt-4o-mini` 下线）；`testModel` 所有 provider 可配；`anthropic-version` 为代码内常量（非用户配置），随 HiKey 版本升级跟进；错误码映射表集中维护；内置名单为 MVP 首版暂定，M3 真实 Key 联调后定稿 |
| lowdb 数据量上限 | 当前定位几十~几百条够用；v2 做用量历史时迁 SQLite |
| 备份可移植性 | safeStorage 可用时密文备份限同一 Windows 用户恢复（verifier 校验）；safeStorage 不可用时为明文标记备份，视为明文导出，任意机器可读，需用户自行保管；跨机加密迁移依赖 v2 可选主密码层 |
| 关窗/崩溃 | 检测 best-effort，关窗即丢弃未完成检测，不损坏数据；恢复采用 temp+rename+fsync 原子写，崩溃在中途=旧库完好 |
| 待定 | 错误码映射最终表（M3 联调定稿） |

## 13. MVP 验收标准

| 场景 | 预期 |
|---|---|
| 有效 Key（深检开） | 保存后 ping+深检通过 -> valid，检测模式标"深检" |
| 有效 Key（深检关） | 轮询时 deepCheckEnabled=false 或记录 deepCheck=false 时，仅 ping 通过 -> valid，检测模式标"仅 ping"，不追加深检（手动/新增/编辑不受限） |
| 失效 Key | 401/403 且错误码非欠费类 -> invalid |
| 限流 Key | 429 且错误码非欠费类（含无 body） -> rate_limited |
| 欠费 Key | 402（含无 body），或 401/403/429 错误体命中欠费类（含 Anthropic 403 `billing_not_active`） -> quota_exceeded |
| 深检不执行 | ping 非 valid（invalid/rate_limited/quota_exceeded/unknown）时不深检，直接结束 |
| 深检-模型/配置错误 | ping=valid 但深检 400/404（模型不存在等）-> 状态保持 valid 不降级，lastError 写"深检未通过：模型/配置问题，建议更换 testModel" |
| 断网/超时 | 两级检测均 unknown，不误判 invalid |
| custom /models | custom 端点不支持 GET /models（404/405）-> 标 unknown，不破坏深检前置规则 |
| checking 状态 | 检测进行中 status=checking，显示蓝色徽标；完成或超时后写入最终状态 |
| 启动归位 | 启动时遗留 checking 归位为 unchecked，不卡在检测中 |
| 手动重检 | 全部重检取消当前轮所有未完成检测；单条立即检测仅取消该 key 在飞检测；按钮显示"重检中" |
| 深检前置 | 新增/编辑/手动始终深检；轮询需 deepCheckEnabled + 记录 deepCheck + ping=valid 同时满足才深检；状态迁移不反向触发深检 |
| baseUrl 规范 | 非 custom：用户填带版本后缀时自动剥离后追加 `/v1`，不出现 `/v1/v1`；custom：原样拼接不追加版本段，用户自负责填对路径 |
| 明文降级 | 默认拒绝；开启后 DB 写入 `plaintextMode: true` 且 UI 常驻警告；safeStorage 不可用时开关可开不可关（置灰），需恢复并重加密完成才可关 |
| 明文降级-旧记录 | safeStorage 不可用时，已加密旧记录无法解密 -> status 标 unknown、lastError 写"无法解密旧记录"、界面报错不崩溃、可删除或重录 |
| 记录加密模式 | 每条记录 `secretMode` 自描述密文/明文；safeStorage 可用时新增强制 `safeStorage`，不因全局降级而明文存 |
| 重加密 | safeStorage 恢复可用时，存量 plaintext 记录自动重加密为 safeStorage；单条失败保留明文并告警；全部完成后 plaintextMode 置 false、警告消失 |
| 导入重复 | 预览标记重复，默认跳过，可逐条"覆盖"或"强制新增"；覆盖更新 name/baseUrl/testModel/notes 并重写 secret |
| 同 key 多 name | 强制新增允许同一 secret 在不同 name 下重复存在，用户自行负责 |
| 查看明文 | 二次确认后返回一次；渲染进程不缓存；复制后由主进程比对剪贴板内容，60s 后一致才清除 |
| 文件导入 | 仅主进程文件选择框，限制 .env/.json 与 1MB；.env name 按 `{provider}-{序号}` 自动生成可改 |
| schema 迁移 | schemaVersion<2 的旧库自动迁移；缺失字段视为 0；gemini 等未知 provider 标 custom 并提示；迁移失败中止启动不破坏原库 |
| 备份恢复 | 跨机（verifier 失败）整体拒绝；同机（verifier 通过）可完整恢复，含 plaintext 记录时恢复后自动重加密；**恢复后立即执行 schema 迁移** |
| 明文标记备份 | safeStorage 不可用时导出为明文标记备份（verifier=null）；恢复跳过 verifier 校验，强制二次确认 + 醒目警告；视为明文导出，任意机器可读，用户自行保管；混合库（plaintext + safeStorage 记录并存）不拒绝恢复，safeStorage 记录按旧密文读取规则标 unknown |
| 明文记录检测 | 导出时扫描库内 plaintext 记录，写入 plaintextRecordCount；UI 提示"备份包含 N 条明文记录"；密文备份也可能含明文记录（重加密部分失败场景） |
| 畸形字段组合 | verifier=null 但 plaintextBackup 缺失/false，或 plaintextBackup=true 但 verifier 非 null -> 拒绝恢复并报错 |
| 预备份生成 | 正常恢复前生成 `userData/backups/hikey-db.pre-restore.{timestamp}.hikey-backup`，保留最近 3 个；当前库可读但预备份失败时中止恢复 |
| 库损坏恢复 | 当前库损坏时，恢复允许跳过预备份继续恢复 |
| 跨用户/跨机恢复 | 密文备份跨机（verifier 失败）整体拒绝，不做部分恢复，不破坏当前库；明文标记备份按明文流程放行（任意机器可恢复） |
| 恢复原子写 | 恢复采用 temp+rename+fsync，崩溃在中途=旧库完好，不留半截数据 |
