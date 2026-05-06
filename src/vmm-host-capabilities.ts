/**
 * Host capability matrix for Vulcan plugin adapters.
 * Vulcan 插件适配器的宿主能力矩阵。
 *
 * This file belongs to the adapter contract layer. Runtime adapters use it to
 * decide whether a host can provide native plugins, MCP tools, scoped prompt
 * injection, session identity, tool lifecycle hooks, or only a degraded MCP path.
 * 这个文件属于适配契约层。
 * 运行时适配器会用它判断宿主是否能提供原生插件、MCP tools、限定回合提示词注入、
 * 会话身份、工具生命周期 hook，或者只能走降级 MCP 路径。
 */

/**
 * Stable host identifiers used by Vulcan adapter planning.
 * Vulcan 适配规划使用的稳定宿主标识。
 */
export type VmmHostKind =
  | "opencode"
  | "openclaw"
  | "claude-code"
  | "qwen-code"
  | "hermes-agent"
  | "generic-mcp"
  | "unknown"

/**
 * Capability support strength for one host feature.
 * 单项宿主能力的支持强度。
 */
export type VmmHostCapabilityLevel = "full" | "limited" | "none"

/**
 * Evidence category used to explain why a capability is marked as supported or degraded.
 * 用于解释某项能力为何被标记为支持或降级的证据类别。
 */
export type VmmHostCapabilityEvidence =
  | "current-plugin"
  | "source-analysis"
  | "official-docs"
  | "assumption"
  | "fallback"

/**
 * One host capability tracked by the adapter contract.
 * 适配契约跟踪的一项宿主能力。
 */
export type VmmHostCapabilityName = (typeof VMM_HOST_CAPABILITY_NAMES)[number]

/**
 * Refresh strategy selected after comparing one host profile with tool registry changes.
 * 对比宿主画像与工具注册表变化后选择的刷新策略。
 */
export type VmmToolRefreshMode = "dynamic" | "restart-required" | "unsupported"

/**
 * Support metadata for one capability in one host profile.
 * 某个宿主画像中单项能力的支持元信息。
 */
export type VmmHostCapabilitySupport = {
  /**
   * Support strength used by planner and degradation checks.
   * 供规划器和降级检查使用的支持强度。
   */
  level: VmmHostCapabilityLevel

  /**
   * Human-readable reason explaining the current support decision.
   * 解释当前支持判定的人类可读原因。
   */
  reason: string

  /**
   * Evidence category behind the support decision.
   * 该支持判定背后的证据类别。
   */
  evidence: VmmHostCapabilityEvidence

  /**
   * Whether using this capability normally requires host restart or explicit reload.
   * 使用该能力时通常是否需要宿主重启或显式 reload。
   */
  requiresRestart?: boolean
}

/**
 * One complete capability profile for a supported host family.
 * 一个受支持宿主家族的完整能力画像。
 */
export type VmmHostCapabilityProfile = {
  /**
   * Stable host identifier.
   * 稳定宿主标识。
   */
  hostKind: VmmHostKind

  /**
   * Display name used in diagnostics and planning documents.
   * 诊断与规划文档中使用的展示名称。
   */
  displayName: string

  /**
   * Capability support map keyed by stable capability name.
   * 以稳定能力名为键的能力支持映射。
   */
  capabilities: Record<VmmHostCapabilityName, VmmHostCapabilitySupport>

  /**
   * Additional planning notes that do not fit one single capability.
   * 无法归入单一能力的额外规划说明。
   */
  notes: string[]
}

/**
 * Capability names shared by all host profiles.
 * 所有宿主画像共享的能力名称。
 */
export const VMM_HOST_CAPABILITY_NAMES = [
  "nativePlugin",
  "mcpTools",
  "dynamicToolRefresh",
  "restartRequiredToolRefresh",
  "sessionIdAccess",
  "workmemIdFallback",
  "precheck",
  "postaction",
  "turnScopedPrompt",
  "persistentWorkflowSkills",
  "toolLifecycleHooks",
  "sessionLifecycleHooks",
  "compactLifecycleHooks",
] as const

