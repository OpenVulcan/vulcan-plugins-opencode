/**
 * Host adapter registry and runtime wiring helpers.
 * 宿主适配器注册表与运行时接线辅助模块。
 *
 * This file belongs to the adapter runtime layer. It wraps the lower-level
 * capability matrix into adapter descriptors that current OpenCode tools and
 * future generic MCP/LuaSkill wrappers can consume without knowing every host
 * capability detail directly.
 * 这个文件属于适配器运行时层。
 * 它会把更底层的能力矩阵包装成适配器描述符，让当前 OpenCode tools 以及未来
 * generic MCP/LuaSkill 包装器无需直接理解每个宿主能力细节也能复用。
 */

import {
  getVmmHostCapabilityProfile,
  normalizeVmmHostKind,
  resolveVmmToolRefreshMode,
  type VmmHostCapabilityProfile,
  type VmmHostKind,
  type VmmToolRefreshMode,
} from "./vmm-host-capabilities.js"
import {
  buildVmmHostRuntimeContext,
  type VmmHostRuntimeContext,
  type VmmHostRuntimeContextInput,
} from "./vmm-host-runtime-context.js"

/**
 * Runtime integration mode used by one host adapter.
 * 单个宿主适配器使用的运行时集成模式。
 */
export type VmmHostAdapterMode = "native-plugin" | "mcp-compatible" | "hybrid" | "unknown"

/**
 * Identity strategy used by tools that need memory attribution.
 * 需要记忆归因的 tools 所使用的身份策略。
 */
export type VmmHostAdapterIdentityMode = "native-session" | "session-or-workmem" | "workmem-only"

/**
 * Stable adapter descriptor consumed by runtime wiring and diagnostics.
 * 运行时接线与诊断消费的稳定适配器描述符。
 */
export type VmmHostAdapterDescriptor = {
  /**
   * Stable adapter id used in logs and future relay payloads.
   * 日志和未来 relay 载荷中使用的稳定适配器 id。
   */
  adapterId: VmmHostKind

  /**
   * Host kind served by this adapter.
   * 该适配器服务的宿主类型。
   */
  hostKind: VmmHostKind

  /**
   * Human-readable adapter name.
   * 人类可读的适配器名称。
   */
  displayName: string

  /**
   * Runtime integration mode for this host.
   * 该宿主的运行时集成模式。
   */
  mode: VmmHostAdapterMode

  /**
   * Identity strategy for memory and WorkMem-aware tools.
   * 记忆和 WorkMem-aware tools 使用的身份策略。
   */
  identityMode: VmmHostAdapterIdentityMode

  /**
   * Host capability profile backing this adapter descriptor.
   * 支撑该适配器描述符的宿主能力画像。
   */
  profile: VmmHostCapabilityProfile

  /**
   * Safest known tool refresh mode for this host.
   * 该宿主已知最安全的 tool 刷新模式。
   */
  refreshMode: VmmToolRefreshMode

  /**
   * Whether real session-bound memory writes are supported in principle.
   * 原则上是否支持真实 session 绑定的记忆写入。
   */
  supportsSessionBoundMemoryWrite: boolean

  /**
   * Whether WorkMem fallback is available for degraded tool paths.
   * 降级 tool 路径是否可使用 WorkMem fallback。
   */
  supportsWorkmemFallback: boolean

  /**
   * Adapter notes used by diagnostics and planning surfaces.
   * 诊断和规划界面使用的适配器说明。
   */
  notes: string[]
}

/**
 * Runtime input accepted by host adapter wiring.
 * 宿主适配器接线接收的运行时输入。
 */
export type VmmHostAdapterRuntimeInput = VmmHostRuntimeContextInput & {
  /**
   * Optional host alias that overrides `hostKind` when supplied by caller-specific config.
   * 调用方特定配置提供时用于覆盖 `hostKind` 的可选宿主别名。
   */
  adapterHostKind?: string
}

