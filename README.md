# vmm-opencode-plugins

OpenCode 的 VulcanMemoryMesh 记忆插件工作区。

## 当前实现

当前仓库已经不再是“只打日志的原型”，而是一个可运行的 gRPC 版记忆插件实现：

1. 只跟踪 root session，避免子线程、后台 continuation 和命令回执污染记忆。
2. 在真实用户轮次进入时调用 `PreCheck`，按当前后端语义做安全 fail-open 检索。
3. 在稳定收口后调用 `PostAction`，并把中间过程整理为结构化 `timeline[]`。
4. 使用本地 outbox 顺序重放失败写回，避免临时网络问题直接丢失数据。
5. 提供统一的 `/vmm-setting` TUI 控制中心，用来完成绑定、语言、画像和记忆模式管理。
6. 所有管理交互都迁移到 TUI 覆盖层，不再依赖旧的 `/vmm-*` 文本命令回执。
7. 提供多语言 UI 文案，当前默认英语，首版支持 `en`、`zh-CN`、`es`、`fr`、`de`、`ja`、`ko`。
8. 在新 root session 首轮前读取完整画像 bundle，并以隐藏 system 形式持续隐式注入。
9. 在写回成功后按 `profile_refresh_turns` 周期刷新画像 bundle；计数口径为“成功提交到后端的 turn 次数”。

## 当前配置模型

运行时业务作用域已经收敛为：

- `vulcan_host_target`
- `user_id`
- `project_id`
- `language`
- `visible_memory_injection`
- `implicit_memory_turns`
- `profile_refresh_turns`

其中：

- `vulcan_host_target` 负责唯一 gRPC 连接地址，推荐指向统一的 `vulcan-host` 中转程序
- `user_id` 和 `project_id` 必须是非零十进制字符串
- `language` 未设置或设置无效时，会安全回退到英语
- 只有 `vulcan_host_target + user_id + project_id` 同时有效时，检索和写回链才会启用
- `profile_refresh_turns` 只控制“成功提交多少条 turn 后重新拉取画像 bundle”，不控制画像注入本身持续多久
- 修改 `language` 后，运行时 toast 和 TUI 界面会立刻切换，但 `/vmm-setting` 的入口描述仍然需要重启 OpenCode 才会刷新

默认模板位于：

- `.vmm/config.default.json`

运行时文件位于：

- 项目本地配置：`.opencode/.vmm.json`
- 全局配置：`~/.config/opencode/.vmm.json`
- session 状态：`.opencode/.vmm-session-state.json`
- 写回重试队列：`.opencode/.vmm-writeback-outbox.json`

## 公开入口

普通用户可见的公开入口现在只保留：

- `/vmm-setting`

绑定、语言切换、画像查看/写入、项目迁移、删除确认、记忆模式切换等操作都已经收敛到这个 TUI 控制中心里。

普通对话链还会自动做两件和画像相关的事情：

- 新 root session 首轮前，插件会用 OpenCode `session.get` 元数据判断是否是初始会话，而不是只靠本地历史比较
- 如果当前 `user_id / project_id` 作用域下已有完整画像 bundle，插件会把它持续隐式注入到 system；后续只在成功写回达到刷新阈值或绑定发生变化时重新拉取

语言相关说明：

- `language` 仍然支持 local/global 覆盖
- `inherit` / `default` / `clear` / `reset` 以及对应中文别名会清空当前作用域语言覆盖值
- 切换语言不会改变记忆提取语义，只影响 TUI、toast、system 引导和显式注入包裹文案

## 主要文档

- `docs/opencode-memory-plugin-design.md`
- `docs/api-integration-handoff-2026-03-22.md`
- `docs/opencode-memory-extraction-whitepaper.md`
- `.vmm/README.md`

## 关键实现文件

- 插件编排入口：`src/plugin.ts`
- TUI 控制中心：`src/vmm-tui.tsx`
- 配置解析与持久化：`src/vmm-config.ts`
- gRPC 客户端封装：`src/vmm-grpc.ts`
- 检索/写回传输：`src/memory-sync.ts`
- TUI gRPC bridge：`src/vmm-tui-grpc-bridge.ts`

## 本地验证

当前仓库常用验证命令：

```bash
npm run check
npm run build
```

## 现阶段边界

当前版本已经完成插件侧迁移，但仍建议继续做真实 VMM 联调，重点确认：

1. `ResolveProject / EnsureProject / ResolveUser / DeleteUser` 的确认流提示是否符合真实宿主体验。
2. `PreCheck` 当前“不注入”语义是否与后端最新实现保持一致。
3. 真实 gRPC 超时、断连和 outbox 重放是否符合预期。
