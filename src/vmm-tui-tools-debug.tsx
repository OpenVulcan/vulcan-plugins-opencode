/** @jsxImportSource @opentui/solid */
/**
 * VMM TUI tools-debug feature module.
 * VMM TUI tools 调试功能模块。
 *
 * This file belongs to the TUI interaction layer. It provides one standalone
 * debug screen for durable-memory tools, so operators can validate request
 * shape, worker bridging, and backend payloads without leaving `/vulcan-setting`.
 * 这个文件属于 TUI 交互层。
 * 它提供一个独立调试页，覆盖长期记忆 tools，
 * 让操作者可以不离开 `/vulcan-setting` 就完成请求结构、worker 桥接和后端载荷验证。
 */

import { createEffect, createMemo, createSignal } from "solid-js"
import { useKeyboard } from "@opentui/solid"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { MouseButton } from "@opentui/core"
import { hasConfiguredGrpcTarget } from "./vmm-config.js"
import type {
  VmmGrpcMemoryLevel,
  VmmGrpcMemoryPriority,
  VmmGrpcMemoryScopeLevel,
  VmmGrpcUnaryResult,
  VmmGrpcWriteMemoryItem,
} from "./vmm-grpc.js"
import {
  callVmmTuiGetTurnDetails,
  callVmmTuiSearchMemoryEvents,
  callVmmTuiWriteMemories,
} from "./vmm-tui-grpc-bridge.js"
import type { VmmLanguage } from "./vmm-language.js"
import { tVmmTui } from "./vmm-tui-language.js"
import {
  VMM_SETTING_ROUTE_NAME,
  VMM_TOOLS_DEBUG_ROUTE_NAME,
  VMM_TUI_COLOR_BODY,
  VMM_TUI_COLOR_HINT,
  VMM_TUI_COLOR_STATUS_BUSY,
  VMM_TUI_COLOR_STATUS_IDLE,
  VMM_TUI_COLOR_SURFACE,
  VMM_TUI_PANEL_HEADER_HEIGHT,
  VMM_TUI_PANEL_OUTER_GAP,
  VMM_TUI_PANEL_VERTICAL_PADDING,
  VMM_TUI_LEFT_PANE_WIDTH,
  VmmDialogHost,
  VmmListRow,
  VmmScrollColumn,
  VmmSectionBox,
  buildVmmRowRenderableId,
  buildVmmTuiTransportConfig,
  createVmmTuiLocaleState,
  isVmmDialogOpen,
  openVmmPendingDialog,
  openVmmSelectDialog,
  openVmmTextPrompt,
  setVmmDialogLanguage,
  summarizeGrpcResult,
  writeVmmTuiLog,
} from "./vmm-tui.js"

/**
 * Stable action identifiers exposed by the tools-debug screen.
 * tools 调试页暴露的稳定动作标识。
 */
type VmmToolsDebugActionID =
  | "search-memory-events"
  | "get-turn-details"
  | "write-memories"

/**
 * One action row rendered in the tools-debug screen.
 * tools 调试页里渲染的一条动作行。
 */
type VmmToolsDebugActionItem = {
  id: VmmToolsDebugActionID
  title: string
  subtitle: string
}

/**
 * One compact request summary shown above the raw request payload pane.
 * 原始请求面板上方显示的一条紧凑请求摘要。
 */
type VmmToolsDebugRequestSummary = {
  label: string
  payload: unknown
}

/**
 * One normalized failure payload shown by the response pane.
 * 响应面板展示的一条归一化失败载荷。
 */
type VmmToolsDebugFailureSummary = {
  ok: false
  method: string
  target: string
  grpcCodeName?: string
  timedOutPhase?: "handshake" | "receive"
  details?: string
}

/**
 * Draft fields collected before building one write-memory request item.
 * 在构建一条写记忆请求项之前逐步收集的草稿字段。
 */
type VmmWriteMemoryDraft = {
  abstract: string
  details: string
  categoryRaw: string
  scopeLevel: VmmGrpcMemoryScopeLevel
  priority: VmmGrpcMemoryPriority
  memoryLevel: VmmGrpcMemoryLevel
}

/**
 * Build the fixed action list rendered by the tools-debug screen.
 * 为 tools 调试页构建固定动作列表。
 */
function buildVmmToolsDebugActionItems(language: VmmLanguage): VmmToolsDebugActionItem[] {
  return [
    {
      id: "search-memory-events",
      title: tVmmTui(language, "tools_debug_action_search_memory_title"),
      subtitle: tVmmTui(language, "tools_debug_action_search_memory_subtitle"),
    },
    {
      id: "get-turn-details",
      title: tVmmTui(language, "tools_debug_action_turn_details_title"),
      subtitle: tVmmTui(language, "tools_debug_action_turn_details_subtitle"),
    },
    {
      id: "write-memories",
      title: tVmmTui(language, "tools_debug_action_write_memories_title"),
      subtitle: tVmmTui(language, "tools_debug_action_write_memories_subtitle"),
    },
  ]
}

