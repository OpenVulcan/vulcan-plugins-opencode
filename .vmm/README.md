# VMM Config Templates

这个目录存放插件内置的 VMM 配置模板，不是运行时真正使用的配置目录。

## 运行时文件位置

插件运行时实际读写的文件仍然位于 `.opencode/`：

- 项目本地配置：`.opencode/.vmm.json`
- 全局配置：`~/.config/opencode/.vmm.json`
- session 状态：`.opencode/.vmm-session-state.json`
- 写回重试队列：`.opencode/.vmm-writeback-outbox.json`

如果老环境里还存在 `~/.opencode/.vmm.json`，插件启动时会把它前迁到新的全局路径。

## 模板用途

`config.default.json` 是引导模板：

1. 用于仓库内展示默认配置格式。
2. 用于插件首次启动时生成默认的全局配置文件。

当前默认模板只保留新的业务寻址模型：

```json
{
  "project_id": "",
  "user_id": "",
  "language": "en",
  "vulcan_host_target": "${VULCAN_HOST_GRPC_TARGET}",
  "grpc_api_key": "${VMM_GRPC_API_KEY}",
  "grpc_handshake_timeout_ms": 1500,
  "grpc_receive_timeout_ms": 10000,
  "visible_memory_injection": false,
  "implicit_memory_turns": 5,
  "profile_refresh_turns": 5
}
```

## 配置键含义

- `project_id`
  - 当前生效的 VMM 项目 ID
  - 必须是非零十进制字符串
- `user_id`
  - 当前生效的 VMM 用户 ID
  - 必须是非零十进制字符串
- `vulcan_host_target`
  - 统一 vulcan-host gRPC 中转地址
  - 插件唯一连接入口，由 vulcan-host 再代理到 VMM 与 LuaSkills
- `language`
  - VMM UI 语言覆盖值
  - 未设置或设置无效时会回退到 `en`
  - 当前支持：`en`、`zh-CN`、`es`、`fr`、`de`、`ja`、`ko`
- `grpc_api_key`
  - 可选鉴权字段
  - 配置后会通过 gRPC metadata 发送
- `grpc_handshake_timeout_ms`
  - 连接 ready-check 超时
- `grpc_receive_timeout_ms`
  - unary 响应超时
- `visible_memory_injection`
  - `true` 表示显式把检索结果展示到用户输入前
  - `false` 表示隐式写入 system
- `implicit_memory_turns`
  - 记忆保温轮数
- `profile_refresh_turns`
  - 完整画像 bundle 的刷新轮数
  - 只按“成功提交到后端的 turn 次数”计数
  - 不会限制画像 bundle 的持续隐式注入时长

## 业务启用条件

只有下列三项都有效时，普通检索与写回链才会启用：

1. `vulcan_host_target`
2. `user_id`
3. `project_id`

如果这三项不完整，插件会进入安全停用态：

- 普通聊天不做记忆检索
- finalize 不做写回
- `/vulcan-setting` 仍然可用，方便用户修复配置

## 画像 bundle 运行时规则

当前运行时还会维护一份按 `user_id + project_id` 绑定的完整画像 bundle：

1. 新 root session 首轮前，插件会优先通过 OpenCode `session.get` 判断当前是否仍是初始会话
2. 如果是初始会话，或者当前绑定与缓存 bundle 不一致，会先向后端拉取完整 bundle
3. bundle 一旦拉到，会持续以隐藏 system 形式参与普通对话
4. `profile_refresh_turns` 只决定“成功提交多少条 turn 后重新拉取一次”，不会让注入自动失效

## 公开入口

当前公开入口只保留：

- `/vulcan-setting`

所有绑定、语言切换、画像管理、项目迁移/删除和记忆模式切换都已经转入 TUI 控制面板。

## 语言切换说明

- 运行时 toast、system 提示、显式记忆包裹文案会跟随当前生效语言切换
- `/vulcan-setting` 的入口描述在启动阶段注册，因此修改 `language` 后需要重启 OpenCode 才能刷新

