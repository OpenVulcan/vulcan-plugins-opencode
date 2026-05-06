/**
 * OpenCode tool registrations for the simplified VMM memory surface.
 * 面向收缩版 VMM 记忆接口的 OpenCode tool 注册模块。
 *
 * This file belongs to the orchestration/integration layer. `plugin.ts` uses
 * it to expose AI-facing tools that resolve the current workspace binding
 * first, then call the underlying VMM gRPC helpers with the new minimal memory
 * contract.
 * 这个文件属于编排与集成层。`plugin.ts` 会用它暴露面向 AI 的 tools；
 * 这些 tools 会先解析当前工作空间绑定，再按新的最小记忆契约调用底层
 * VMM gRPC 辅助函数。
 */

import { tool } from "@opencode-ai/plugin"

import { loadVmmConfig } from "./vmm-config.js"
import {
  callVmmGetTurnDetails,
  callVmmSearchMemoryEvents,
  callVmmWriteMemories,
  extractTransportConfig,
  type VmmGrpcGetTurnDetailsResponse,
  type VmmGrpcMemoryLevel,
  type VmmGrpcMemoryPriority,
  type VmmGrpcMemoryScopeLevel,
  type VmmGrpcSearchMemoryEventsResponse,
  type VmmGrpcTimelineItem,
  type VmmGrpcWriteMemoriesResponse,
  type VmmGrpcWriteMemoryItem,
} from "./vmm-grpc.js"
import {
  callVmmHostAdapterListVmmMemoryTools,
  type VmmHostAdapterGrpcToolDescriptor,
} from "./vmm-host-adapter-grpc.js"
import { buildOpenCodeArgsShapeFromInputSchema } from "./vmm-luaskills-tools.js"
import {
  formatWorkspaceToolUnaryFailure,
  loadReadyWorkspaceToolRuntime,
  readWorkspaceToolSessionID,
} from "./vmm-tool-runtime.js"

/**
 * Default and maximum hit counts used by the proactive memory-search tool.
 * 主动记忆搜索 tool 使用的默认与最大召回数量。
 *
 * The backend allows higher limits, but the tool layer still keeps a readable
 * default so one accidental call does not immediately flood the chat context.
 * 后端允许更高的上限，但 tool 层仍然保留一个利于阅读的默认值，
 * 这样单次误调用就不会立刻把聊天上下文塞满。
 */
const DEFAULT_MEMORY_SEARCH_TOP_K = 5

/**
 * Stable plugin client name sent to vulcan-host HostAdapterService.
 * 发送给 vulcan-host HostAdapterService 的稳定插件客户端名称。
 */
const VMM_MEMORY_TOOL_CLIENT_NAME = "opencode"

/**
 * Plugin client version marker used for VMM memory metadata diagnostics.
 * VMM 记忆元信息诊断使用的插件客户端版本标记。
 */
const VMM_MEMORY_TOOL_CLIENT_VERSION = "vmm-opencode-plugin"

/**
 * Stable VMM memory tool names expected from vulcan-host metadata.
 * 期望从 vulcan-host 元信息中获得的稳定 VMM 记忆工具名称。
 */
const VMM_MEMORY_SEARCH_TOOL_NAME = "vmm_memory_search"
const VMM_TURN_DETAILS_TOOL_NAME = "vmm_turn_details"
const VMM_MEMORY_WRITE_TOOL_NAME = "vmm_memory_write"

/**
 * Structured write-item input exposed by the public AI-facing memory-write tool.
 * 对外开放的记忆写入 tool 使用的一条结构化写入项输入。
 */
type VmmMemoryWriteToolItemInput = {
  abstract: string
  details: string
  category: number
  scopeLevel?: number
  priority?: number
  memoryLevel?: number
}

/**
 * Metadata map keyed by stable VMM memory tool name.
 * 按稳定 VMM 记忆工具名索引的元信息表。
 */
type VmmMemoryToolMetadataMap = Map<string, VmmHostAdapterGrpcToolDescriptor>

/**
 * Raw OpenCode tool args shape accepted by `tool()`.
 * `tool()` 接收的 OpenCode 原始参数形态。
 */
type VmmMemoryOpenCodeArgsShape = Record<string, any>

/**
 * Resolved metadata needed to register one VMM memory tool.
 * 注册单个 VMM 记忆工具所需的已解析元信息。
 */