/**
 * Alias table used to normalize host names from configuration or diagnostics.
 * 用于归一化配置或诊断中宿主名称的别名表。
 */
const VMM_HOST_KIND_ALIASES: Record<string, VmmHostKind> = {
  claude: "claude-code",
  "claude_code": "claude-code",
  "claude-code": "claude-code",
  claudecode: "claude-code",
  generic: "generic-mcp",
  "generic-mcp": "generic-mcp",
  hermes: "hermes-agent",
  "hermes-agent": "hermes-agent",
  hermes_agent: "hermes-agent",
  hermesagent: "hermes-agent",
  mcp: "generic-mcp",
  open_claw: "openclaw",
  "open-claw": "openclaw",
  openclaw: "openclaw",
  open_code: "opencode",
  "open-code": "opencode",
  opencode: "opencode",
  qwen: "qwen-code",
  "qwen-code": "qwen-code",
  qwen_code: "qwen-code",
  qwencode: "qwen-code",
  unknown: "unknown",
}

/**
 * Build one capability support object with consistent optional restart metadata.
 * 使用一致的可选重启元信息构建一项能力支持对象。
 */
function capability(
  level: VmmHostCapabilityLevel,
  reason: string,
  evidence: VmmHostCapabilityEvidence,
  requiresRestart?: boolean,
): VmmHostCapabilitySupport {
  return {
    level,
    reason,
    evidence,
    ...(requiresRestart === undefined ? {} : { requiresRestart }),
  }
}

/**
 * Build one full capability map while defaulting unspecified entries to unsupported.
 * 构建完整能力映射，并把未显式声明的能力默认标记为不支持。
 */
function defineCapabilities(
  overrides: Partial<Record<VmmHostCapabilityName, VmmHostCapabilitySupport>>,
): Record<VmmHostCapabilityName, VmmHostCapabilitySupport> {
  const base = Object.fromEntries(
    VMM_HOST_CAPABILITY_NAMES.map((name) => [
      name,
      capability("none", "No host-level evidence for this capability yet.", "assumption"),
    ]),
  ) as Record<VmmHostCapabilityName, VmmHostCapabilitySupport>

  return {
    ...base,
    ...overrides,
  }
}

/**
 * Capability profiles derived from the current plugin and source/documentation analysis.
 * 从当前插件实现、源码分析和官方文档分析沉淀出的能力画像。
 */