/**
 * Runtime object returned after binding one adapter descriptor to one host context.
 * 把一个适配器描述符绑定到一份宿主上下文后返回的运行时对象。
 */
export type VmmHostAdapterRuntime = {
  /**
   * Adapter descriptor selected for this call.
   * 本次调用选中的适配器描述符。
   */
  descriptor: VmmHostAdapterDescriptor

  /**
   * Normalized host runtime context for this call.
   * 本次调用的归一化宿主运行上下文。
   */
  context: VmmHostRuntimeContext

  /**
   * Whether the selected identity strategy has enough data to run.
   * 选中的身份策略是否已有足够数据可运行。
   */
  identityReady: boolean

  /**
   * Degradation reasons from both context normalization and adapter strategy checks.
   * 来自上下文归一化与适配器策略检查的降级原因。
   */
  degradedReasons: string[]
}

/**
 * Static host mode overrides that cannot be inferred from capability levels alone.
 * 无法仅从能力等级推导出来的静态宿主模式覆盖表。
 */
const VMM_HOST_ADAPTER_MODES: Record<VmmHostKind, VmmHostAdapterMode> = {
  "claude-code": "hybrid",
  "generic-mcp": "mcp-compatible",
  "hermes-agent": "hybrid",
  openclaw: "hybrid",
  opencode: "native-plugin",
  "qwen-code": "hybrid",
  unknown: "unknown",
}

/**
 * Resolve the identity strategy for one host capability profile.
 * 为一个宿主能力画像解析身份策略。
 *
 * @param profile Host capability profile to inspect.
 * @param profile 要检查的宿主能力画像。
 * @returns Identity mode used by memory-aware tools.
 * @returns memory-aware tools 使用的身份模式。
 */
function resolveVmmHostAdapterIdentityMode(profile: VmmHostCapabilityProfile): VmmHostAdapterIdentityMode {
  const sessionLevel = profile.capabilities.sessionIdAccess.level

  if (sessionLevel === "full") {
    return "native-session"
  }

  if (sessionLevel === "limited") {
    return "session-or-workmem"
  }

  return "workmem-only"
}

/**
 * Build one adapter descriptor from a host kind or alias.
 * 从宿主类型或别名构建一个适配器描述符。
 *
 * @param hostKind Host kind or alias to resolve.
 * @param hostKind 需要解析的宿主类型或别名。
 * @returns Adapter descriptor with profile, refresh mode, and identity strategy.
 * @returns 带有画像、刷新模式和身份策略的适配器描述符。
 */
export function getVmmHostAdapterDescriptor(hostKind: VmmHostKind | string): VmmHostAdapterDescriptor {
  const normalizedHostKind = normalizeVmmHostKind(hostKind)
  const profile = getVmmHostCapabilityProfile(normalizedHostKind)
  const identityMode = resolveVmmHostAdapterIdentityMode(profile)

  return {
    adapterId: normalizedHostKind,
    hostKind: normalizedHostKind,
    displayName: `${profile.displayName} Adapter`,
    mode: VMM_HOST_ADAPTER_MODES[normalizedHostKind],
    identityMode,
    profile,
    refreshMode: resolveVmmToolRefreshMode(profile),
    supportsSessionBoundMemoryWrite: profile.capabilities.sessionIdAccess.level !== "none",
    supportsWorkmemFallback: profile.capabilities.workmemIdFallback.level !== "none",
    notes: profile.notes,
  }
}

/**
 * List all built-in host adapter descriptors in stable host order.
 * 按稳定宿主顺序列出所有内置宿主适配器描述符。
 *
 * @returns Built-in adapter descriptors.
 * @returns 内置适配器描述符列表。
 */
export function listVmmHostAdapterDescriptors(): VmmHostAdapterDescriptor[] {
  return [
    getVmmHostAdapterDescriptor("opencode"),
    getVmmHostAdapterDescriptor("openclaw"),
    getVmmHostAdapterDescriptor("claude-code"),
    getVmmHostAdapterDescriptor("qwen-code"),
    getVmmHostAdapterDescriptor("hermes-agent"),
    getVmmHostAdapterDescriptor("generic-mcp"),
    getVmmHostAdapterDescriptor("unknown"),
  ]
}