type ResolvedVmmMemoryToolMetadata = {
  descriptor: VmmHostAdapterGrpcToolDescriptor
  args: VmmMemoryOpenCodeArgsShape
}

/**
 * Convert descriptor arrays into a name-keyed lookup map.
 * 将描述数组转换成按名称索引的查找表。
 */
function buildVmmMemoryToolMetadataMap(
  descriptors: Iterable<VmmHostAdapterGrpcToolDescriptor> | undefined,
): VmmMemoryToolMetadataMap {
  const map: VmmMemoryToolMetadataMap = new Map()
  if (!descriptors) {
    return map
  }

  // Keep only descriptors with usable names so malformed metadata never breaks startup.
  // 仅保留带可用名称的描述，避免异常元信息影响插件启动。
  for (const descriptor of descriptors) {
    const name = descriptor.name.trim()
    if (name) {
      map.set(name, descriptor)
    }
  }
  return map
}

/**
 * Resolve the OpenCode argument shape from central gRPC schema metadata.
 * 从中心化 gRPC schema 元信息解析 OpenCode 参数形态。
 */
function resolveRequiredVmmMemoryToolMetadata(
  descriptors: VmmMemoryToolMetadataMap,
  toolName: string,
  requiredProperties: string[],
): ResolvedVmmMemoryToolMetadata | undefined {
  const descriptor = descriptors.get(toolName)
  if (!descriptor) {
    return undefined
  }

  if (!descriptor.description.trim()) {
    return undefined
  }

  const result = buildOpenCodeArgsShapeFromInputSchema(
    descriptor.input_schema_json,
    "Raw VMM memory tool argument object. Use this only when the central descriptor does not expose a structured JSON schema.",
  )
  if (result.mode !== "direct") {
    return undefined
  }

  // Refuse to register malformed metadata because the tool would also fail without MCP.
  // 拒绝注册异常元信息，因为没有 MCP 时工具本身也无法正常调用。
  if (!requiredProperties.every((name) => Object.hasOwn(result.shape, name))) {
    return undefined
  }

  return {
    descriptor,
    args: result.shape,
  }
}

/**
 * Load VMM memory tool descriptors from vulcan-host through HostAdapterService.
 * 通过 HostAdapterService 从 vulcan-host 加载 VMM 记忆工具描述。
 */
async function loadVmmMemoryToolDescriptors(directory: string) {
  try {
    const runtimeConfig = await loadVmmConfig(directory)
    const result = await callVmmHostAdapterListVmmMemoryTools({
      config: extractTransportConfig(runtimeConfig),
      request: {
        context: {
          client_name: VMM_MEMORY_TOOL_CLIENT_NAME,
          client_version: VMM_MEMORY_TOOL_CLIENT_VERSION,
          request_id: "startup:vmm-memory-tools",
        },
      },
    })

    if (
      !result.ok ||
      !result.response ||
      result.response.is_error ||
      !result.response.vmm_enabled
    ) {
      return []
    }

    return result.response.tools
  } catch {
    // Metadata loading must never block plugin startup; without MCP these tools are simply not registered.
    // 元信息加载不应阻断插件启动；没有 MCP 时这些工具会直接不注册。
    return []
  }
}

/**
 * Normalize one mixed turn timeline into a tool-friendly JSON shape.
 * 把一条结构化 turn 时间线归一化成适合 tool 返回的 JSON 结构。
 */
function normalizeTurnTimeline(timeline: VmmGrpcTimelineItem[]) {
  return timeline.map((item) => ({
    type: item.type,
    content: item.content,
  }))
}

/**
 * Normalize one search response into a compact JSON result for the model.
 * 把一条搜索响应归一化成供模型消费的紧凑 JSON 结果。
 *
 * Search hits now expose the backend-formatted creation time, so the normalized
 * result keeps the grouping shape and carries recency metadata beside each hit.
 * 搜索命中现在只保留最小 AI 字段，因此这里在保留分组结构的同时，
 * 会把后端格式化后的创建时间随每条命中一起返回，方便模型判断新旧程度。
 */