const VMM_HOST_CAPABILITY_PROFILES: Record<VmmHostKind, VmmHostCapabilityProfile> = {
  opencode: {
    hostKind: "opencode",
    displayName: "OpenCode",
    capabilities: defineCapabilities({
      compactLifecycleHooks: capability(
        "full",
        "Current plugin uses the experimental compacting hook path.",
        "current-plugin",
      ),
      dynamicToolRefresh: capability(
        "none",
        "OpenCode tools are registered from the plugin surface and should be treated as restart-bound after tool ids change.",
        "current-plugin",
      ),
      mcpTools: capability("full", "OpenCode can consume MCP tools outside this native plugin.", "source-analysis"),
      nativePlugin: capability("full", "The current repository is an OpenCode native plugin.", "current-plugin"),
      persistentWorkflowSkills: capability(
        "limited",
        "Workflow prompts can be represented by plugin-managed prompts, but they are not the same as a durable built-in skill registry.",
        "current-plugin",
      ),
      postaction: capability(
        "full",
        "The current plugin owns after-tool and message-finalization paths for memory post-processing.",
        "current-plugin",
      ),
      precheck: capability(
        "full",
        "The current plugin can transform chat messages before model execution.",
        "current-plugin",
      ),
      restartRequiredToolRefresh: capability(
        "full",
        "Install, uninstall, and update can change tool ids; the safe OpenCode path is to restart the host.",
        "current-plugin",
        true,
      ),
      sessionIdAccess: capability(
        "full",
        "OpenCode plugin contexts expose the active session id used by the current memory tools.",
        "current-plugin",
      ),
      sessionLifecycleHooks: capability(
        "full",
        "The current plugin receives session lifecycle events.",
        "current-plugin",
      ),
      toolLifecycleHooks: capability(
        "full",
        "The current plugin registers before-tool and after-tool hooks.",
        "current-plugin",
      ),
      turnScopedPrompt: capability(
        "full",
        "The current message transform path can inject turn-scoped prompt material.",
        "current-plugin",
      ),
      workmemIdFallback: capability(
        "full",
        "When a host session is not available, WorkMem can use an explicit or generated workmem id.",
        "fallback",
      ),
    }),
    notes: [
      "Treat OpenCode as the highest-fidelity native adapter today.",
      "Tool id changes should produce a host restart notice rather than pretending the prompt/tool surface updated live.",
    ],
  },
  openclaw: {
    hostKind: "openclaw",
    displayName: "OpenClaw",
    capabilities: defineCapabilities({
      compactLifecycleHooks: capability(
        "limited",
        "OpenClaw has rich internal hooks, but compact-specific parity still needs adapter proof.",
        "source-analysis",
      ),
      dynamicToolRefresh: capability(
        "limited",
        "Source paths suggest control-plane and tool-surface refresh points, but the Vulcan adapter must own reconciliation.",
        "source-analysis",
      ),
      mcpTools: capability("full", "OpenClaw exposes MCP-oriented integration paths.", "source-analysis"),
      nativePlugin: capability(
        "full",
        "OpenClaw has plugin and internal hook installation paths that can host a native adapter.",
        "source-analysis",
      ),
      persistentWorkflowSkills: capability(
        "limited",
        "Workflow prompts can be mapped through hook/message paths, but a durable skill registry needs adapter work.",
        "source-analysis",
      ),
      postaction: capability(
        "limited",
        "Message and tool hook paths exist, but multi-stage turn merge semantics need adapter validation.",
        "source-analysis",
      ),
      precheck: capability(
        "limited",
        "Message preprocessing hooks can support precheck-like behavior, subject to exact turn timing.",
        "source-analysis",
      ),
      restartRequiredToolRefresh: capability(
        "limited",
        "Restart or explicit adapter reload remains the conservative fallback when dynamic refresh cannot be proven.",
        "source-analysis",
        true,
      ),
      sessionIdAccess: capability(
        "full",
        "OpenClaw source exposes session keys and control-plane session operations.",
        "source-analysis",
      ),
      sessionLifecycleHooks: capability(
        "full",
        "OpenClaw internal hooks include session-level events.",
        "source-analysis",
      ),
      toolLifecycleHooks: capability(
        "limited",
        "Tool events are visible, but exact pre/post blocking and result mutation semantics require adapter checks.",
        "source-analysis",
      ),
      turnScopedPrompt: capability(
        "limited",
        "Message preprocessing can inject prompt content, but exact one-turn scoping must be enforced by the adapter.",
        "source-analysis",
      ),
      workmemIdFallback: capability(
        "full",
        "WorkMem can degrade to explicit workmem ids when host session wiring is incomplete.",
        "fallback",
      ),
    }),
    notes: [
      "OpenClaw is the best next native-adapter candidate, but turn boundaries must be validated before marking full fidelity.",
      "Use vulcan-host as the gRPC relay even when OpenClaw can also reach VMM directly.",
    ],
  },
  "claude-code": {
    hostKind: "claude-code",
    displayName: "Claude Code",
    capabilities: defineCapabilities({
      compactLifecycleHooks: capability(
        "limited",
        "Claude Code documents plugin hooks, but compact parity and per-turn memory timing are not guaranteed.",
        "official-docs",
      ),
      dynamicToolRefresh: capability(
        "limited",
        "The documented /reload-plugins flow can reload plugin content, but live model prompt/tool refresh should not be assumed.",
        "official-docs",
        true,
      ),
      mcpTools: capability("full", "Claude Code plugins can include MCP server configuration.", "official-docs"),
      nativePlugin: capability(
        "limited",
        "Claude Code has plugins, commands, hooks, agents, and skills, but not the same adapter surface as OpenCode.",
        "official-docs",
      ),
      persistentWorkflowSkills: capability(
        "full",
        "Claude Code plugins explicitly document skills as plugin content.",
        "official-docs",
      ),
      postaction: capability(
        "limited",
        "Hooks may support post-action behavior, but exact multi-stage turn merge and memory finalization need proof.",
        "official-docs",
      ),
      precheck: capability(
        "limited",
        "Hooks may support prompt or tool gating, but exact one-turn scoped precheck injection is not proven.",
        "official-docs",
      ),
      restartRequiredToolRefresh: capability(
        "full",
        "Plugin changes should be treated as reload or restart bound unless a live refresh contract is confirmed.",
        "official-docs",
        true,
      ),
      sessionIdAccess: capability(
        "limited",
        "Claude plugin documentation does not guarantee the same session id access required by VMM memory attribution.",
        "official-docs",
      ),
      sessionLifecycleHooks: capability(
        "limited",
        "Documented hooks may expose lifecycle points, but adapter-grade session identity needs validation.",
        "official-docs",
      ),
      toolLifecycleHooks: capability(
        "limited",
        "Documented hooks and MCP tools can support lifecycle interception in some form, but mutation guarantees are unclear.",
        "official-docs",
      ),
      turnScopedPrompt: capability(
        "limited",
        "Skills and slash commands are available, but temporary per-turn injection should be treated as degraded.",
        "official-docs",
      ),
      workmemIdFallback: capability(
        "full",
        "Claude Code can still use explicit WorkMem ids through MCP-compatible tools when session binding is missing.",
        "fallback",
      ),
    }),
    notes: [
      "Prefer MCP-compatible mode first for Claude Code, then selectively enrich with plugin skills and hooks.",
      "Do not assume per-turn scoped prompt injection until the official hook payloads are verified in a real plugin.",
    ],
  },
  "generic-mcp": {
    hostKind: "generic-mcp",
    displayName: "Generic MCP Host",
    capabilities: defineCapabilities({
      mcpTools: capability(
        "full",
        "The host can call MCP tools but provides no known native plugin contract.",
        "fallback",
      ),
      restartRequiredToolRefresh: capability(
        "full",
        "Most MCP clients discover tools at connection or session start, so tool id changes require reconnect or restart.",
        "fallback",
        true,
      ),
      workmemIdFallback: capability(
        "full",
        "Without host session identity, tools can require explicit workmem ids or generate workspace-scoped ones.",
        "fallback",
      ),
    }),
    notes: [
      "This profile is the minimum viable compatibility layer.",
      "It should not claim precheck, postaction, or host session memory attribution.",
    ],
  },
  "hermes-agent": {
    hostKind: "hermes-agent",
    displayName: "Hermes Agent",
    capabilities: defineCapabilities({
      compactLifecycleHooks: capability(
        "limited",
        "Hermes has hook and skill preprocessing paths, but compact lifecycle parity still needs adapter proof.",
        "source-analysis",
      ),
      dynamicToolRefresh: capability(
        "limited",
        "ACP/MCP paths can refresh parts of the tool surface, while CLI configuration still warns that new sessions may be required.",
        "source-analysis",
      ),
      mcpTools: capability("full", "Hermes exposes MCP configuration and serving commands.", "source-analysis"),
      nativePlugin: capability(
        "full",
        "Hermes is Python-based but exposes shell hook and skill preprocessing surfaces suitable for a native adapter.",
        "source-analysis",
      ),
      persistentWorkflowSkills: capability(
        "full",
        "Hermes skill command and preprocessing code can carry workflow-style prompt material.",
        "source-analysis",
      ),
      postaction: capability(
        "limited",
        "Hermes exposes post-tool hooks, but final answer multi-stage memory merge must be proven.",
        "source-analysis",
      ),
      precheck: capability(
        "full",
        "Hermes shell hooks include pre-tool blocking and Claude-style decision conversion.",
        "source-analysis",
      ),
      restartRequiredToolRefresh: capability(
        "limited",
        "New sessions remain the conservative fallback for MCP configuration changes.",
        "source-analysis",
        true,
      ),
      sessionIdAccess: capability(
        "full",
        "Hermes skill preprocessing includes session id substitution paths.",
        "source-analysis",
      ),
      sessionLifecycleHooks: capability(
        "full",
        "Hermes ACP adapter includes explicit session creation, loading, resume, fork, and prompt flows.",
        "source-analysis",
      ),
      toolLifecycleHooks: capability(
        "full",
        "Hermes shell hooks include pre_tool_call and post_tool_call surfaces.",
        "source-analysis",
      ),
      turnScopedPrompt: capability(
        "limited",
        "Skill preprocessing can inject prompt material, but exact one-turn scope needs adapter ownership.",
        "source-analysis",
      ),
      workmemIdFallback: capability(
        "full",
        "Hermes can degrade to explicit WorkMem ids when a host session id is not present.",
        "fallback",
      ),
    }),
    notes: [
      "Hermes should use the same vulcan-host relay contract as TypeScript hosts instead of direct VMM access.",
      "Python runtime differences argue for a gRPC adapter contract rather than a shared in-process library.",
    ],
  },
  "qwen-code": {
    hostKind: "qwen-code",
    displayName: "Qwen Code",
    capabilities: defineCapabilities({
      compactLifecycleHooks: capability(
        "full",
        "Qwen Code hook tests include PreCompact coverage.",
        "source-analysis",
      ),
      dynamicToolRefresh: capability(
        "limited",
        "Tool discovery and MCP configuration are present, but live tool id replacement still needs adapter proof.",
        "source-analysis",
      ),
      mcpTools: capability("full", "Qwen Code has MCP server configuration and tool registry paths.", "source-analysis"),
      nativePlugin: capability(
        "limited",
        "Qwen Code exposes hooks and settings rather than the same native plugin packaging model as OpenCode.",
        "source-analysis",
      ),
      persistentWorkflowSkills: capability(
        "limited",
        "Hook-provided context can emulate workflow prompts, but a durable plugin skill registry is not proven.",
        "source-analysis",
      ),
      postaction: capability(
        "limited",
        "Stop and PostToolUse hooks exist, but final turn merge semantics should be verified before full memory postaction.",
        "source-analysis",
      ),
      precheck: capability(
        "full",
        "Qwen Code hook tests include UserPromptSubmit and PreToolUse events.",
        "source-analysis",
      ),
      restartRequiredToolRefresh: capability(
        "full",
        "Tool id changes should fall back to host restart or session restart until dynamic replacement is proven.",
        "source-analysis",
        true,
      ),
      sessionIdAccess: capability(
        "full",
        "Qwen Code config paths expose session id data.",
        "source-analysis",
      ),
      sessionLifecycleHooks: capability(
        "full",
        "Qwen Code hook tests include SessionStart and SessionEnd.",
        "source-analysis",
      ),
      toolLifecycleHooks: capability(
        "full",
        "Qwen Code hook tests include PreToolUse, PostToolUse, and PostToolUseFailure.",
        "source-analysis",
      ),
      turnScopedPrompt: capability(
        "limited",
        "Prompt submit hooks can add or modify context, but exact one-turn scope remains adapter-defined.",
        "source-analysis",
      ),
      workmemIdFallback: capability(
        "full",
        "Qwen Code can degrade to explicit WorkMem ids if session binding is unavailable.",
        "fallback",
      ),
    }),
    notes: [
      "Qwen Code looks hook-rich, but package/plugin deployment differs from OpenCode.",
      "Use hook evidence to shape the gRPC adapter contract before attempting a native package.",
    ],
  },
  unknown: {
    hostKind: "unknown",
    displayName: "Unknown Host",
    capabilities: defineCapabilities({
      mcpTools: capability(
        "limited",
        "Unknown hosts may still support MCP, but this must be configured explicitly.",
        "assumption",
      ),
      restartRequiredToolRefresh: capability(
        "limited",
        "Without host-specific refresh evidence, restart or reconnect is the only safe tool refresh guidance.",
        "fallback",
        true,
      ),
      workmemIdFallback: capability(
        "full",
        "Explicit WorkMem ids are the safest cross-host fallback.",
        "fallback",
      ),
    }),
    notes: [
      "Use this profile until the adapter can positively identify the host.",
      "Never assume precheck, postaction, or session id access for unknown hosts.",
    ],
  },
}

