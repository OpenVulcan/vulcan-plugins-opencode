/**
 * Pure view-model helpers for the VMM gRPC transport settings screen.
 * VMM gRPC 传输设置页面的纯视图模型辅助模块。
 *
 * This file belongs to the TUI presentation-support layer. It centralizes the
 * endpoint/keepalive copy resolution, raw-config parsing, and compact row assembly so
 * the transport screen can stay thin while verification can cover page-state
 * composition without booting the TSX runtime.
 * 这个文件属于 TUI 展示支撑层。
 * 它把 endpoint/keepalive 文案解析、原始配置值解析以及紧凑列表条目拼装集中到一起，
 * 让传输设置页面本身保持轻量，同时让验证层可以在不启动 TSX 运行时的前提下，
 * 覆盖页面状态拼装这条关键链路。
 */

import type { VmmLanguage } from "./vmm-language.js"
import { normalizeStrictPositiveConfigInteger, type VmmConfigScope } from "./vmm-config.js"
import { buildVmmEndpointPlan, normalizeEndpointTargetText } from "./vmm-endpoint-plan.js"
import { tVmmTui } from "./vmm-tui-language.js"

/**
 * Stable localized copy bundle consumed by the transport settings screen.
 * 传输设置页面消费的稳定本地化文案集合。
 *
 * The screen needs a compact but complete set of labels for row titles,
 * prompts, and toasts. Keeping the bundle typed here helps the TSX layer stay
 * declarative and makes locale regression tests straightforward.
 * 这个页面需要一组紧凑但完整的标签来驱动行标题、输入框和提示消息。
 * 在这里把文案集合做成强类型，可以让 TSX 层保持声明式，
 * 同时也让多语言回归测试更直接。
 */
export type VmmGrpcTransportCopy = {
  menuTitle: string
  menuSubtitle: string
  menuDetailLines: string[]
  overlayTitle: string
  sectionListTitle: string
  loading: string
  keysHint: string
  inheritValue: string
  disabledValue: string
  enabledValue: string
  statePair: (args: { project: string; global: string }) => string
  scopeDialogTitle: string
  scopeWorkspaceTitle: string
  scopeWorkspaceSubtitle: string
  scopeGlobalTitle: string
  scopeGlobalSubtitle: string
  toastTitle: string
  vulcanHostTargetTitle: string
  vulcanHostTargetSubtitle: string
  endpointPlanSummary: (args: { mode: string; effective: string }) => string
  endpointPromptPlaceholder: string
  endpointPromptDescription: string
  endpointPromptInvalid: string
  vulcanHostTargetPromptTitle: string
  savedVulcanHostTarget: (args: { scope: string; value: string }) => string
  keepaliveTimeTitle: string
  keepaliveTimeSubtitle: string
  keepaliveTimeoutTitle: string
  keepaliveTimeoutSubtitle: string
  permitTitle: string
  permitSubtitle: string
  keepaliveTimePromptTitle: string
  keepaliveTimePromptPlaceholder: string
  keepaliveTimePromptDescription: string
  keepaliveTimePromptEmpty: string
  keepaliveTimePromptInvalid: string
  keepaliveTimeoutPromptTitle: string
  keepaliveTimeoutPromptPlaceholder: string
  keepaliveTimeoutPromptDescription: string
  keepaliveTimeoutPromptEmpty: string
  keepaliveTimeoutPromptInvalid: string
  keepaliveTimeoutExceedsTime: string
  keepaliveTimeBelowTimeout: string
  permitSelectTitle: (scopeLabel: string) => string
  permitDisabledTitle: string
  permitDisabledSubtitle: string
  permitEnabledTitle: string
  permitEnabledSubtitle: string
  savedKeepaliveTime: (args: { scope: string; value: string }) => string
  savedKeepaliveTimeout: (args: { scope: string; value: string }) => string
  savedPermit: (args: { scope: string; enabled: boolean }) => string
  saveFailed: string
}

/**
 * One compact row rendered inside the transport settings list.
 * 传输设置列表里渲染的一条紧凑行。
 *
 * The row shape is intentionally pure-data so the screen and tests can both
 * consume the exact same assembly result.
 * 这个行结构刻意保持为纯数据，
 * 这样页面和测试都可以消费同一份拼装结果。
 */
export type VmmGrpcTransportSettingsItem = {
  id: string
  kind:
    | "vulcan-host-target"
    | "keepalive-time"
    | "keepalive-timeout"
    | "permit-without-calls"
  title: string
  subtitle: string
}

/**
 * Raw scoped transport values needed to build the compact settings rows.
 * 用于构建紧凑设置行的作用域原始传输配置值。
 *
 * The screen reads project/global raw strings from config storage, then this
 * builder turns them into normalized row titles with visible inheritance
 * states. Keeping the raw snapshot explicit prevents future hidden coupling.
 * 页面会先从配置存储中读取 project/global 两层原始字符串，
 * 然后这个构建器再把它们转换成带继承状态的标题。
 * 把这份原始快照结构显式化，可以避免后续产生隐藏耦合。
 */