function normalizeSearchResponse(response: VmmGrpcSearchMemoryEventsResponse) {
  return {
    trace_id: response.trace_id,
    query_count: response.results.length,
    results: response.results.map((group) => ({
      query_index: group.query_index,
      query: group.query,
      hit_count: group.hits.length,
      hits: group.hits.map((hit) => ({
        memory_id: hit.memory_id,
        source_turn_id: hit.source_turn_id,
        has_source_turn: Boolean(hit.source_turn_id && hit.source_turn_id !== "0"),
        abstract: hit.abstract,
        details_preview: hit.details_preview,
        category: hit.category,
        created_datetime: hit.created_datetime,
      })),
    })),
  }
}

/**
 * Normalize one turn-detail response into a stable tool-facing JSON object.
 * 把一条 turn 详情响应归一化成稳定的 tool 返回 JSON 对象。
 */
function normalizeTurnDetailsResponse(response: VmmGrpcGetTurnDetailsResponse) {
  return {
    trace_id: response.trace_id,
    turn_count: response.turns.length,
    turns: response.turns.map((turn) => ({
      turn_id: turn.turn_id,
      user_question: turn.user_question,
      timeline: normalizeTurnTimeline(turn.timeline),
      assistant_answer: turn.assistant_answer,
      detail: turn.detail,
      previous_turn_ids: turn.previous_turn_ids,
      next_turn_ids: turn.next_turn_ids,
    })),
  }
}

/**
 * Normalize one write-memory response into a compact JSON result for the model.
 * 把一条写记忆响应归一化成供模型消费的紧凑 JSON 结果。
 */
function normalizeWriteResponse(response: VmmGrpcWriteMemoriesResponse) {
  return {
    trace_id: response.trace_id,
    item_count: response.items.length,
    items: response.items.map((item) => ({
      memory_id: item.memory_id,
      deduped: item.deduped,
    })),
  }
}

/**
 * Coerce one optional numeric concept value into the narrow write type.
 * 把一条可选数字概念值收口到更窄的写记忆类型里。
 *
 * We validate numeric ranges at the schema layer first, then narrow the final
 * payload here so transport receives the compact integers expected by the proto.
 * 这里会先依赖 schema 做数值范围校验，再在最终出站时把值收口，
 * 让传输层拿到 proto 期望的紧凑整数。
 */
function buildWriteMemoryItem(input: VmmMemoryWriteToolItemInput): VmmGrpcWriteMemoryItem {
  return {
    abstract: input.abstract.trim(),
    details: input.details.trim(),
    category: input.category,
    scope_level: (input.scopeLevel ?? 0) as VmmGrpcMemoryScopeLevel,
    priority: (input.priority ?? 0) as VmmGrpcMemoryPriority,
    memory_level: (input.memoryLevel ?? 0) as VmmGrpcMemoryLevel,
  }
}

/**
 * Build the tool registry from preloaded VMM memory metadata.
 * 基于已加载的 VMM 记忆元信息构建工具注册表。
 *
 * The returned object can be attached directly to the plugin hook surface.
 * 返回对象可以直接挂到插件的 `tool` hook 表面。
 */
