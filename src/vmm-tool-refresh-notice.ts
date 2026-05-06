/**
 * Tool refresh notice builder for host adapter runtime wiring.
 * 宿主适配器运行时接线使用的 tool 刷新提示构建器。
 *
 * This file belongs to the adapter runtime layer. LuaSkill install, uninstall,
 * and update flows can feed tool registry diffs into this module to produce
 * stable model-facing and user-facing guidance about restart or reconnect needs.
 * 这个文件属于适配器运行时层。
 * LuaSkill install、uninstall 与 update 流程可以把 tool 注册表差异输入到该模块，
 * 生成稳定的模型可见与用户可见提示，说明是否需要重启或重连。
 */

import { resolveVmmToolRefreshMode, type VmmHostCapabilityProfile, type VmmToolRefreshMode } from "./vmm-host-capabilities.js"
import { type VmmHostAdapterDescriptor } from "./vmm-host-adapter.js"
import {
  diffVmmToolRegistrySnapshots,
  type VmmToolDescriptorSnapshot,
  type VmmToolRegistryDiff,
  type VmmToolRegistrySnapshot,
} from "./vmm-tool-registry-snapshot.js"

/**
 * Severity used by tool refresh notices.
 * tool 刷新提示使用的严重级别。
 */
export type VmmToolRefreshNoticeSeverity = "none" | "info" | "warning" | "error"

/**
 * Input accepted when building one tool refresh notice directly from snapshots.
 * 直接从快照构建 tool 刷新提示时接收的输入。
 */
export type VmmToolRefreshNoticeInput = {
  /**
   * Previous registry snapshot captured before a tool lifecycle operation.
   * tool 生命周期操作前捕获的旧注册表快照。
   */
  previous: VmmToolRegistrySnapshot

  /**
   * Next registry snapshot captured after a tool lifecycle operation.
   * tool 生命周期操作后捕获的新注册表快照。
   */
  next: VmmToolRegistrySnapshot

  /**
   * Optional host adapter descriptor used to derive display name and refresh mode.
   * 用于推导展示名称与刷新模式的可选宿主适配器描述符。
   */
  adapter?: VmmHostAdapterDescriptor

  /**
   * Optional host capability profile used when no adapter descriptor is available.
   * 没有适配器描述符时使用的可选宿主能力画像。
   */
  hostProfile?: VmmHostCapabilityProfile

  /**
   * Optional host display name for diagnostics.
   * 诊断信息中使用的可选宿主展示名称。
   */
  hostDisplayName?: string

  /**
   * Explicit refresh mode for tests or low-level callers.
   * 测试或低层调用方使用的显式刷新模式。
   */
  refreshMode?: VmmToolRefreshMode
}

/**
 * Structured notice produced after tool registry changes are analyzed.
 * 分析 tool 注册表变化后生成的结构化提示。
 */
export type VmmToolRefreshNotice = {
  /**
   * Whether any tool id or descriptor changed.
   * 是否有任何 tool id 或描述符发生变化。
   */
  changed: boolean

  /**
   * Host display name used in messages.
   * 消息中使用的宿主展示名称。
   */
  hostDisplayName: string

  /**
   * Refresh mode selected for this host.
   * 为该宿主选中的刷新模式。
   */
  refreshMode: VmmToolRefreshMode

  /**
   * Notice severity for UI, logs, and tool results.
   * UI、日志和 tool 结果使用的提示严重级别。
   */
  severity: VmmToolRefreshNoticeSeverity

  /**
   * Whether host restart or reconnect is required.
   * 是否需要宿主重启或重连。
   */
  restartRequired: boolean

  /**
   * Tool ids added by the lifecycle operation.
   * 生命周期操作新增的 tool id。
   */
  addedToolIds: string[]

  /**
   * Tool ids removed by the lifecycle operation.
   * 生命周期操作删除的 tool id。
   */
  removedToolIds: string[]

  /**
   * Tool ids updated by the lifecycle operation.
   * 生命周期操作更新的 tool id。
   */
  updatedToolIds: string[]

  /**
   * All changed tool ids in sorted order.
   * 所有发生变化的 tool id 排序列表。
   */
  changedToolIds: string[]

  /**
   * Original diff summary from the snapshot layer.
   * 快照层生成的原始差异摘要。
   */
  diffSummary: string

  /**
   * Short model-facing instruction that can be returned from a tool call.
   * 可从 tool 调用返回的简短模型可见指令。
   */
  modelMessage: string

  /**
   * User-facing notice suitable for TUI or toast surfaces.
   * 适合 TUI 或 toast 表面的用户可见提示。
   */
  userMessage: string
}

