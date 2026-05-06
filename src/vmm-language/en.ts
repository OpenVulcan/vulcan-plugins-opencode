/**
 * English VMM shared language catalog.
 * 英语 VMM 共享语言目录。
 *
 * This file belongs to the language-data layer. It stores the English copy
 * used by runtime toasts, config flows, and hidden citation-rule prompts.
 * 这个文件属于语言数据层，承载运行时 toast、配置流程与隐藏引用规则提示词
 * 所使用的英语文案目录。
 */

import type { VmmLanguageCatalog } from "./shared.js"

/**
 * English catalog entry registered by the unified VMM language registry.
 * 统一 VMM 语言注册表登记的英语目录项。
 */
export const VMM_LANGUAGE_CATALOG_EN = {
  option: {
    code: "en",
    englishName: "English",
    nativeName: "English",
    aliases: ["en", "english"],
  },
  sharedText: {
    scope_global: "Global",
    scope_local: "Current project",
    scope_default_english: "Default English",
    visible_memory_title: "> **VulcanMemoryMesh Retrieved Memory**",
    visible_memory_intro:
      "> The following lines were retrieved from memory and should be treated as prior context unless the user clearly contradicts them.",
    visible_memory_current_input: "> **Current user input:**",
    implicit_memory_inject_notice:
      "##Notice: The following items were inferred from historical data analysis. Treat them as reference only, not guaranteed facts. When a TURN_ID is present, use the tools to inspect the original dialogue.",
    recall_in_progress: "Reviewing retrieved history...",
    recall_complete_empty: "No history review needed.",
    recall_complete_injected: "History review finished. Injected {count} memory items.",
    missing_vulcan_host_target:
      "vulcan_host_target is not configured yet. Retrieval and writeback are currently skipped.",
    binding_repair_user: "Please reopen /vmm-setting and update the current user binding.",
    binding_repair_project: "Please reopen /vmm-setting and update the current project binding.",
    binding_repair_both: "Please reopen /vmm-setting and update both user and project bindings.",
    binding_repair_generic: "Please review the current VMM configuration.",
    language_list_toast: "Loaded supported VMM languages.",
    language_missing:
      "Missing language value. Use a supported language code, or use inherit/default to clear the current override.",
    language_invalid: "Unsupported language value: {value}. Open /vmm-setting to choose a supported language.",
    language_restart_notice: "Restart OpenCode to refresh command descriptions in the command palette.",
    memory_context_handshake_timeout: "Memory retrieval connection timed out. History injection was skipped for this turn.",
    memory_context_receive_timeout: "Memory retrieval response timed out. History injection was skipped for this turn.",
    memory_context_unavailable: "Memory retrieval is temporarily unavailable. History injection was skipped for this turn.",
    memory_service_reconnected: "VMM connection restored successfully.",
    memory_sync_outbox_stalled: "The memory service is temporarily unavailable. This writeback was queued locally in order.",
    memory_sync_outbox_enqueued: "Submitting to the memory service failed. This writeback was queued locally in order.",
    memory_sync_success: "The full conversation was submitted to the memory service successfully.",
    memory_sync_success_with_flush: "Submitted the current memory and replayed {count} queued writebacks.",
    critical_citation_rules_prompt: `# VMM (Vulcan Memory Mesh) Memory Usage and Traceability Discipline

When generating a response, you must strictly trace any context provided by VMM. You must obey the following 3 output disciplines without exception:

## 1. Local Citation (content fragment wrapping)
**Condition**: Only **part** of your answer uses facts, details, or habits provided by VMM, and the same answer also contains content that is not generated from memory-based citation. Otherwise, you should use the **Global Citation** format.
**Rule**: You must use \`⏩VMM🧠\` and \`⏪\` to wrap the exact fragment that is fully generated from memory.
**Format standard**: \`⏩VMM🧠Put the specific memory-based content here⏪\`
**Example**:
Based on your earlier configuration habits, ⏩VMM🧠you tend to use LuaJIT as the underlying runtime⏪. But combined with the error you just sent, the current priority is to fix the host GCC dependency first.

## 2. Global Citation (fully restating memory)
**Condition**: Your final answer is generated **entirely from** historical memory provided by VMM, without adding any internal knowledge or new reasoning.
**Rule**: Do not add any fragment wrapping in the main body. You must output a fixed global traceability suffix at the **very end** of the entire answer, on its own line.
**Format standard**:
💠VMM🧠This response is generated based on memory-derived analysis💠
**Example**:
This is usually caused by a port configuration conflict, and the proxy settings need to be updated.
💠VMM🧠This response is generated based on memory-derived analysis💠

## 3. Zero-Citation Discipline (highest-priority red line)
**Condition**: You did not use any VMM memory at all, or the memory provided by VMM is **completely irrelevant** to the user's current question.
**Rule**: Do not generate any \`⏩\`, \`⏪\`, or \`🧠\` icon. Reply in natural language only.`,
    final_check_notice: `## You must strictly comply with: VMM (Vulcan Memory Mesh) Memory Usage and Traceability Discipline`,
  },
} satisfies VmmLanguageCatalog
