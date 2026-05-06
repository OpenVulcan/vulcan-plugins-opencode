/**
 * Pure endpoint planning helpers for vulcan-host transport selection.
 * vulcan-host 传输选择使用的纯 endpoint plan 辅助模块。
 *
 * This file belongs to the transport-configuration layer. Runtime config,
 * gRPC transport extraction, and TUI status rows use it to agree on the same
 * host-only interpretation without touching any network API.
 * 这个文件属于传输配置层。运行时配置、gRPC 传输提取和 TUI 状态行会复用它，
 * 在不触碰任何网络 API 的前提下，对仅走 vulcan-host 的语义保持一致。
 */

/**
 * Runtime endpoint mode derived from layered VMM transport config.
 * 从分层 VMM 传输配置推导出的运行时 endpoint 模式。
 */
export type VmmEndpointPlanMode =
  | "vulcan-host"
  | "missing"

/**
 * Stable endpoint plan consumed by runtime and TUI layers.
 * 运行时与 TUI 层共同消费的稳定 endpoint plan。
 *
 * `effectiveTarget` is populated only from `vulcan_host_target`. Direct VMM
 * fallback is intentionally not represented in the plugin layer anymore.
 * `effectiveTarget` 只会来自 `vulcan_host_target`。
 * 插件层不再表达 VMM 直连回退语义。
 */
export type VmmEndpointPlan = {
  mode: VmmEndpointPlanMode
  vulcanHostTarget: string
  effectiveTarget: string
  hasVulcanHostTarget: boolean
  missing: boolean
}

/**
 * Input fields used to build one endpoint plan.
 * 构建一份 endpoint plan 所需的输入字段。
 */
export type VmmEndpointPlanInput = {
  vulcanHostTarget?: string
}

/**
 * Normalize one endpoint-like text value without interpreting env placeholders.
 * 归一化一条 endpoint 风格文本，但不解释环境变量占位符。
 *
 * Config loading expands env placeholders before reaching this helper. The TUI
 * also calls it for raw scoped strings, where preserving literal placeholders
 * is useful for display and editing.
 * 配置加载会在进入这个 helper 前完成环境变量展开。
 * TUI 也会用它处理原始作用域字符串，此时保留字面占位符更适合展示和编辑。
 */
export function normalizeEndpointTargetText(value: string | undefined) {
  return (value ?? "").trim()
}

/**
 * Build a host-only endpoint plan from layered target strings.
 * 根据分层 target 字符串构建一份仅走宿主中转的 endpoint plan。
 *
 * The plan is deliberately pure and conservative: it never probes endpoints,
 * and it treats missing `vulcan_host_target` as disabled transport.
 * 这份 plan 刻意保持纯函数和保守策略：
 * 它不会探测端点，并且会把缺失 `vulcan_host_target` 视为传输未启用。
 */
export function buildVmmEndpointPlan(input: VmmEndpointPlanInput): VmmEndpointPlan {
  const vulcanHostTarget = normalizeEndpointTargetText(input.vulcanHostTarget)
  const hasVulcanHostTarget = Boolean(vulcanHostTarget)
  const effectiveTarget = vulcanHostTarget
  const mode: VmmEndpointPlanMode = hasVulcanHostTarget ? "vulcan-host" : "missing"

  return {
    mode,
    vulcanHostTarget,
    effectiveTarget,
    hasVulcanHostTarget,
    missing: !effectiveTarget,
  }
}
