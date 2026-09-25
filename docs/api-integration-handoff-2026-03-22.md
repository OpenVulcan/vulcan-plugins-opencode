# API Integration Handoff

更新日期：2026-03-27

这份 handoff 记录当前插件侧已经落地的 VMM gRPC 集成状态，用于后续联调、排障和继续开发。

## 1. 当前结论

本仓库已经完成从旧业务寻址模型到新 gRPC 模型的插件侧迁移。

当前主线不再由插件传入 `team_id` / `space_id`，而是收敛为：

- `session_id`
- `user_id`
- `project_id`

其中：

- `user_id` 和 `project_id` 在插件内部仍以十进制字符串存储与传输
- 真实 gRPC proto 字段已经切到 `uint64`
- 只有当 `grpc_target + user_id + project_id` 三者都有效时，记忆检索和写回链才启用

## 2. 当前代码状态

插件侧已经完成：

1. gRPC unary 传输封装
2. `PreCheck` / `PostAction` 业务链迁移
3. `ListProjects / ResolveProject / EnsureProject / DeleteProject / MigrateProject / ResolveUser / ListUsers / DeleteUser` 管理 RPC 接入
4. `/vulcan-setting` TUI 控制面板落地
5. outbox 顺序重放保留
6. 多语言文案支持落地
7. TUI 管理面改为通过 Node bridge 间接调用管理 RPC，不再在 TUI 宿主里直接加载 gRPC 运行时
8. 普通对话链新增完整画像 bundle 的隐式注入与提交后刷新

本地验证已完成：

- `npm run check`
- `npm run build`

尚未覆盖的部分：

- 针对真实 VMM 实例的完整端到端联调
- 长时间断连 / 重连下的真实 outbox 重放验证
- 宿主侧模型回显确认指令的体验微调

## 3. 关键文件

- `src/plugin.ts`
- `src/vmm-config.ts`
- `src/vmm-grpc.ts`
- `src/memory-sync.ts`
- `proto/v1/vmm.proto`
- `.vmm/config.default.json`
- `src/vmm-tui-grpc-bridge.ts`
- `src/vmm-tui-grpc-bridge-worker.ts`

## 4. 当前运行时配置

### 4.1 文件位置

- 项目本地配置：`.opencode/.vmm.json`
- 全局配置：`~/.config/opencode/.vmm.json`
- session 状态：`.opencode/.vmm-session-state.json`
- 写回重试队列：`.opencode/.vmm-writeback-outbox.json`

兼容迁移：

- 如果发现旧路径 `~/.opencode/.vmm.json`，插件会在引导时把它复制到新的全局路径

### 4.2 分层规则

传输层：

- `grpc_target`: `local -> global`
- `grpc_api_key`: `local -> global`
- `grpc_handshake_timeout_ms`: `local -> global -> default`
- `grpc_receive_timeout_ms`: `local -> global -> default`

业务层：

- `project_id`: `local -> global -> default`
- `user_id`: `local -> global -> default`
- `language`: `local -> global -> default`
- `visible_memory_injection`: `local -> global -> default`
- `implicit_memory_turns`: `local -> global -> default`
- `profile_refresh_turns`: `local -> global -> default`

### 4.3 业务启用规则

当前实现不是“只要有 `grpc_target` 就开”。

普通记忆链的启用条件是：

1. `grpc_target` 非空
2. `user_id` 是非零十进制字符串
3. `project_id` 是非零十进制字符串

在这三项不完整时：

- `chat.message` 检索跳过
- 事件侧记忆状态更新跳过
- finalize 写回跳过
- `/vulcan-setting` 仍然可用

这是刻意保留的安全停用态。

### 4.4 多语言规则

当前首版支持：

- `en`
- `zh-CN`
- `es`
- `fr`
- `de`
- `ja`
- `ko`

规则：

1. `language` 未设置时默认英语
2. `language` 设置为未知值时，运行时会 fallback 到英语
3. 运行时 toast、system 提示、显式记忆包裹文案会立即切换
4. `/vulcan-setting` 入口描述在启动时注册，因此修改语言后需要重启 OpenCode 才能刷新描述

### 4.5 完整画像 bundle 规则

当前普通对话链额外维护一份完整画像 bundle：

1. 新 root session 首轮前，会优先查询 OpenCode `session.get`
2. 只有当 session 仍然是初始根会话时，才会把这条链认定为“首轮画像预热”
3. 如果是初始会话，或者当前 `user_id / project_id` 与缓存 bundle 绑定签名不一致，会先拉取一份 `FULL` bundle
4. 拉到的 bundle 会持续以隐藏 system 形式隐式注入到普通对话里
5. `profile_refresh_turns` 只控制“成功提交多少条 turn 后重新拉取 bundle”
6. 这里的计数口径是 `PostAction accepted=true` 的成功提交次数，而不是请求次数或新 turn 开启次数

## 5. 当前 gRPC 契约

### 5.1 管理 RPC

插件当前已经接入：

- `ListProjects`
- `ResolveProject`
- `EnsureProject`
- `DeleteProject`
- `MigrateProject`
- `ResolveUser`
- `ListUsers`
- `DeleteUser`

这些 RPC 只用于 `/vulcan-setting` 管理面，不会进入普通对话记忆 payload。

### 5.2 画像 bundle RPC

插件当前也已经接入：

- `GetProfileBundle`

当前语义：