export type VmmGrpcTransportSettingsSnapshot = {
  language: VmmLanguage
  workspaceVulcanHostTargetRaw?: string
  workspaceKeepaliveTimeRaw: string
  workspaceKeepaliveTimeoutRaw: string
  workspacePermitWithoutCallsRaw: string
  globalVulcanHostTargetRaw?: string
  globalKeepaliveTimeRaw: string
  globalKeepaliveTimeoutRaw: string
  globalPermitWithoutCallsRaw: string
}

/**
 * Compact option shape reused by transport-scope and permit dialogs.
 * transport 作用域对话框与 permit 对话框复用的紧凑选项结构。
 *
 * Keeping this option model framework-agnostic lets the TSX shell forward it
 * into dialog helpers while tests assert exact titles and values.
 * 把这个选项结构保持为框架无关的纯数据，
 * 可以让 TSX 外壳直接转发给对话框助手，同时也方便测试精确断言标题和值。
 */
export type VmmGrpcTransportDialogOption = {
  title: string
  subtitle: string
  value: string
}

/**
 * Compact scope-dialog model for the transport settings flow.
 * transport 设置流程使用的紧凑作用域对话框模型。
 */
export type VmmGrpcTransportScopeDialogModel = {
  title: string
  options: ReadonlyArray<VmmGrpcTransportDialogOption>
}

/**
 * Compact text-prompt model for one numeric keepalive editor.
 * 单个 keepalive 数值编辑器使用的紧凑文本输入模型。
 */
export type VmmGrpcTransportTextPromptModel = {
  title: string
  placeholder: string
  description: string
  emptyMessage: string
  invalidMessage: string
  initialValue: string
  toastTitle: string
}

/**
 * Compact text-prompt model for one endpoint editor.
 * 单个 endpoint 编辑器使用的紧凑文本输入模型。
 */
export type VmmGrpcTransportEndpointPromptModel = VmmGrpcTransportTextPromptModel & {
  allowEmpty: boolean
}

/**
 * Compact selector model for one permit-without-calls switch dialog.
 * permit-without-calls 开关对话框使用的紧凑选择器模型。
 */
export type VmmGrpcTransportPermitDialogModel = {
  title: string
  options: ReadonlyArray<VmmGrpcTransportDialogOption>
}

/**
 * Named transport action resolved from the selected row.
 * 从当前选中行解析出的具名 transport 动作。
 *
 * The TSX shell only needs to know which editor flow should open next. Making
 * that routing explicit here keeps keyboard-enter behavior testable without
 * depending on actual dialog rendering.
 * TSX 外壳真正需要的只有“下一步该打开哪条编辑流程”。
 * 在这里把这个路由结果显式化，可以让回车激活语义在不依赖真实对话框渲染的前提下被测试。
 */
export type VmmGrpcTransportActivationAction =
  | "open-vulcan-host-target"
  | "open-keepalive-time"
  | "open-keepalive-timeout"
  | "open-permit-without-calls"

/**
 * High-level keyboard action recognized by the transport overlay.
 * transport 覆盖层识别出的高层键盘动作。
 *
 * The page should respond to only a very small keyboard vocabulary. Turning
 * raw key names into stable semantic actions keeps the runtime handler thin
 * and makes the final UI event rules testable in plain Node.
 * 页面只应该响应很小的一组键盘词汇。
 * 把原始键名翻译成稳定的语义动作，可以让运行时处理器保持轻量，
 * 也让最终 UI 事件规则可以在普通 Node 里直接测试。
 */
export type VmmGrpcTransportKeyboardAction =
  | "move-up"
  | "move-down"
  | "close"
  | "activate"

/**
 * Resolve the compact transport copy for the current TUI language.
 * 根据当前 TUI 语言解析紧凑 transport 文案集合。
 */