/**
 * Build one refresh notice directly from previous and next snapshots.
 * 直接从旧快照和新快照构建一条刷新提示。
 *
 * @param input Snapshot and host context used for notice construction.
 * @param input 构建提示使用的快照与宿主上下文。
 * @returns Structured refresh notice.
 * @returns 结构化刷新提示。
 */
export function buildVmmToolRefreshNotice(input: VmmToolRefreshNoticeInput): VmmToolRefreshNotice {
  const refreshMode = resolveNoticeRefreshMode(input)
  const derivedHostProfile = input.refreshMode ? undefined : input.adapter?.profile ?? input.hostProfile
  const diff = diffVmmToolRegistrySnapshots(input.previous, input.next, {
    dynamicToolRefreshSupported: refreshMode === "dynamic",
    hostProfile: derivedHostProfile,
    hostRestartRequired: refreshMode === "restart-required",
  })

  return buildVmmToolRefreshNoticeFromDiff(diff, {
    hostDisplayName: input.hostDisplayName ?? input.adapter?.profile.displayName ?? input.hostProfile?.displayName,
    refreshMode,
  })
}

/**
 * Build one refresh notice from an already computed tool registry diff.
 * 从已经计算好的 tool 注册表差异构建一条刷新提示。
 *
 * @param diff Tool registry diff from the snapshot layer.
 * @param diff 快照层生成的 tool 注册表差异。
 * @param options Optional host display and refresh context.
 * @param options 可选的宿主展示与刷新上下文。
 * @returns Structured refresh notice.
 * @returns 结构化刷新提示。
 */
export function buildVmmToolRefreshNoticeFromDiff(
  diff: VmmToolRegistryDiff,
  options: {
    /**
     * Host display name used in messages.
     * 消息中使用的宿主展示名称。
     */
    hostDisplayName?: string

    /**
     * Refresh mode selected for this host.
     * 为该宿主选中的刷新模式。
     */
    refreshMode?: VmmToolRefreshMode
  } = {},
): VmmToolRefreshNotice {
  const hostDisplayName = options.hostDisplayName ?? "Current host"
  const refreshMode = options.refreshMode ?? (diff.restartRequired ? "restart-required" : "dynamic")
  const changed = diff.changedToolIds.length > 0
  const severity = resolveNoticeSeverity(changed, refreshMode)
  const restartRequired = changed && refreshMode === "restart-required"

  return {
    changed,
    hostDisplayName,
    refreshMode,
    severity,
    restartRequired,
    addedToolIds: toolIds(diff.added),
    removedToolIds: toolIds(diff.removed),
    updatedToolIds: toolIds(diff.updated),
    changedToolIds: diff.changedToolIds,
    diffSummary: diff.summary,
    modelMessage: buildModelRefreshMessage(hostDisplayName, changed, refreshMode, diff.changedToolIds),
    userMessage: buildUserRefreshMessage(hostDisplayName, changed, refreshMode, diff.changedToolIds),
  }
}

/**
 * Resolve the refresh mode from explicit input, adapter descriptor, or profile.
 * 从显式输入、适配器描述符或能力画像中解析刷新模式。
 *
 * @param input Notice input carrying optional host context.
 * @param input 携带可选宿主上下文的提示输入。
 * @returns Refresh mode selected for the notice.
 * @returns 为提示选中的刷新模式。
 */
function resolveNoticeRefreshMode(input: VmmToolRefreshNoticeInput): VmmToolRefreshMode {
  if (input.refreshMode) {
    return input.refreshMode
  }

  if (input.adapter) {
    return input.adapter.refreshMode
  }

  if (input.hostProfile) {
    return resolveVmmToolRefreshMode(input.hostProfile)
  }

  return "restart-required"
}