/**
 * Convert one selected action id into its localized display label.
 * 把一条动作 id 转成当前语言下的显示标签。
 */
function formatToolsDebugActionLabel(language: VmmLanguage, actionID: VmmToolsDebugActionID) {
  switch (actionID) {
    case "search-memory-events":
      return tVmmTui(language, "tools_debug_action_search_memory_title")
    case "get-turn-details":
      return tVmmTui(language, "tools_debug_action_turn_details_title")
    case "write-memories":
      return tVmmTui(language, "tools_debug_action_write_memories_title")
  }
}

/**
 * Normalize one unary result into a response-pane-safe payload.
 * 把一条 unary 结果归一化成响应面板可安全展示的载荷。
 */
function normalizeToolsDebugResult<TResponse>(result: VmmGrpcUnaryResult<TResponse>) {
  if (result.ok) {
    return {
      ok: true as const,
      method: result.method,
      target: result.target,
      response: result.response,
    }
  }

  return {
    ok: false as const,
    method: result.method,
    target: result.target,
    grpcCodeName: result.grpcCodeName,
    timedOutPhase: result.timedOutPhase,
    details: result.details,
  } satisfies VmmToolsDebugFailureSummary
}

/**
 * Serialize one request or response payload into readable pretty JSON.
 * 把请求或响应载荷序列化成可读的格式化 JSON。
 */
function stringifyToolsDebugPayload(payload: unknown) {
  return JSON.stringify(payload, null, 2)
}

/**
 * Parse one positive integer from prompt input.
 * 从 prompt 输入中解析一条正整数。
 */
function parsePositiveInteger(rawValue: string) {
  const normalized = rawValue.trim()
  if (!/^[1-9][0-9]*$/.test(normalized)) {
    throw new Error("invalid-positive-integer")
  }
  return Number.parseInt(normalized, 10)
}

/**
 * Split one free-form numeric-id list by comma or newline and drop empty entries.
 * 把一条自由数值 id 列表按逗号或换行拆开，并去掉空项。
 *
 * This helper is intentionally reserved for numeric id probes such as turn-id
 * lists. Free-form text fields like search queries should not be split on
 * commas because commas are valid content there.
 * 这个辅助函数只保留给 turn id 这类数值型探针使用。
 * 像搜索 query 这样的自由文本字段不应该再按逗号拆分，
 * 因为逗号本身就是这些字段的合法内容。
 */