export function getVmmGrpcTransportCopy(language: VmmLanguage): VmmGrpcTransportCopy {
  return {
    menuTitle: tVmmTui(language, "setting_menu_grpc_transport_title"),
    menuSubtitle: tVmmTui(language, "setting_menu_grpc_transport_subtitle"),
    menuDetailLines: [
      tVmmTui(language, "setting_menu_grpc_transport_detail_1"),
      tVmmTui(language, "setting_menu_grpc_transport_detail_2"),
      tVmmTui(language, "setting_menu_grpc_transport_detail_3"),
    ],
    // Intentionally hardcoded ASCII to match existing setting center visual style.
    // 刻意硬编码为 ASCII，以匹配现有设置中心的视觉风格。
    overlayTitle: "GRPC TRANSPORT",
    sectionListTitle: tVmmTui(language, "grpc_transport_section_list"),
    loading: tVmmTui(language, "grpc_transport_loading"),
    // Reuses memory settings keys for shared UI vocabulary.
    // If these keys are renamed in vmm-tui-language.ts, update here too.
    // 复用记忆设置键作为共享 UI 词汇表。
    // 如果这些键在 vmm-tui-language.ts 中被重命名，这里也需要同步更新。
    keysHint: tVmmTui(language, "memory_settings_keys_hint"),
    inheritValue: tVmmTui(language, "memory_settings_inherit_value"),
    disabledValue: tVmmTui(language, "memory_settings_session_compact_disabled_value"),
    enabledValue: tVmmTui(language, "memory_settings_session_compact_enabled_value"),
    statePair: ({ project, global }) =>
      tVmmTui(language, "memory_settings_state_pair", { project, global }),
    scopeDialogTitle: tVmmTui(language, "grpc_transport_scope_dialog_title"),
    scopeWorkspaceTitle: tVmmTui(language, "memory_settings_scope_workspace_title"),
    scopeWorkspaceSubtitle: tVmmTui(language, "grpc_transport_scope_workspace_subtitle"),
    scopeGlobalTitle: tVmmTui(language, "memory_settings_scope_global_title"),
    scopeGlobalSubtitle: tVmmTui(language, "grpc_transport_scope_global_subtitle"),
    toastTitle: tVmmTui(language, "grpc_transport_toast_title"),
    vulcanHostTargetTitle: tVmmTui(language, "grpc_transport_vulcan_host_target_title"),
    vulcanHostTargetSubtitle: tVmmTui(language, "grpc_transport_vulcan_host_target_subtitle"),
    endpointPlanSummary: ({ mode, effective }) =>
      tVmmTui(language, "grpc_transport_endpoint_plan_summary", {
        mode,
        effective,
      }),
    endpointPromptPlaceholder: tVmmTui(
      language,
      "grpc_transport_endpoint_prompt_placeholder",
    ),
    endpointPromptDescription: tVmmTui(
      language,
      "grpc_transport_endpoint_prompt_description",
    ),
    endpointPromptInvalid: tVmmTui(language, "grpc_transport_endpoint_prompt_invalid"),
    vulcanHostTargetPromptTitle: tVmmTui(
      language,
      "grpc_transport_vulcan_host_target_prompt_title",
    ),
    savedVulcanHostTarget: ({ scope, value }) =>
      tVmmTui(language, "grpc_transport_saved_vulcan_host_target", { scope, value }),
    keepaliveTimeTitle: tVmmTui(language, "grpc_transport_keepalive_time_title"),
    keepaliveTimeSubtitle: tVmmTui(language, "grpc_transport_keepalive_time_subtitle"),
    keepaliveTimeoutTitle: tVmmTui(language, "grpc_transport_keepalive_timeout_title"),
    keepaliveTimeoutSubtitle: tVmmTui(language, "grpc_transport_keepalive_timeout_subtitle"),
    permitTitle: tVmmTui(language, "grpc_transport_permit_title"),
    permitSubtitle: tVmmTui(language, "grpc_transport_permit_subtitle"),
    keepaliveTimePromptTitle: tVmmTui(language, "grpc_transport_keepalive_time_prompt_title"),
    keepaliveTimePromptPlaceholder: tVmmTui(
      language,
      "grpc_transport_keepalive_time_prompt_placeholder",
    ),
    keepaliveTimePromptDescription: tVmmTui(
      language,
      "grpc_transport_keepalive_time_prompt_description",
    ),
    keepaliveTimePromptEmpty: tVmmTui(language, "grpc_transport_keepalive_time_prompt_empty"),
    keepaliveTimePromptInvalid: tVmmTui(
      language,
      "grpc_transport_keepalive_time_prompt_invalid",
    ),
    keepaliveTimeoutPromptTitle: tVmmTui(
      language,
      "grpc_transport_keepalive_timeout_prompt_title",
    ),
    keepaliveTimeoutPromptPlaceholder: tVmmTui(
      language,
      "grpc_transport_keepalive_timeout_prompt_placeholder",
    ),
    keepaliveTimeoutPromptDescription: tVmmTui(
      language,
      "grpc_transport_keepalive_timeout_prompt_description",
    ),
    keepaliveTimeoutPromptEmpty: tVmmTui(
      language,
      "grpc_transport_keepalive_timeout_prompt_empty",
    ),
    keepaliveTimeoutPromptInvalid: tVmmTui(
      language,
      "grpc_transport_keepalive_timeout_prompt_invalid",
    ),
    keepaliveTimeoutExceedsTime: tVmmTui(
      language,
      "grpc_transport_keepalive_timeout_exceeds_time",
    ),
    keepaliveTimeBelowTimeout: tVmmTui(
      language,
      "grpc_transport_keepalive_time_below_timeout",
    ),
    permitSelectTitle: (scopeLabel) =>
      tVmmTui(language, "grpc_transport_permit_select_title", { scope: scopeLabel }),
    permitDisabledTitle: tVmmTui(language, "grpc_transport_permit_disabled_title"),
    permitDisabledSubtitle: tVmmTui(language, "grpc_transport_permit_disabled_subtitle"),
    permitEnabledTitle: tVmmTui(language, "grpc_transport_permit_enabled_title"),
    permitEnabledSubtitle: tVmmTui(language, "grpc_transport_permit_enabled_subtitle"),
    savedKeepaliveTime: ({ scope, value }) =>
      tVmmTui(language, "grpc_transport_saved_keepalive_time", { scope, value }),
    savedKeepaliveTimeout: ({ scope, value }) =>
      tVmmTui(language, "grpc_transport_saved_keepalive_timeout", { scope, value }),
    savedPermit: ({ scope, enabled }) =>
      tVmmTui(
        language,
        enabled ? "grpc_transport_saved_permit_on" : "grpc_transport_saved_permit_off",
        { scope },
      ),
    saveFailed: tVmmTui(language, "grpc_transport_save_failed"),
  }
}