/**
 * Normalize arbitrary host text into a stable host kind.
 * 把任意宿主文本归一化为稳定宿主类型。
 *
 * @param value Host identifier from config, environment, or diagnostics.
 * @param value 来自配置、环境变量或诊断信息的宿主标识。
 * @returns Stable host kind, or unknown when no alias matches.
 * @returns 稳定宿主类型；没有别名匹配时返回 unknown。
 */
export function normalizeVmmHostKind(value: string | undefined): VmmHostKind {
  const normalized = (value ?? "").trim().toLowerCase().replace(/\s+/g, "-")
  return VMM_HOST_KIND_ALIASES[normalized] ?? "unknown"
}

/**
 * Return the capability profile for one host kind or host alias.
 * 返回某个宿主类型或宿主别名对应的能力画像。
 *
 * @param hostKind Host kind or alias to resolve.
 * @param hostKind 需要解析的宿主类型或别名。
 * @returns Immutable capability profile object for the resolved host.
 * @returns 解析后宿主对应的不可变能力画像对象。
 */
export function getVmmHostCapabilityProfile(hostKind: VmmHostKind | string): VmmHostCapabilityProfile {
  return VMM_HOST_CAPABILITY_PROFILES[normalizeVmmHostKind(hostKind)]
}

/**
 * Test whether a profile or host kind has any support for one capability.
 * 判断某个画像或宿主类型是否对指定能力有任意级别支持。
 *
 * @param profileOrKind Profile object, host kind, or host alias.
 * @param profileOrKind 能力画像对象、宿主类型或宿主别名。
 * @param capabilityName Capability to test.
 * @param capabilityName 要检查的能力名称。
 * @returns True when the support level is not none.
 * @returns 当支持级别不是 none 时返回 true。
 */
