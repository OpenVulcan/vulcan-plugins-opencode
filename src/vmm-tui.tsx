/** @jsxImportSource @opentui/solid */
/**
 * VMM setting-center TUI entry for OpenCode.
 * OpenCode 使用的 VMM 设置中心 TUI 入口。
 *
 * This file belongs to the TUI interaction layer. It exposes one stable
 * `/vmm-setting` entry, then routes the user into focused control windows
 * such as the user manager. The goal is to move command
 * interactions out of the LLM reply flow and into explicit terminal UI.
 * 这个文件属于 TUI 交互层。它对外只暴露稳定的 `/vmm-setting` 入口，
 * 再把用户分流到更聚焦的控制窗口，例如 user manager 和诊断页。
 * 目标是把指令式交互从 LLM 回答链路里移出来，转成明确的终端界面操作。
 */

import { useKeyboard } from "@opentui/solid"
import { Show, createEffect, createMemo, createSignal, onMount } from "solid-js"
import type { JSX } from "solid-js"
import {
  MouseButton,
  type InputRenderable,
  type ScrollBoxRenderable,
  type SelectOption,
  type SelectRenderable,
  type TextareaRenderable,
} from "@opentui/core"
import type { TuiPlugin, TuiPluginApi, TuiPluginModule } from "@opencode-ai/plugin/tui"
import { writeLog } from "./logger.js"
import { buildVmmEndpointPlan } from "./vmm-endpoint-plan.js"
import {
  resolveVmmSettingHomeMouseIndex,
  resolveVmmSettingHomeScrollOffset,
} from "./vmm-tui-home-pointer.js"
import {
  getConfigScopeLabel,
  getVmmPaths,
  hasConfiguredGrpcTarget,
  loadVmmConfig,
  readJsonObjectIfExists,
  saveVmmConfig,
  type VmmConfigScope,
  type VmmRuntimeConfig,
} from "./vmm-config.js"
import type {
  VmmGrpcApplyProfileInstructionResponse,
  VmmGrpcGetProfileNodesResponse,
  VmmGrpcProfileNodeEntry,
  VmmGrpcProfileNodeSourceKind,
  VmmGrpcProfileTarget,
  VmmGrpcProjectEntry,
  VmmGrpcTransportConfig,
  VmmGrpcUnaryResult,
  VmmGrpcUserEntry,
} from "./vmm-grpc.js"
import {
  formatVmmLanguageLabel,
  getSupportedVmmLanguages,
  resolveVmmLanguage,
  type VmmLanguage,
} from "./vmm-language.js"
import { getVmmTuiCommandMetadata, tVmmTui } from "./vmm-tui-language.js"
import { VmmUserManagerOverlay, VmmProjectManagerOverlay } from "./vmm-tui-user-project.js"
import { VmmLanguageControlOverlay, VmmLanguageControlScreen, VmmMemorySettingsScreen } from "./vmm-tui-language-memory.js"
import { VmmGrpcTransportSettingsScreen } from "./vmm-tui-language-grpc.js"
import { getVmmGrpcTransportCopy } from "./vmm-grpc-transport-view-model.js"
import { VmmProfileBundleTestScreen, VmmProfileCenterScreen } from "./vmm-tui-profile-admin.js"
import { VmmToolsDebugScreen } from "./vmm-tui-tools-debug.js"

/**
 * Stable route and slash-command identifiers for the TUI setting center.
 * 设置中心使用的稳定路由名与 slash 命令值。
 *
 * The top-level entry remains `/vmm-setting` so the user does not need to
 * relearn command names while the internal UI is being rebuilt.
 * 顶层入口继续复用 `/vmm-setting`，这样在内部 UI 重建期间，
 * 用户不需要重新记新的命令名。
 */
const VMM_SETTING_ROUTE_NAME = "vmm-setting"
const VMM_PROFILE_CENTER_ROUTE_NAME = "vmm-setting-profile-center"
const VMM_PROFILE_BUNDLE_TEST_ROUTE_NAME = "vmm-setting-profile-bundle-test"
const VMM_TOOLS_DEBUG_ROUTE_NAME = "vmm-setting-tools-debug"
const VMM_LANGUAGE_ROUTE_NAME = "vmm-setting-language"
const VMM_MEMORY_ROUTE_NAME = "vmm-setting-memory"
const VMM_GRPC_TRANSPORT_ROUTE_NAME = "vmm-setting-grpc-transport"
const VMM_SETTING_COMMAND_VALUE = "plugin.vmm.setting.open"
/**
 * Slot order used by the mounted VMM setting entry.
 * 挂载式 VMM 设置入口使用的插槽顺序。
 *
 * We keep it earlier than the host's informational sidebar sections so the
 * entry reads like one navigation gateway instead of getting buried under
 * telemetry and file summaries.
 * 这里把顺序放在宿主信息型侧栏区块之前，
 * 是为了让这个入口更像“导航网关”，而不是被上下文统计和文件摘要埋在后面。
 */
const VMM_SETTING_ENTRY_SLOT_ORDER = 50

/**
 * Shared layout metrics for the VMM TUI windows.
 * VMM TUI 窗口共享的布局尺寸基线。
 *
 * The goal is to keep every screen visually aligned, even when some pages have
 * selector panels and others do not.
 * 这些尺寸用于让所有页面保持统一视觉节奏，
 * 即使有的页面带右上角选择器，有的页面没有，也不会再出现面板忽大忽小。
 */
const VMM_TUI_LEFT_PANE_WIDTH = 38

/**
 * Shared color tokens for the VMM TUI windows.
 * VMM TUI 窗口共享的颜色令牌。
 *
 * These tokens intentionally reduce per-page ad-hoc color choices so list
 * panes, detail panes, and selector panes look like one product surface.
 * 这里刻意减少页面内各自为政的颜色选择，
 * 让左侧列表、右侧详情、右上角选择面板看起来像同一套产品表面。
 */
const VMM_TUI_COLOR_SURFACE = "#101010"
const VMM_TUI_COLOR_BORDER = "#3d3d3d"
const VMM_TUI_COLOR_TITLE = "#f3f4f6"
const VMM_TUI_COLOR_SECTION = "#8fd3ff"
const VMM_TUI_COLOR_BODY = "#d8d8d8"
const VMM_TUI_COLOR_MUTED = "#9a9a9a"
const VMM_TUI_COLOR_HINT = "#8c8c8c"
const VMM_TUI_COLOR_STATUS_IDLE = "#b0b0b0"
const VMM_TUI_COLOR_STATUS_BUSY = "#ffd479"
const VMM_TUI_COLOR_ROW_SELECTED_BG = "#1f2836"
const VMM_TUI_COLOR_ROW_SELECTED_BORDER = "#8fd3ff"

/**
 * Diagnostic transport budgets used by manual TUI probes and user-manager RPCs.
 * 手工 TUI 探针与 user-manager RPC 使用的诊断超时预算。
 *
 * Manual TUI actions are explicitly user-triggered, so they should tolerate
 * slightly larger connection budgets than the automated memory pipeline.
 * TUI 里的手工动作是用户显式触发的，因此这里允许比自动记忆链
 * 更宽松一点的连接预算，避免把单次人工操作误判成失败。
 */
const VMM_TUI_MIN_HANDSHAKE_TIMEOUT_MS = 4000
const VMM_TUI_MIN_RECEIVE_TIMEOUT_MS = 15000

/**
 * One generic list item shown in a two-pane setting window.
 * 双栏设置窗口里显示的一条通用列表项。
 */
type VmmMenuItem = {
  id: string
  title: string
  subtitle: string
  detailTitle: string
  detailLines: string[]
  onOpen: () => void
}

/**
 * Row model rendered by the current User Manager overlay.
 * 当前 User Manager 弹层里渲染的行模型。
 *
 * This overlay keeps only three behaviors: existing users, create user, and
 * clear workspace override. Splitting them into explicit row kinds keeps later
 * UI expansion predictable without reintroducing the removed legacy screen.
 * 这层弹层只保留三种行为：已有用户、新建用户、清空工作区覆盖。
 * 先把它们拆成明确的行类型，后续继续扩 UI 时就不需要重新引回已删除的旧页面。
 */
type VmmUserManagerItem =
  | {
      id: string
      kind: "user"
      title: string
      subtitle: string
      user: VmmGrpcUserEntry
    }
  | {
      id: "action:new-user"
      kind: "new-user"
      title: string
      subtitle: string
    }
  | {
      id: "action:clear-workspace"
      kind: "clear-workspace"
      title: string
      subtitle: string
    }

/**
 * Raw binding keys that can exist independently in local/global config files.
 * 可以独立存在于本地/全局配置文件里的原始绑定键。
 *
 * The runtime config returned by `loadVmmConfig` is already layered, but the
 * TUI managers also need to show what is stored in the currently selected
 * write scope so the user can understand override precedence.
 * `loadVmmConfig` 返回的是已经分层合并后的运行时配置，
 * 但 TUI 管理页还需要展示“当前选中写入范围”里实际存的值，
 * 这样用户才能看清覆盖优先级，而不是只看到最终生效结果。
 */
type VmmScopedBindingKey = "user_id" | "project_id"

/**
 * Raw config keys that the TUI overlays may inspect per local/global layer.
 * TUI 弹层按 local/global 分层直接查看时可能会读取的原始配置键集合。
 *
 * User/project managers need binding ids, while language control also needs
 * the raw scoped `language` value so the footer can explain inheritance
 * without relying on already-layered runtime config.
 * 用户/项目管理页需要绑定 id，而语言控制还需要读取原始 `language` 值，
 * 这样底部摘要才能解释继承关系，而不是只看到已经分层后的运行时配置。
 */
type VmmScopedConfigKey =
  | VmmScopedBindingKey
  | "language"
  | "vulcan_host_target"
  | "visible_memory_injection"
  | "implicit_memory_turns"
  | "profile_refresh_turns"
  | "session_compact_recall"
  | "grpc_keepalive_time_ms"
  | "grpc_keepalive_timeout_ms"
  | "grpc_keepalive_permit_without_calls"

/**
 * Row model rendered by the Project Manager overlay.
 * Project Manager 弹层里渲染的行模型。
 *
 * The new project manager follows the same launcher-style interaction as the
 * user manager: one compact action group plus one live project group. Keeping
 * the row model explicit prevents the removed legacy route shape from leaking
 * back into the new overlay implementation.
 * 新的项目管理会沿用用户管理那套启动器式交互：
 * 上方一组紧凑动作，加上下方一组实时项目列表。
 * 先把行模型写成显式联合类型，可以避免已删除的旧 route 形态再回流进新弹层实现。
 */
type VmmProjectManagerItemBase = {
  id: string
  title: string
  subtitle: string
  scope?: VmmConfigScope
  project?: VmmGrpcProjectEntry
}

type VmmProjectManagerItem =
  | (VmmProjectManagerItemBase & {
      kind: "scope"
      scope: VmmConfigScope
    })
  | (VmmProjectManagerItemBase & {
      kind: "project"
      project: VmmGrpcProjectEntry
    })
  | (VmmProjectManagerItemBase & {
      id: "action:new-project"
      kind: "new-project"
    })
  | (VmmProjectManagerItemBase & {
      id: "action:refresh"
      kind: "refresh"
    })
  | (VmmProjectManagerItemBase & {
      id: "action:clear-project"
      kind: "clear"
    })
  | (VmmProjectManagerItemBase & {
      id: "action:back"
      kind: "back"
    })
  | (VmmProjectManagerItemBase & {
      id: "action:clear-workspace"
      kind: "clear-workspace"
    })

/**
 * Supported profile targets exposed by the TUI profile center.
 * TUI 画像中心暴露的画像目标集合。
 */
type VmmTuiProfileTarget = "user" | "project" | "team" | "space"

/**
 * Supported row kinds inside the language-control window.
 * language-control 窗口里支持的行类型。
 */
type VmmLanguageControlItemKind = "language" | "inherit-global"

/**
 * One list row rendered by the rebuilt language-control overlay.
 * 重建后的 language-control 弹层里渲染的一条列表行。
 *
 * The overlay follows the same grouped launcher shell as User Manager and
 * Project Manager: one compact action section plus one language list. The row
 * kinds stay explicit so the old selector-heavy route shape does not leak
 * back into this overlay implementation.
 * 这个弹层会沿用 User Manager 和 Project Manager 的分组启动器外壳：
 * 上方一组紧凑动作，加上下方一组语言列表。
 * 因此这里把行类型保持为显式联合，避免旧的右侧选择器页面形态回流进来。
 */
type VmmLanguageControlItem = {
  id: string
  kind: VmmLanguageControlItemKind
  title: string
  subtitle: string
  languageCode?: VmmLanguage
}

/**
 * Supported row kinds inside the memory-settings overlay.
 * memory-settings 覆盖层里支持的行类型。
 */
type VmmMemorySettingsItemKind =
  | "mode"
  | "turns"
  | "profile-refresh-turns"
  | "session-compact-recall"

/**
 * One list row rendered by the memory-settings overlay.
 * memory-settings 覆盖层渲染的一条列表行。
 */
type VmmMemorySettingsItem = {
  id: string
  kind: VmmMemorySettingsItemKind
  title: string
  subtitle: string
}

/**
 * Minimal shape required by the shared vertical-list keyboard helper.
 * 共享纵向列表键盘辅助函数要求的最小数据结构。
 */
type VmmSelectableItem = {
  id: string
}

/**
 * Props used by the compact list-row component.
 * 紧凑型列表行组件使用的属性。
 */
type VmmListRowProps = {
  rowId?: string
  title: string
  subtitle: string
  titleMaxWidth?: number
  subtitleMaxWidth?: number
  selected: boolean
  titleColor?: string
  subtitleColor?: string
  selectedTitleColor?: string
  selectedSubtitleColor?: string
  onHover: () => void
  onPress: () => void
}

/**
 * Shared locale state used by one TUI screen.
 * 某个 TUI 页面复用的共享语言状态。
 */
type VmmTuiLocaleState = {
  config: () => VmmRuntimeConfig | null
  language: () => VmmLanguage
  refreshConfig: () => Promise<VmmRuntimeConfig>
}

/**
 * Write one breadcrumb into the shared plugin debug log.
 * 把一条 breadcrumb 写入共享插件调试日志。
 *
 * The TUI flow is rebuilt incrementally, so file-based breadcrumbs remain the
 * fastest way to tell whether a failure belongs to selection, navigation, or
 * backend RPC execution.
 * 由于当前 TUI 流程仍在增量重建，文件日志仍然是区分
 * “选中阶段失败”“路由跳转失败”“后端 RPC 执行失败”最快的办法。
 */
function writeVmmTuiLog(kind: string, data: Record<string, unknown>) {
  void writeLog({
    kind,
    data,
  })
}

/**
 * Build the transport config used by manual TUI operations.
 * 构建手工 TUI 操作使用的传输配置。
 */
function buildVmmTuiTransportConfig(config: VmmRuntimeConfig): VmmGrpcTransportConfig {
  return {
    grpcTarget: config.grpcTarget,
    grpcApiKey: config.grpcApiKey,
    grpcHandshakeTimeoutMs: Math.max(
      config.grpcHandshakeTimeoutMs,
      VMM_TUI_MIN_HANDSHAKE_TIMEOUT_MS,
    ),
    grpcReceiveTimeoutMs: Math.max(
      config.grpcReceiveTimeoutMs,
      VMM_TUI_MIN_RECEIVE_TIMEOUT_MS,
    ),
    grpcKeepaliveTimeMs: config.grpcKeepaliveTimeMs,
    grpcKeepaliveTimeoutMs: config.grpcKeepaliveTimeoutMs,
    grpcKeepalivePermitWithoutCalls: config.grpcKeepalivePermitWithoutCalls,
  }
}

/**
 * Convert one gRPC result into a compact single-line summary.
 * 把一条 gRPC 结果转换成紧凑的单行摘要。
 */