/**
 * Parse one raw scoped positive integer value from config storage.
 * 把一条作用域里的正整数原始值解析成数字。
 *
 * Transport keepalive values should never silently accept zero, negatives, or
 * junk strings because the page uses `inherit` as the visible fallback state.
 * keepalive 数值不应默默接受 0、负数或无效字符串，
 * 因为页面需要把这些情况统一显示为继承状态。
 */
export function parseScopedPositiveIntegerValue(rawValue: string) {
  const normalized = rawValue.trim()
  if (!/^[1-9]\d*$/.test(normalized)) return undefined
  return Number.parseInt(normalized, 10)
}

/**
 * Parse one raw scoped permit-without-calls value from config storage.
 * 把一条作用域里的 permit-without-calls 原始值解析成 0/1。
 *
 * The config file persists this switch as a narrow integer domain. Any other
 * raw value should surface as `inherit` instead of being guessed.
 * 配置文件会把这个开关持久化为狭义的整数域。
 * 任何其他原始值都应该回退为继承，而不是被猜测解释。
 */
export function parseScopedPermitWithoutCallsValue(rawValue: string) {
  const normalized = rawValue.trim()
  if (normalized === "0") return 0
  if (normalized === "1") return 1
  return undefined
}

/**
 * Format one optional endpoint override into a compact localized label.
 * 把一个可选 endpoint 覆盖值格式化成紧凑的本地化标签。
 *
 * Empty raw values mean the selected scope inherits from a lower-precedence
 * source, so the UI should display the same inherit label used by keepalive.
 * 空原始值表示当前作用域继承低优先级来源，
 * 因此 UI 应展示与 keepalive 相同的继承标签。
 */
export function formatEndpointStateValue(language: VmmLanguage, rawValue: string | undefined) {
  const copy = getVmmGrpcTransportCopy(language)
  return normalizeEndpointTargetText(rawValue) || copy.inheritValue
}

/**
 * Format one optional numeric override into a compact localized label.
 * 把一个可选数字覆盖值格式化成紧凑的本地化标签。
 */
export function formatNumericStateValue(language: VmmLanguage, value: number | undefined) {
  const copy = getVmmGrpcTransportCopy(language)
  return value === undefined ? copy.inheritValue : String(value)
}

/**
 * Format one optional permit-without-calls override into a localized label.
 * 把一个可选 permit-without-calls 覆盖值格式化成本地化标签。
 */
export function formatPermitStateValue(language: VmmLanguage, value: 0 | 1 | undefined) {
  const copy = getVmmGrpcTransportCopy(language)
  if (value === undefined) return copy.inheritValue
  return value === 1 ? copy.enabledValue : copy.disabledValue
}

/**
 * Append one local/global state pair to a row title.
 * 把一组 local/global 当前状态拼接到列表标题里。
 *
 * The operator needs project/global visibility directly in the row label so
 * they can reason about inheritance before opening the editor.
 * 操作者需要直接在行标题里看到 project/global 双层状态，
 * 这样在打开编辑器前就能先理解继承关系。
 */
export function appendStateToTitle(args: {
  baseTitle: string
  language: VmmLanguage
  projectValue: string
  globalValue: string
}) {
  const copy = getVmmGrpcTransportCopy(args.language)
  return `${args.baseTitle} [${copy.statePair({
    project: args.projectValue,
    global: args.globalValue,
  })}]`
}

/**
 * Build a compact endpoint-plan summary for the transport settings screen.
 * 为传输设置页构建一条紧凑 endpoint plan 摘要。
 *
 * The summary is config-only: it explains how the plugin will choose targets,
 * but it does not claim that any endpoint is reachable.
 * 这条摘要只描述配置状态：它解释插件将如何选择 target，
 * 但不声称任何 endpoint 当前可达。
 */
