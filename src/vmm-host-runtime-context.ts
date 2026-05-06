/**
 * Runtime context normalization for Vulcan host adapters.
 * Vulcan 宿主适配器的运行上下文归一化模块。
 *
 * This file belongs to the adapter contract layer. Native plugins and degraded
 * MCP-compatible adapters use it before calling memory or LuaSkill tools so
 * session-bound features and WorkMem fallback behavior are decided consistently.
 * 这个文件属于适配契约层。
 * 原生插件和降级 MCP 兼容适配器会在调用记忆或 LuaSkill tools 前使用它，
 * 以便一致地判定 session 绑定能力与 WorkMem fallback 行为。
 */

import {
  getVmmHostCapabilityProfile,
  normalizeVmmHostKind,
  type VmmHostCapabilityProfile,
  type VmmHostKind,
} from "./vmm-host-capabilities.js"

/**
 * Source used to derive the effective WorkMem id for one adapter call.
 * 单次适配器调用中有效 WorkMem id 的来源。
 */
export type VmmWorkmemIDSource =
  | "session-id"
  | "provided-workmem-id"
  | "generated-from-workspace"
  | "missing"

/**
 * Raw host runtime context accepted by the adapter contract.
 * 适配契约接收的原始宿主运行上下文。
 */
export type VmmHostRuntimeContextInput = {
  /**
   * Host kind or alias reported by the adapter.
   * 适配器上报的宿主类型或别名。
   */
  hostKind?: string

  /**
   * Native host session id when the host exposes one.
   * 宿主暴露原生会话身份时传入的 session id。
   */
  sessionId?: string

  /**
   * Explicit WorkMem id supplied by a degraded MCP-compatible caller.
   * 降级 MCP 兼容调用方显式提供的 WorkMem id。
   */
  workmemId?: string

  /**
   * Turn id or message id when the host can provide a scoped execution marker.
   * 宿主可以提供限定执行标记时传入的 turn id 或 message id。
   */
  turnId?: string

  /**
   * Workspace path or project key used for deterministic WorkMem fallback.
   * 用于确定性 WorkMem fallback 的工作区路径或项目键。
   */
  workspace?: string

  /**
   * Current user message when a precheck or prompt injection path needs diagnostics.
   * precheck 或提示词注入路径需要诊断时传入的当前用户消息。
   */
  userMessage?: string

  /**
   * Conversation id used by hosts that do not name the value session id.
   * 未把会话标识命名为 session id 的宿主可传入 conversation id。
   */
  conversationId?: string

  /**
   * Root session id used by hosts with forked or nested sessions.
   * 支持 fork 或嵌套会话的宿主可传入 root session id。
   */
  rootSessionId?: string
}

/**
 * Normalized host runtime context consumed by tool wrappers and adapters.
 * tool 包装器和适配器消费的归一化宿主运行上下文。
 */
export type VmmHostRuntimeContext = {
  /**
   * Stable host kind after alias normalization.
   * 别名归一化后的稳定宿主类型。
   */
  hostKind: VmmHostKind

  /**
   * Capability profile for the normalized host kind.
   * 归一化宿主类型对应的能力画像。
   */
  capabilities: VmmHostCapabilityProfile

  /**
   * Native or session-like host id when available.
   * 可用时的原生或类 session 宿主身份。
   */
  sessionId?: string

  /**
   * Effective WorkMem id after explicit, session-derived, or workspace-derived fallback.
   * 经过显式传入、session 派生或 workspace 派生 fallback 后的有效 WorkMem id。
   */
  workmemId?: string

  /**
   * Source used to derive the effective WorkMem id.
   * 有效 WorkMem id 的来源。
   */
  workmemSource: VmmWorkmemIDSource

  /**
   * Whether tools requiring real host session attribution may run.
   * 依赖真实宿主 session 归因的 tools 是否可以运行。
   */
  canUseSessionBoundTools: boolean

  /**
   * Whether tools accepting WorkMem fallback identity may run.
   * 接受 WorkMem fallback 身份的 tools 是否可以运行。
   */
  canUseWorkmemBoundTools: boolean

  /**
   * Normalized turn id when supplied by the host.
   * 宿主提供时的归一化 turn id。
   */
  turnId?: string

  /**
   * Normalized workspace path or project key.
   * 归一化后的工作区路径或项目键。
   */
  workspace?: string

  /**
   * Normalized user message for diagnostics and prompt planning.
   * 用于诊断和提示词规划的归一化用户消息。
   */
  userMessage?: string

  /**
   * Degradation reasons detected while normalizing the context.
   * 上下文归一化过程中检测到的降级原因。
   */
  degradedReasons: string[]
}

/**
 * Normalize optional runtime context text into a trimmed optional string.
 * 把可选运行时上下文文本归一化为裁剪后的可选字符串。
 *
 * @param value Optional text supplied by a host adapter.
 * @param value 宿主适配器传入的可选文本。
 * @returns Trimmed text, or undefined when the value is empty.
 * @returns 裁剪后的文本；当值为空时返回 undefined。
 */
