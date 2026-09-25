# OpenCode Memory Plugin 设计方案

更新日期：2026-03-27

本文档描述当前仓库已经落地的实现设计，不再保留旧版 `space_id / team_id` 客户端寻址模型，也不再保留公开 `-confirm` 指令的命令面假设。

## 1. 设计目标

当前插件的目标是：

1. 在 OpenCode 顶层真实对话里做记忆检索与写回。
2. 只对稳定收口的真实主线程轮次写回记忆。
3. 把命令、后台回流、ASK 取消态、子线程噪声从记忆链中剔除。
4. 使用新的 VMM gRPC 契约接入业务链和管理链。
5. 让用户通过 `/vulcan-setting` TUI 控制面板完成绑定、查看和管理，而不是手工编辑所有配置。
6. 让用户可以为命令描述、toast 和 system 提示选择界面语言，同时保证提取语义不受影响。
7. 让 TUI 管理面避开宿主运行时差异，不直接在页面代码里加载 gRPC 依赖链。
8. 让完整画像 bundle 在普通对话里持续隐式生效，并只在真正需要时刷新。

## 2. 当前架构

插件当前可以分成 4 层：

### 2.1 编排层

文件：

- `src/plugin.ts`

职责：

1. 接入 OpenCode hooks
2. 管理 root session / active turn / sealed turns / followup 状态
3. 控制什么时候检索、什么时候 finalize、什么时候写回
4. 管理普通对话里的完整画像 bundle 预热、缓存、隐式注入与提交后刷新
5. 把 `/vulcan-setting` 之外的管理交互完全迁移到 TUI 控制面板

### 2.2 配置与 TUI 控制层

文件：

- `src/vmm-config.ts`
- `src/vmm-tui.tsx`

职责：

1. 提供 local/global 分层配置读写能力
2. 提供 `/vulcan-setting` TUI 控制面板入口
3. 通过覆盖层完成绑定、列表、删除、迁移与语言切换
4. 生成多语言 TUI、toast 与确认弹窗文案

### 2.3 传输层

文件：

- `src/vmm-grpc.ts`
- `src/memory-sync.ts`

职责：

1. 加载 vendored proto
2. 管理 gRPC client 与 unary 超时
3. 发送 `PreCheck` / `PostAction` / `GetProfileBundle`
4. 维护失败写回 outbox

### 2.4 配置层

文件：

- `.vmm/config.default.json`
- `src/vmm-config.ts`

职责：

1. 加载 local / global / default 分层配置
2. 引导生成默认全局配置
3. 提供业务启用判定
4. 提供 TUI 操作落盘能力

### 2.5 TUI bridge 层

文件：

- `src/vmm-tui-grpc-bridge.ts`
- `src/vmm-tui-grpc-bridge-worker.ts`

职责：

1. 让 `/vulcan-setting` 相关页面不直接在 TUI 宿主里加载 gRPC transport
2. 通过独立 `node` 子进程调用 `dist/vmm-tui-grpc-bridge-worker.js`
3. 在 worker 内部复用 `src/vmm-grpc.ts`
4. 把 worker 失败重新归一化成与普通 unary 相同的结果结构

## 3. 当前业务寻址模型

插件现在不再主动传入 `team_id` / `space_id`。

当前客户端业务寻址只依赖：

- `session_id`
- `user_id`
- `project_id`

当前展示语言则额外由：

- `language`

规则：

1. `user_id` 和 `project_id` 在插件内部以十进制字符串保存
2. 发 gRPC 时映射到 proto 的 `uint64`
3. `user_id` 与 `project_id` 必须是非零十进制字符串
4. `team_id / space_id` 由服务端按 `project_id` 解析

### 3.1 完整画像 bundle 模型

当前普通对话链会额外维护一份完整画像 bundle：

- 绑定维度：`user_id + project_id`
- 获取接口：`GetProfileBundle`
- 请求模式：`PROFILE_BUNDLE_MODE_FULL`
- 注入方式：隐藏 system 注入

核心规则：

1. 新 root session 首轮前，会优先通过 OpenCode `session.get` 判断当前会话是否仍是初始根会话
2. 初始会话、绑定变化或缓存缺失时，会先预热完整画像 bundle
3. 一旦缓存成功，后续普通对话都会持续隐式注入该 bundle
4. `profile_refresh_turns` 只控制“成功提交多少条 turn 后重新拉取 bundle”
5. 这里的计数口径不是请求次数，而是 `PostAction accepted=true` 的成功提交次数

## 4. 业务启用规则

当前普通记忆链不是“只要有 gRPC 地址就启用”。

启用条件是：

1. `grpc_target` 非空
2. `user_id` 有效
3. `project_id` 有效

三者任一缺失时，插件进入安全停用态：

1. `chat.message` 不发检索
2. 事件侧记忆状态更新跳过
3. finalize 不发写回
4. 命令流保持可用

这样做是为了避免在“地址已配置但业务作用域还没绑定”的半配置状态下，把无效请求持续打到后端。

`language` 不参与业务启用判定。

原因：

1. 语言只影响展示层
2. 即使语言配置缺失或写错，业务链仍应继续工作
3. 当前实现会在无效语言值时安全回退到英语

`profile_refresh_turns` 也不参与业务启用判定。

原因：

1. 它只影响完整画像 bundle 的刷新时机
2. 即使没有显式设置，也应安全回退到默认值继续工作

## 5. Turn 状态模型

当前状态机核心仍是“保守收口”：