export function buildEndpointPlanSummary(args: {
  language: VmmLanguage
  vulcanHostTargetRaw?: string
}) {
  const copy = getVmmGrpcTransportCopy(args.language)
  const plan = buildVmmEndpointPlan({
    vulcanHostTarget: args.vulcanHostTargetRaw,
  })
  return copy.endpointPlanSummary({
    mode: plan.mode,
    effective: plan.effectiveTarget || copy.inheritValue,
  })
}

/**
 * Build the reusable scope dialog model for one transport edit action.
 * 为一次 transport 编辑动作构建可复用的作用域选择框模型。
 *
 * The transport page always asks the operator to choose workspace or global
 * scope after selecting one function, so this pure builder keeps that step
 * stable and testable.
 * transport 页面在选择具体功能后，总是要让操作者先选择 workspace
 * 还是 global 作用域，因此这个纯函数会把这一步稳定下来并纳入测试。
 */
export function buildVmmGrpcTransportScopeDialogModel(
  language: VmmLanguage,
): VmmGrpcTransportScopeDialogModel {
  const copy = getVmmGrpcTransportCopy(language)
  return {
    title: copy.scopeDialogTitle,
    options: [
      {
        title: copy.scopeWorkspaceTitle,
        subtitle: copy.scopeWorkspaceSubtitle,
        value: "local",
      },
      {
        title: copy.scopeGlobalTitle,
        subtitle: copy.scopeGlobalSubtitle,
        value: "global",
      },
    ],
  }
}

/**
 * Maximum allowed keepalive value in milliseconds (1 hour).
 * 允许的最大 keepalive 值（1 小时）。
 *
 * Values larger than this would effectively disable keepalive in practice and
 * could cause overflow issues in grpc-js or server-side implementations.
 * 超过此值在实践中会实质上禁用 keepalive，
 * 并可能导致 grpc-js 或服务端实现中的溢出问题。
 */
const MAX_KEEPALIVE_MS = 3600000

/**
 * Validate one numeric keepalive input using the shared positive-int rule.
 * 使用共享正整数规则校验一条 keepalive 数值输入。
 *
 * This keeps page-level validation semantics aligned across keepalive time and
 * timeout prompts while remaining easy to verify in plain Node tests.
 * 这个函数会让 keepalive time 和 timeout 两类输入框共享一致的校验语义，
 * 同时仍然可以在普通 Node 测试里直接验证。
 */
export function validateGrpcTransportPositiveIntegerInput(
  rawValue: string,
  invalidMessage: string,
) {
  const trimmed = rawValue.trim()
  if (!/^[1-9]\d*$/.test(trimmed)) return invalidMessage
  const parsed = Number.parseInt(trimmed, 10)
  if (!Number.isFinite(parsed) || parsed > MAX_KEEPALIVE_MS) return invalidMessage
  return undefined
}

/**
 * Validate one optional endpoint input for scoped config persistence.
 * 校验一条可选 endpoint 输入，用于作用域配置持久化。
 *
 * Empty values are accepted so operators can clear one scope and restore
 * inheritance. Non-empty values must stay one whitespace-free grpc-js target.
 * 空值是允许的，这样操作者可以清空当前作用域并恢复继承。
 * 非空值必须保持为一个不含空白字符的 grpc-js target。
 */
export function validateGrpcTransportEndpointInput(
  rawValue: string,
  invalidMessage: string,
) {
  const trimmed = rawValue.trim()
  if (!trimmed) return undefined
  if (/\s/.test(trimmed)) return invalidMessage
  return undefined
}

/**
 * Resolve one keepalive reference value for TUI save-time validation.
 * 为 TUI 保存时校验解析一条 keepalive 参考值。
 *
 * Save validation must follow the same invalid-value semantics as the runtime
 * transport layer: explicit scoped positive integers win, and otherwise fall
 * back to the layered effective value because both global and local scopes
 * may carry env-resolved numbers. The code-level default is only a last resort.
 * 保存校验必须遵循与运行时传输层一致的非法值语义：
 * 显式作用域正整数优先；无论 global 还是 local 都先回退到已解析的
 * effectiveValue，因为两者都可能携带环境变量解析后的数字；
 * 代码级默认值仅作为最终兜底。
 */
export function resolveScopedKeepaliveReferenceValue(args: {
  scope: VmmConfigScope
  rawScopedValue: string
  effectiveValue: number
  defaultValue: number
}) {
  const parsedScopedValue = parseScopedPositiveIntegerValue(args.rawScopedValue)
  if (parsedScopedValue !== undefined) {
    return parsedScopedValue
  }
  return normalizeStrictPositiveConfigInteger(args.effectiveValue, args.defaultValue)
}