/**
 * Build one runtime adapter binding for a host context.
 * 为一份宿主上下文构建一个运行时适配器绑定。
 *
 * @param input Raw runtime input from a plugin or MCP-compatible wrapper.
 * @param input 来自插件或 MCP 兼容包装器的原始运行时输入。
 * @returns Adapter runtime with descriptor, normalized context, and readiness flags.
 * @returns 带有描述符、归一化上下文和就绪标记的适配器运行时。
 */
export function buildVmmHostAdapterRuntime(input: VmmHostAdapterRuntimeInput): VmmHostAdapterRuntime {
  const hostKind = normalizeVmmHostKind(input.adapterHostKind ?? input.hostKind)
  const descriptor = getVmmHostAdapterDescriptor(hostKind)
  const context = buildVmmHostRuntimeContext({
    ...input,
    hostKind,
  })
  const adapterReasons = resolveAdapterIdentityDegradationReasons(descriptor, context)
  const degradedReasons = [...new Set([...context.degradedReasons, ...adapterReasons])]

  return {
    descriptor,
    context,
    identityReady: adapterReasons.length === 0,
    degradedReasons,
  }
}

/**
 * Build the default OpenCode adapter runtime for current plugin calls.
 * 为当前插件调用构建默认 OpenCode 适配器运行时。
 *
 * @param input Runtime context without requiring callers to repeat the host kind.
 * @param input 不要求调用方重复填写宿主类型的运行时上下文。
 * @returns OpenCode adapter runtime binding.
 * @returns OpenCode 适配器运行时绑定。
 */
export function buildOpenCodeHostAdapterRuntime(
  input: Omit<VmmHostAdapterRuntimeInput, "hostKind" | "adapterHostKind">,
): VmmHostAdapterRuntime {
  return buildVmmHostAdapterRuntime({
    ...input,
    hostKind: "opencode",
  })
}

/**
 * Build a generic MCP adapter runtime for degraded hosts.
 * 为降级宿主构建 generic MCP 适配器运行时。
 *
 * @param input Runtime context without requiring callers to repeat the host kind.
 * @param input 不要求调用方重复填写宿主类型的运行时上下文。
 * @returns Generic MCP adapter runtime binding.
 * @returns generic MCP 适配器运行时绑定。
 */
export function buildGenericMcpHostAdapterRuntime(
  input: Omit<VmmHostAdapterRuntimeInput, "hostKind" | "adapterHostKind">,
): VmmHostAdapterRuntime {
  return buildVmmHostAdapterRuntime({
    ...input,
    hostKind: "generic-mcp",
  })
}

/**
 * Resolve adapter-level identity degradation reasons.
 * 解析适配器层面的身份降级原因。
 *
 * @param descriptor Adapter descriptor selected for this call.
 * @param descriptor 本次调用选中的适配器描述符。
 * @param context Normalized host context for this call.
 * @param context 本次调用的归一化宿主上下文。
 * @returns Adapter-level degradation reason list.
 * @returns 适配器层面的降级原因列表。
 */
function resolveAdapterIdentityDegradationReasons(
  descriptor: VmmHostAdapterDescriptor,
  context: VmmHostRuntimeContext,
): string[] {
  if (descriptor.identityMode === "native-session" && !context.canUseSessionBoundTools) {
    return ["adapter-requires-native-session: this host path needs a real session id for full memory attribution"]
  }

  if (descriptor.identityMode === "session-or-workmem" && !context.canUseSessionBoundTools && !context.canUseWorkmemBoundTools) {
    return ["adapter-requires-session-or-workmem: provide a session id, workmem id, or workspace fallback"]
  }

  if (descriptor.identityMode === "workmem-only" && !context.canUseWorkmemBoundTools) {
    return ["adapter-requires-workmem: this degraded host path needs an explicit or generated workmem id"]
  }

  return []
}