1. 只跟踪 root session
2. 使用 `activeTurn` 表示当前真实轮次
3. 使用 `sealedTurns` 暂存已经拿到稳定回答、但还未 finalize 的轮次
4. 使用 followup 状态承接 ASK 生命周期

关键点：

1. 新用户输入到来时，如果上一轮已经稳定但尚未 finalize，会先 seal，再开启新轮次
2. ASK 只认 `question.asked / question.replied / question.rejected`
3. finalize 时会重新读取 `session.messages()` 做兜底提取

## 6. 当前数据提取策略

写回 payload 的职责已经固定：

1. `user_content`
   - 只保留本次提交边界内的首问

2. `assistant_content`
   - 只保留最终稳定回答

3. `timeline[]`
   - 只保留中间轨迹
   - 包括后续用户补充
   - 包括必要的 assistant 中间过程痕迹
   - 包括 ASK prompt 与用户回答

当前实现已经不再使用旧术语 `turn_outline`，统一改为结构化 `timeline[]`。

## 7. 当前管理入口模型

### 7.1 公开入口

公开入口现在只保留：

- `/vulcan-setting`

### 7.2 管理交互

绑定、语言切换、画像查看/写入、项目迁移/删除、记忆模式切换都在 TUI 覆盖层里完成。

这样做的原因是：

1. 管理操作不再需要走 LLM 文本回执
2. 管理确认流可以直接用自定义弹窗，而不是依赖隐藏命令
3. 管理操作天然不会再落入普通对话文本

## 8. 管理交互与记忆链隔离

当前实现已经不再依赖旧的 `/vmm-*` 文本命令，因此不再需要“命令文本污染提取链”的那套专门过滤逻辑。

现在的隔离原则变成：

1. 普通记忆链只处理真实聊天轮次
2. 管理面交互留在 `/vulcan-setting` TUI 内部完成
3. 显式记忆包裹仍会在文本清洗阶段被剥离，避免展示层包裹回流到写回载荷

## 9. 当前 gRPC 交互模型

### 9.1 管理 RPC

当前命令层使用：

- `ListProjects`
- `ResolveProject`
- `EnsureProject`
- `DeleteProject`
- `MigrateProject`
- `ResolveUser`
- `ListUsers`
- `DeleteUser`

### 9.2 业务 RPC

当前对话记忆链使用：

- `ChatCompact`
- `PreCheck`
- `PostAction`
- `GetProfileBundle`

当前语义：

1. `PreCheck`
   - 当前更偏向校验和 fail-open 检索入口
   - 插件端以 `should_inject + context_items[]` 为主消费面
   - 插件不再继续兼容 `context_text`，只消费结构化 `context_items[]`
   - 当前后端可能稳定返回“不注入”

2. `ChatCompact`
   - 只在确认当前会话属于 root session 时才会触发
   - 受 `session_compact_recall` 开关统一控制
   - 用于在宿主发生 compact 时，把当前 session 的 compact 边界同步给 VMM

3. `PostAction`
   - 用于真正写回
   - `accepted = true` 才算成功
   - 失败时进入 outbox

4. `GetProfileBundle`
   - 用于普通对话前的完整画像 bundle 预热
   - 成功后缓存并持续隐式注入
   - 写回成功后按 `profile_refresh_turns` 刷新

### 9.3 TUI 管理 RPC

当前 `/vulcan-setting` 相关页面不会直接在 TUI 页面代码里调用 `src/vmm-grpc.ts`。

链路改成：

1. TUI 页面
2. `src/vmm-tui-grpc-bridge.ts`
3. `dist/vmm-tui-grpc-bridge-worker.js`
4. `src/vmm-grpc.ts`

这样设计的原因是：

1. npm 安装版 OpenCode 的 TUI 宿主，与命令模式的 Node 运行时不完全等价
2. 管理 RPC 在命令模式下已验证可用
3. 同样的 gRPC 依赖链在 TUI 宿主里可能卡在依赖加载阶段

因此当前原则是：

1. 业务链继续直接复用 `src/vmm-grpc.ts`
2. TUI 管理页统一走 Node bridge
3. 后续新增 TUI 管理动作时，优先把 RPC 加进 bridge，而不是在 TUI 页面里直接引 gRPC 调用

### 9.4 初始会话判定

当前完整画像 bundle 的首轮预热，不能只靠本地历史猜测。

因此运行时会优先读取：

- OpenCode `session.get`

判定规则是：

1. 当前是 root session
2. `parentID` 为空
3. `time.created === time.updated`

只有宿主接口不可用时，才会回退到插件在 `session.created` 事件里持久化下来的提示标记。

## 10. Outbox 与失败恢复

失败写回会进入：

- `.opencode/.vmm-writeback-outbox.json`

规则：

1. 每次写回前先尝试冲刷历史 outbox
2. 按 FIFO 顺序重放
3. 历史 replay 卡住时，当前 payload 会被追加到末尾
4. 没有后台 daemon，重试依赖后续新的写回机会

## 11. 当前文档边界

这份设计文档只描述当前仓库实际实现过的设计，不再记录早期原型里的：

1. `space_id` 本地状态模型
2. 旧 `/vmm-*` 文本命令面
3. HTTP JSON 版记忆传输
4. 公开 `-confirm` 命令面

如果后续再发生协议级变化，应优先更新：

1. `README.md`
2. `.vmm/README.md`
3. 本文档
4. `docs/api-integration-handoff-2026-03-22.md`