/**
 * Build one endpoint text-prompt model for target editing.
 * 构建一个用于 target 编辑的 endpoint 文本输入框模型。
 *
 * Endpoint editors allow empty values because clearing a scoped target is the
 * safest way to return to inherited vulcan-host configuration.
 * endpoint 编辑器允许空值，因为清空作用域 target 是回到继承式 vulcan-host 配置的最安全方式。
 */
function buildEndpointPromptModel(args: {
  language: VmmLanguage
  rawScopedValue: string
  title: string
}): VmmGrpcTransportEndpointPromptModel {
  const copy = getVmmGrpcTransportCopy(args.language)
  return {
    title: args.title,
    placeholder: copy.endpointPromptPlaceholder,
    description: copy.endpointPromptDescription,
    emptyMessage: "",
    invalidMessage: copy.endpointPromptInvalid,
    initialValue: args.rawScopedValue,
    toastTitle: copy.toastTitle,
    allowEmpty: true,
  }
}

/**
 * Build the text-prompt model for vulcan-host relay target editing.
 * 构建 vulcan-host 中转 target 编辑所需的文本输入框模型。
 */
export function buildVulcanHostTargetPromptModel(args: {
  language: VmmLanguage
  rawScopedValue: string
}): VmmGrpcTransportEndpointPromptModel {
  const copy = getVmmGrpcTransportCopy(args.language)
  return buildEndpointPromptModel({
    language: args.language,
    rawScopedValue: args.rawScopedValue,
    title: copy.vulcanHostTargetPromptTitle,
  })
}

/**
 * Build the text-prompt model for keepalive time editing.
 * 构建 keepalive time 编辑所需的文本输入框模型。
 *
 * The initial value only shows the scoped raw value when one exists. If the
 * scope has no explicit override, the field stays empty so the operator must
 * type a value to confirm they want to break inheritance. This prevents the
 * page from silently freezing an inherited value into the local scope just
 * because the user opened the editor and pressed Enter without editing.
 * 只有当作用域存在显式覆盖值时才预填初始值。
 * 如果作用域没有显式覆盖，输入框保持为空，
 * 这样操作者必须显式输入一个值才能确认他们想打破继承关系。
 * 这可以防止页面仅仅因为用户打开编辑器后直接按回车，
 * 就把继承的生效值静默固化到局部作用域中。
 */
export function buildKeepaliveTimePromptModel(args: {
  language: VmmLanguage
  rawScopedValue: string
}): VmmGrpcTransportTextPromptModel {
  const copy = getVmmGrpcTransportCopy(args.language)
  return {
    title: copy.keepaliveTimePromptTitle,
    placeholder: copy.keepaliveTimePromptPlaceholder,
    description: copy.keepaliveTimePromptDescription,
    emptyMessage: copy.keepaliveTimePromptEmpty,
    invalidMessage: copy.keepaliveTimePromptInvalid,
    initialValue: args.rawScopedValue,
    toastTitle: copy.toastTitle,
  }
}

/**
 * Build the text-prompt model for keepalive timeout editing.
 * 构建 keepalive timeout 编辑所需的文本输入框模型。
 *
 * The initial value only shows the scoped raw value when one exists. If the
 * scope has no explicit override, the field stays empty so the operator must
 * type a value to confirm they want to break inheritance. This prevents the
 * page from silently freezing an inherited value into the local scope just
 * because the user opened the editor and pressed Enter without editing.
 * 只有当作用域存在显式覆盖值时才预填初始值。
 * 如果作用域没有显式覆盖，输入框保持为空，
 * 这样操作者必须显式输入一个值才能确认他们想打破继承关系。
 * 这可以防止页面仅仅因为用户打开编辑器后直接按回车，
 * 就把继承的生效值静默固化到局部作用域中。
 */
export function buildKeepaliveTimeoutPromptModel(args: {
  language: VmmLanguage
  rawScopedValue: string
}): VmmGrpcTransportTextPromptModel {
  const copy = getVmmGrpcTransportCopy(args.language)
  return {
    title: copy.keepaliveTimeoutPromptTitle,
    placeholder: copy.keepaliveTimeoutPromptPlaceholder,
    description: copy.keepaliveTimeoutPromptDescription,
    emptyMessage: copy.keepaliveTimeoutPromptEmpty,
    invalidMessage: copy.keepaliveTimeoutPromptInvalid,
    initialValue: args.rawScopedValue,
    toastTitle: copy.toastTitle,
  }
}

/**
 * Build the permit-without-calls selector model for one chosen scope.
 * 为某个已选作用域构建 permit-without-calls 选择框模型。
 *
 * The scope label is injected from the caller so the transport page can reuse
 * the same builder after resolving localized workspace/global wording.
 * 这里由调用方传入作用域标签，
 * 这样 transport 页面在解析出本地化的 workspace/global 文案后，
 * 就可以复用同一套构建器。
 */
