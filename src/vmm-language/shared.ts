/**
 * Shared VMM language catalog types.
 * VMM 语言目录共享类型定义。
 *
 * This file belongs to the language-data foundation layer. It defines the
 * stable type surface shared by the language registry, per-language catalog
 * files, and the public language helper entry.
 * 这个文件属于语言数据基础层，负责定义语言注册表、各语言目录文件以及
 * 对外语言辅助入口共同依赖的稳定类型面。
 */

/**
 * Supported VMM UI language codes in the first multilingual release.
 * 第一版多语言能力支持的 VMM 界面语言代码集合。
 *
 * The plugin keeps the union explicit so config parsing, TUI rendering, and
 * runtime toast rendering all share the same stable language surface.
 * 这里把语言联合类型显式列出来，
 * 是为了让配置解析、TUI 渲染和运行时 toast 渲染共享同一套稳定语言面。
 */
export type VmmLanguage = "en" | "zh-CN" | "es" | "fr" | "de" | "ja" | "ko"

/**
 * One language option shown to users in list/scope style feedback.
 * 用于 list/scope 类反馈里展示的单条语言选项结构。
 */
export type VmmLanguageOption = {
  code: VmmLanguage
  englishName: string
  nativeName: string
  aliases: string[]
}

/**
 * Shared text keys consumed by runtime prompts and VMM UI helpers.
 * 运行时提示与 VMM 界面辅助模块消费的共享文案键集合。
 *
 * These keys stay centralized so every language file must implement the same
 * surface, which helps the registry catch missing translations at compile time.
 * 这些键集中定义在这里，是为了让每个语言文件都实现同一套表面，
 * 从而在编译期就能发现缺失翻译。
 */
export type VmmSharedTextKey =
  | "scope_global"
  | "scope_local"
  | "scope_default_english"
  | "visible_memory_title"
  | "visible_memory_intro"
  | "visible_memory_current_input"
  | "implicit_memory_inject_notice"
  | "recall_in_progress"
  | "recall_complete_empty"
  | "recall_complete_injected"
  | "missing_vulcan_host_target"
  | "binding_repair_user"
  | "binding_repair_project"
  | "binding_repair_both"
  | "binding_repair_generic"
  | "language_list_toast"
  | "language_missing"
  | "language_invalid"
  | "language_restart_notice"
  | "memory_context_handshake_timeout"
  | "memory_context_receive_timeout"
  | "memory_context_unavailable"
  | "memory_service_reconnected"
  | "memory_sync_outbox_stalled"
  | "memory_sync_outbox_enqueued"
  | "memory_sync_success"
  | "memory_sync_success_with_flush"
  | "critical_citation_rules_prompt"
  | "final_check_notice"

/**
 * Full language catalog entry consumed by the unified VMM registry.
 * 统一 VMM 语言注册表消费的完整语言目录项。
 */
export type VmmLanguageCatalog = {
  option: VmmLanguageOption
  sharedText: Record<VmmSharedTextKey, string>
}