function summarizeGrpcResult<TResponse>(
  language: VmmLanguage,
  label: string,
  result: VmmGrpcUnaryResult<TResponse>,
) {
  if (result.ok) return tVmmTui(language, "summary_ok", { label })
  if (result.timedOutPhase === "handshake") {
    return tVmmTui(language, "summary_handshake_timeout", { label })
  }
  if (result.timedOutPhase === "receive") {
    return tVmmTui(language, "summary_receive_timeout", { label })
  }
  if (typeof result.details === "string" && result.details.trim()) {
    return `${label}: ${result.details.trim()}`
  }
  if (typeof result.grpcCodeName === "string" && result.grpcCodeName.trim()) {
    return `${label}: ${result.grpcCodeName.trim()}`
  }
  if (result.error instanceof Error && result.error.message) {
    return `${label}: ${result.error.message}`
  }
  return tVmmTui(language, "summary_failed", { label })
}

/**
 * Load one screen-local config snapshot and expose its effective UI language.
 * 加载某个页面本地使用的配置快照，并暴露对应的生效界面语言。
 *
 * Each screen reads the same layered VMM config, but this wrapper keeps that
 * async read localized so presentation code can react to language changes
 * without duplicating the same loading pattern in every component.
 * 每个页面读取的都是同一份分层 VMM 配置，
 * 但这个包装器把异步加载收口起来，
 * 让展示组件可以在不重复样板代码的前提下响应语言变化。
 */
function createVmmTuiLocaleState(api: TuiPluginApi): VmmTuiLocaleState {
  const [config, setConfig] = createSignal<VmmRuntimeConfig | null>(null)

  /**
   * Reload the current effective VMM config for this workspace route.
   * 为当前工作区路由重新加载生效 VMM 配置。
   */
  const refreshConfig = async () => {
    const nextConfig = await loadVmmConfig(api.state.path.directory)
    setConfig(nextConfig)
    return nextConfig
  }

  /**
   * Keep one derived language accessor available for the current screen.
   * 为当前页面持续提供一条派生后的语言访问器。
   */
  const language = createMemo<VmmLanguage>(() => config()?.language ?? "en")

  return {
    config,
    language,
    refreshConfig,
  }
}

/**
 * Normalize one raw persisted config value into the string form used by TUI state.
 * 把一条原始落盘配置值归一化成 TUI 状态统一使用的字符串形式。
 *
 * Scope-specific config files may contain numbers, booleans, or strings.
 * The TUI only needs one stable display form, so we collapse everything into a
 * trimmed string and treat unsupported values as empty.
 * 不同作用域的配置文件里，值可能是数字、布尔值或字符串。
 * TUI 这里只需要一种稳定的展示形式，因此统一收敛成裁剪后的字符串，
 * 其余不支持的值都视为“未设置”。
 */
function normalizeScopedVmmBindingValue(value: unknown) {
  if (typeof value === "string") return value.trim()
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "boolean") return String(value)
  return ""
}

/**
 * Read one binding value directly from the selected local/global config layer.
 * 直接从指定的本地/全局配置层读取一条绑定值。
 *
 * User/project managers need this raw scope view so the right-side details can
 * explain why a global write may not change the effective binding immediately
 * when a local override still exists.
 * user/project 管理页需要这份“原始作用域视图”，
 * 这样右侧详情才能解释清楚：为什么写入全局后，若本地仍有覆盖值，
 * 最终生效绑定不会立刻改变。
 */
async function readScopedVmmBindingValue(
  directory: string,
  scope: VmmConfigScope,
  key: VmmScopedBindingKey,
) {
  return readScopedVmmConfigValue(directory, scope, key)
}

/**
 * Read one raw config value directly from the selected local/global config layer.
 * 直接从指定的本地/全局配置层读取一条原始配置值。
 *
 * The runtime config returned by `loadVmmConfig` is already layered, but some
 * overlays need to show where a value is physically stored so users can
 * understand inheritance. This helper exposes the raw scoped value for that
 * purpose.
 * `loadVmmConfig` 返回的是已经分层后的运行时配置，
 * 但某些弹层需要展示“这个值实际存在哪一层”，这样用户才能看清继承关系。
 * 这个辅助函数就是为这种原始作用域读取而准备的。
 */
async function readScopedVmmConfigValue(
  directory: string,
  scope: VmmConfigScope,
  key: VmmScopedConfigKey,
) {
  const paths = getVmmPaths(directory)

  /**
   * Check both the current global path and the legacy fallback path so older
   * developer setups still show the real scope value while the UI is migrating.
   * 全局作用域同时检查当前路径和旧版兼容路径，
   * 这样在 UI 迁移期间，老开发环境里的真实全局值也能被正确展示出来。
   */
  const candidatePaths =
    scope === "global"
      ? [paths.globalConfigPath, paths.legacyGlobalConfigPath]
      : [paths.configPath]

  for (const filePath of candidatePaths) {
    const rawConfig = await readJsonObjectIfExists(filePath)
    if (!rawConfig) continue
    if (!(key in rawConfig)) continue
    return normalizeScopedVmmBindingValue(rawConfig[key])
  }

  return ""
}

/**
 * Bind a shared vertical-list keyboard model to one route.
 * 给某个路由绑定共享的纵向列表键盘模型。
 *
 * Every settings page in this file uses the same up/down/enter/escape mental
 * model so users do not need to relearn controls for each sub-window.
 * 这个文件里的每个设置页都复用同一套 up/down/enter/escape 心智模型，
 * 这样用户在不同子窗口之间切换时，不需要重新学习操作方式。
 */