export function buildPermitWithoutCallsDialogModel(args: {
  language: VmmLanguage
  scopeLabel: string
}): VmmGrpcTransportPermitDialogModel {
  const copy = getVmmGrpcTransportCopy(args.language)
  return {
    title: copy.permitSelectTitle(args.scopeLabel),
    options: [
      {
        title: copy.permitDisabledTitle,
        subtitle: copy.permitDisabledSubtitle,
        value: "0",
      },
      {
        title: copy.permitEnabledTitle,
        subtitle: copy.permitEnabledSubtitle,
        value: "1",
      },
    ],
  }
}

/**
 * Resolve one safe selected row id after the row list changes.
 * 在行列表变化后解析一个安全的选中行 id。
 *
 * Reloading the transport screen may replace every rendered row title, so the
 * page must keep the previous selection when possible and otherwise fall back
 * to the first available row.
 * transport 页面重载时可能会替换所有行标题，
 * 因此页面需要在可能的情况下保留原选中项，
 * 否则回退到首个可用条目。
 */
export function resolveGrpcTransportSelectedId(args: {
  items: ReadonlyArray<VmmGrpcTransportSettingsItem>
  currentSelectedId: string
}) {
  if (args.items.some((item) => item.id === args.currentSelectedId)) {
    return args.currentSelectedId
  }
  return args.items[0]?.id ?? ""
}

/**
 * Move the current transport selection with wrap-around semantics.
 * 使用带环绕语义的方式移动当前 transport 选中项。
 *
 * The keepalive page follows the same compact keyboard model as other rebuilt
 * managers: up/down should wrap instead of dead-ending at the list boundary.
 * keepalive 页面沿用其他重建管理页相同的紧凑键盘模型：
 * 上下移动需要环绕，而不是在边界处停死。
 */
export function moveGrpcTransportSelection(args: {
  items: ReadonlyArray<VmmGrpcTransportSettingsItem>
  currentSelectedId: string
  direction: -1 | 1
}) {
  if (args.items.length === 0) return ""
  const currentIndex = args.items.findIndex((item) => item.id === args.currentSelectedId)
  const safeIndex = currentIndex >= 0 ? currentIndex : 0
  const nextIndex = (safeIndex + args.direction + args.items.length) % args.items.length
  return args.items[nextIndex]?.id ?? args.items[0]?.id ?? ""
}

/**
 * Resolve the effective row that should respond to activation.
 * 解析应该响应激活动作的有效行。
 *
 * The screen accepts either an explicitly hovered row or the current keyboard
 * selection. This helper makes that fallback rule stable and reusable.
 * 页面既允许使用显式 hover/点击的行，也允许使用当前键盘选中项。
 * 这个辅助函数会把这条回退规则稳定下来并复用。
 */
export function resolveGrpcTransportActivatedItem(args: {
  items: ReadonlyArray<VmmGrpcTransportSettingsItem>
  selectedId: string
  explicitItem?: VmmGrpcTransportSettingsItem
}) {
  return (
    args.explicitItem ??
    args.items.find((item) => item.id === args.selectedId) ??
    args.items[0]
  )
}

/**
 * Map one selected transport row into the next editor action.
 * 把一条选中的 transport 行映射成下一步编辑动作。
 *
 * This keeps the TSX event handler declarative: resolve the item once, then
 * translate its kind into one stable action name.
 * 这能让 TSX 事件处理保持声明式：
 * 先解析出目标行，再把它的 kind 翻译成稳定动作名。
 */
export function resolveGrpcTransportActivationAction(
  item: VmmGrpcTransportSettingsItem | undefined,
): VmmGrpcTransportActivationAction | undefined {
  if (!item) return undefined
  if (item.kind === "vulcan-host-target") return "open-vulcan-host-target"
  if (item.kind === "keepalive-time") return "open-keepalive-time"
  if (item.kind === "keepalive-timeout") return "open-keepalive-timeout"
  return "open-permit-without-calls"
}

/**
 * Resolve one raw keyboard event name into a transport overlay action.
 * 把一条原始键盘事件名解析成 transport 覆盖层动作。
 *
 * Dialog-open state and empty-list state should suppress navigational actions
 * so the overlay does not steal input from child dialogs or react to keys when
 * there is nothing to select.
 * 当自定义对话框已打开或列表为空时，导航类动作都应被抑制，
 * 这样覆盖层既不会抢占子对话框输入，也不会在无条目时响应选择键。
 */
export function resolveGrpcTransportKeyboardAction(args: {
  eventName: string
  hasItems: boolean
  dialogOpen: boolean
}): VmmGrpcTransportKeyboardAction | undefined {
  if (args.dialogOpen) return undefined

  if (["up", "k"].includes(args.eventName)) {
    return args.hasItems ? "move-up" : undefined
  }
  if (["down", "j"].includes(args.eventName)) {
    return args.hasItems ? "move-down" : undefined
  }
  if (args.eventName === "escape") {
    return "close"
  }
  if (["return", "enter", "linefeed"].includes(args.eventName)) {
    return args.hasItems ? "activate" : undefined
  }
  return undefined
}

