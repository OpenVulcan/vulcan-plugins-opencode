/**
 * Simplified Chinese VMM shared language catalog.
 * 简体中文 VMM 共享语言目录。
 *
 * This file belongs to the language-data layer. It stores the Simplified
 * Chinese copy used by runtime toasts, config flows, and hidden citation-rule prompts.
 * 这个文件属于语言数据层，承载运行时 toast、配置流程与隐藏引用规则提示词
 * 所使用的简体中文文案目录。
 */

import type { VmmLanguageCatalog } from "./shared.js"

/**
 * Simplified Chinese catalog entry registered by the unified VMM language registry.
 * 统一 VMM 语言注册表登记的简体中文目录项。
 */
export const VMM_LANGUAGE_CATALOG_ZH_CN = {
  option: {
    code: "zh-CN",
    englishName: "Simplified Chinese",
    nativeName: "简体中文",
    aliases: ["zh", "zh-cn", "zh-hans", "中文", "简体中文", "chinese"],
  },
  sharedText: {
    scope_global: "全局",
    scope_local: "当前项目",
    scope_default_english: "默认英语",
    visible_memory_title: "> **VulcanMemoryMesh 检索记忆**",
    visible_memory_intro: "> 以下内容来自检索到的历史记忆，仅在当前对话未被用户明确否认时作为优先参考：",
    visible_memory_current_input: "> **当前用户输入如下：**",
    implicit_memory_inject_notice:
      "##提示：以下内容来自历史数据分析，仅供参考，不保证完全准确。如需查看原始对话，请使用 TOOLS 查询对应的 TURN_ID。",
    recall_in_progress: "正在回顾历史中",
    recall_complete_empty: "无需历史回顾。",
    recall_complete_injected: "历史回顾完成，已注入 {count} 条历史数据。",
    missing_vulcan_host_target: "尚未配置 vulcan_host_target，当前已跳过记忆检索与写回。",
    binding_repair_user: "请重新打开 /vmm-setting，并更新当前用户绑定。",
    binding_repair_project: "请重新打开 /vmm-setting，并更新当前项目绑定。",
    binding_repair_both: "请重新打开 /vmm-setting，并同时更新用户与项目绑定。",
    binding_repair_generic: "请检查当前 VMM 配置。",
    language_list_toast: "已读取受支持的 VMM 语言。",
    language_missing: "缺少语言值。请提供受支持的语言代码，或使用 inherit/default 清空当前覆盖值。",
    language_invalid: "不支持的语言值：{value}。请打开 /vmm-setting 选择受支持的语言。",
    language_restart_notice: "需要重启 OpenCode，命令面板中的指令描述才会刷新为新语言。",
    memory_context_handshake_timeout: "记忆检索连接超时，本轮已跳过历史注入。",
    memory_context_receive_timeout: "记忆检索响应超时，本轮已跳过历史注入。",
    memory_context_unavailable: "记忆检索暂时不可用，本轮已跳过历史注入。",
    memory_service_reconnected: "VMM 连接已恢复。",
    memory_sync_outbox_stalled: "记忆系统暂时不可用，本次写回已进入本地顺序队列。",
    memory_sync_outbox_enqueued: "记忆系统提交失败，本次写回已进入本地顺序队列。",
    memory_sync_success: "已经获取完整对话，提交给记忆系统成功。",
    memory_sync_success_with_flush: "已经提交当前记忆，并补交历史排队记录 {count} 条。",
    critical_citation_rules_prompt: `# VMM (Vulcan Memory Mesh) 记忆调用与溯源纪律

在生成回答时，你必须对 VMM 提供的上下文进行严格的溯源。请绝对遵守以下 3 条输出纪律：

## 1. 局部引用 (内容片段包裹)
**条件**：当你的回答只有**部分内容**使用了 VMM 提供的事实、细节或习惯并且**存在**非记忆引用生成的内容时，否则应该使用**全局引用**格式。
**规则**：必须使用 \`⏩VMM🧠\` 和 \`⏪\` 将“完全基于记忆生成的那段文字”包裹起来。
**输出格式标准**：\`⏩VMM🧠这里写具体的记忆内容⏪\`
**示例**：
根据你之前的配置习惯，⏩VMM🧠你倾向于使用 LuaJIT 作为底层⏪。但结合你刚才发来的报错，当前需要先解决宿主机的 GCC 依赖问题。

## 2. 全局引用 (完全复述记忆)
**条件**：如果你的最终回答**完全基于** VMM 提供的历史记忆生成，没有补充任何你的内部知识或新的推演逻辑。
**规则**：绝对不在正文中做任何片段包裹。必须在整篇回答的**最末尾**（独立成行）固定输出全局溯源尾缀。
**格式标准**：
💠VMM🧠本文内容基于记忆内容分析生成💠
**示例**：
这通常是因为系统的端口配置冲突导致的，需要修改代理设置。
💠VMM🧠本文内容基于记忆内容分析生成💠

## 3. 零引用纪律 (最高红线)
**条件**：如果没有使用任何 VMM 记忆，或者 VMM 提供的记忆与当前用户问题**完全无关**。
**规则**：绝对禁止生成任何 \`⏩\`、\`⏪\` 或 \`🧠\` 图标。直接使用自然语言回答即可。`,
    final_check_notice: `## 对于记忆的调用必须严格遵守：VMM (Vulcan Memory Mesh) 记忆调用与溯源纪律`,
  },
} satisfies VmmLanguageCatalog