export function normalizeVmmHostRuntimeContextText(value: string | undefined): string | undefined {
  const normalized = (value ?? "").trim()
  return normalized || undefined
}

/**
 * Build one deterministic fallback WorkMem id from host kind and workspace text.
 * 根据宿主类型和工作区文本构建一条确定性的 fallback WorkMem id。
 *
 * @param hostKind Stable host kind.
 * @param hostKind 稳定宿主类型。
 * @param workspace Normalized workspace path or project key.
 * @param workspace 归一化后的工作区路径或项目键。
 * @returns Stable lowercase fallback WorkMem id.
 * @returns 稳定的小写 fallback WorkMem id。
 */
function buildWorkspaceFallbackWorkmemID(hostKind: VmmHostKind, workspace: string): string {
  const normalizedHost = hostKind.replace(/[^a-z0-9_-]/g, "-")
  return `vwm_fallback_${normalizedHost}_${stableTextHash(workspace)}`
}

/**
 * Pick the first non-empty text value from a list of optional candidates.
 * 从一组可选候选值中选出第一条非空文本。
 *
 * @param values Candidate values in priority order.
 * @param values 按优先级排列的候选值。
 * @returns First normalized non-empty value, or undefined when all are empty.
 * @returns 第一条归一化后的非空值；全部为空时返回 undefined。
 */
function firstNormalizedText(...values: Array<string | undefined>): string | undefined {
  for (const value of values) {
    const normalized = normalizeVmmHostRuntimeContextText(value)

    if (normalized) {
      return normalized
    }
  }

  return undefined
}

/**
 * Build a short deterministic hash for non-secret adapter fallback identifiers.
 * 为非敏感适配器 fallback 标识构建一条短确定性哈希。
 *
 * @param text Text to hash.
 * @param text 需要哈希的文本。
 * @returns Eight-character lowercase hexadecimal FNV-1a hash.
 * @returns 八字符小写十六进制 FNV-1a 哈希。
 */
function stableTextHash(text: string): string {
  let hash = 0x811c9dc5

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  return hash.toString(16).padStart(8, "0")
}

/**
 * Normalize raw host context into the shared Vulcan adapter contract.
 * 把原始宿主上下文归一化为共享的 Vulcan 适配契约。
 *
 * @param input Raw context supplied by a native plugin or MCP-compatible wrapper.
 * @param input 原生插件或 MCP 兼容包装器传入的原始上下文。
 * @returns Normalized context with host profile, session state, WorkMem fallback, and degradation reasons.
 * @returns 带有宿主画像、session 状态、WorkMem fallback 和降级原因的归一化上下文。
 */
export function buildVmmHostRuntimeContext(input: VmmHostRuntimeContextInput): VmmHostRuntimeContext {
  const hostKind = normalizeVmmHostKind(input.hostKind)
  const capabilities = getVmmHostCapabilityProfile(hostKind)
  const sessionId = firstNormalizedText(input.sessionId, input.rootSessionId, input.conversationId)
  const explicitWorkmemId = normalizeVmmHostRuntimeContextText(input.workmemId)
  const workspace = normalizeVmmHostRuntimeContextText(input.workspace)
  const turnId = normalizeVmmHostRuntimeContextText(input.turnId)
  const userMessage = normalizeVmmHostRuntimeContextText(input.userMessage)
  const degradedReasons: string[] = []

  let workmemId: string | undefined
  let workmemSource: VmmWorkmemIDSource = "missing"

  /**
   * WorkMem identity resolution intentionally prefers explicit values because
   * degraded MCP callers may not have a native session id but can still provide
   * a stable user-approved task identity.
   * WorkMem 身份解析会有意优先使用显式值，
   * 因为降级 MCP 调用方可能没有原生 session id，但仍可提供稳定且用户认可的任务身份。
   */
  if (explicitWorkmemId) {
    workmemId = explicitWorkmemId
    workmemSource = "provided-workmem-id"
  } else if (sessionId) {
    workmemId = sessionId
    workmemSource = "session-id"
  } else if (workspace) {
    workmemId = buildWorkspaceFallbackWorkmemID(hostKind, workspace)
    workmemSource = "generated-from-workspace"
  }

  if (!sessionId) {
    degradedReasons.push("missing-session-id: session-bound tools must use WorkMem fallback or stay disabled")
  }

  if (!workmemId) {
    degradedReasons.push("missing-workmem-id: WorkMem-compatible tools need an explicit id or workspace fallback")
  }

  if (capabilities.capabilities.sessionIdAccess.level === "none") {
    degradedReasons.push("host-has-no-session-id-access: native memory attribution is unavailable")
  }

  return {
    hostKind,
    capabilities,
    sessionId,
    workmemId,
    workmemSource,
    canUseSessionBoundTools: Boolean(sessionId),
    canUseWorkmemBoundTools: Boolean(workmemId),
    turnId,
    workspace,
    userMessage,
    degradedReasons,
  }
}