/**
 * Check whether one mouse-up event should close the transport overlay.
 * 检查一条鼠标抬起事件是否应该关闭 transport 覆盖层。
 *
 * The overlay intentionally uses right-click as its explicit pointer-side exit
 * gesture so left-click interactions on nested content cannot accidentally
 * dismiss the page.
 * 这个覆盖层刻意把“右键”作为显式的指针侧退出手势，
 * 这样嵌套内容上的左键交互就不会误伤整个页面。
 */
export function shouldCloseGrpcTransportOverlayOnMouseButton(button: number) {
  return button === 2
}

/**
 * Build the compact transport rows from one raw scoped-config snapshot.
 * 根据一份作用域原始配置快照构建紧凑的传输设置行。
 *
 * This is the key page-state compiler for the keepalive screen. It translates
 * raw project/global strings into user-facing row titles, preserving whether a
 * value is inherited, explicitly disabled, or explicitly set.
 * 这是 keepalive 页面最关键的状态编译器。
 * 它会把 project/global 两层原始字符串转换成面向用户的标题，
 * 并保留继承、显式关闭、显式设置三类状态。
 */
export function buildVmmGrpcTransportSettingsItems(
  args: VmmGrpcTransportSettingsSnapshot,
): ReadonlyArray<VmmGrpcTransportSettingsItem> {
  const copy = getVmmGrpcTransportCopy(args.language)

  const workspaceVulcanHostTargetValue = formatEndpointStateValue(
    args.language,
    args.workspaceVulcanHostTargetRaw,
  )
  const globalVulcanHostTargetValue = formatEndpointStateValue(
    args.language,
    args.globalVulcanHostTargetRaw,
  )
  const endpointPlanSummary = buildEndpointPlanSummary({
    language: args.language,
    vulcanHostTargetRaw: args.workspaceVulcanHostTargetRaw || args.globalVulcanHostTargetRaw,
  })
  const workspaceKeepaliveTimeValue = formatNumericStateValue(
    args.language,
    parseScopedPositiveIntegerValue(args.workspaceKeepaliveTimeRaw),
  )
  const globalKeepaliveTimeValue = formatNumericStateValue(
    args.language,
    parseScopedPositiveIntegerValue(args.globalKeepaliveTimeRaw),
  )
  const workspaceKeepaliveTimeoutValue = formatNumericStateValue(
    args.language,
    parseScopedPositiveIntegerValue(args.workspaceKeepaliveTimeoutRaw),
  )
  const globalKeepaliveTimeoutValue = formatNumericStateValue(
    args.language,
    parseScopedPositiveIntegerValue(args.globalKeepaliveTimeoutRaw),
  )
  const workspacePermitValue = formatPermitStateValue(
    args.language,
    parseScopedPermitWithoutCallsValue(args.workspacePermitWithoutCallsRaw),
  )
  const globalPermitValue = formatPermitStateValue(
    args.language,
    parseScopedPermitWithoutCallsValue(args.globalPermitWithoutCallsRaw),
  )

  return [
    {
      id: "action:vulcan-host-target",
      kind: "vulcan-host-target",
      title: appendStateToTitle({
        baseTitle: copy.vulcanHostTargetTitle,
        language: args.language,
        projectValue: workspaceVulcanHostTargetValue,
        globalValue: globalVulcanHostTargetValue,
      }),
      subtitle: `${copy.vulcanHostTargetSubtitle} ${endpointPlanSummary}`,
    },
    {
      id: "action:keepalive-time",
      kind: "keepalive-time",
      title: appendStateToTitle({
        baseTitle: copy.keepaliveTimeTitle,
        language: args.language,
        projectValue: workspaceKeepaliveTimeValue,
        globalValue: globalKeepaliveTimeValue,
      }),
      subtitle: copy.keepaliveTimeSubtitle,
    },
    {
      id: "action:keepalive-timeout",
      kind: "keepalive-timeout",
      title: appendStateToTitle({
        baseTitle: copy.keepaliveTimeoutTitle,
        language: args.language,
        projectValue: workspaceKeepaliveTimeoutValue,
        globalValue: globalKeepaliveTimeoutValue,
      }),
      subtitle: copy.keepaliveTimeoutSubtitle,
    },
    {
      id: "action:permit-without-calls",
      kind: "permit-without-calls",
      title: appendStateToTitle({
        baseTitle: copy.permitTitle,
        language: args.language,
        projectValue: workspacePermitValue,
        globalValue: globalPermitValue,
      }),
      subtitle: copy.permitSubtitle,
    },
  ]
}