export function supportsVmmHostCapability(
  profileOrKind: VmmHostCapabilityProfile | VmmHostKind | string,
  capabilityName: VmmHostCapabilityName,
): boolean {
  const profile =
    typeof profileOrKind === "string" ? getVmmHostCapabilityProfile(profileOrKind) : profileOrKind
  return profile.capabilities[capabilityName].level !== "none"
}

/**
 * List missing or degraded capabilities for one required capability set.
 * 列出某组必需能力中缺失或降级的能力。
 *
 * @param profile Host capability profile to inspect.
 * @param profile 要检查的宿主能力画像。
 * @param requiredCapabilities Required capability names for one adapter path.
 * @param requiredCapabilities 某条适配路径必需的能力名称。
 * @returns Capabilities that are not fully supported, including their support metadata.
 * @returns 未达到 full 支持的能力及其支持元信息。
 */
export function listVmmHostCapabilityGaps(
  profile: VmmHostCapabilityProfile,
  requiredCapabilities: readonly VmmHostCapabilityName[],
) {
  return requiredCapabilities
    .map((capabilityName) => ({
      capabilityName,
      support: profile.capabilities[capabilityName],
    }))
    .filter((entry) => entry.support.level !== "full")
}

/**
 * Resolve the safest tool refresh mode for one host profile.
 * 为某个宿主画像解析最安全的工具刷新模式。
 *
 * @param profile Host capability profile to inspect.
 * @param profile 要检查的宿主能力画像。
 * @returns Dynamic refresh, restart-required refresh, or unsupported.
 * @returns 动态刷新、需要重启刷新或不支持刷新。
 */
export function resolveVmmToolRefreshMode(profile: VmmHostCapabilityProfile): VmmToolRefreshMode {
  if (profile.capabilities.dynamicToolRefresh.level === "full") {
    return "dynamic"
  }

  if (profile.capabilities.restartRequiredToolRefresh.level !== "none") {
    return "restart-required"
  }

  return "unsupported"
}