function splitToolsDebugNumericListInput(rawValue: string) {
  return rawValue
    .split(/[\r\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Split one free-form text list by newline and drop empty entries.
 * 把一条自由文本列表按换行拆开，并去掉空项。
 *
 * Search queries are ordinary strings in the public contract, so the debug UI
 * should preserve commas instead of silently changing one string into multiple values.
 * 搜索 query 在公开契约里是普通字符串，
 * 因此调试 UI 应保留逗号，而不是静默把一条字符串改写成多条值。
 */
function splitToolsDebugLineInput(rawValue: string) {
  return rawValue
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Parse one memory-search query list from free-form prompt input.
 * 从自由输入中解析一份记忆搜索查询列表。
 *
 * The simplified contract only accepts plain query strings, so every non-empty
 * line becomes one query directly.
 * 收缩后的契约只接受纯查询字符串，
 * 因此这里会把每一条非空输入直接当成一条 query。
 */
function parseSearchQueryList(rawValue: string) {
  const queries = splitToolsDebugLineInput(rawValue)
  if (queries.length === 0) {
    throw new Error("invalid-search-lines")
  }
  return queries
}

/**
 * Parse one comma/newline turn-id list.
 * 解析一条逗号或换行分隔的 turn id 列表。
 */
function parseTurnIDList(rawValue: string) {
  const parts = splitToolsDebugNumericListInput(rawValue)

  if (parts.length === 0) {
    throw new Error("empty-turn-list")
  }

  for (const part of parts) {
    if (!/^[1-9][0-9]*$/.test(part)) {
      throw new Error("invalid-turn-list")
    }
  }

  return parts
}

/**
 * Parse one required integer within the provided inclusive range.
 * 解析一条落在给定闭区间内的必填整数。
 */
function parseRequiredIntegerInRange(
  rawValue: string,
  min: number,
  max: number,
  errorCode: string,
) {
  const normalized = rawValue.trim()
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(errorCode)
  }

  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(errorCode)
  }
  return parsed
}

/**
 * Convert one selected scope-level option into the compact numeric write type.
 * 把一条选中的 scope-level 选项转换成紧凑数字写入类型。
 */
function parseMemoryScopeLevel(value: string): VmmGrpcMemoryScopeLevel | undefined {
  const parsed = Number.parseInt(value, 10)
  if (parsed === 1 || parsed === 2 || parsed === 3) {
    return parsed
  }
  return undefined
}

/**
 * Convert one selected priority option into the compact numeric write type.
 * 把一条选中的 priority 选项转换成紧凑数字写入类型。
 */
function parseMemoryPriority(value: string): VmmGrpcMemoryPriority | undefined {
  const parsed = Number.parseInt(value, 10)
  if (parsed === 1 || parsed === 2 || parsed === 3) {
    return parsed
  }
  return undefined
}

/**
 * Convert one selected memory-level option into the compact numeric write type.
 * 把一条选中的 memory-level 选项转换成紧凑数字写入类型。
 */
function parseMemoryLevel(value: string): VmmGrpcMemoryLevel | undefined {
  const parsed = Number.parseInt(value, 10)
  if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4) {
    return parsed
  }
  return undefined
}

/**
 * Build one normalized write-memory item from the dedicated prompt fields.
 * 根据专用表单字段构建一条归一化后的写记忆项。
 */
function buildWriteMemoryItem(draft: VmmWriteMemoryDraft): VmmGrpcWriteMemoryItem {
  return {
    scope_level: draft.scopeLevel,
    abstract: draft.abstract.trim(),
    details: draft.details.trim(),
    category: parseRequiredIntegerInRange(draft.categoryRaw, 0, 7, "invalid-write-category"),
    priority: draft.priority,
    memory_level: draft.memoryLevel,
  }
}

/**
 * Ensure the current config has one reachable grpc target.
 * 确保当前配置里存在可用的 grpc target。
 */
function ensureToolsDebugGrpcTarget(args: {
  language: VmmLanguage
  selectedActionLabel: string
  configHasGrpcTarget: boolean
  setStatusMessage: (value: string) => void
}) {
  if (args.configHasGrpcTarget) return true
  args.setStatusMessage(
    `${args.selectedActionLabel}: ${tVmmTui(args.language, "tools_debug_missing_grpc")}`,
  )
  return false
}

/**
 * Ensure the current config has one ready user/project business scope.
 * 确保当前配置里存在可用的 user/project 业务作用域。
 */
function ensureToolsDebugBusinessScope(args: {
  language: VmmLanguage
  selectedActionLabel: string
  userId: string
  projectId: string
  setStatusMessage: (value: string) => void
}) {
  if (args.userId.trim() && args.projectId.trim()) return true
  args.setStatusMessage(
    `${args.selectedActionLabel}: ${tVmmTui(args.language, "tools_debug_missing_scope")}`,
  )
  return false
}

/**
 * Read the session id passed through the VMM setting route chain.
 * 读取通过 VMM 设置路由链透传下来的 session id。
 */
function readToolsDebugSessionID(api: TuiPluginApi) {
  const currentRoute = api.route.current
  const routeParams =
    "params" in currentRoute && currentRoute.params ? currentRoute.params : undefined
  return routeParams && typeof routeParams["sessionID"] === "string"
    ? routeParams["sessionID"].trim() || undefined
    : undefined
}

/**
 * Dedicated TUI debug screen for tool-related gRPC interfaces.
 * 面向 tool 相关 gRPC 接口的独立 TUI 调试页面。
 */
export const VmmToolsDebugScreen = (props: { api: TuiPluginApi }) => {
  const locale = createVmmTuiLocaleState(props.api)
  const language = locale.language
  const [selectedActionID, setSelectedActionID] =
    createSignal<VmmToolsDebugActionID>("search-memory-events")
  const [statusMessage, setStatusMessage] = createSignal(
    tVmmTui(language(), "tools_debug_status_idle"),
  )
  const [requestText, setRequestText] = createSignal("")
  const [responseText, setResponseText] = createSignal("")
  const [isLoading, setIsLoading] = createSignal(false)

  /**
   * Keep the action catalog bound to the current route language.
   * 让动作目录始终绑定当前路由语言。
   */
  const actionItems = createMemo(() => buildVmmToolsDebugActionItems(language()))

  /**
   * Synchronize dialog language with the current route language.
   * 让对话框语言始终与当前路由语言同步。
   */
  createEffect(() => {
    setVmmDialogLanguage(language())
  })

  /**
   * Prime one config snapshot so the route starts with the effective language.
   * 预加载一次配置快照，让路由从一开始就拿到生效语言。
   */
  createEffect(() => {
    void locale.refreshConfig()
  })

  /**
   * Update both request/response panes for the latest executed action.
   * 同步更新最近一次执行动作的请求/响应面板。
   */
  const updateResultPanes = (requestSummary: VmmToolsDebugRequestSummary, responseSummary: unknown) => {
    setRequestText(stringifyToolsDebugPayload(requestSummary))
    setResponseText(stringifyToolsDebugPayload(responseSummary))
  }

  /**
   * Execute one simple `SearchMemoryEvents` probe for the current bindings.
   * 针对当前绑定执行一次简化版 `SearchMemoryEvents` 调试探针。
   */
  const runSearchMemoryEvents = async (queries: string[], topK: number, reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const actionLabel = formatToolsDebugActionLabel(currentLanguage, "search-memory-events")

    if (
      !ensureToolsDebugGrpcTarget({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        configHasGrpcTarget: hasConfiguredGrpcTarget(config),
        setStatusMessage,
      })
    ) {
      return
    }

    if (
      !ensureToolsDebugBusinessScope({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        userId: config.userId,
        projectId: config.projectId,
        setStatusMessage,
      })
    ) {
      return
    }

    setIsLoading(true)
    setStatusMessage(tVmmTui(currentLanguage, "tools_debug_loading", { label: actionLabel }))
    updateResultPanes(
      {
        label: actionLabel,
        payload: {
          method: "SearchMemoryEvents",
          user_id: config.userId,
          project_id: config.projectId,
          queries,
          top_k: topK,
        },
      },
      {
        ok: false,
        pending: true,
      },
    )
    const closePending = openVmmPendingDialog({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "tools_debug_title"),
      message: tVmmTui(currentLanguage, "tools_debug_loading", { label: actionLabel }),
    })

    try {
      const result = await callVmmTuiSearchMemoryEvents({
        request: {
          user_id: config.userId,
          project_id: config.projectId,
          queries,
          top_k: topK,
        },
        config: buildVmmTuiTransportConfig(config),
      })

      writeVmmTuiLog("vmm.tui.tools_debug.search_memory_events", {
        reason,
        ok: result.ok,
        details: result.details,
        grpcCodeName: result.grpcCodeName,
        timedOutPhase: result.timedOutPhase,
        traceId: result.response?.trace_id,
        topK,
        queryCount: queries.length,
      })
      updateResultPanes(
        {
          label: actionLabel,
          payload: {
            method: "SearchMemoryEvents",
            user_id: config.userId,
            project_id: config.projectId,
            queries,
            top_k: topK,
          },
        },
        normalizeToolsDebugResult(result),
      )
      setStatusMessage(summarizeGrpcResult(currentLanguage, actionLabel, result))
    } finally {
      closePending()
      setIsLoading(false)
    }
  }

  /**
   * Execute one exact `GetTurnDetails` probe by turn-id list.
   * 按 turn id 列表执行一次精确 `GetTurnDetails` 调试探针。
   */
  const runGetTurnDetails = async (turnIDs: string[], reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const actionLabel = formatToolsDebugActionLabel(currentLanguage, "get-turn-details")

    if (
      !ensureToolsDebugGrpcTarget({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        configHasGrpcTarget: hasConfiguredGrpcTarget(config),
        setStatusMessage,
      })
    ) {
      return
    }

    setIsLoading(true)
    setStatusMessage(tVmmTui(currentLanguage, "tools_debug_loading", { label: actionLabel }))
    updateResultPanes(
      {
        label: actionLabel,
        payload: {
          method: "GetTurnDetails",
          turn_ids: turnIDs,
        },
      },
      {
        ok: false,
        pending: true,
      },
    )
    const closePending = openVmmPendingDialog({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "tools_debug_title"),
      message: tVmmTui(currentLanguage, "tools_debug_loading", { label: actionLabel }),
    })

    try {
      const result = await callVmmTuiGetTurnDetails({
        request: {
          turn_ids: turnIDs,
        },
        config: buildVmmTuiTransportConfig(config),
      })

      writeVmmTuiLog("vmm.tui.tools_debug.get_turn_details", {
        reason,
        ok: result.ok,
        details: result.details,
        grpcCodeName: result.grpcCodeName,
        timedOutPhase: result.timedOutPhase,
        traceId: result.response?.trace_id,
        turnCount: turnIDs.length,
      })
      updateResultPanes(
        {
          label: actionLabel,
          payload: {
            method: "GetTurnDetails",
            turn_ids: turnIDs,
          },
        },
        normalizeToolsDebugResult(result),
      )
      setStatusMessage(summarizeGrpcResult(currentLanguage, actionLabel, result))
    } finally {
      closePending()
      setIsLoading(false)
    }
  }

  /**
   * Execute one direct `WriteMemories` probe for the current bindings.
   * 针对当前绑定执行一次主动 `WriteMemories` 调试探针。
   */
  const runWriteMemories = async (items: VmmGrpcWriteMemoryItem[], reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const actionLabel = formatToolsDebugActionLabel(currentLanguage, "write-memories")
    const sessionID = `vmm-tui-tools-debug-${Date.now()}`

    if (
      !ensureToolsDebugGrpcTarget({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        configHasGrpcTarget: hasConfiguredGrpcTarget(config),
        setStatusMessage,
      })
    ) {
      return
    }

    if (
      !ensureToolsDebugBusinessScope({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        userId: config.userId,
        projectId: config.projectId,
        setStatusMessage,
      })
    ) {
      return
    }

    setIsLoading(true)
    setStatusMessage(tVmmTui(currentLanguage, "tools_debug_loading", { label: actionLabel }))
    updateResultPanes(
      {
        label: actionLabel,
        payload: {
          method: "WriteMemories",
          session_id: sessionID,
          user_id: config.userId,
          project_id: config.projectId,
          items,
        },
      },
      {
        ok: false,
        pending: true,
      },
    )
    const closePending = openVmmPendingDialog({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "tools_debug_title"),
      message: tVmmTui(currentLanguage, "tools_debug_loading", { label: actionLabel }),
    })

    try {
      const result = await callVmmTuiWriteMemories({
        request: {
          session_id: sessionID,
          user_id: config.userId,
          project_id: config.projectId,
          items,
        },
        config: buildVmmTuiTransportConfig(config),
      })

      writeVmmTuiLog("vmm.tui.tools_debug.write_memories", {
        reason,
        ok: result.ok,
        details: result.details,
        grpcCodeName: result.grpcCodeName,
        timedOutPhase: result.timedOutPhase,
        traceId: result.response?.trace_id,
        itemCount: items.length,
        sessionID,
      })
      updateResultPanes(
        {
          label: actionLabel,
          payload: {
            method: "WriteMemories",
            session_id: sessionID,
            user_id: config.userId,
            project_id: config.projectId,
            items,
          },
        },
        normalizeToolsDebugResult(result),
      )
      setStatusMessage(summarizeGrpcResult(currentLanguage, actionLabel, result))
    } finally {
      closePending()
      setIsLoading(false)
    }
  }

  /**
   * Open the simple-query prompt flow for `SearchMemoryEvents`.
   * 为 `SearchMemoryEvents` 打开简单查询输入流程。
   */
  const openSearchMemoryPrompt = async (reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const actionLabel = formatToolsDebugActionLabel(currentLanguage, "search-memory-events")

    if (
      !ensureToolsDebugGrpcTarget({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        configHasGrpcTarget: hasConfiguredGrpcTarget(config),
        setStatusMessage,
      })
    ) {
      return
    }

    if (
      !ensureToolsDebugBusinessScope({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        userId: config.userId,
        projectId: config.projectId,
        setStatusMessage,
      })
    ) {
      return
    }

    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "tools_debug_search_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "tools_debug_search_prompt_placeholder"),
      description: tVmmTui(currentLanguage, "tools_debug_search_prompt_description"),
      emptyMessage: tVmmTui(currentLanguage, "tools_debug_search_prompt_empty"),
      multiline: true,
      inputHeight: 7,
      toastTitle: tVmmTui(currentLanguage, "tools_debug_title"),
      validateValue: (value) => {
        try {
          parseSearchQueryList(value)
          return undefined
        } catch {
          return tVmmTui(currentLanguage, "tools_debug_search_prompt_invalid")
        }
      },
      onConfirmValue: (queryValue) => {
        openVmmTextPrompt({
          api: props.api,
          language: currentLanguage,
          title: tVmmTui(currentLanguage, "tools_debug_search_topk_prompt_title"),
          placeholder: tVmmTui(currentLanguage, "tools_debug_search_topk_prompt_placeholder"),
          description: tVmmTui(currentLanguage, "tools_debug_search_topk_prompt_description"),
          emptyMessage: tVmmTui(currentLanguage, "tools_debug_search_topk_prompt_empty"),
          initialValue: "5",
          toastTitle: tVmmTui(currentLanguage, "tools_debug_title"),
          validateValue: (value) => {
            try {
              parsePositiveInteger(value)
              return undefined
            } catch {
              return tVmmTui(currentLanguage, "tools_debug_search_topk_prompt_invalid")
            }
          },
          onConfirmValue: (topKValue) => {
            const queries = parseSearchQueryList(queryValue)
            const topK = parsePositiveInteger(topKValue)
            void runSearchMemoryEvents(queries, topK, reason)
          },
        })
      },
    })
  }

  /**
   * Open the turn-id prompt flow for `GetTurnDetails`.
   * 为 `GetTurnDetails` 打开 turn id 输入流程。
   */
  const openTurnDetailsPrompt = async (reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const actionLabel = formatToolsDebugActionLabel(currentLanguage, "get-turn-details")

    if (
      !ensureToolsDebugGrpcTarget({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        configHasGrpcTarget: hasConfiguredGrpcTarget(config),
        setStatusMessage,
      })
    ) {
      return
    }

    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "tools_debug_turn_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "tools_debug_turn_prompt_placeholder"),
      description: tVmmTui(currentLanguage, "tools_debug_turn_prompt_description"),
      emptyMessage: tVmmTui(currentLanguage, "tools_debug_turn_prompt_empty"),
      multiline: true,
      inputHeight: 6,
      toastTitle: tVmmTui(currentLanguage, "tools_debug_title"),
      validateValue: (value) => {
        try {
          parseTurnIDList(value)
          return undefined
        } catch {
          return tVmmTui(currentLanguage, "tools_debug_turn_prompt_invalid")
        }
      },
      onConfirmValue: (value) => {
        void runGetTurnDetails(parseTurnIDList(value), reason)
      },
    })
  }

  /**
   * Open the active write-memory prompt flow for `WriteMemories`.
   * 为 `WriteMemories` 打开主动写记忆输入流程。
   */
  const openWriteMemoriesPrompt = async (reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const actionLabel = formatToolsDebugActionLabel(currentLanguage, "write-memories")

    if (
      !ensureToolsDebugGrpcTarget({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        configHasGrpcTarget: hasConfiguredGrpcTarget(config),
        setStatusMessage,
      })
    ) {
      return
    }

    if (
      !ensureToolsDebugBusinessScope({
        language: currentLanguage,
        selectedActionLabel: actionLabel,
        userId: config.userId,
        projectId: config.projectId,
        setStatusMessage,
      })
    ) {
      return
    }

    /**
     * Finish the write-memory prompt chain once all structured fields are ready.
     * 在所有结构化字段都准备好后，完成写记忆表单链路。
     */
    const submitWriteMemoryDraft = (draft: VmmWriteMemoryDraft) => {
      void runWriteMemories([buildWriteMemoryItem(draft)], reason)
    }

    /**
     * Ask for one category code after all text and compact numeric selectors are ready.
     * 在文本与紧凑数字选项都准备好后，最后询问 category 编号。
     */
    const openCategoryPrompt = (draft: Omit<VmmWriteMemoryDraft, "categoryRaw">) => {
      openVmmTextPrompt({
        api: props.api,
        language: currentLanguage,
        title: tVmmTui(currentLanguage, "tools_debug_write_category_prompt_title"),
        placeholder: tVmmTui(currentLanguage, "tools_debug_write_category_prompt_placeholder"),
        description: tVmmTui(currentLanguage, "tools_debug_write_category_prompt_description"),
        emptyMessage: tVmmTui(currentLanguage, "tools_debug_write_prompt_empty"),
        toastTitle: tVmmTui(currentLanguage, "tools_debug_title"),
        validateValue: (value) => {
          try {
            parseRequiredIntegerInRange(value, 0, 7, "invalid-write-category")
            return undefined
          } catch {
            return tVmmTui(currentLanguage, "tools_debug_write_category_prompt_invalid")
          }
        },
        onConfirmValue: (categoryRaw) => {
          submitWriteMemoryDraft({
            ...draft,
            categoryRaw,
          })
        },
      })
    }

    /**
     * Let the operator choose one memory level for the draft item.
     * 让操作者为草稿项选择一个 memory level。
     */
    const openMemoryLevelPrompt = (draft: Omit<VmmWriteMemoryDraft, "memoryLevel" | "categoryRaw">) => {
      openVmmSelectDialog({
        language: currentLanguage,
        title: tVmmTui(currentLanguage, "tools_debug_write_level_prompt_title"),
        contentLines: [tVmmTui(currentLanguage, "tools_debug_write_level_prompt_description")],
        options: [
          {
            title: `1 · ${tVmmTui(currentLanguage, "tools_debug_write_level_l0_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_level_l0_subtitle"),
            value: "1",
          },
          {
            title: `2 · ${tVmmTui(currentLanguage, "tools_debug_write_level_l1_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_level_l1_subtitle"),
            value: "2",
          },
          {
            title: `3 · ${tVmmTui(currentLanguage, "tools_debug_write_level_l2_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_level_l2_subtitle"),
            value: "3",
          },
          {
            title: `4 · ${tVmmTui(currentLanguage, "tools_debug_write_level_l3_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_level_l3_subtitle"),
            value: "4",
          },
        ],
        onCancel: () => {},
        onSelect: (value) => {
          const memoryLevel = parseMemoryLevel(value)
          if (memoryLevel === undefined) return
          openCategoryPrompt({
            ...draft,
            memoryLevel,
          })
        },
      })
    }

    /**
     * Let the operator choose one priority before choosing the memory level.
     * 在选择 memory level 之前，先让操作者选择优先级。
     */
    const openPriorityPrompt = (draft: Omit<VmmWriteMemoryDraft, "priority" | "memoryLevel" | "categoryRaw">) => {
      openVmmSelectDialog({
        language: currentLanguage,
        title: tVmmTui(currentLanguage, "tools_debug_write_priority_prompt_title"),
        contentLines: [tVmmTui(currentLanguage, "tools_debug_write_priority_prompt_description")],
        options: [
          {
            title: `1 · ${tVmmTui(currentLanguage, "tools_debug_write_priority_p0_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_priority_p0_subtitle"),
            value: "1",
          },
          {
            title: `2 · ${tVmmTui(currentLanguage, "tools_debug_write_priority_p1_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_priority_p1_subtitle"),
            value: "2",
          },
          {
            title: `3 · ${tVmmTui(currentLanguage, "tools_debug_write_priority_p2_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_priority_p2_subtitle"),
            value: "3",
          },
        ],
        onCancel: () => {},
        onSelect: (value) => {
          const priority = parseMemoryPriority(value)
          if (priority === undefined) return
          openMemoryLevelPrompt({
            ...draft,
            priority,
          })
        },
      })
    }

    /**
     * Let the operator choose one write scope for the draft memory item.
     * 让操作者为草稿记忆项选择写入作用域。
     */
    const openScopePrompt = (draft: Pick<VmmWriteMemoryDraft, "abstract" | "details">) => {
      openVmmSelectDialog({
        language: currentLanguage,
        title: tVmmTui(currentLanguage, "tools_debug_write_scope_prompt_title"),
        contentLines: [tVmmTui(currentLanguage, "tools_debug_write_scope_prompt_description")],
        options: [
          {
            title: `1 · ${tVmmTui(currentLanguage, "tools_debug_write_scope_session_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_scope_session_subtitle"),
            value: "1",
          },
          {
            title: `2 · ${tVmmTui(currentLanguage, "tools_debug_write_scope_project_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_scope_project_subtitle"),
            value: "2",
          },
          {
            title: `3 · ${tVmmTui(currentLanguage, "tools_debug_write_scope_user_title")}`,
            subtitle: tVmmTui(currentLanguage, "tools_debug_write_scope_user_subtitle"),
            value: "3",
          },
        ],
        onCancel: () => {},
        onSelect: (value) => {
          const scopeLevel = parseMemoryScopeLevel(value)
          if (scopeLevel === undefined) return
          openPriorityPrompt({
            ...draft,
            scopeLevel,
          })
        },
      })
    }

    /**
     * Ask for one required details block after the required abstract text.
     * 在必填摘要之后，继续询问同样必填的详情正文。
     */
    const openDetailsPrompt = (abstract: string) => {
      openVmmTextPrompt({
        api: props.api,
        language: currentLanguage,
        title: tVmmTui(currentLanguage, "tools_debug_write_details_prompt_title"),
        placeholder: tVmmTui(currentLanguage, "tools_debug_write_details_prompt_placeholder"),
        description: tVmmTui(currentLanguage, "tools_debug_write_details_prompt_description"),
        emptyMessage: tVmmTui(currentLanguage, "tools_debug_write_prompt_empty"),
        multiline: true,
        inputHeight: 7,
        toastTitle: tVmmTui(currentLanguage, "tools_debug_title"),
        validateValue: (value) => {
          if (!value.trim()) {
            return tVmmTui(currentLanguage, "tools_debug_write_prompt_invalid")
          }
          return undefined
        },
        onConfirmValue: (details) => {
          openScopePrompt({
            abstract: abstract.trim(),
            details: details.trim(),
          })
        },
      })
    }

    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "tools_debug_write_abstract_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "tools_debug_write_abstract_prompt_placeholder"),
      description: tVmmTui(currentLanguage, "tools_debug_write_abstract_prompt_description"),
      emptyMessage: tVmmTui(currentLanguage, "tools_debug_write_prompt_empty"),
      multiline: true,
      inputHeight: 6,
      toastTitle: tVmmTui(currentLanguage, "tools_debug_title"),
      validateValue: (value) => {
        if (!value.trim()) {
          return tVmmTui(currentLanguage, "tools_debug_write_prompt_invalid")
        }
        return undefined
      },
      onConfirmValue: (abstract) => {
        openDetailsPrompt(abstract)
      },
    })
  }

  /**
   * Dispatch the currently selected debug action.
   * 分发当前选中的调试动作。
   */
  const runActionByID = (actionID: VmmToolsDebugActionID, reason: string) => {
    if (isLoading()) return

    switch (actionID) {
      case "search-memory-events":
        void openSearchMemoryPrompt(reason)
        return
      case "get-turn-details":
        void openTurnDetailsPrompt(reason)
        return
      case "write-memories":
        void openWriteMemoriesPrompt(reason)
        return
    }
  }

  /**
   * Execute the action that is currently selected in the left-side list.
   * 执行左侧列表当前选中的动作。
   */
  const runSelectedAction = (reason: string) => {
    runActionByID(selectedActionID(), reason)
  }

  useKeyboard((event) => {
    if (props.api.route.current.name !== VMM_TOOLS_DEBUG_ROUTE_NAME) return
    if (isVmmDialogOpen()) return

    const items = actionItems()
    if (items.length === 0) return

    if (["up", "left", "k"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      const currentIndex = Math.max(
        0,
        items.findIndex((item) => item.id === selectedActionID()),
      )
      const nextIndex = (currentIndex - 1 + items.length) % items.length
      setSelectedActionID(items[nextIndex]?.id ?? items[0].id)
      return
    }

    if (["down", "right", "j"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      const currentIndex = Math.max(
        0,
        items.findIndex((item) => item.id === selectedActionID()),
      )
      const nextIndex = (currentIndex + 1 + items.length) % items.length
      setSelectedActionID(items[nextIndex]?.id ?? items[0].id)
      return
    }

    if (["return", "enter", "linefeed"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      runSelectedAction("keyboard-run")
      return
    }

    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      props.api.route.navigate(
        VMM_SETTING_ROUTE_NAME,
        readToolsDebugSessionID(props.api) ? { sessionID: readToolsDebugSessionID(props.api) } : undefined,
      )
    }
  })

  return (
    <>
      <box
        width="100%"
        height="100%"
        backgroundColor={VMM_TUI_COLOR_SURFACE}
        flexDirection="column"
        paddingTop={VMM_TUI_PANEL_VERTICAL_PADDING}
        paddingBottom={VMM_TUI_PANEL_VERTICAL_PADDING}
        paddingLeft={2}
        paddingRight={2}
        gap={VMM_TUI_PANEL_OUTER_GAP}
        onMouseUp={(event) => {
          if (event.button !== MouseButton.RIGHT) return
          event.stopPropagation()
          event.preventDefault()
          props.api.route.navigate(
            VMM_SETTING_ROUTE_NAME,
            readToolsDebugSessionID(props.api) ? { sessionID: readToolsDebugSessionID(props.api) } : undefined,
          )
        }}
      >
        <box width="100%" alignItems="center" justifyContent="center" height={VMM_TUI_PANEL_HEADER_HEIGHT}>
          <ascii_font
            text="VULCAN PLUGINS"
            font="tiny"
            color="#ffffff"
            backgroundColor="transparent"
          />
        </box>
        <box width="100%" flexGrow={1} flexDirection="row" gap={1}>
          <box width={VMM_TUI_LEFT_PANE_WIDTH} minHeight={0} flexDirection="column">
            <VmmSectionBox title={tVmmTui(language(), "tools_debug_section_actions")} flexGrow={1}>
              <VmmScrollColumn
                selectedChildId={buildVmmRowRenderableId("tools-debug-actions", selectedActionID())}
              >
                {actionItems().map((item) => (
                  <VmmListRow
                    rowId={buildVmmRowRenderableId("tools-debug-actions", item.id)}
                    title={item.title}
                    subtitle={item.subtitle}
                    selected={item.id === selectedActionID()}
                    onHover={() => {
                      setSelectedActionID(item.id)
                    }}
                    onPress={() => {
                      setSelectedActionID(item.id)
                      runActionByID(item.id, "mouse-run")
                    }}
                  />
                ))}
              </VmmScrollColumn>
            </VmmSectionBox>
          </box>
          <box flexGrow={1} minHeight={0} flexDirection="column" gap={1}>
            <VmmSectionBox title={tVmmTui(language(), "tools_debug_section_request")} flexGrow={1}>
              <text fg={isLoading() ? VMM_TUI_COLOR_STATUS_BUSY : VMM_TUI_COLOR_STATUS_IDLE}>
                {statusMessage()}
              </text>
              <scrollbox flexGrow={1} scrollY>
                <box width="100%" minHeight={0} flexDirection="column" paddingRight={1}>
                  <text fg={VMM_TUI_COLOR_BODY} wrapMode="word">
                    {requestText() || tVmmTui(language(), "tools_debug_request_empty")}
                  </text>
                </box>
              </scrollbox>
            </VmmSectionBox>
            <VmmSectionBox title={tVmmTui(language(), "tools_debug_section_response")} flexGrow={1}>
              <scrollbox flexGrow={1} scrollY>
                <box width="100%" minHeight={0} flexDirection="column" paddingRight={1}>
                  <text fg={VMM_TUI_COLOR_BODY} wrapMode="word">
                    {responseText() || tVmmTui(language(), "tools_debug_response_empty")}
                  </text>
                </box>
              </scrollbox>
            </VmmSectionBox>
          </box>
        </box>
        <box width="100%" alignItems="center" justifyContent="center">
          <text fg={VMM_TUI_COLOR_HINT}>{tVmmTui(language(), "tools_debug_keys_hint")}</text>
        </box>
      </box>
      <VmmDialogHost />
    </>
  )
}