1. 普通运行时固定请求 `PROFILE_BUNDLE_MODE_FULL`
2. 画像 bundle 测试入口目前保留为独立 TUI 页，不并入当前画像中心主流程
3. 该 RPC 属于普通对话前置注入链，而不是管理链

### 5.3 TUI 管理面桥接

当前结论：

- `/vulcan-setting` 对应的 TUI 管理页不再直接调用 `src/vmm-grpc.ts`
- TUI 页面会先调用 `src/vmm-tui-grpc-bridge.ts`
- bridge 再用独立 `node` 子进程执行 `dist/vmm-tui-grpc-bridge-worker.js`
- worker 内部才会实际调用 `src/vmm-grpc.ts`

这样做的原因是：

- npm 安装版 OpenCode 的 TUI 宿主运行时，与命令模式/Node 运行时对 gRPC 依赖链的加载行为不同
- 命令模式下 `ListUsers / ListProjects` 已验证可用
- TUI 直连则会在宿主运行时里卡在 gRPC 依赖加载阶段

因此当前稳定方案是：

1. 业务链继续直接复用 `src/vmm-grpc.ts`
2. TUI 管理页统一走 Node bridge
3. 后续新增 TUI 管理动作时，优先把新的 RPC 包进 bridge，而不是在 TUI 页面里直接引入 gRPC 调用

### 5.4 业务 RPC

#### PreCheck

方法：

- `vmm.v1.VMMService/PreCheck`

当前请求体：

```json
{
  "session_id": "ses_xxx",
  "user_id": "123",
  "project_id": "456",
  "user_content": "user text"
}
```

当前处理语义：

- 插件按 `should_inject + context_items[]` 做 fail-open 解析
- 插件只消费结构化 `context_items[]`，不再继续兼容 `context_text`
- 但按当前后端设计，`PreCheck` 仍可能稳定返回“不注入”
- 任何连接失败、超时、服务端异常都不会阻断正常对话

#### PostAction

方法：

- `vmm.v1.VMMService/PostAction`

当前请求体：

```json
{
  "session_id": "ses_xxx",
  "user_id": "123",
  "project_id": "456",
  "user_content": "首问",
  "assistant_content": "最终稳定回答",
  "timeline": [
    { "type": "user", "content": "后续补充" },
    { "type": "assistant", "content": "中间过程痕迹" }
  ]
}
```

成功规则：

- 只有 `accepted = true` 才视为语义成功
- 失败 payload 会进入 `.opencode/.vmm-writeback-outbox.json`

#### GetProfileBundle

方法：

- `vmm.v1.VMMService/GetProfileBundle`

当前请求体特征：

```json
{
  "user_id": "123",
  "project_id": "456",
  "mode": "PROFILE_BUNDLE_MODE_FULL",
  "include_explanation": false
}
```

当前处理语义：

- 首轮新 session、绑定变化和提交后刷新阈值命中时才会重新拉取
- 成功后缓存到 `.opencode/.vmm-session-state.json`
- 后续普通对话会持续隐式注入缓存中的完整 bundle

## 6. 当前管理入口

### 6.1 公开入口

当前公开入口只保留：

- `/vulcan-setting`

### 6.2 管理交互

绑定、语言切换、画像查看/写入、项目迁移/删除、记忆模式切换都已经迁入 `/vulcan-setting` TUI 控制面板。

这意味着：

- 不再依赖旧的 `/vmm-*` 文本命令
- 不再依赖隐藏 `-confirm` 命令
- 确认流通过 TUI 自定义弹窗直接完成

## 7. 管理交互与记忆链隔离

当前实现已经移除了“为了避免旧 `/vmm-*` 文本命令污染记忆链”而加入的专门命令过滤逻辑。

现在的隔离方式是：

1. 普通记忆链只处理真实聊天轮次
2. 管理交互留在 `/vulcan-setting` TUI 内部完成
3. 显式记忆包裹仍会在文本清洗阶段被剥离，避免展示层包裹回流
4. 完整画像 bundle 通过隐藏 system 注入进入普通对话链，不经 TUI 管理面中转

## 8. 当前日志与调试面

主要日志：

- `logs/opencode-plugin-debug.jsonl`
- `logs/memory-sync-debug.jsonl`

常见事件：

- `memory.context.request`
- `memory.context.response`
- `memory.context.error`
- `memory.sync.candidate`
- `memory.sync.grpc.response`
- `memory.sync.grpc.error`
- `memory.sync.outbox.flush.attempt`
- `memory.sync.outbox.stalled`
- `memory.sync.outbox.enqueued`

## 9. 后续联调建议

推荐按下面顺序联调：

1. 配置好 `grpc_target`
2. 通过 `/vulcan-setting` 打开用户/项目管理页，确认管理 RPC 可通
3. 绑定有效 `project_id` 与 `user_id`
4. 验证首页底部状态能正确反映当前生效配置
5. 触发一次普通对话，确认 `PreCheck` 与 `PostAction` 均能到达后端
6. 新开 root session，确认首轮会按 `session.get` 结果触发完整画像 bundle 预热
7. 连续完成多条写回，确认 `profile_refresh_turns` 只按成功提交次数触发刷新
8. 人工制造写回失败，再验证 outbox FIFO 重放

## 10. 当前边界

这份 handoff 只描述“当前插件实现已经是什么”，不再描述旧版 HTTP JSON 集成，也不再描述旧的 `space/team/project/user` 客户端寻址模型。