/**
 * Resolve notice severity from change state and refresh mode.
 * 根据变化状态和刷新模式解析提示严重级别。
 *
 * @param changed Whether any tool changed.
 * @param changed 是否有任何 tool 发生变化。
 * @param refreshMode Refresh mode selected for the host.
 * @param refreshMode 为宿主选中的刷新模式。
 * @returns Notice severity.
 * @returns 提示严重级别。
 */
function resolveNoticeSeverity(changed: boolean, refreshMode: VmmToolRefreshMode): VmmToolRefreshNoticeSeverity {
  if (!changed) {
    return "none"
  }

  if (refreshMode === "dynamic") {
    return "info"
  }

  if (refreshMode === "restart-required") {
    return "warning"
  }

  return "error"
}

/**
 * Extract stable ids from one tool descriptor bucket.
 * 从一个 tool 描述符分组中提取稳定 id。
 *
 * @param tools Tool descriptor bucket from a diff.
 * @param tools 差异结果中的 tool 描述符分组。
 * @returns Sorted tool ids.
 * @returns 排序后的 tool id。
 */
function toolIds(tools: readonly VmmToolDescriptorSnapshot[]): string[] {
  return tools.map((tool) => tool.id).sort()
}

/**
 * Build a model-facing refresh message.
 * 构建模型可见的刷新提示消息。
 *
 * @param hostDisplayName Host display name used in the message.
 * @param hostDisplayName 消息中使用的宿主展示名称。
 * @param changed Whether any tool changed.
 * @param changed 是否有任何 tool 发生变化。
 * @param refreshMode Refresh mode selected for the host.
 * @param refreshMode 为宿主选中的刷新模式。
 * @param changedToolIds Changed tool ids in sorted order.
 * @param changedToolIds 排序后的变更 tool id。
 * @returns Model-facing message.
 * @returns 模型可见消息。
 */
function buildModelRefreshMessage(
  hostDisplayName: string,
  changed: boolean,
  refreshMode: VmmToolRefreshMode,
  changedToolIds: readonly string[],
): string {
  if (!changed) {
    return "Tool registry unchanged. Continue using the existing tool surface."
  }

  const ids = changedToolIds.join(", ")

  if (refreshMode === "dynamic") {
    return `Tool registry changed for ${hostDisplayName}, and dynamic refresh is supported. Changed tools: ${ids}.`
  }

  if (refreshMode === "restart-required") {
    return `Tool registry changed for ${hostDisplayName}. Restart or reconnect the host before relying on these changed tools: ${ids}.`
  }

  return `Tool registry changed for ${hostDisplayName}, but this host has no safe refresh path. Changed tools: ${ids}.`
}

/**
 * Build a user-facing refresh message.
 * 构建用户可见的刷新提示消息。
 *
 * @param hostDisplayName Host display name used in the message.
 * @param hostDisplayName 消息中使用的宿主展示名称。
 * @param changed Whether any tool changed.
 * @param changed 是否有任何 tool 发生变化。
 * @param refreshMode Refresh mode selected for the host.
 * @param refreshMode 为宿主选中的刷新模式。
 * @param changedToolIds Changed tool ids in sorted order.
 * @param changedToolIds 排序后的变更 tool id。
 * @returns User-facing message.
 * @returns 用户可见消息。
 */
function buildUserRefreshMessage(
  hostDisplayName: string,
  changed: boolean,
  refreshMode: VmmToolRefreshMode,
  changedToolIds: readonly string[],
): string {
  if (!changed) {
    return "工具注册表没有变化，无需重启宿主。"
  }

  const ids = changedToolIds.join(", ")

  if (refreshMode === "dynamic") {
    return `${hostDisplayName} 已支持动态刷新，本次 tool 变化可以继续使用。变化项：${ids}。`
  }

  if (refreshMode === "restart-required") {
    return `${hostDisplayName} 的 tool 表面已变化，请重启或重新连接宿主后再依赖这些 tool：${ids}。`
  }

  return `${hostDisplayName} 的 tool 表面已变化，但当前没有安全刷新路径。变化项：${ids}。`
}