function useVmmListKeyboard<TItem extends VmmSelectableItem>(args: {
  api: TuiPluginApi
  routeName: string
  getItems: () => readonly TItem[]
  selectedId: () => string
  setSelectedId: (value: string) => void
  onActivate: (item: TItem) => void
  onLeft?: () => void
  onRight?: () => void
  onEscape: () => void
}) {
  useKeyboard((event) => {
    if (args.api.route.current.name !== args.routeName) return
    if (isVmmDialogOpen()) return

    const items = args.getItems()

    /**
     * Give selector-aware pages a dedicated left/right path so the main list
     * can stay focused on actions while the right-side selector panel changes.
     * 给带有右侧选择器的页面单独预留 left/right 路径，
     * 这样左侧主列表可以只负责动作项，而右侧选择面板负责切换范围或目标。
     */
    if (event.name === "left" && args.onLeft) {
      event.preventDefault()
      event.stopPropagation()
      args.onLeft()
      return
    }
    if (event.name === "right" && args.onRight) {
      event.preventDefault()
      event.stopPropagation()
      args.onRight()
      return
    }

    if (items.length === 0) {
      if (event.name === "escape") {
        event.preventDefault()
        event.stopPropagation()
        args.onEscape()
      }
      return
    }

    if (["up", "down", "left", "right"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      const currentIndex = Math.max(0, items.findIndex((item) => item.id === args.selectedId()))
      const delta = ["up", "left"].includes(event.name) ? -1 : 1
      const nextIndex = (currentIndex + delta + items.length) % items.length
      args.setSelectedId(items[nextIndex]?.id ?? items[0].id)
      return
    }

    if (["return", "enter"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      const item = items.find((entry) => entry.id === args.selectedId()) ?? items[0]
      args.onActivate(item)
      return
    }

    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      args.onEscape()
    }
  })
}

/**
 * Ordered write scopes used by selector-aware setting pages.
 * 带有右侧选择器的设置页使用的写入范围顺序表。
 */
const VMM_SCOPE_SELECTOR_ORDER: readonly VmmConfigScope[] = ["local", "global"]

/**
 * Rotate one write scope value forward or backward.
 * 把一个写入范围值按顺序向前或向后轮换。
 */
function cycleConfigScope(current: VmmConfigScope, direction: -1 | 1): VmmConfigScope {
  const currentIndex = VMM_SCOPE_SELECTOR_ORDER.indexOf(current)
  const safeIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex =
    (safeIndex + direction + VMM_SCOPE_SELECTOR_ORDER.length) % VMM_SCOPE_SELECTOR_ORDER.length
  return VMM_SCOPE_SELECTOR_ORDER[nextIndex]
}

/**
 * Carry the current session id across VMM setting sub-routes when available.
 * 在可用时把当前 session id 透传到 VMM 设置子路由之间。
 *
 * Some setting sub-routes need to return to the active chat context, so this
 * helper preserves the session id when `/vmm-setting` is opened from a concrete
 * chat session.
 * 部分设置子路由需要回到当前聊天上下文，
 * 因此当 `/vmm-setting` 是从某个具体聊天 session 打开的时，
 * 这里会继续透传这个 session id。
 */
function buildVmmRouteSessionParams(api: TuiPluginApi) {
  const currentRoute = api.route.current
  if (
    currentRoute.name === "session" &&
    "params" in currentRoute &&
    currentRoute.params &&
    typeof currentRoute.params["sessionID"] === "string"
  ) {
    return {
      sessionID: currentRoute.params["sessionID"],
    }
  }

  if (!("params" in currentRoute) || !currentRoute.params) {
    return undefined
  }

  const nestedSessionID =
    typeof currentRoute.params["sessionID"] === "string"
      ? currentRoute.params["sessionID"]
      : undefined
  if (!nestedSessionID) {
    return undefined
  }

  return {
    sessionID: nestedSessionID,
  }
}

/**
 * Open the top-level setting-center route.
 * 打开顶层设置中心路由。
 */
function openVmmSettingScreen(api: TuiPluginApi) {
  writeVmmTuiLog("vmm.tui.setting.open", {
    directory: api.state.path.directory,
  })
  api.route.navigate(VMM_SETTING_ROUTE_NAME, buildVmmRouteSessionParams(api))
}

/**
 * Shared single-line mounted action for the VMM setting center.
 * 挂载到宿主导航区域里的 VMM 设置中心单行动作入口。
 *
 * The user asked for a much quieter treatment than the earlier card/button
 * style, so this component deliberately renders as one plain navigation line
 * with no extra vertical padding or trailing shortcut hints.
 * 用户希望它比之前的卡片/按钮样式低调得多，
 * 因此这里刻意把它收成一条普通导航线，不再附带额外纵向留白，也不再显示尾部快捷提示。
 */
const VmmMountedSettingAction = (props: {
  api: TuiPluginApi
  label: string
}) => {
  const [hovered, setHovered] = createSignal(false)
  const theme = () => props.api.theme.current

  return (
    <box
      width="100%"
      onMouseOver={(event) => {
        event.stopPropagation()
        setHovered(true)
      }}
      onMouseOut={(event) => {
        event.stopPropagation()
        setHovered(false)
      }}
      onMouseUp={(event) => {
        if (event.button !== MouseButton.LEFT) return
        event.stopPropagation()
        event.preventDefault()
        openVmmSettingScreen(props.api)
      }}
    >
      <text fg={hovered() ? theme().text : theme().textMuted}>
        <b>&gt; {props.label}</b>
      </text>
    </box>
  )
}

/**
 * Home-screen mounted entry shown below the main prompt.
 * 展示在 home 主输入框下方的设置入口。
 *
 * The home wrapper keeps the line aligned with the prompt column, but avoids
 * adding top/bottom padding so the mounted control stays visually lightweight.
 * 这个 home 包装只负责让入口和主输入列对齐，
 * 同时避免再引入上下内边距，让这条控制入口保持足够轻量。
 */
const VmmHomeSettingEntry = (props: {
  api: TuiPluginApi
  label: string
}) => {
  return (
    <box width="100%" maxWidth={75} flexShrink={0}>
      <VmmMountedSettingAction api={props.api} label={props.label} />
    </box>
  )
}

/**
 * Session-sidebar mounted entry shown with other contextual sections.
 * 展示在 session 右侧信息栏上下文区里的设置入口。
 *
 * The sidebar version intentionally stays identical to the home version so the
 * control reads like one consistent "open panel" affordance across screens.
 * 侧栏版本刻意和 home 版本保持同一条线式样，
 * 这样跨页面看起来都是同一种“打开控制面板”的入口信号。
 */
const VmmSidebarSettingEntry = (props: {
  api: TuiPluginApi
  label: string
}) => {
  return <VmmMountedSettingAction api={props.api} label={props.label} />
}

/**
 * Shared option shape used by the custom VMM select dialog.
 * 自定义 VMM 选择对话框复用的一条通用选项结构。
 *
 * The TUI now owns its own select-style dialogs instead of delegating to the
 * host's DialogSelect implementation, so every scope picker and replacement
 * picker can share the same row model.
 * 现在 TUI 会自己维护选择型对话框，而不是继续委托给宿主的 DialogSelect，
 * 因此所有作用域选择和替代项选择都复用同一套行模型。
 */
type VmmDialogSelectOption = {
  value: string
  title: string
  subtitle: string
}

/**
 * Factory signature for one lazily rendered VMM dialog body.
 * 一条惰性渲染的 VMM 对话框内容工厂签名。
 *
 * Dialog components depend on renderer-bound hooks such as keyboard handlers,
 * so the plugin must create them inside the active render tree instead of
 * instantiating JSX eagerly inside event callbacks.
 * 对话框组件依赖键盘处理等绑定渲染器的 hooks，
 * 因此插件必须在活动渲染树内部创建它们，
 * 不能在事件回调里提前实例化 JSX。
 */
type VmmDialogFactory = () => JSX.Element

/**
 * Shared runtime store for one custom VMM modal overlay.
 * 自定义 VMM 模态覆盖层共用的一份运行时状态。
 *
 * The plugin now renders its own full-screen dialogs so right-click cancel,
 * input retry, and overlay focus all stay consistent without depending on the
 * host DialogConfirm/DialogPrompt/DialogSelect implementations.
 * 插件现在会自己渲染全屏对话框，
 * 这样右键取消、输入重试和遮罩层焦点都能保持一致，
 * 不再依赖宿主内建的 DialogConfirm/DialogPrompt/DialogSelect 实现。
 */
const [vmmDialogFactory, setVmmDialogFactory] = createSignal<VmmDialogFactory | null>(null)
const [activeVmmDialogLanguage, setActiveVmmDialogLanguage] = createSignal<VmmLanguage>("en")

/**
 * Shared style baseline for centered VMM dialogs.
 * VMM 居中对话框共用的一组样式基线。
 */
const VMM_TUI_DIALOG_WIDTH = 76
const VMM_TUI_DIALOG_Z_INDEX = 4200
const VMM_TUI_DIALOG_MASK_OPACITY = 0.8

/**
 * Extra multiline-submit bindings used by the shared text prompt dialog.
 * 共享文本输入对话框为多行模式补充的提交键位绑定。
 *
 * OpenTUI textarea submits on Meta+Enter by default, but this plugin exposes
 * Ctrl+Enter in its prompt hint. Adding both Ctrl and Meta submit bindings
 * keeps multiline confirmation behavior consistent across terminal hosts.
 * OpenTUI 的 textarea 默认使用 Meta+Enter 提交，
 * 但当前插件提示文案对外承诺的是 Ctrl+Enter。
 * 因此这里同时补上 Ctrl 和 Meta 的提交绑定，保证不同终端宿主下行为一致。
 */
const VMM_MULTILINE_SUBMIT_KEY_BINDINGS = [
  { name: "return", ctrl: true, action: "submit" as const },
  { name: "linefeed", ctrl: true, action: "submit" as const },
  { name: "return", meta: true, action: "submit" as const },
  { name: "linefeed", meta: true, action: "submit" as const },
]

/**
 * Report whether one custom VMM dialog is currently open.
 * 判断当前是否存在一个打开中的自定义 VMM 对话框。
 */
function isVmmDialogOpen() {
  return Boolean(vmmDialogFactory())
}

/**
 * Update the shared active language used by custom dialog buttons and hints.
 * 更新自定义对话框按钮和提示共用的当前活动语言。
 */
function setVmmDialogLanguage(language: VmmLanguage) {
  setActiveVmmDialogLanguage(language)
}

/**
 * Replace the current custom VMM dialog content factory.
 * 替换当前打开的自定义 VMM 对话框内容工厂。
 */
export function replaceVmmDialog(factory: VmmDialogFactory) {
  setVmmDialogFactory(() => factory)
}

/**
 * Clear the current custom VMM dialog.
 * 清空当前打开的自定义 VMM 对话框。
 */
export function clearVmmDialog() {
  setVmmDialogFactory(null)
}

/**
 * Render the shared VMM dialog host above the current route content.
 * 在当前路由内容之上渲染共享的 VMM 对话框宿主层。
 */
const VmmDialogHost = () => (
  <Show when={vmmDialogFactory()}>
    {(factory) => <>{factory()()}</>}
  </Show>
)

/**
 * Build one short localized confirm label for custom dialogs.
 * 为自定义对话框生成一条简短的本地化确认按钮文案。
 */
function getVmmDialogConfirmLabel(language: VmmLanguage) {
  switch (language) {
    case "zh-CN":
      return "确认"
    case "es":
      return "Confirmar"
    case "fr":
      return "Confirmer"
    case "de":
      return "Bestätigen"
    case "ja":
      return "確認"
    case "ko":
      return "확인"
    case "en":
    default:
      return "Confirm"
  }
}

/**
 * Build one short localized cancel label for custom dialogs.
 * 为自定义对话框生成一条简短的本地化取消按钮文案。
 */
function getVmmDialogCancelLabel(language: VmmLanguage) {
  switch (language) {
    case "zh-CN":
      return "取消"
    case "es":
      return "Cancelar"
    case "fr":
      return "Annuler"
    case "de":
      return "Abbrechen"
    case "ja":
      return "取消"
    case "ko":
      return "취소"
    case "en":
    default:
      return "Cancel"
  }
}

/**
 * Build one short localized acknowledgement label for info dialogs.
 * 为信息提示框生成一条简短的本地化“知道了”按钮文案。
 */
function getVmmDialogAcknowledgeLabel(language: VmmLanguage) {
  switch (language) {
    case "zh-CN":
      return "知道了"
    case "es":
      return "Entendido"
    case "fr":
      return "Compris"
    case "de":
      return "Verstanden"
    case "ja":
      return "了解"
    case "ko":
      return "확인"
    case "en":
    default:
      return "OK"
  }
}

/**
 * Shared clickable button used by all custom dialog footers.
 * 所有自定义对话框页脚共用的一条可点击按钮。
 *
 * Buttons only react to the left mouse button so the global right-click cancel
 * path can bubble through the whole overlay surface unchanged.
 * 按钮只响应鼠标左键，
 * 这样全局右键取消才能在整个覆盖层里保持统一冒泡行为。
 */
const VmmDialogButton = (props: {
  label: string
  selected: boolean
  variant?: "primary" | "danger" | "secondary"
  onHover?: () => void
  onPress: () => void
}) => (
  <box
    border
    borderColor={props.selected ? VMM_TUI_COLOR_ROW_SELECTED_BORDER : VMM_TUI_COLOR_BORDER}
    backgroundColor={
      props.selected
        ? props.variant === "danger"
          ? "#4b1f1f"
          : VMM_TUI_COLOR_ROW_SELECTED_BG
        : "transparent"
    }
    paddingLeft={2}
    paddingRight={2}
    onMouseOver={(event) => {
      event.stopPropagation()
      if (props.selected) return
      props.onHover?.()
    }}
    onMouseUp={(event) => {
      if (event.button !== MouseButton.LEFT) return
      event.stopPropagation()
      event.preventDefault()
      props.onPress()
    }}
  >
    <text
      fg={
        props.variant === "danger"
          ? "#ffb0b0"
          : props.selected
            ? VMM_TUI_COLOR_TITLE
            : VMM_TUI_COLOR_BODY
      }
    >
      <b>{props.label}</b>
    </text>
  </box>
)

/**
 * Shared full-screen frame used by every custom VMM dialog.
 * 所有自定义 VMM 对话框共用的一层全屏框架。
 */
const VmmDialogFrame = (props: {
  title: string
  dismissible?: boolean
  onDismiss?: () => void
  children?: JSX.Element
}) => {
  /**
   * Route one dialog dismissal request back into the owning dialog flow.
   * 把对话框的关闭请求回传给当前拥有这层对话框的业务流程。
   *
   * Right-click cancellation must behave the same as pressing Esc or clicking
   * a visible cancel button. Some flows need more than "just hide the dialog":
   * they may navigate back, reopen an input, or update route state.
   * 右键取消必须和 Esc、点击取消按钮保持一致。
   * 有些流程在关闭时不只是“把对话框隐藏掉”，
   * 还要回退页面、重新打开输入框，或同步修正路由状态。
   */
  const dismissDialog = () => {
    if (props.dismissible === false) return
    if (props.onDismiss) {
      props.onDismiss()
      return
    }
    clearVmmDialog()
  }

  return (
    <>
      <box
        position="absolute"
        left={0}
        top={0}
        zIndex={VMM_TUI_DIALOG_Z_INDEX}
        width="100%"
        height="100%"
        backgroundColor="#000000"
        opacity={VMM_TUI_DIALOG_MASK_OPACITY}
        onMouseUp={(event) => {
          if (event.button !== MouseButton.RIGHT) return
          if (props.dismissible === false) return
          event.stopPropagation()
          event.preventDefault()
          dismissDialog()
        }}
      />
      <box
        position="absolute"
        left={0}
        top={0}
        zIndex={VMM_TUI_DIALOG_Z_INDEX + 1}
        width="100%"
        height="100%"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        onMouseUp={(event) => {
          if (event.button !== MouseButton.RIGHT) return
          if (props.dismissible === false) return
          event.stopPropagation()
          event.preventDefault()
          dismissDialog()
        }}
      >
        <box
          width={VMM_TUI_DIALOG_WIDTH}
          maxWidth="92%"
          maxHeight="86%"
          backgroundColor={VMM_TUI_COLOR_SURFACE}
          border
          borderColor={VMM_TUI_COLOR_BORDER}
          title={props.title}
          titleAlignment="center"
          flexDirection="column"
          padding={1}
          gap={1}
          onMouseUp={(event) => {
            if (event.button !== MouseButton.LEFT) return
            event.stopPropagation()
            event.preventDefault()
          }}
        >
          {props.children}
        </box>
      </box>
    </>
  )
}

/**
 * Custom confirm-style dialog with one content area and footer buttons.
 * 自定义确认类对话框，包含说明区和底部按钮区。
 */
const VmmConfirmDialogView = (props: {
  language: VmmLanguage
  title: string
  contentLines: ReadonlyArray<string>
  confirmLabel?: string
  cancelLabel?: string
  showCancel?: boolean
  confirmVariant?: "primary" | "danger" | "secondary"
  onConfirm: () => void
  onCancel: () => void
}) => {
  const [selectedAction, setSelectedAction] = createSignal<"confirm" | "cancel">("confirm")

  useKeyboard((event) => {
    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      props.onCancel()
      return
    }
    if (props.showCancel !== false && ["left", "right", "tab"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      setSelectedAction((current) => (current === "confirm" ? "cancel" : "confirm"))
      return
    }
    if (["return", "enter", "linefeed"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      if (props.showCancel !== false && selectedAction() === "cancel") {
        props.onCancel()
        return
      }
      props.onConfirm()
    }
  })

  return (
    <VmmDialogFrame title={props.title} onDismiss={props.onCancel}>
      <box flexDirection="column" gap={1}>
        {props.contentLines.map((line) => (
          <text fg="#b8b8b8">{line}</text>
        ))}
      </box>
      <box width="100%" flexDirection="row" justifyContent="flex-end" gap={1} paddingTop={1}>
        {props.showCancel !== false ? (
          <VmmDialogButton
            label={props.cancelLabel ?? getVmmDialogCancelLabel(props.language)}
            selected={selectedAction() === "cancel"}
            variant="secondary"
            onHover={() => setSelectedAction("cancel")}
            onPress={props.onCancel}
          />
        ) : null}
        <VmmDialogButton
          label={props.confirmLabel ?? getVmmDialogConfirmLabel(props.language)}
          selected={props.showCancel === false || selectedAction() === "confirm"}
          variant={props.confirmVariant}
          onHover={() => setSelectedAction("confirm")}
          onPress={props.onConfirm}
        />
      </box>
    </VmmDialogFrame>
  )
}

/**
 * Custom input dialog with single-line and multi-line editor support.
 * 自定义输入对话框，支持单行与多行编辑器。
 */
const VmmInputDialogView = (props: {
  language: VmmLanguage
  title: string
  contentLines: ReadonlyArray<string>
  placeholder: string
  initialValue?: string
  multiline?: boolean
  inputHeight?: number
  confirmLabel?: string
  cancelLabel?: string
  confirmVariant?: "primary" | "danger" | "secondary"
  onConfirm: (value: string) => void
  onCancel: () => void
}) => {
  const [value, setValue] = createSignal(props.initialValue ?? "")
  const editorHeight = props.multiline ? Math.max(4, props.inputHeight ?? 7) : 1
  /**
   * Track which control is currently active inside the input dialog.
   * 跟踪输入对话框内部当前激活的是哪一个控件。
   *
   * The dialog keeps keyboard navigation self-contained so operators can stay
   * on the keyboard when they want to switch from typing to the footer buttons.
   * 这个对话框会把键盘导航限制在自身内部，
   * 这样操作者从输入切到底部按钮时可以一直停留在键盘上。
   */
  const [activeControl, setActiveControl] = createSignal<"input" | "cancel" | "confirm">("input")
  let inputRef: InputRenderable | undefined
  let textareaRef: TextareaRenderable | undefined

  /**
   * Submit the current dialog value through the shared confirm callback.
   * 通过共享确认回调提交当前对话框里的值。
   */
  const submitCurrentValue = () => {
    props.onConfirm(value())
  }

  /**
   * Focus the active text editor regardless of whether the dialog is single-line or multi-line.
   * 无论当前对话框是单行还是多行，都把焦点交给当前激活的文本编辑器。
   */
  const focusEditor = () => {
    if (props.multiline) {
      textareaRef?.focus()
      return
    }
    inputRef?.focus()
  }

  onMount(() => {
    queueMicrotask(() => {
      focusEditor()
    })
  })

  /**
   * Return focus to the text input whenever keyboard navigation switches back to it.
   * 每当键盘导航切回输入框时，把焦点重新交还给文本输入控件。
   */
  createEffect(() => {
    if (activeControl() !== "input") return
    queueMicrotask(() => {
      focusEditor()
    })
  })

  /**
   * Move the keyboard-active control across input and footer actions.
   * 在输入框和底部动作之间移动键盘激活控件。
   */
  const moveActiveControl = (direction: 1 | -1) => {
    const controls: Array<"input" | "cancel" | "confirm"> = ["input", "cancel", "confirm"]
    const currentIndex = controls.indexOf(activeControl())
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + controls.length) % controls.length
    setActiveControl(controls[nextIndex] ?? "input")
  }

  /**
   * Handle keyboard shortcuts that belong to this dialog itself.
   * 处理这个对话框自身负责的键盘快捷键。
   *
   * Tab cycles the active control, while Enter applies the currently selected
   * footer action so the dialog does not require a mouse click for common flows.
   * Tab 会轮换当前激活控件，
   * Enter 则执行当前选中的底部动作，避免常见流程必须再点鼠标。
   */
  useKeyboard((event) => {
    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      props.onCancel()
      return
    }
    if (event.name === "tab") {
      event.preventDefault()
      event.stopPropagation()
      moveActiveControl(event.shift ? -1 : 1)
      return
    }
    if (["left", "right"].includes(event.name) && activeControl() !== "input") {
      event.preventDefault()
      event.stopPropagation()
      setActiveControl((current) => {
        if (current === "cancel") return "confirm"
        if (current === "confirm") return "cancel"
        return current
      })
      return
    }
    if (["return", "enter", "linefeed"].includes(event.name)) {
      if (props.multiline && activeControl() === "input") {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (activeControl() === "cancel") {
        props.onCancel()
        return
      }
      submitCurrentValue()
    }
  })

  return (
    <VmmDialogFrame title={props.title} onDismiss={props.onCancel}>
      <box flexDirection="column" gap={1}>
        {props.contentLines.map((line) => (
          <text fg="#b8b8b8">{line}</text>
        ))}
      </box>
      <box
        width="100%"
        height={props.multiline ? editorHeight + 2 : 3}
        border
        borderColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
        flexDirection="row"
        alignItems={props.multiline ? "flex-start" : "center"}
        paddingLeft={1}
        paddingRight={1}
        paddingTop={props.multiline ? 1 : 0}
        paddingBottom={props.multiline ? 1 : 0}
        onMouseUp={(event) => {
          if (event.button !== MouseButton.LEFT) return
          event.stopPropagation()
          event.preventDefault()
          setActiveControl("input")
          focusEditor()
        }}
      >
        {props.multiline ? (
          <textarea
            ref={textareaRef}
            width="100%"
            height={editorHeight}
            initialValue={props.initialValue ?? ""}
            placeholder={props.placeholder}
            placeholderColor={VMM_TUI_COLOR_MUTED}
            backgroundColor="transparent"
            focusedBackgroundColor="transparent"
            textColor={VMM_TUI_COLOR_BODY}
            focusedTextColor={VMM_TUI_COLOR_TITLE}
            cursorColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
            wrapMode="word"
            focused={activeControl() === "input"}
            keyBindings={VMM_MULTILINE_SUBMIT_KEY_BINDINGS}
            onContentChange={(nextValue) => {
              setValue(typeof nextValue === "string" ? nextValue : textareaRef?.plainText ?? value())
              setActiveControl("input")
            }}
            onSubmit={() => {
              submitCurrentValue()
            }}
          />
        ) : (
          <input
            ref={inputRef}
            width="100%"
            value={value()}
            placeholder={props.placeholder}
            placeholderColor={VMM_TUI_COLOR_MUTED}
            backgroundColor="transparent"
            focusedBackgroundColor="transparent"
            textColor={VMM_TUI_COLOR_BODY}
            focusedTextColor={VMM_TUI_COLOR_TITLE}
            cursorColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
            focused={activeControl() === "input"}
            onInput={(nextValue) => {
              setValue(nextValue)
              setActiveControl("input")
            }}
          />
        )}
      </box>
      {props.multiline ? (
        <box width="100%" justifyContent="center">
          <text fg={VMM_TUI_COLOR_HINT}>
            {tVmmTui(props.language, "dialog_multiline_input_keys_hint")}
          </text>
        </box>
      ) : null}
      <box width="100%" flexDirection="row" justifyContent="flex-end" gap={1}>
        <VmmDialogButton
          label={props.cancelLabel ?? getVmmDialogCancelLabel(props.language)}
          selected={activeControl() === "cancel"}
          variant="secondary"
          onHover={() => setActiveControl("cancel")}
          onPress={props.onCancel}
        />
        <VmmDialogButton
          label={props.confirmLabel ?? getVmmDialogConfirmLabel(props.language)}
          selected={activeControl() === "confirm"}
          variant={props.confirmVariant ?? "primary"}
          onHover={() => setActiveControl("confirm")}
          onPress={submitCurrentValue}
        />
      </box>
    </VmmDialogFrame>
  )
}

/**
 * Custom select dialog with a compact up/down list and no filter bar.
 * 自定义选择对话框，使用紧凑的上下列表，不带过滤输入框。
 */
export const VmmSelectDialogView = (props: {
  language: VmmLanguage
  title: string
  contentLines?: ReadonlyArray<string>
  options: ReadonlyArray<VmmDialogSelectOption>
  onSelect: (value: string) => void
  onCancel: () => void
}) => {
  const [selectedId, setSelectedId] = createSignal(props.options[0]?.value ?? "")

  createEffect(() => {
    const current = selectedId()
    if (props.options.some((option) => option.value === current)) return
    setSelectedId(props.options[0]?.value ?? "")
  })

  const moveSelection = (direction: -1 | 1) => {
    if (props.options.length === 0) return
    const currentIndex = props.options.findIndex((option) => option.value === selectedId())
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + props.options.length) % props.options.length
    setSelectedId(props.options[nextIndex]?.value ?? props.options[0]?.value ?? "")
  }

  const confirmSelection = (value?: string) => {
    const selectedValue = value ?? selectedId()
    if (!selectedValue) return
    props.onSelect(selectedValue)
  }

  useKeyboard((event) => {
    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      props.onCancel()
      return
    }
    if (["up", "k"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      moveSelection(-1)
      return
    }
    if (["down", "j"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      moveSelection(1)
      return
    }
    if (["return", "enter", "linefeed"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      confirmSelection()
    }
  })

  return (
    <VmmDialogFrame title={props.title} onDismiss={props.onCancel}>
      {props.contentLines?.length ? (
        <box flexDirection="column" gap={1}>
          {props.contentLines.map((line) => (
            <text fg="#b8b8b8">{line}</text>
          ))}
        </box>
      ) : null}
      <box
        width="100%"
        minHeight={0}
        maxHeight={18}
        border
        borderColor={VMM_TUI_COLOR_BORDER}
        flexDirection="column"
        padding={1}
      >
        <VmmScrollColumn selectedChildId={buildVmmRowRenderableId("dialog-select", selectedId())}>
          {props.options.map((option) => (
            <VmmCompactListRow
              rowId={buildVmmRowRenderableId("dialog-select", option.value)}
              title={option.title}
              subtitle={option.subtitle}
              selected={option.value === selectedId()}
              onHover={() => setSelectedId(option.value)}
              onPress={() => confirmSelection(option.value)}
            />
          ))}
        </VmmScrollColumn>
      </box>
      <box width="100%" flexDirection="row" justifyContent="center">
        <text fg={VMM_TUI_COLOR_HINT}>{tVmmTui(props.language, "dialog_select_keys_hint")}</text>
      </box>
    </VmmDialogFrame>
  )
}

/**
 * Open a prompt dialog so the user can resolve or create a VMM user by name.
 * 打开输入框，让用户按名称解析或创建一个 VMM user。
 *
 * The prompt itself stays minimal: once a non-empty name is confirmed, the
 * actual resolve/create RPC runs outside the dialog so the dialog lifecycle
 * remains simple and predictable.
 * 这个输入框本身保持极简：一旦用户提交了非空名称，就在对话框外执行
 * 真正的解析/创建 RPC，这样对话框生命周期会更简单、更可预测。
 */
function openNewUserPrompt(
  api: TuiPluginApi,
  language: VmmLanguage,
  onConfirmName: (name: string) => void,
) {
  let hasSubmitted = false
  replaceVmmDialog(() => (
    <VmmInputDialogView
      language={language}
      title={tVmmTui(language, "new_user_dialog_title")}
      placeholder={tVmmTui(language, "new_user_dialog_placeholder")}
      contentLines={[tVmmTui(language, "new_user_dialog_description")]}
      onCancel={() => {
        clearVmmDialog()
      }}
      onConfirm={(value) => {
        const trimmed = value.trim()
        if (!trimmed) {
          openVmmInfoDialog({
            api,
            title: tVmmTui(language, "user_manager_toast_title"),
            message: tVmmTui(language, "new_user_dialog_empty"),
            onClose: () => {
              openNewUserPrompt(api, language, onConfirmName)
            },
          })
          return
        }
        if (hasSubmitted) return
        hasSubmitted = true
        clearVmmDialog()
        onConfirmName(trimmed)
      }}
    />
  ))
}

/**
 * Open one reusable text prompt dialog for short or long-form input.
 * 打开一个可复用的文本输入对话框，可承载短文本或长文本输入。
 *
 * Several setting-center actions only need one explicit confirmation surface,
 * but the payload may still be a long-form note, list, or multi-line draft.
 * This helper keeps both single-line and multi-line prompts behaviorally
 * consistent on the shared dialog stack.
 * 设置中心里有很多动作都只需要一层明确的确认界面，
 * 但实际载荷可能是短文本、长备注、逐行列表或多行草稿。
 * 这个助手会把单行和多行 prompt 都统一挂到共享对话框栈上，
 * 保持交互行为一致。
 */
function openVmmTextPrompt(args: {
  api: TuiPluginApi
  language?: VmmLanguage
  title: string
  placeholder: string
  description: string
  emptyMessage: string
  initialValue?: string
  multiline?: boolean
  inputHeight?: number
  allowEmpty?: boolean
  toastTitle: string
  validateValue?: (value: string) => string | undefined
  onConfirmValue: (value: string) => void
}) {
  let hasSubmitted = false
  replaceVmmDialog(() => (
    <VmmInputDialogView
      language={args.language ?? activeVmmDialogLanguage()}
      title={args.title}
      placeholder={args.placeholder}
      initialValue={args.initialValue}
      multiline={args.multiline}
      inputHeight={args.inputHeight}
      contentLines={[args.description]}
      onCancel={() => {
        clearVmmDialog()
      }}
      onConfirm={(value) => {
        const normalizedValue = args.multiline ? value : value.trim()
        if (!args.allowEmpty && !normalizedValue.trim()) {
          openVmmInfoDialog({
            api: args.api,
            title: args.toastTitle,
            message: args.emptyMessage,
            onClose: () => {
              openVmmTextPrompt({
                ...args,
                initialValue: value,
              })
            },
          })
          return
        }
        const validationMessage = args.validateValue?.(normalizedValue)
        if (validationMessage) {
          openVmmInfoDialog({
            api: args.api,
            title: args.toastTitle,
            message: validationMessage,
            onClose: () => {
              openVmmTextPrompt({
                ...args,
                initialValue: value,
              })
            },
          })
          return
        }
        if (hasSubmitted) return
        hasSubmitted = true
        clearVmmDialog()
        args.onConfirmValue(normalizedValue)
      }}
    />
  ))
}

/**
 * Open one reusable exact-match prompt before irreversible actions.
 * 在不可逆动作前打开一个可复用的精确匹配输入框。
 *
 * Some destructive flows should not rely on one simple confirm click. This
 * helper keeps the prompt open when the typed text is empty or mismatched so
 * the user can retry immediately or cancel with Esc.
 * 某些破坏性流程不适合只靠一次简单确认点击。
 * 这个助手会在输入为空或不匹配时保留提示框，让用户可以直接重试，或用 Esc 取消。
 */
function openVmmExactConfirmPrompt(args: {
  api: TuiPluginApi
  language?: VmmLanguage
  title: string
  placeholder: string
  descriptionLines: ReadonlyArray<string>
  expectedValue: string
  initialValue?: string
  emptyMessage: string
  mismatchMessage: string
  toastTitle: string
  onConfirmValue: (value: string) => void
}) {
  let hasSubmitted = false
  replaceVmmDialog(() => (
    <VmmInputDialogView
      language={args.language ?? activeVmmDialogLanguage()}
      title={args.title}
      placeholder={args.placeholder}
      initialValue={args.initialValue}
      contentLines={args.descriptionLines}
      confirmVariant="danger"
      onCancel={() => {
        clearVmmDialog()
      }}
      onConfirm={(value) => {
        const trimmed = value.trim()
        if (!trimmed) {
          openVmmInfoDialog({
            api: args.api,
            language: args.language,
            title: args.toastTitle,
            message: args.emptyMessage,
            onClose: () => {
              openVmmExactConfirmPrompt({
                ...args,
                initialValue: value,
              })
            },
          })
          return
        }
        if (trimmed !== args.expectedValue) {
          openVmmInfoDialog({
            api: args.api,
            language: args.language,
            title: args.toastTitle,
            message: args.mismatchMessage,
            onClose: () => {
              openVmmExactConfirmPrompt({
                ...args,
                initialValue: value,
              })
            },
          })
          return
        }
        if (hasSubmitted) return
        hasSubmitted = true
        clearVmmDialog()
        args.onConfirmValue(trimmed)
      }}
    />
  ))
}

/**
 * Open one reusable confirm dialog before a destructive or high-authority action.
 * 在破坏性或高权威动作前打开一个可复用的确认对话框。
 */
function openVmmConfirmDialog(args: {
  api: TuiPluginApi
  language?: VmmLanguage
  title: string
  message: string
  onConfirm: () => void
}) {
  let hasConfirmed = false
  replaceVmmDialog(() => (
    <VmmConfirmDialogView
      language={args.language ?? activeVmmDialogLanguage()}
      title={args.title}
      contentLines={[args.message]}
      confirmVariant="danger"
      onCancel={() => {
        clearVmmDialog()
      }}
      onConfirm={() => {
        if (hasConfirmed) return
        hasConfirmed = true
        clearVmmDialog()
        args.onConfirm()
      }}
    />
  ))
}

/**
 * Open one reusable scope picker for binding a VMM user into local or global config.
 * 打开一个可复用的动作选择框，把 VMM 用户绑定到工作区、公共配置，或执行删除。
 *
 * User Manager no longer keeps one persistent scope tab. Instead it asks
 * for the next action right before the write so the list can stay compact and
 * launcher-like while still supporting destructive actions on one user row.
 * User Manager 不再长期保留一个作用域页签，
 * 而是在真正写入前再询问下一步动作，让列表本身保持更紧凑的启动器风格，
 * 同时仍能在单个用户行上挂接删除这类破坏性操作。
 */
function openUserManagerScopeDialog(args: {
  api: TuiPluginApi
  language: VmmLanguage
  onSelectScope: (scope: VmmConfigScope) => void
  onDeleteUser?: () => void
}) {
  let hasSelected = false
  replaceVmmDialog(() => (
    <VmmSelectDialogView
      language={args.language}
      title={tVmmTui(args.language, "user_manager_overlay_scope_dialog_title")}
      options={[
        {
          title: tVmmTui(args.language, "user_manager_overlay_scope_workspace_title"),
          subtitle: tVmmTui(args.language, "user_manager_overlay_scope_workspace_subtitle"),
          value: "local",
        },
        {
          title: tVmmTui(args.language, "user_manager_overlay_scope_global_title"),
          subtitle: tVmmTui(args.language, "user_manager_overlay_scope_global_subtitle"),
          value: "global",
        },
        ...(args.onDeleteUser
          ? [
              {
                title: tVmmTui(args.language, "user_manager_overlay_scope_delete_title"),
                subtitle: tVmmTui(args.language, "user_manager_overlay_scope_delete_subtitle"),
                value: "delete-user",
              },
            ]
          : []),
      ]}
      onCancel={() => {
        clearVmmDialog()
      }}
      onSelect={(value) => {
        if (hasSelected) return
        hasSelected = true
        clearVmmDialog()
        if (value === "delete-user") {
          args.onDeleteUser?.()
          return
        }
        if (value !== "local" && value !== "global") return
        args.onSelectScope(value)
      }}
    />
  ))
}

/**
 * Open one shared-public replacement picker before deleting the currently bound global user.
 * 在删除当前公共绑定用户前，打开一个公共替代账号选择框。
 *
 * If the deleted account is also the shared global binding, the overlay flow must
 * select another existing user first so the public setting never points at a
 * removed account after the delete succeeds.
 * 如果待删账号同时也是公共设置当前绑定的用户，
 * 这套弹层流程必须先挑选另一个现有账号，避免删除成功后公共设置仍指向一个已移除账号。
 */
function openUserManagerReplacementDialog(args: {
  api: TuiPluginApi
  language: VmmLanguage
  users: ReadonlyArray<VmmGrpcUserEntry>
  deletedUserId: string
  onSelectReplacement: (user: VmmGrpcUserEntry) => void
}) {
  let hasSelected = false
  replaceVmmDialog(() => (
    <VmmSelectDialogView
      language={args.language}
      title={tVmmTui(args.language, "user_manager_overlay_replace_global_title")}
      options={args.users
        .filter((user) => String(user.user_id) !== args.deletedUserId)
        .map((user) => ({
          title: formatVmmUserManagerAccountLabel(
            args.language,
            user.user_name || String(user.user_id),
          ),
          subtitle: formatVmmUserManagerIdLabel(args.language, user.user_id),
          value: String(user.user_id),
        }))}
      onCancel={() => {
        clearVmmDialog()
      }}
      onSelect={(value) => {
        if (hasSelected) return
        hasSelected = true
        clearVmmDialog()
        const matchedUser = args.users.find((user) => String(user.user_id) === value)
        if (!matchedUser) return
        args.onSelectReplacement(matchedUser)
      }}
    />
  ))
}

/**
 * Open one reusable result dialog for non-destructive action feedback.
 * 为非破坏性动作反馈打开一个可复用的结果提示框。
 *
 * Some management flows need a stronger acknowledgement than a transient toast,
 * especially when the user just finished a multi-step input flow. This helper
 * reuses the built-in confirm dialog as a simple modal notice and closes on
 * either confirm or cancel.
 * 某些管理流程在走完多步输入后，需要比短暂 toast 更明显的反馈。
 * 这里复用内建确认框做成一个简单的结果弹窗，
 * 无论点确认还是取消，都会直接关闭，适合承载成功或失败提示。
 */
function openVmmInfoDialog(args: {
  api: TuiPluginApi
  language?: VmmLanguage
  title: string
  message: string
  onClose?: () => void
}) {
  let hasClosed = false
  replaceVmmDialog(() => (
    <VmmConfirmDialogView
      language={args.language ?? activeVmmDialogLanguage()}
      title={args.title}
      contentLines={[args.message]}
      confirmLabel={getVmmDialogAcknowledgeLabel(args.language ?? activeVmmDialogLanguage())}
      showCancel={false}
      onCancel={() => {
        if (hasClosed) return
        hasClosed = true
        clearVmmDialog()
        args.onClose?.()
      }}
      onConfirm={() => {
        if (hasClosed) return
        hasClosed = true
        clearVmmDialog()
        args.onClose?.()
      }}
    />
  ))
}

/**
 * Open one transient blocking dialog while a foreground gRPC request is running.
 * 在前台 gRPC 请求执行期间打开一个临时阻塞提示框。
 *
 * Some destructive or high-latency flows close their input prompt first, then
 * spend noticeable time waiting for the backend. This helper keeps one
 * visible "working" overlay open until the caller explicitly closes it, so
 * the operator does not think the submit silently disappeared.
 * 某些破坏性或高延迟流程会先关闭输入框，然后明显等待后端返回。
 * 这个助手会在调用方显式关闭前一直保留一个“正在处理”的提示层，
 * 避免操作者误以为提交动作已经静默消失。
 */
function openVmmPendingDialog(args: {
  api: TuiPluginApi
  language?: VmmLanguage
  title: string
  message: string
}) {
  let closed = false
  replaceVmmDialog(() => (
    <VmmDialogFrame title={args.title} dismissible={false}>
      <box flexDirection="column" gap={1}>
        <text fg="#b8b8b8">{args.message}</text>
        <text fg="#8f8f8f">gRPC...</text>
      </box>
    </VmmDialogFrame>
  ))
  return () => {
    if (closed) return
    closed = true
    clearVmmDialog()
  }
}

/**
 * Open one reusable scope picker for binding a VMM project into local or global config.
 * 打开一个可复用的动作选择框，把 VMM 项目绑定到工作区或公共配置。
 *
 * The rebuilt project manager follows the same "pick the target scope right
 * before the write" interaction as the user manager overlay, so one project
 * row can stay compact while still supporting both workspace and global saves.
 * 重建后的项目管理会沿用用户管理那种“真正写入前再挑作用域”的交互，
 * 这样单条项目行可以保持紧凑，同时又支持工作区和公共设置两种写入目标。
 */
function openProjectManagerScopeDialog(args: {
  api: TuiPluginApi
  language: VmmLanguage
  onSelectScope: (scope: VmmConfigScope) => void
  onDeleteProject?: () => void
  onMigrateProject?: () => void
}) {
  let hasSelected = false
  replaceVmmDialog(() => (
    <VmmSelectDialogView
      language={args.language}
      title={tVmmTui(args.language, "project_manager_overlay_scope_dialog_title")}
      options={[
        {
          title: tVmmTui(args.language, "project_manager_overlay_scope_workspace_title"),
          subtitle: tVmmTui(args.language, "project_manager_overlay_scope_workspace_subtitle"),
          value: "local",
        },
        {
          title: tVmmTui(args.language, "project_manager_overlay_scope_global_title"),
          subtitle: tVmmTui(args.language, "project_manager_overlay_scope_global_subtitle"),
          value: "global",
        },
        ...(args.onDeleteProject
          ? [
              {
                title: tVmmTui(args.language, "project_manager_overlay_scope_delete_title"),
                subtitle: tVmmTui(
                  args.language,
                  "project_manager_overlay_scope_delete_subtitle",
                ),
                value: "delete-project",
              },
            ]
          : []),
        ...(args.onMigrateProject
          ? [
              {
                title: tVmmTui(args.language, "project_manager_overlay_scope_migrate_title"),
                subtitle: tVmmTui(
                  args.language,
                  "project_manager_overlay_scope_migrate_subtitle",
                ),
                value: "migrate-project",
              },
            ]
          : []),
      ]}
      onCancel={() => {
        clearVmmDialog()
      }}
      onSelect={(value) => {
        if (hasSelected) return
        hasSelected = true
        clearVmmDialog()
        if (value === "delete-project") {
          args.onDeleteProject?.()
          return
        }
        if (value === "migrate-project") {
          args.onMigrateProject?.()
          return
        }
        if (value !== "local" && value !== "global") return
        args.onSelectScope(value)
      }}
    />
  ))
}

/**
 * Open one shared-public replacement picker before deleting the currently bound global project.
 * 在删除当前公共绑定项目之前，打开一个公共替代项目选择框。
 *
 * If the deleted project is also the shared global binding, the overlay flow
 * must pick another existing project first so the public setting never points
 * at a removed project after deletion succeeds.
 * 如果待删项目同时也是公共设置当前绑定的项目，
 * 这套弹层流程必须先挑选另一个现有项目，
 * 避免删除成功后公共设置仍然指向一个已移除项目。
 */
function openProjectManagerReplacementDialog(args: {
  api: TuiPluginApi
  language: VmmLanguage
  projects: ReadonlyArray<VmmGrpcProjectEntry>
  deletedProjectId: string
  onSelectReplacement: (project: VmmGrpcProjectEntry) => void
}) {
  let hasSelected = false
  replaceVmmDialog(() => (
    <VmmSelectDialogView
      language={args.language}
      title={tVmmTui(args.language, "project_manager_overlay_replace_global_title")}
      options={args.projects
        .filter((project) => String(project.project_id) !== args.deletedProjectId)
        .map((project) => ({
          title: project.display_path || project.project_name || `#${project.project_id}`,
          subtitle: formatVmmProjectManagerIdLabel(args.language, project.project_id),
          value: String(project.project_id),
        }))}
      onCancel={() => {
        clearVmmDialog()
      }}
      onSelect={(value) => {
        if (hasSelected) return
        hasSelected = true
        clearVmmDialog()
        const matchedProject = args.projects.find(
          (project) => String(project.project_id) === value,
        )
        if (!matchedProject) return
        args.onSelectReplacement(matchedProject)
      }}
    />
  ))
}

/**
 * Open one reusable scope picker for saving a language override.
 * 打开一个可复用的作用域选择框，用于保存语言覆盖值。
 *
 * The rebuilt language overlay keeps its main list focused on language
 * choices, then asks for the write scope only after the user picks one
 * language. This keeps the page compact while still supporting both local and
 * global saves.
 * 重建后的语言弹层会先把主列表聚焦在“语言选择”本身，
 * 等用户选定语言后再询问写入范围。
 * 这样页面可以保持紧凑，同时又支持工作区和公共设置两种保存目标。
 */
function openLanguageControlScopeDialog(args: {
  api: TuiPluginApi
  language: VmmLanguage
  onSelectScope: (scope: VmmConfigScope) => void
}) {
  let hasSelected = false
  replaceVmmDialog(() => (
    <VmmSelectDialogView
      language={args.language}
      title={tVmmTui(args.language, "language_control_scope_dialog_title")}
      options={[
        {
          title: tVmmTui(args.language, "language_control_scope_workspace_title"),
          subtitle: tVmmTui(args.language, "language_control_scope_workspace_subtitle"),
          value: "local",
        },
        {
          title: tVmmTui(args.language, "language_control_scope_global_title"),
          subtitle: tVmmTui(args.language, "language_control_scope_global_subtitle"),
          value: "global",
        },
      ]}
      onCancel={() => {
        clearVmmDialog()
      }}
      onSelect={(value) => {
        if (hasSelected) return
        hasSelected = true
        clearVmmDialog()
        if (value !== "local" && value !== "global") return
        args.onSelectScope(value)
      }}
    />
  ))
}

/**
 * Open one reusable scope picker for saving one memory-setting change.
 * 打开一个可复用的作用域选择框，用于保存一条记忆设置变更。
 *
 * The rebuilt memory overlay no longer keeps one persistent write-scope selector
 * on the page. Instead it asks for the target scope only after the operator
 * chooses one function, so the main list can stay compact and focused on
 * memory operations themselves.
 * 重建后的记忆设置不再在页面里常驻一个写入范围选择器；
 * 而是在操作者先选功能之后，再询问目标作用域，
 * 这样主列表就能保持紧凑，只聚焦在记忆操作本身。
 */
function openMemorySettingsScopeDialog(args: {
  api: TuiPluginApi
  language: VmmLanguage
  onSelectScope: (scope: VmmConfigScope) => void
}) {
  let hasSelected = false
  replaceVmmDialog(() => (
    <VmmSelectDialogView
      language={args.language}
      title={tVmmTui(args.language, "memory_settings_scope_dialog_title")}
      options={[
        {
          title: tVmmTui(args.language, "memory_settings_scope_workspace_title"),
          subtitle: tVmmTui(args.language, "memory_settings_scope_workspace_subtitle"),
          value: "local",
        },
        {
          title: tVmmTui(args.language, "memory_settings_scope_global_title"),
          subtitle: tVmmTui(args.language, "memory_settings_scope_global_subtitle"),
          value: "global",
        },
      ]}
      onCancel={() => {
        clearVmmDialog()
      }}
      onSelect={(value) => {
        if (hasSelected) return
        hasSelected = true
        clearVmmDialog()
        if (value !== "local" && value !== "global") return
        args.onSelectScope(value)
      }}
    />
  ))
}

/**
 * Open one generic compact selection dialog for feature entry flows.
 * 为功能入口流程打开一个通用的紧凑选择对话框。
 *
 * Some screens should ask the user for one target before the real workspace
 * appears. This helper keeps those flows on the shared custom dialog stack so
 * they inherit the same right-click cancel and keyboard behavior as every
 * other VMM overlay.
 * 有些页面在真正进入工作区前，需要先让用户挑选一个目标。
 * 这个助手会把这类流程统一挂到共享自定义对话框栈上，
 * 从而继承和其他 VMM 弹层一致的右键取消与键盘行为。
 */
function openVmmSelectDialog(args: {
  language?: VmmLanguage
  title: string
  contentLines?: ReadonlyArray<string>
  options: ReadonlyArray<VmmDialogSelectOption>
  onSelect: (value: string) => void
  onCancel: () => void
}) {
  let hasSelected = false
  replaceVmmDialog(() => (
    <VmmSelectDialogView
      language={args.language ?? activeVmmDialogLanguage()}
      title={args.title}
      contentLines={args.contentLines}
      options={args.options}
      onCancel={() => {
        clearVmmDialog()
        args.onCancel()
      }}
      onSelect={(value) => {
        if (hasSelected) return
        hasSelected = true
        clearVmmDialog()
        args.onSelect(value)
      }}
    />
  ))
}

/**
 * Format one localized user-id label for compact second-line list descriptions.
 * 把一个用户 ID 格式化成紧凑的本地化标签，用在列表第二行说明里。
 */
function formatVmmUserManagerIdLabel(language: VmmLanguage, userId: string | number) {
  return tVmmTui(language, "user_manager_overlay_id_label", {
    id: String(userId),
  })
}

/**
 * Format one localized account label used as the primary title in overlay rows.
 * 格式化覆盖层用户行主标题里使用的本地化账号标签。
 */
function formatVmmUserManagerAccountLabel(language: VmmLanguage, accountName: string) {
  return tVmmTui(language, "user_manager_overlay_account_label", {
    name: accountName,
  })
}

/**
 * Format one localized project-id label for compact second-line list descriptions.
 * 把一个项目 ID 格式化成紧凑的本地化标签，用在列表第二行说明里。
 */
function formatVmmProjectManagerIdLabel(language: VmmLanguage, projectId: string | number) {
  return tVmmTui(language, "project_manager_overlay_id_label", {
    id: String(projectId),
  })
}

/**
 * Parse one raw scoped visible-memory value from config storage.
 * 把一条作用域里的显式记忆模式原始值解析成布尔态。
 *
 * The config reader returns stable strings for cross-layer summaries. Memory
 * mode needs one boolean view again before the footer can describe local,
 * global, and effective state.
 * 配置读取器为了跨层摘要会先统一返回字符串；
 * 但记忆模式在页脚摘要里还需要回到布尔语义，
 * 这样才能正确描述本地、公共和当前生效状态。
 */
function parseScopedMemoryModeValue(rawValue: string) {
  const normalized = rawValue.trim().toLowerCase()
  if (normalized === "true") return true
  if (normalized === "false") return false
  return undefined
}

/**
 * Parse one raw scoped compact-recall value from config storage.
 * 把一条作用域里的 compact-recall 开关原始值解析成布尔态。
 *
 * The footer summary needs to distinguish between an inherited empty value and
 * one explicit compact-aware override. Reusing the stable bool parser keeps
 * the display rules aligned with the JSON config semantics.
 * 页脚摘要需要区分“继承的空值”和“显式 compact-aware 覆盖”。
 * 这里复用稳定布尔解析规则，可以让展示语义和 JSON 配置语义保持一致。
 */
function parseScopedSessionCompactRecallValue(rawValue: string) {
  return parseScopedMemoryModeValue(rawValue)
}

/**
 * Parse one scoped non-negative integer value from config storage.
 * 把一条作用域里的非负整数原始值解析成数字。
 *
 * Several footer summaries need to distinguish "unset / inherit" from one real
 * numeric override, so invalid or missing values return undefined here.
 * 多个页脚摘要都需要区分“未设置 / 继承”和真实数字覆盖值，
 * 因此这里遇到缺失或非法输入时会返回 undefined。
 */
function parseScopedNonNegativeIntegerValue(rawValue: string) {
  const normalized = rawValue.trim()
  if (!/^\d+$/.test(normalized)) return undefined
  return Number.parseInt(normalized, 10)
}

/**
 * Parse one raw scoped implicit-turn value from config storage.
 * 把一条作用域里的隐式轮数原始值解析成数字。
 */
function parseScopedImplicitTurnsValue(rawValue: string) {
  return parseScopedNonNegativeIntegerValue(rawValue)
}

/**
 * Parse one raw scoped profile-refresh-turn value from config storage.
 * 把一条作用域里的画像刷新轮数原始值解析成数字。
 */
function parseScopedProfileRefreshTurnsValue(rawValue: string) {
  return parseScopedNonNegativeIntegerValue(rawValue)
}

/**
 * Normalize one project-path-like input back into the canonical Team/Space/Project text.
 * 把一条“看起来像项目路径”的输入规范化回标准 Team/Space/Project 文本。
 *
 * Some UI summaries prepend helper prefixes such as `[2]` or `编号#2/`.
 * Destructive project flows should always compare and submit the pure path only,
 * so this helper strips known presentation prefixes before validation.
 * 某些界面摘要会在路径前面拼上 `[2]` 或 `编号#2/` 这类展示前缀。
 * 项目删除、迁移这类破坏性流程应该始终只比较和提交纯路径，
 * 因此这里会先剥掉已知的展示前缀，再交给后续校验逻辑使用。
 */
function normalizeCanonicalProjectPathInput(projectPath: string | undefined) {
  const cleaned = projectPath?.trim() ?? ""
  if (!cleaned) return ""

  /**
   * Remove compact id prefixes that may leak from overlay summary rows.
   * 去掉可能从弹层摘要行里串进来的紧凑 ID 前缀。
   */
  return cleaned
    .replace(/^\[\d+\]\s*/, "")
    .replace(/^(?:ID|编号)#\d+\s*\/\s*/i, "")
    .trim()
}

/**
 * Judge whether one project path follows the canonical Team/Space/Project shape.
 * 判断一个项目路径是否满足标准 Team/Space/Project 结构。
 *
 * The TUI should reject obviously invalid hierarchy input before it closes the
 * creation prompt, so this helper mirrors the backend's current path contract:
 * exactly three slash-separated, non-empty segments.
 * TUI 需要在关闭新建输入框之前先拦住明显非法的层级路径，
 * 因此这里镜像后端当前的路径契约：必须正好三段，且每一段都非空。
 */
function looksLikeCanonicalProjectPath(projectPath: string | undefined) {
  const cleaned = normalizeCanonicalProjectPathInput(projectPath)
  if (!cleaned) return false
  const parts = cleaned.split("/")
  return parts.length === 3 && parts.every((part) => Boolean(part.trim()))
}

/**
 * Convert EnsureProject failures into one project-manager specific user-facing message.
 * 把 EnsureProject 的失败结果转换成项目管理专用的用户提示。
 *
 * The generic gRPC summarizer is still useful for transport failures, but the
 * project manager should surface hierarchy-specific hints for invalid paths and
 * duplicate/conflicting names so the operator knows how to recover.
 * 通用 gRPC 摘要仍然适合处理传输级失败，
 * 但项目管理需要把“路径格式错误”和“重名/冲突”这类层级语义翻成更直接的恢复提示，
 * 这样操作者才知道下一步该怎么改。
 */
function summarizeProjectCreateFailure(
  language: VmmLanguage,
  result: VmmGrpcUnaryResult<unknown>,
) {
  const normalizedDetails = String(result.details ?? "")
    .trim()
    .toLowerCase()
  const normalizedCode = String(result.grpcCodeName ?? "")
    .trim()
    .toUpperCase()

  /**
   * Match hierarchy validation and conflict cases before falling back to the generic summary.
   * 先匹配层级校验和冲突场景，再回退到通用错误摘要。
   */
  if (
    normalizedCode === "INVALID_ARGUMENT" ||
    normalizedDetails.includes("must be teamname/spacename/projectname") ||
    normalizedDetails.includes("project_path:")
  ) {
    return tVmmTui(language, "project_manager_overlay_error_invalid_path")
  }
  if (normalizedCode === "ALREADY_EXISTS" || normalizedDetails.includes("already exists")) {
    return tVmmTui(language, "project_manager_overlay_error_exists")
  }
  if (normalizedCode === "FAILED_PRECONDITION" || normalizedDetails.includes("confirm")) {
    return tVmmTui(language, "project_manager_overlay_error_confirmation")
  }
  if (normalizedCode === "ABORTED" || normalizedDetails.includes("conflict")) {
    return tVmmTui(language, "project_manager_overlay_error_conflict")
  }
  return summarizeGrpcResult(language, tVmmTui(language, "project_manager_overlay_add_title"), result)
}

/**
 * Format one project entry into a compact path-plus-id label.
 * 把一条项目记录格式化成紧凑的路径加 ID 标签。
 */
function formatProjectEntry(project: VmmGrpcProjectEntry | undefined) {
  if (!project) return "(unknown project)"
  return `${project.display_path} (#${project.project_id})`
}

/**
 * Format one user entry into a compact name-plus-id label.
 * 把一条用户记录格式化成紧凑的名称加 ID 标签。
 */
function formatUserEntry(user: VmmGrpcUserEntry | undefined) {
  if (!user) return "(unknown user)"
  return `${user.user_name || "(unnamed user)"} (#${user.user_id})`
}

/**
 * Convert one UI profile target token into the current gRPC enum string.
 * 把 UI 里的画像目标 token 转成当前 gRPC 枚举字符串。
 */
function toGrpcProfileTarget(target: VmmTuiProfileTarget): VmmGrpcProfileTarget {
  switch (target) {
    case "user":
      return "PROFILE_TARGET_USER"
    case "project":
      return "PROFILE_TARGET_PROJECT"
    case "team":
      return "PROFILE_TARGET_TEAM"
    case "space":
      return "PROFILE_TARGET_SPACE"
  }
}

/**
 * Build one compact raw P/L/W label for profile nodes.
 * 为画像节点构建紧凑的原始 P/L/W 标签。
 */
function buildProfileNodePlw(node: VmmGrpcProfileNodeEntry) {
  return `${node.priority || "?"}-${node.level || "?"}-W${node.refresh_weight}`
}

/**
 * Convert one raw millisecond timestamp into a YYYY-MM-DD date string.
 * 把原始毫秒时间戳转换成 YYYY-MM-DD 日期字符串。
 */
function formatEpochMillisecondsAsLocalDate(value: string | number | undefined) {
  const raw = typeof value === "number" ? String(value) : String(value ?? "").trim()
  if (!raw || raw === "0") return "-"

  const numeric = Number.parseInt(raw, 10)
  if (!Number.isFinite(numeric) || numeric <= 0) return raw

  const date = new Date(numeric)
  if (Number.isNaN(date.getTime())) return raw

  const pad = (part: number) => String(part).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Shorten one long node/content string for list subtitles.
 * 为列表副标题截断较长的节点或内容字符串。
 */
function truncateForList(value: string | undefined, maxLength = 56) {
  const cleaned = String(value ?? "").replace(/\s+/g, " ").trim()
  if (!cleaned) return "-"
  return cleaned.length <= maxLength ? cleaned : `${cleaned.slice(0, maxLength - 1)}…`
}

/**
 * Convert one profile target into a localized label for TUI details.
 * 把画像目标转换成 TUI 详情面板使用的本地化标签。
 */
function formatTuiProfileTarget(language: VmmLanguage, target: VmmTuiProfileTarget) {
  if (language === "zh-CN") {
    switch (target) {
      case "user":
        return "用户"
      case "project":
        return "项目"
      case "team":
        return "团队"
      case "space":
        return "空间"
    }
  }
  return target
}

/**
 * Convert one backend profile source kind into a localized TUI label.
 * 把后端画像来源枚举转换成 TUI 使用的本地化标签。
 */
function formatTuiProfileSourceKind(
  language: VmmLanguage,
  sourceKind: VmmGrpcProfileNodeSourceKind | undefined,
) {
  switch (sourceKind) {
    case "PROFILE_NODE_SOURCE_KIND_TURN_EXTRACT":
      return language === "zh-CN" ? "对话分析" : "dialog analysis"
    case "PROFILE_NODE_SOURCE_KIND_MANUAL_INSTRUCTION":
      return language === "zh-CN" ? "手动设置" : "manual setting"
    case "PROFILE_NODE_SOURCE_KIND_SYSTEM_SEED":
      return language === "zh-CN" ? "系统种子" : "system seed"
    default:
      return language === "zh-CN" ? "未知来源" : "unknown source"
  }
}

/**
 * Resolve the binding ids required by one profile target.
 * 解析某个画像目标真正需要的绑定 id。
 *
 * User profile operations require only user_id, while project/team/space
 * operations require only project_id, matching the backend validation rules.
 * user 画像操作只要求 user_id，
 * 而 project/team/space 操作只要求 project_id，与后端校验规则保持一致。
 */
function resolveProfileBindingScope(
  config: VmmRuntimeConfig,
  target: VmmTuiProfileTarget,
) {
  if (target === "user") {
    if (!config.userId.trim()) return undefined
    return {
      target: toGrpcProfileTarget(target),
      userID: config.userId,
      projectID: "0",
    }
  }
  if (!config.projectId.trim()) return undefined
  return {
    target: toGrpcProfileTarget(target),
    userID: "0",
    projectID: config.projectId,
  }
}

/**
 * Normalize one backend profile target enum into the route-level target token.
 * 把后端画像目标枚举归一化成当前路由使用的目标 token。
 */
function normalizeProfileTargetToken(
  target: VmmGrpcProfileNodeEntry["target"],
): VmmTuiProfileTarget {
  switch (target) {
    case "PROFILE_TARGET_PROJECT":
      return "project"
    case "PROFILE_TARGET_TEAM":
      return "team"
    case "PROFILE_TARGET_SPACE":
      return "space"
    default:
      return "user"
  }
}

/**
 * Build one reusable pair of local/global scope selector rows.
 * 构建一组可复用的 local/global 写入范围选择行。
 */
function buildScopeSelectorRows(language: VmmLanguage, selectedScope: VmmConfigScope) {
  return (["local", "global"] as const).map((scope) => {
    const scopeLabel = getConfigScopeLabel(scope, language)
    return {
      id: `scope:${scope}`,
      scope,
      title: tVmmTui(language, scope === "local" ? "scope_local_title" : "scope_global_title"),
      subtitle:
        scope === selectedScope
          ? tVmmTui(language, "scope_selected_subtitle", { scope: scopeLabel })
          : tVmmTui(language, "scope_switch_subtitle", { scope: scopeLabel }),
    }
  })
}

/**
 * Build one stable renderable id for rows inside one scrollable pane.
 * 为某个可滚动面板里的行构建稳定 renderable id。
 *
 * OpenTUI scroll containers can bring one child into view only by child id,
 * so every keyboard-navigable pane needs deterministic row ids instead of
 * relying on transient renderable instances.
 * OpenTUI 的滚动容器只能通过子节点 id 把目标滚进可视区，
 * 因此所有支持键盘导航的面板都需要稳定行 id，而不能依赖临时 renderable 实例。
 */
function buildVmmRowRenderableId(sectionId: string, itemId: string) {
  return `vmm-row:${sectionId}:${itemId}`
}

/**
 * Build one reusable detail block for the current scope selector row.
 * 为当前范围选择行构建一段可复用的详情说明。
 */
function buildScopeSelectorDetailLines(
  language: VmmLanguage,
  rowScope: VmmConfigScope,
  selectedScope: VmmConfigScope,
) {
  const scopeLabel = getConfigScopeLabel(rowScope, language)
  return rowScope === selectedScope
    ? [tVmmTui(language, "scope_detail_selected", { scope: scopeLabel })]
    : [tVmmTui(language, "scope_detail_switch", { scope: scopeLabel })]
}

/**
 * One compact list row shared by all setting-center routes.
 * 所有设置中心路由共享的一条紧凑列表行。
 *
 * It intentionally looks like a list entry instead of a large action button,
 * because the user flow is now list-first with details on the right.
 * 这里刻意让它看起来像列表项，而不是大型动作按钮，
 * 因为当前交互已经改成“左侧列表、右侧说明”的模式。
 */
/**
 * Shared width reserved for the left-side selection arrow in custom lists.
 * 自定义列表左侧选中箭头统一预留的宽度。
 *
 * The arrow should appear on every custom list row without changing text
 * alignment between selected and unselected states, so the width is reserved
 * even when the row is not active.
 * 选中箭头需要在所有自定义列表里默认出现，
 * 同时又不能因为选中态切换导致文本左右抖动，
 * 因此这里会在未选中时也持续预留同样的宽度。
 */
const VMM_TUI_LIST_ARROW_WIDTH = 3

/**
 * Render the standard left-side selection arrow for one custom list row.
 * 为一条自定义列表行渲染标准的左侧选中箭头。
 *
 * The shared list system uses one consistent arrow marker so managers,
 * pickers, and compact selection dialogs all expose the same focus cue.
 * 共享列表系统使用同一套箭头标记，
 * 这样管理页、选择框和紧凑型列表都能暴露一致的焦点提示。
 */
const VmmListRowArrow = (props: { selected: boolean }) => (
  <text
    width={VMM_TUI_LIST_ARROW_WIDTH}
    fg={props.selected ? VMM_TUI_COLOR_SECTION : VMM_TUI_COLOR_MUTED}
  >
    {props.selected ? "▶" : " "}
  </text>
)

const VmmListRow = (props: VmmListRowProps) => (
  <box
    id={props.rowId}
    width="100%"
    flexDirection="row"
    paddingLeft={1}
    paddingRight={1}
    paddingTop={0}
    paddingBottom={0}
    backgroundColor={props.selected ? VMM_TUI_COLOR_ROW_SELECTED_BG : VMM_TUI_COLOR_SURFACE}
    border
    borderColor={props.selected ? VMM_TUI_COLOR_ROW_SELECTED_BORDER : VMM_TUI_COLOR_SURFACE}
    onMouseOver={(event) => {
      event.stopPropagation()
      if (props.selected) return
      props.onHover()
    }}
    onMouseUp={(event) => {
      if (event.button !== MouseButton.LEFT) return
      event.stopPropagation()
      event.preventDefault()
      props.onPress()
    }}
  >
    <VmmListRowArrow selected={props.selected} />
    <box flexDirection="column" flexGrow={1} minHeight={0}>
      <text
        fg={
          props.selected
            ? props.selectedTitleColor ?? VMM_TUI_COLOR_TITLE
            : props.titleColor ?? VMM_TUI_COLOR_BODY
        }
      >
        <b>{truncateForList(props.title, props.titleMaxWidth ?? 34)}</b>
      </text>
      <text
        fg={
          props.selected
            ? props.selectedSubtitleColor ?? "#cfe9ff"
            : props.subtitleColor ?? VMM_TUI_COLOR_MUTED
        }
      >
        {truncateForList(props.subtitle, props.subtitleMaxWidth ?? 42)}
      </text>
    </box>
  </box>
)

/**
 * Scrollable column body shared by list and detail panes.
 * 列表面板和详情面板共享的可滚动纵向内容区。
 *
 * Small terminal windows can no longer fit every row at once, so each pane now
 * owns its own vertical scroll region instead of letting content overflow.
 * 小尺寸终端里已经无法一次容纳所有条目，
 * 因此每个面板现在都拥有自己的纵向滚动区域，而不是让内容直接被裁掉。
 */
const VmmScrollColumn = (props: {
  children?: JSX.Element
  selectedChildId?: string
  gap?: number
}) => {
  let scrollRef: ScrollBoxRenderable | undefined

  /**
   * Keep the selected row visible while keyboard navigation moves through long lists.
   * 当键盘在长列表里移动选中项时，持续把当前行保持在可视区域内。
   *
   * The scroll containers already support manual wheel/key scrolling, but menu
   * navigation also needs to pull the selected row into view automatically so
   * users do not lose track of focus in small windows.
   * 当前滚动容器虽然已经支持手动滚动，但菜单导航还需要在选中项变化时
   * 自动把对应行带进视口，否则小窗口里用户会失去焦点位置。
   */
  createEffect(() => {
    const childId = props.selectedChildId
    if (!childId || !scrollRef) return
    queueMicrotask(() => {
      scrollRef?.scrollChildIntoView(childId)
    })
  })

  return (
    <scrollbox ref={scrollRef} flexGrow={1} scrollY>
      <box width="100%" minHeight={0} flexDirection="column" gap={props.gap ?? 1} paddingRight={1}>
        {props.children}
      </box>
    </scrollbox>
  )
}

/**
 * Compact launcher-like row used by User Manager to stay visually close to Select.
 * User Manager 使用的紧凑启动器式行，用来尽量贴近原本 Select 的视觉样式。
 *
 * Unlike the shared boxed row, this version removes borders and extra spacing
 * so grouped sections can still look like one continuous command list.
 * 和共享的带边框列表行不同，这个版本会去掉边框和额外间距，
 * 让带分组标题的区域仍然看起来像一整块连续命令列表。
 */
const VmmCompactListRow = (props: {
  rowId?: string
  title: string
  subtitle: string
  selected: boolean
  onHover: () => void
  onPress: () => void
}) => (
  <box
    id={props.rowId}
    width="100%"
    flexDirection="row"
    paddingLeft={1}
    paddingRight={1}
    backgroundColor={props.selected ? VMM_TUI_COLOR_ROW_SELECTED_BG : "transparent"}
    onMouseOver={(event) => {
      event.stopPropagation()
      if (props.selected) return
      props.onHover()
    }}
    onMouseUp={(event) => {
      if (event.button !== MouseButton.LEFT) return
      event.stopPropagation()
      event.preventDefault()
      props.onPress()
    }}
  >
    <VmmListRowArrow selected={props.selected} />
    <box flexDirection="column" flexGrow={1} minHeight={0}>
      <text fg={props.selected ? VMM_TUI_COLOR_SECTION : VMM_TUI_COLOR_BODY}>
        <b>{truncateForList(props.title, 40)}</b>
      </text>
      <text fg={props.selected ? "#cfe9ff" : VMM_TUI_COLOR_MUTED}>
        {truncateForList(props.subtitle, 48)}
      </text>
    </box>
  </box>
)

/**
 * One bordered section box shared inside each pane.
 * 每个面板内部共享的一块带边框分区。
 *
 * After the setting center gained more panes, the UI needed a second level of
 * structure inside the left/right columns, so scope pickers, live lists, and
 * detail blocks can share the same visual rhythm.
 * 随着设置中心内部出现更多分区，界面需要在左右列内部再加一层结构，
 * 这样范围选择、实时列表和详情区才能维持统一的视觉节奏。
 */
const VmmSectionBox = (props: {
  title: string
  flexGrow?: number
  children?: JSX.Element
}) => (
  <box
    width="100%"
    minHeight={0}
    flexGrow={props.flexGrow}
    border
    borderColor={VMM_TUI_COLOR_BORDER}
    flexDirection="column"
    padding={1}
    gap={1}
  >
    <text fg={VMM_TUI_COLOR_SECTION}>
      <b>{props.title}</b>
    </text>
    {props.children}
  </box>
)

/**
 * One compact profile-table header row.
 * 画像表格使用的一条紧凑表头行。
 *
 * The profile center now renders active nodes as a table on the right so the
 * user can inspect more rows at once than a prose list would allow.
 * 画像中心现在把 active 节点以表格方式渲染在右侧，
 * 这样相比纯说明式列表，用户可以在同一屏里检查更多行。
 */
const VmmProfileTableHeaderRow = (props: { language: VmmLanguage }) => (
  <box width="100%" flexDirection="row" paddingLeft={1} paddingRight={1}>
    <text fg={VMM_TUI_COLOR_MUTED} width={3}>
      {" "}
    </text>
    <text fg={VMM_TUI_COLOR_MUTED} width={7}>
      <b>{tVmmTui(props.language, "profile_table_id")}</b>
    </text>
    <text fg={VMM_TUI_COLOR_MUTED} width={10}>
      <b>{tVmmTui(props.language, "profile_table_scope")}</b>
    </text>
    <text fg={VMM_TUI_COLOR_MUTED} width={11}>
      <b>{tVmmTui(props.language, "profile_table_plw")}</b>
    </text>
    <text fg={VMM_TUI_COLOR_MUTED} width={13}>
      <b>{tVmmTui(props.language, "profile_table_expires")}</b>
    </text>
    <text fg={VMM_TUI_COLOR_MUTED} width={12}>
      <b>{tVmmTui(props.language, "profile_table_source")}</b>
    </text>
    <text fg={VMM_TUI_COLOR_MUTED} flexGrow={1}>
      <b>{tVmmTui(props.language, "profile_table_content")}</b>
    </text>
  </box>
)

/**
 * One compact profile-table data row.
 * 画像表格使用的一条紧凑数据行。
 */
const VmmProfileTableRow = (props: {
  rowId?: string
  language: VmmLanguage
  node: VmmGrpcProfileNodeEntry
  selected: boolean
  onHover: () => void
  onPress: () => void
}) => (
  <box
    id={props.rowId}
    width="100%"
    flexDirection="row"
    paddingLeft={1}
    paddingRight={1}
    backgroundColor={props.selected ? VMM_TUI_COLOR_ROW_SELECTED_BG : VMM_TUI_COLOR_SURFACE}
    border
    borderColor={props.selected ? VMM_TUI_COLOR_ROW_SELECTED_BORDER : VMM_TUI_COLOR_SURFACE}
    onMouseOver={(event) => {
      event.stopPropagation()
      if (props.selected) return
      props.onHover()
    }}
    onMouseUp={(event) => {
      if (event.button !== MouseButton.LEFT) return
      event.stopPropagation()
      event.preventDefault()
      props.onPress()
    }}
  >
    <text fg={props.selected ? VMM_TUI_COLOR_SECTION : VMM_TUI_COLOR_MUTED} width={3}>
      {props.selected ? "▶" : " "}
    </text>
    <text fg={props.selected ? VMM_TUI_COLOR_TITLE : VMM_TUI_COLOR_BODY} width={7}>
      {`#${props.node.profile_node_id}`}
    </text>
    <text fg={props.selected ? VMM_TUI_COLOR_TITLE : VMM_TUI_COLOR_BODY} width={10}>
      {truncateForList(
        formatTuiProfileTarget(props.language, normalizeProfileTargetToken(props.node.target)),
        8,
      )}
    </text>
    <text fg={props.selected ? VMM_TUI_COLOR_TITLE : VMM_TUI_COLOR_BODY} width={11}>
      {buildProfileNodePlw(props.node)}
    </text>
    <text fg={props.selected ? VMM_TUI_COLOR_TITLE : VMM_TUI_COLOR_BODY} width={13}>
      {truncateForList(formatEpochMillisecondsAsLocalDate(props.node.expires_timestamp), 12)}
    </text>
    <text fg={props.selected ? VMM_TUI_COLOR_TITLE : VMM_TUI_COLOR_BODY} width={12}>
      {truncateForList(formatTuiProfileSourceKind(props.language, props.node.source_kind), 10)}
    </text>
    <text fg={props.selected ? VMM_TUI_COLOR_TITLE : VMM_TUI_COLOR_BODY} flexGrow={1}>
      {truncateForList(props.node.content, 48)}
    </text>
  </box>
)

/**
 * Build the home-page commands shown by the setting-center launcher.
 * 构建设置中心首页展示的命令列表。
 *
 * The first line stays in stable English so users can learn one command name,
 * while the second line follows the current UI language for a concise
 * explanation.
 * 第一行固定使用稳定的英文名称，便于用户形成统一命令记忆；
 * 第二行则跟随当前界面语言，给出一条精简说明。
 */
function buildVmmSettingHomeItems(
  api: TuiPluginApi,
  language: VmmLanguage,
  callbacks: {
    openUserManager: () => void
    openProjectManager: () => void
    openLanguageControl: () => void
  },
): VmmMenuItem[] {
  const grpcTransportCopy = getVmmGrpcTransportCopy(language)
  return [
    {
      id: "user-manager",
      title: tVmmTui("en", "setting_menu_user_manager_title"),
      subtitle: tVmmTui(language, "setting_menu_user_manager_subtitle"),
      detailTitle: tVmmTui(language, "setting_menu_user_manager_title"),
      detailLines: [
        tVmmTui(language, "setting_menu_user_manager_subtitle"),
        tVmmTui(language, "setting_menu_user_manager_detail_1"),
        tVmmTui(language, "setting_menu_user_manager_detail_2"),
        tVmmTui(language, "setting_menu_user_manager_detail_3"),
        tVmmTui(language, "setting_menu_user_manager_detail_4"),
      ],
      onOpen: () => callbacks.openUserManager(),
    },
    {
      id: "project-manager",
      title: tVmmTui("en", "setting_menu_project_manager_title"),
      subtitle: tVmmTui(language, "setting_menu_project_manager_subtitle"),
      detailTitle: tVmmTui(language, "setting_menu_project_manager_title"),
      detailLines: [
        tVmmTui(language, "setting_menu_project_manager_subtitle"),
        tVmmTui(language, "setting_menu_project_manager_detail_1"),
        tVmmTui(language, "setting_menu_project_manager_detail_2"),
        tVmmTui(language, "setting_menu_project_manager_detail_3"),
        tVmmTui(language, "setting_menu_project_manager_detail_4"),
      ],
      onOpen: () => callbacks.openProjectManager(),
    },
    {
      id: "profile-center",
      title: tVmmTui("en", "setting_menu_profile_center_title"),
      subtitle: tVmmTui(language, "setting_menu_profile_center_subtitle"),
      detailTitle: tVmmTui(language, "setting_menu_profile_center_title"),
      detailLines: [
        tVmmTui(language, "setting_menu_profile_center_subtitle"),
        tVmmTui(language, "setting_menu_profile_center_detail_1"),
        tVmmTui(language, "setting_menu_profile_center_detail_2"),
        tVmmTui(language, "setting_menu_profile_center_detail_3"),
      ],
      onOpen: () => api.route.navigate(VMM_PROFILE_CENTER_ROUTE_NAME, buildVmmRouteSessionParams(api)),
    },
    {
      id: "profile-bundle-test",
      title: tVmmTui("en", "setting_menu_profile_bundle_test_title"),
      subtitle: tVmmTui(language, "setting_menu_profile_bundle_test_subtitle"),
      detailTitle: tVmmTui(language, "setting_menu_profile_bundle_test_title"),
      detailLines: [
        tVmmTui(language, "setting_menu_profile_bundle_test_subtitle"),
        tVmmTui(language, "setting_menu_profile_bundle_test_detail_1"),
        tVmmTui(language, "setting_menu_profile_bundle_test_detail_2"),
      ],
      onOpen: () =>
        api.route.navigate(VMM_PROFILE_BUNDLE_TEST_ROUTE_NAME, buildVmmRouteSessionParams(api)),
    },
    {
      id: "tools-debug",
      title: tVmmTui("en", "setting_menu_tools_debug_title"),
      subtitle: tVmmTui(language, "setting_menu_tools_debug_subtitle"),
      detailTitle: tVmmTui(language, "setting_menu_tools_debug_title"),
      detailLines: [
        tVmmTui(language, "setting_menu_tools_debug_subtitle"),
        tVmmTui(language, "setting_menu_tools_debug_detail_1"),
        tVmmTui(language, "setting_menu_tools_debug_detail_2"),
        tVmmTui(language, "setting_menu_tools_debug_detail_3"),
      ],
      onOpen: () => api.route.navigate(VMM_TOOLS_DEBUG_ROUTE_NAME, buildVmmRouteSessionParams(api)),
    },
    {
      id: "language-control",
      title: tVmmTui("en", "setting_menu_language_title"),
      subtitle: tVmmTui(language, "setting_menu_language_subtitle"),
      detailTitle: tVmmTui(language, "setting_menu_language_title"),
      detailLines: [
        tVmmTui(language, "setting_menu_language_subtitle"),
        tVmmTui(language, "setting_menu_language_detail_1"),
        tVmmTui(language, "setting_menu_language_detail_2"),
        tVmmTui(language, "setting_menu_language_detail_3"),
      ],
      onOpen: () => callbacks.openLanguageControl(),
    },
    {
      id: "memory-settings",
      title: tVmmTui("en", "setting_menu_memory_title"),
      subtitle: tVmmTui(language, "setting_menu_memory_subtitle"),
      detailTitle: tVmmTui(language, "setting_menu_memory_title"),
      detailLines: [
        tVmmTui(language, "setting_menu_memory_subtitle"),
        tVmmTui(language, "setting_menu_memory_detail_1"),
        tVmmTui(language, "setting_menu_memory_detail_2"),
        tVmmTui(language, "setting_menu_memory_detail_3"),
      ],
      onOpen: () => api.route.navigate(VMM_MEMORY_ROUTE_NAME, buildVmmRouteSessionParams(api)),
    },
    {
      id: "grpc-transport",
      title: grpcTransportCopy.menuTitle,
      subtitle: grpcTransportCopy.menuSubtitle,
      detailTitle: grpcTransportCopy.menuTitle,
      detailLines: grpcTransportCopy.menuDetailLines,
      onOpen: () =>
        api.route.navigate(VMM_GRPC_TRANSPORT_ROUTE_NAME, buildVmmRouteSessionParams(api)),
    },
  ]
}

/**
 * Check whether one home-page command matches the current filter text.
 * 判断首页某条命令是否匹配当前过滤文本。
 *
 * The filter prioritizes English titles, but it also searches the localized
 * subtitle and detail lines so users can still discover entries from the
 * current language description.
 * 过滤主要服务于英文指令名，但也会同时检索当前语言的副标题和说明，
 * 这样用户即使只记得本地化描述，也能把对应入口筛出来。
 */
function matchesVmmSettingHomeFilter(item: VmmMenuItem, normalizedFilter: string) {
  if (!normalizedFilter) return true
  const haystack = [item.title, item.subtitle, ...item.detailLines].join(" ").toLowerCase()
  return haystack.includes(normalizedFilter)
}

/**
 * Build the compact gRPC endpoint summary shown on the settings home screen.
 * 构建设置首页展示的紧凑 gRPC 端点摘要。
 *
 * The effective target is the vulcan-host relay, so the footer should surface
 * only the host endpoint that the plugin will actually call.
 * 当前生效地址就是 vulcan-host 中转，
 * 因此底部摘要只展示插件实际会调用的宿主端点。
 */
function buildVmmSettingHomeGrpcStatus(config: VmmRuntimeConfig | null, unsetLabel: string) {
  if (!config) {
    return unsetLabel
  }
  const endpointPlan = buildVmmEndpointPlan({
    vulcanHostTarget: config.vulcanHostTarget,
  })
  if (endpointPlan.hasVulcanHostTarget) {
    return endpointPlan.effectiveTarget
  }
  return endpointPlan.effectiveTarget || unsetLabel
}

/**
 * Build the compact status line shown at the bottom of the home launcher.
 * 构建首页启动器底部显示的紧凑状态行。
 *
 * The home screen should surface the currently effective runtime scope at a
 * glance, so users can see grpc target, user, project, and language without
 * entering a second screen.
 * 首页需要一眼暴露当前生效运行状态，
 * 让用户不用进入二级页面，也能看到 grpc 目标、用户、项目和语言。
 */
function buildVmmSettingHomeStatusLine(
  language: VmmLanguage,
  config: VmmRuntimeConfig | null,
) {
  const unsetLabel = tVmmTui(language, "user_manager_unset")
  const memoryModeLabel =
    config?.visibleMemoryInjection === true
      ? tVmmTui(language, "setting_home_mode_visible")
      : tVmmTui(language, "setting_home_mode_implicit")
  const compactRecallLabel = config?.sessionCompactRecall
    ? tVmmTui(language, "memory_settings_session_compact_enabled_value")
    : tVmmTui(language, "memory_settings_session_compact_disabled_value")

  /**
   * Keep the home footer summary short enough for one terminal line.
   * 让首页底部摘要尽量保持在一条终端行内可读。
   *
   * The user asked for compact labels here, so we intentionally avoid the
   * longer descriptive mode names used by the detailed settings pages.
   * 用户要求这里尽量短，因此这里刻意不复用详情页里的长模式名称，
   * 只保留首页一眼可读的短标签。
   */
  return [
    `${tVmmTui(language, "setting_home_status_grpc")}:${buildVmmSettingHomeGrpcStatus(config, unsetLabel)}`,
    `${tVmmTui(language, "setting_home_status_user")}:${config?.userId?.trim() || unsetLabel}`,
    `${tVmmTui(language, "setting_home_status_project")}:${config?.projectId?.trim() || unsetLabel}`,
    `${tVmmTui(language, "setting_home_status_language")}:${config?.language || "en"}`,
    `${tVmmTui(language, "setting_home_status_mode")}:${memoryModeLabel}`,
    `${tVmmTui(language, "setting_home_status_turns")}:${config?.implicitMemoryTurns ?? 0}`,
    `${tVmmTui(language, "setting_home_status_compact")}:${compactRecallLabel}`,
  ].join("  |  ")
}

/**
 * Top-level VMM setting-center route styled after the OpenTUI launcher page.
 * 参照 OpenTUI 主入口样式构建的顶层 VMM 设置中心路由。
 *
 * This route intentionally behaves like an application launcher: a fixed title,
 * one always-active filter line, and a single command list that supports both
 * typing and arrow navigation.
 * 这个路由刻意做成“应用启动页”的感觉：固定标题、始终激活的过滤行、
 * 以及一个同时支持输入过滤和上下导航的命令列表。
 */
const VmmSettingScreen = (props: { api: TuiPluginApi }) => {
  const locale = createVmmTuiLocaleState(props.api)
  const language = locale.language
  const [filterText, setFilterText] = createSignal("")
  const [isUserManagerOpen, setIsUserManagerOpen] = createSignal(false)
  const [isProjectManagerOpen, setIsProjectManagerOpen] = createSignal(false)
  const [isLanguageControlOpen, setIsLanguageControlOpen] = createSignal(false)
  let filterInputRef: InputRenderable | undefined
  let selectRef: SelectRenderable | undefined
  /**
   * Freeze one scroll anchor for mouse hit-testing until keyboard or filter
   * changes make the previous viewport assumption stale.
   * 冻结一份鼠标命中换算使用的滚动锚点，直到键盘导航或过滤结果变化使旧视口假设失效。
   */
  let homeMouseScrollAnchorIndex: number | null = null
  const items = createMemo(() =>
    buildVmmSettingHomeItems(props.api, language(), {
      openUserManager: () => setIsUserManagerOpen(true),
      openProjectManager: () => setIsProjectManagerOpen(true),
      openLanguageControl: () => setIsLanguageControlOpen(true),
    }),
  )
  const filteredItems = createMemo(() => {
    const normalizedFilter = filterText().trim().toLowerCase()
    return items().filter((item) => matchesVmmSettingHomeFilter(item, normalizedFilter))
  })
  /**
   * Derive one compact footer summary from the current effective config.
   * 基于当前生效配置派生一条紧凑的底部摘要。
   */
  const homeStatusLine = createMemo(() =>
    buildVmmSettingHomeStatusLine(language(), locale.config()),
  )
  const selectOptions = createMemo<SelectOption[]>(() =>
    filteredItems().map((item) => ({
      name: item.title,
      description: item.subtitle,
      value: item.id,
    })),
  )
  const [selectedId, setSelectedId] = createSignal("")

  /**
   * Load one config snapshot so localized second-line descriptions follow the
   * current workspace language before the user starts filtering.
   * 先加载一份配置快照，确保列表第二行会跟随当前工作区语言，
   * 再让用户开始输入过滤。
   */
  createEffect(() => {
    void locale.refreshConfig()
  })

  /**
   * Keep custom dialogs aligned with the launcher's active language.
   * 让自定义对话框持续跟随首页当前的活动语言。
   */
  createEffect(() => {
    setVmmDialogLanguage(language())
  })

  /**
   * Keep the selected command valid when the filter result set changes.
   * 当过滤结果集合发生变化时，持续保持当前选中命令有效。
   */
  createEffect(() => {
    const current = selectedId()
    const nextItems = filteredItems()
    if (nextItems.some((item) => item.id === current)) return
    setSelectedId(nextItems[0]?.id ?? "")
  })

  /**
   * Reset mouse hover tracking when the visible launcher options change.
   * 当首页当前可见的启动器选项发生变化时，重置鼠标悬停跟踪状态。
   *
   * Filter edits, language refreshes, and config-driven title changes can all
   * reflow the Select viewport. Clearing the cached anchor here prevents stale
   * hover coordinates from remapping against a previous layout snapshot.
   * 过滤输入、语言刷新以及配置驱动的标题变化都会让 Select 视口重新排布。
   * 这里清空缓存锚点，避免旧布局快照下的 hover 坐标继续套用到新视口。
   */
  createEffect(() => {
    selectOptions()
    homeMouseScrollAnchorIndex = null
  })

  /**
   * Keep the Select component synchronized with the current filtered item set.
   * 让 Select 组件持续与当前过滤结果集合保持同步。
   *
   * The launcher uses a real Select renderable, so changing the filter must
   * also move the visual selected row, not just the local signal state.
   * 首页现在使用真实的 Select 组件，
   * 因此过滤条件变化时，不仅要更新本地信号，还要同步更新界面上的选中行。
   */
  createEffect(() => {
    const currentOptions = selectOptions()
    const currentId = selectedId()
    const nextIndex = Math.max(
      0,
      currentOptions.findIndex((option) => option.value === currentId),
    )
    queueMicrotask(() => {
      selectRef?.setSelectedIndex(nextIndex)
    })
  })

  /**
   * Open the currently selected launcher command.
   * 打开当前选中的启动器命令。
   */
  const openSelectedItem = (itemId?: string) => {
    const selected =
      filteredItems().find((item) => item.id === (itemId ?? selectedId())) ??
      filteredItems()[0]
    if (!selected) return
    writeVmmTuiLog("vmm.tui.setting.activate", {
      itemId: selected.id,
      filterText: filterText(),
    })
    selected.onOpen()
  }

  /**
   * Resolve the stable scroll anchor used by hover and click hit-testing.
   * 解析 hover 与点击命中换算所使用的稳定滚动锚点。
   *
   * The anchor intentionally lags behind hover-driven selection updates so one
   * steady pointer position does not keep walking the selected row during
   * terminal resize repaint.
   * 这个锚点会刻意滞后于 hover 驱动的选中变化，
   * 以避免终端 resize 重绘时，同一个静止鼠标位置持续推动选中行向前漂移。
   */
  const resolveMouseSelectionAnchorIndex = () => {
    if (!selectRef) return 0
    if (homeMouseScrollAnchorIndex !== null) return homeMouseScrollAnchorIndex
    homeMouseScrollAnchorIndex = selectRef.getSelectedIndex()
    return homeMouseScrollAnchorIndex
  }

  /**
   * Invalidate the cached mouse scroll anchor after one non-hover navigation.
   * 在一次非 hover 导航之后让缓存的鼠标滚动锚点失效。
   */
  const resetMouseSelectionAnchor = () => {
    homeMouseScrollAnchorIndex = null
  }

  /**
   * Update the launcher selection from one mouse hover/move event.
   * 根据一次鼠标 hover/move 事件更新首页启动器的选中项。
   */
  const syncMouseSelection = (eventY: number) => {
    if (!selectRef) return
    const currentSelectedIndex = selectRef.getSelectedIndex()
    const nextIndex = resolveVmmSettingHomeMouseIndex({
      eventY,
      selectY: selectRef.y,
      selectHeight: selectRef.height,
      scrollAnchorIndex: resolveMouseSelectionAnchorIndex(),
      optionCount: selectOptions().length,
    })
    if (nextIndex === null) return
    if (nextIndex === currentSelectedIndex) return
    const nextOption = selectOptions()[nextIndex]
    if (!nextOption) return
    setSelectedId(String(nextOption.value ?? ""))
    selectRef.setSelectedIndex(nextIndex)
  }

  /**
   * Confirm the hovered launcher selection with a left mouse click.
   * 使用鼠标左键确认当前悬停的首页启动器选中项。
   *
   * Right click is intentionally reserved for "go back" on the launcher, so
   * only the left button should activate the selected command.
   * 首页里右键被刻意留给“返回上一级”，
   * 因此只有左键才会真正打开当前选中的命令。
   */
  const confirmMouseSelection = (eventY: number) => {
    if (!selectRef) return
    const currentSelectedIndex = selectRef.getSelectedIndex()
    const nextIndex = resolveVmmSettingHomeMouseIndex({
      eventY,
      selectY: selectRef.y,
      selectHeight: selectRef.height,
      scrollAnchorIndex: resolveMouseSelectionAnchorIndex(),
      optionCount: selectOptions().length,
    })
    if (nextIndex === null) return
    const nextOption = selectOptions()[nextIndex]
    if (!nextOption) return
    homeMouseScrollAnchorIndex = nextIndex
    if (nextIndex !== currentSelectedIndex) {
      setSelectedId(String(nextOption.value ?? ""))
      selectRef.setSelectedIndex(nextIndex)
    }
    openSelectedItem(String(nextOption.value ?? ""))
  }

  /**
   * Handle right-click on the home launcher as a shortcut to leave the page.
   * 把首页里的鼠标右键处理成“离开当前页”的快捷返回动作。
   */
  const handleLauncherRightClick = () => {
    if (filterText()) {
      setFilterText("")
      queueMicrotask(() => {
        filterInputRef?.focus()
      })
      return
    }
    props.api.route.navigate("home")
  }

  useKeyboard((event) => {
    if (props.api.route.current.name !== VMM_SETTING_ROUTE_NAME) return
    if (isVmmDialogOpen()) return
    if (isUserManagerOpen()) return
    if (isProjectManagerOpen()) return
    if (isLanguageControlOpen()) return

    /**
     * Mirror the OpenTUI launcher behavior by forwarding navigation keys to the
     * Select control while the Input stays focused for live filtering.
     * 这里对齐 OpenTUI 启动页的行为：
     * Input 保持焦点负责实时过滤，导航键则转发给 Select 控件。
     */
    if (["up", "down", "j", "k"].includes(event.name)) {
      if (filteredItems().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      resetMouseSelectionAnchor()
      if (event.name === "up" || event.name === "k") {
        selectRef?.moveUp(1)
      } else {
        selectRef?.moveDown(1)
      }
      return
    }

    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      if (filterText()) {
        setFilterText("")
        queueMicrotask(() => {
          filterInputRef?.focus()
        })
        return
      }
      props.api.route.navigate("home")
      return
    }

    if (["return", "enter", "linefeed"].includes(event.name)) {
      if (filteredItems().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      selectRef?.selectCurrent()
      return
    }

    /**
     * Keep the real Input control focused so printable keys continue flowing
     * into the filter field after mouse interactions or route re-renders.
     * 持续把真实 Input 控件保持为焦点，
     * 避免鼠标操作或页面重绘后，可打印字符不再进入过滤框。
     */
    queueMicrotask(() => {
      filterInputRef?.focus()
    })
  })

  return (
    <>
      <box
        width="100%"
        height="100%"
        backgroundColor={VMM_TUI_COLOR_SURFACE}
        flexDirection="column"
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
        gap={1}
        onMouseUp={(event) => {
          if (event.button !== 2) return
          event.stopPropagation()
          event.preventDefault()
          handleLauncherRightClick()
        }}
      >
        {/**
         * Keep the home header visually isolated so the launcher reads like one
         * stable product entry rather than one more settings subsection.
         * 单独保留首页头部区域，
         * 让它读起来像插件总入口，而不是又一块普通设置分区。
         */}
        <box
          width="100%"
          height={5}
          backgroundColor="transparent"
          flexDirection="column"
          justifyContent="center"
          alignItems="center"
        >
          <ascii_font text="VMM OPENCODE PLUGIN" font="tiny" color="#ffffff" backgroundColor="transparent" />
        </box>
        {/**
         * Render the filter line as an always-active text field so users can
         * start typing immediately after opening the launcher page.
         * 把过滤行渲染成“始终激活”的文本输入区，
         * 这样用户打开首页后就可以立刻开始输入筛选。
         */}
        <box
          width="100%"
          height={3}
          border
          borderColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
          flexDirection="row"
          alignItems="center"
          paddingLeft={1}
          paddingRight={1}
        >
          <input
            ref={filterInputRef}
            width="100%"
            value={filterText()}
            placeholder={tVmmTui(language(), "setting_home_filter_placeholder")}
            placeholderColor={VMM_TUI_COLOR_MUTED}
            backgroundColor="transparent"
            focusedBackgroundColor="transparent"
            textColor={VMM_TUI_COLOR_BODY}
            focusedTextColor={VMM_TUI_COLOR_TITLE}
            cursorColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
            focused
            onInput={(value) => {
              setFilterText(value)
            }}
          />
        </box>
        {/**
         * Use one single scrollable command list, matching the OpenTUI launcher
         * structure instead of the older multi-pane control-center home screen.
         * 这里改成单一可滚动命令列表，
         * 对齐 OpenTUI 主入口，而不是之前那种多栏控制中心式首页。
         */}
        <box
          width="100%"
          minHeight={0}
          flexGrow={1}
          border
          borderColor={VMM_TUI_COLOR_BORDER}
          title={tVmmTui(language(), "setting_home_list_title")}
          titleAlignment="center"
          backgroundColor="transparent"
          flexDirection="column"
          padding={1}
          gap={1}
        >
          <select
            ref={selectRef}
            height="100%"
            options={selectOptions()}
            selectedIndex={Math.max(
              0,
              selectOptions().findIndex((option) => option.value === selectedId()),
            )}
            backgroundColor="transparent"
            focusedBackgroundColor="transparent"
            selectedBackgroundColor={VMM_TUI_COLOR_ROW_SELECTED_BG}
            textColor={VMM_TUI_COLOR_BODY}
            selectedTextColor={VMM_TUI_COLOR_SECTION}
            descriptionColor={VMM_TUI_COLOR_MUTED}
            selectedDescriptionColor="#cfe9ff"
            showScrollIndicator
            wrapSelection
            showDescription
            fastScrollStep={5}
            onMouseOver={(event) => {
              event.stopPropagation()
              syncMouseSelection(event.y)
            }}
            onMouseMove={(event) => {
              event.stopPropagation()
              syncMouseSelection(event.y)
            }}
            onMouseUp={(event) => {
              if (event.button !== 0) return
              event.stopPropagation()
              confirmMouseSelection(event.y)
            }}
            onChange={(_index, option) => {
              setSelectedId(String(option?.value ?? ""))
            }}
            onSelect={(_index, option) => {
              openSelectedItem(String(option?.value ?? ""))
            }}
          />
          {filteredItems().length === 0 ? (
            <text fg={VMM_TUI_COLOR_MUTED}>{tVmmTui(language(), "setting_home_empty")}</text>
          ) : null}
        </box>
        <box
          width="100%"
          height={1}
          backgroundColor="transparent"
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
        >
          <text fg={VMM_TUI_COLOR_HINT}>{tVmmTui(language(), "setting_home_keys_hint")}</text>
        </box>
        {/**
         * Keep the effective runtime scope on a dedicated last line so the
         * launcher remains self-explanatory even before the user opens any page.
         * 把当前生效运行状态放到独立的最后一行，
         * 这样用户在还没打开任何子页面前，也能读懂当前环境。
         */}
        <box
          width="100%"
          height={1}
          backgroundColor="transparent"
          flexDirection="row"
          alignItems="center"
          justifyContent="center"
        >
          <text fg={VMM_TUI_COLOR_MUTED}>{homeStatusLine()}</text>
        </box>
      </box>
      {isUserManagerOpen() ? (
        <VmmUserManagerOverlay
          api={props.api}
          language={language}
          onClose={() => {
            setIsUserManagerOpen(false)
            queueMicrotask(() => {
              filterInputRef?.focus()
            })
          }}
        />
      ) : null}
      {isProjectManagerOpen() ? (
        <VmmProjectManagerOverlay
          api={props.api}
          language={language}
          onClose={() => {
            setIsProjectManagerOpen(false)
            queueMicrotask(() => {
              filterInputRef?.focus()
            })
          }}
        />
      ) : null}
      {isLanguageControlOpen() ? (
        <VmmLanguageControlOverlay
          api={props.api}
          language={language}
          onClose={() => {
            setIsLanguageControlOpen(false)
            void locale.refreshConfig()
            queueMicrotask(() => {
              filterInputRef?.focus()
            })
          }}
        />
      ) : null}
      <VmmDialogHost />
    </>
  )
}


/**
 * Shared exports consumed by feature-focused TUI modules.
 * 供分拆后的各个 TUI 功能模块复用的共享导出。
 */
export {
  VMM_SETTING_ROUTE_NAME,
  VMM_PROFILE_CENTER_ROUTE_NAME,
  VMM_PROFILE_BUNDLE_TEST_ROUTE_NAME,
  VMM_TOOLS_DEBUG_ROUTE_NAME,
  VMM_LANGUAGE_ROUTE_NAME,
  VMM_MEMORY_ROUTE_NAME,
  VMM_GRPC_TRANSPORT_ROUTE_NAME,
  VMM_SETTING_COMMAND_VALUE,
  VMM_TUI_LEFT_PANE_WIDTH,
  VMM_TUI_COLOR_SURFACE,
  VMM_TUI_COLOR_BORDER,
  VMM_TUI_COLOR_TITLE,
  VMM_TUI_COLOR_SECTION,
  VMM_TUI_COLOR_BODY,
  VMM_TUI_COLOR_MUTED,
  VMM_TUI_COLOR_HINT,
  VMM_TUI_COLOR_STATUS_IDLE,
  VMM_TUI_COLOR_STATUS_BUSY,
  VMM_TUI_COLOR_ROW_SELECTED_BG,
  VMM_TUI_COLOR_ROW_SELECTED_BORDER,
  VMM_TUI_MIN_HANDSHAKE_TIMEOUT_MS,
  VMM_TUI_MIN_RECEIVE_TIMEOUT_MS,
  writeVmmTuiLog,
  buildVmmTuiTransportConfig,
  summarizeGrpcResult,
  createVmmTuiLocaleState,
  isVmmDialogOpen,
  setVmmDialogLanguage,
  normalizeScopedVmmBindingValue,
  readScopedVmmBindingValue,
  readScopedVmmConfigValue,
  useVmmListKeyboard,
  cycleConfigScope,
  openVmmSettingScreen,
  VmmDialogHost,
  openNewUserPrompt,
  openVmmTextPrompt,
  openVmmExactConfirmPrompt,
  openVmmConfirmDialog,
  openUserManagerScopeDialog,
  openUserManagerReplacementDialog,
  openVmmInfoDialog,
  openVmmPendingDialog,
  openProjectManagerScopeDialog,
  openProjectManagerReplacementDialog,
  openLanguageControlScopeDialog,
  openMemorySettingsScopeDialog,
  openVmmSelectDialog,
  formatVmmUserManagerIdLabel,
  formatVmmUserManagerAccountLabel,
  formatVmmProjectManagerIdLabel,
  parseScopedMemoryModeValue,
  parseScopedSessionCompactRecallValue,
  parseScopedImplicitTurnsValue,
  parseScopedProfileRefreshTurnsValue,
  normalizeCanonicalProjectPathInput,
  looksLikeCanonicalProjectPath,
  summarizeProjectCreateFailure,
  formatProjectEntry,
  formatUserEntry,
  toGrpcProfileTarget,
  buildProfileNodePlw,
  formatEpochMillisecondsAsLocalDate,
  truncateForList,
  formatTuiProfileTarget,
  formatTuiProfileSourceKind,
  resolveProfileBindingScope,
  buildScopeSelectorRows,
  buildVmmRowRenderableId,
  buildScopeSelectorDetailLines,
  VmmListRow,
  VmmScrollColumn,
  VmmCompactListRow,
  VmmSectionBox,
  VmmProfileTableHeaderRow,
  VmmProfileTableRow,
  buildVmmSettingHomeItems,
  matchesVmmSettingHomeFilter,
  buildVmmSettingHomeStatusLine,
  resolveVmmSettingHomeScrollOffset,
  resolveVmmSettingHomeMouseIndex,
  VmmSettingScreen,
}
export type {
  VmmMenuItem,
  VmmUserManagerItem,
  VmmScopedBindingKey,
  VmmScopedConfigKey,
  VmmProjectManagerItemBase,
  VmmProjectManagerItem,
  VmmTuiProfileTarget,
  VmmLanguageControlItemKind,
  VmmLanguageControlItem,
  VmmMemorySettingsItemKind,
  VmmMemorySettingsItem,
  VmmSelectableItem,
  VmmListRowProps,
  VmmTuiLocaleState,
}

/**
 * Register the setting-center routes and the single slash command entry.
 * 注册设置中心路由和唯一的 slash 命令入口。
 */
const tui: TuiPlugin = async (api) => {
  const startupConfig = await loadVmmConfig(api.state.path.directory)
  const startupLanguage = startupConfig.language
  const commandMetadata = getVmmTuiCommandMetadata(startupLanguage)

  api.route.register([
    {
      name: VMM_SETTING_ROUTE_NAME,
      render: () => <VmmSettingScreen api={api} />,
    },
    {
      name: VMM_PROFILE_CENTER_ROUTE_NAME,
      render: () => <VmmProfileCenterScreen api={api} />,
    },
    {
      name: VMM_PROFILE_BUNDLE_TEST_ROUTE_NAME,
      render: () => <VmmProfileBundleTestScreen api={api} />,
    },
    {
      name: VMM_TOOLS_DEBUG_ROUTE_NAME,
      render: () => <VmmToolsDebugScreen api={api} />,
    },
    {
      name: VMM_LANGUAGE_ROUTE_NAME,
      render: () => <VmmLanguageControlScreen api={api} />,
    },
    {
      name: VMM_MEMORY_ROUTE_NAME,
      render: () => <VmmMemorySettingsScreen api={api} />,
    },
    {
      name: VMM_GRPC_TRANSPORT_ROUTE_NAME,
      render: () => <VmmGrpcTransportSettingsScreen api={api} />,
    },
  ])

  api.command.register(() => [
    {
      title: commandMetadata.title,
      value: VMM_SETTING_COMMAND_VALUE,
      description: commandMetadata.description,
      category: "VMM",
      slash: {
        name: "vmm-setting",
      },
      onSelect: () => {
        api.ui.dialog.clear()
        openVmmSettingScreen(api)
      },
    },
  ])

  api.slots.register({
    order: VMM_SETTING_ENTRY_SLOT_ORDER,
    slots: {
      home_bottom() {
        return <VmmHomeSettingEntry api={api} label={commandMetadata.mountedEntryLabel} />
      },
      sidebar_content() {
        return <VmmSidebarSettingEntry api={api} label={commandMetadata.mountedEntryLabel} />
      },
    },
  })
}

/**
 * Default exported TUI module for the local OpenCode plugin loader.
 * 提供给本地 OpenCode 插件加载器的默认 TUI 模块导出。
 */
const plugin: TuiPluginModule & { id: string } = {
  id: "vmm-opencode.tui",
  tui,
}

export default plugin