export function buildVmmMemoryToolsFromDescriptors(
  descriptors?: Iterable<VmmHostAdapterGrpcToolDescriptor>,
) {
  const metadata = buildVmmMemoryToolMetadataMap(descriptors)
  const searchMetadata = resolveRequiredVmmMemoryToolMetadata(
    metadata,
    VMM_MEMORY_SEARCH_TOOL_NAME,
    ["queries"],
  )
  const turnDetailsMetadata = resolveRequiredVmmMemoryToolMetadata(
    metadata,
    VMM_TURN_DETAILS_TOOL_NAME,
    ["turnIds"],
  )
  const writeMetadata = resolveRequiredVmmMemoryToolMetadata(
    metadata,
    VMM_MEMORY_WRITE_TOOL_NAME,
    ["items"],
  )
  const tools: Record<string, any> = {}

  if (searchMetadata) {
    tools[VMM_MEMORY_SEARCH_TOOL_NAME] = tool({
      description: searchMetadata.descriptor.description,
      args: searchMetadata.args,
      async execute(args, context) {
        const runtime = await loadReadyWorkspaceToolRuntime(context.directory, {
          sessionID: context.sessionID,
        })
        if (!runtime.ready) {
          return runtime.message
        }

        // The schema may be supplied by gRPC, so narrow validated values before transport.
        // schema 可能来自 gRPC，因此传输前先把已校验值收窄到调用类型。
        const queries = args.queries as string[]
        const topK = typeof args.topK === "number" ? args.topK : DEFAULT_MEMORY_SEARCH_TOP_K

        const result = await callVmmSearchMemoryEvents({
          request: {
            user_id: runtime.runtime.runtimeConfig.userId,
            project_id: runtime.runtime.runtimeConfig.projectId,
            queries,
            top_k: topK,
          },
          config: extractTransportConfig(runtime.runtime.runtimeConfig),
        })

        if (!result.ok || !result.response) {
          return formatWorkspaceToolUnaryFailure("SearchMemoryEvents", result)
        }

        const normalized = normalizeSearchResponse(result.response)
        context.metadata({
          title: "VMM Memory Search",
          metadata: {
            traceID: normalized.trace_id,
            queryCount: normalized.query_count,
          },
        })
        return JSON.stringify(normalized, null, 2)
      },
    })
  }

  if (turnDetailsMetadata) {
    tools[VMM_TURN_DETAILS_TOOL_NAME] = tool({
      description: turnDetailsMetadata.descriptor.description,
      args: turnDetailsMetadata.args,
      async execute(args, context) {
        const runtime = await loadReadyWorkspaceToolRuntime(context.directory, {
          sessionID: context.sessionID,
        })
        if (!runtime.ready) {
          return runtime.message
        }

        // The schema may be supplied by gRPC, so narrow validated values before transport.
        // schema 可能来自 gRPC，因此传输前先把已校验值收窄到调用类型。
        const turnIds = args.turnIds as string[]

        const result = await callVmmGetTurnDetails({
          request: {
            turn_ids: turnIds,
          },
          config: extractTransportConfig(runtime.runtime.runtimeConfig),
        })

        if (!result.ok || !result.response) {
          return formatWorkspaceToolUnaryFailure("GetTurnDetails", result)
        }

        const normalized = normalizeTurnDetailsResponse(result.response)
        context.metadata({
          title: "VMM Turn Details",
          metadata: {
            traceID: normalized.trace_id,
            turnCount: normalized.turn_count,
          },
        })
        return JSON.stringify(normalized, null, 2)
      },
    })
  }

  if (writeMetadata) {
    tools[VMM_MEMORY_WRITE_TOOL_NAME] = tool({
      description: writeMetadata.descriptor.description,
      args: writeMetadata.args,
      async execute(args, context) {
        const runtime = await loadReadyWorkspaceToolRuntime(context.directory, {
          sessionID: context.sessionID,
        })
        if (!runtime.ready) {
          return runtime.message
        }

        const sessionID = readWorkspaceToolSessionID(runtime.runtime.hostAdapter.context.sessionId)
        if (!sessionID) {
          return "VMM memory-write tool unavailable in the current host context. A real session id is required so durable memories can be attributed to the active conversation."
        }

        // The schema may be supplied by gRPC, so narrow validated values before transport.
        // schema 可能来自 gRPC，因此传输前先把已校验值收窄到调用类型。
        const items = args.items as VmmMemoryWriteToolItemInput[]

        const result = await callVmmWriteMemories({
          request: {
            session_id: sessionID,
            user_id: runtime.runtime.runtimeConfig.userId,
            project_id: runtime.runtime.runtimeConfig.projectId,
            items: items.map((item) => buildWriteMemoryItem(item)),
          },
          config: extractTransportConfig(runtime.runtime.runtimeConfig),
        })

        if (!result.ok || !result.response) {
          return formatWorkspaceToolUnaryFailure("WriteMemories", result)
        }

        const normalized = normalizeWriteResponse(result.response)
        context.metadata({
          title: "VMM Memory Write",
          metadata: {
            traceID: normalized.trace_id,
            itemCount: normalized.item_count,
          },
        })
        return JSON.stringify(normalized, null, 2)
      },
    })
  }

  return tools
}

/**
 * Build the tool registry that exposes the simplified VMM memory surface.
 * 构建用于暴露收缩版 VMM 记忆接口的 tool 注册表。
 *
 * Metadata is loaded from vulcan-host first, so argument guidance has one
 * authoritative source across different host plugins.
 * 这里会优先从 vulcan-host 加载元信息，使不同宿主插件共享同一份参数说明权威来源。
 */
export async function buildVmmMemoryTools(directory: string) {
  const descriptors = await loadVmmMemoryToolDescriptors(directory)
  return buildVmmMemoryToolsFromDescriptors(descriptors)
}
