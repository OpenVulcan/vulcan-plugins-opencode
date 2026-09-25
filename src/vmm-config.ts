/**
 * VMM config parsing, layering, and persistence helpers.
 * VMM 配置解析、分层合并与持久化辅助模块。
 *
 * This file belongs to the config/bootstrap layer. It is mainly used by the
 * plugin runtime and TUI control center when resolving effective runtime
 * config and reading or writing local/global VMM config files.
 * 这个文件属于配置与引导层，主要服务于插件运行时和 TUI 控制中心：
 * 计算最终生效的运行时配置，并读写本地/全局 VMM 配置文件。
 */

import fs from "fs/promises"
import os from "os"
import path from "path"
import { fileURLToPath } from "url"
import {
  resolveVmmLanguage,
  tVmmShared,
  type VmmLanguage,
} from "./vmm-language.js"
import {
  normalizeVmmNotificationSurfaceMode,
  type VmmNotificationSurfaceMode,
} from "./vmm-notification-routing.js"
import { buildVmmEndpointPlan } from "./vmm-endpoint-plan.js"

/**
 * Core default values and file names used by VMM config bootstrap.
 * VMM 配置引导阶段使用的核心默认值与文件名常量。
 *
 * These constants stay in one module so the template file, auto-generated
 * global config, and runtime layered config all derive from the same source.
 * 这些常量集中在本模块里，是为了让模板文件、自动初始化的全局配置、
 * 以及运行时的分层配置都基于同一套源头，避免三处配置口径漂移。
 */
const DEFAULT_VISIBLE_MEMORY_INJECTION = false
const DEFAULT_IMPLICIT_MEMORY_TURNS = 5
const DEFAULT_PROFILE_REFRESH_TURNS = 5
const DEFAULT_SESSION_COMPACT_RECALL = true
const DEFAULT_NOTIFICATION_SURFACE_MODE: VmmNotificationSurfaceMode = "auto"
const DEFAULT_GRPC_HANDSHAKE_TIMEOUT_MS = 1500
const DEFAULT_GRPC_RECEIVE_TIMEOUT_MS = 30000
/**
 * Conservative keepalive defaults used by the layered runtime config.
 * 分层运行时配置使用的保守 keepalive 默认值。
 *
 * These defaults intentionally optimize for connection health and empty-idle
 * stability instead of aggressively pinging the backend during every quiet
 * period.
 * 这组默认值会刻意优先保障连接健康和空闲期稳定性，
 * 而不是在每个安静阶段都激进地向后端发送 ping。
 *
 * These constants are also imported by the transport layer (`vmm-grpc.ts`)
 * as defensive fallback defaults. If you change them here, both layers stay aligned.
 * 这些常量也会被传输层（`vmm-grpc.ts`）导入作为防御性默认值。
 * 如果在这里修改，两层的默认值会保持一致。
 */
export const DEFAULT_GRPC_KEEPALIVE_TIME_MS = 300000
export const DEFAULT_GRPC_KEEPALIVE_TIMEOUT_MS = 20000
export const DEFAULT_GRPC_KEEPALIVE_PERMIT_WITHOUT_CALLS = 0
const PLUGIN_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const VMM_TEMPLATE_DIRNAME = ".vmm"
const VMM_CONFIG_FILENAME = ".vmm.json"
const VMM_SESSION_STATE_FILENAME = ".vmm-session-state.json"
const VMM_DEFAULT_TEMPLATE_FILENAME = "config.default.json"

/**
 * Syntax rules used by env placeholder parsing and numeric binding validation.
 * 环境变量占位符解析与数字绑定校验所使用的语法规则。
 *
 * The slash-command parser has been retired in favor of `/vulcan-setting`, but
 * config loading still needs one shared numeric-id rule for business scope
 * validation.
 * 旧的 slash 命令解析器已经下线并收敛到 `/vulcan-setting`，
 * 但配置加载仍然需要一套统一的数字 ID 规则来校验业务作用域。
 */
const CONFIG_ENV_REF_REGEX = /^\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))$/
const VMM_NUMERIC_ID_REGEX = /^[1-9][0-9]*$/

/**
 * Writable VMM config keys supported by TUI persistence and runtime repair flows.
 * TUI 配置落盘和运行时修复链共同支持的 VMM 可写配置键。
 *
 * Keeping the writable key space explicit here prevents TUI save behavior and
 * runtime repair behavior from drifting independently.
 * 在这里显式列出可写键集合，可以防止 TUI 保存能力和运行时修复链
 * 各自演化后出现不一致。
 */
export type VmmConfigKey = "project_id" | "user_id" | "language"
export type VmmWritableConfigKey =
  | VmmConfigKey
  | "vulcan_host_target"
  | "visible_memory_injection"
  | "implicit_memory_turns"
  | "profile_refresh_turns"
  | "session_compact_recall"
  | "grpc_keepalive_time_ms"
  | "grpc_keepalive_timeout_ms"
  | "grpc_keepalive_permit_without_calls"
export type VmmConfigWritableValue = string | number | boolean
export type VmmConfigScope = "global" | "local"

/**
 * Effective runtime config after default/global/local layering.
 * 经过 default/global/local 合并后的最终运行时配置。
 *
 * The rest of the plugin only reads this normalized shape so turn extraction
 * and transport code do not need to care where a value originally came from.
 * 插件其余部分只读取这个归一化结构，
 * 这样 turn 提取和传输代码就不需要关心某个值最初来自哪一层。
 */
export type VmmRuntimeConfig = {
  projectId: string
  userId: string
  language: VmmLanguage
  languageRaw: string
  languageFallbackApplied: boolean
  notificationSurfaceMode: VmmNotificationSurfaceMode
  /**
   * Effective gRPC target used by the runtime, preferring vulcan-host relay.
   * 运行时实际使用的 gRPC 地址，优先采用 vulcan-host 中转地址。
   */
  grpcTarget: string
  /**
   * Primary vulcan-host relay target that fronts VMM and LuaSkills services.
   * 承载 VMM 与 LuaSkills 服务的首选 vulcan-host 中转地址。
   */
  vulcanHostTarget: string
  grpcApiKey: string
  grpcHandshakeTimeoutMs: number
  grpcReceiveTimeoutMs: number
  grpcKeepaliveTimeMs: number
  grpcKeepaliveTimeoutMs: number
  grpcKeepalivePermitWithoutCalls: number
  visibleMemoryInjection: boolean
  implicitMemoryTurns: number
  profileRefreshTurns: number
  sessionCompactRecall: boolean
}

/**
 * Concrete filesystem paths used by VMM config and session persistence.
 * VMM 配置与 session 持久化所使用的具体文件路径集合。
 *
 * Path resolution is centralized here because config bootstrap, session state,
 * and legacy migration all depend on the same directory layout assumptions.
 * 路径解析集中在这里，是因为配置引导、session 状态持久化和旧路径迁移
 * 都依赖同一套目录布局假设。
 */
export type VmmPathSet = {
  opencodeDir: string
  configPath: string
  sessionStatePath: string
  globalOpencodeDir: string
  globalConfigPath: string
  legacyGlobalConfigPath: string
  bundledDefaultConfigPath: string
}

/**
 * Normalize config text before parsing layered values.
 * 在做分层配置解析前标准化配置文本。
 *
 * This helper is local to the config module because trimming and CRLF cleanup
 * are part of config interpretation, not general turn extraction behavior.
 * 这个辅助函数只留在配置模块内，
 * 因为 trim 与 CRLF 清洗属于配置解释逻辑，而不是通用的 turn 提取逻辑。
 */
function normalizeConfigText(value: string | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim()
}

/**
 * Resolve a config value that may reference an environment variable.
 * 解析可能引用环境变量的配置值。
 *
 * This allows API credentials and endpoints to stay outside committed config
 * files while still participating in the normal layering logic.
 * 这个函数让 API 地址和密钥等字段可以不直接写死进配置文件，
 * 同时仍然参与标准的分层配置逻辑。
 */
function resolveConfigEnvValue(raw: unknown) {
  if (typeof raw !== "string") return raw
  const trimmed = raw.trim()
  const match = trimmed.match(CONFIG_ENV_REF_REGEX)
  if (!match) return raw
  const envKey = match[1] ?? match[2]
  return envKey ? process.env[envKey] : undefined
}

/**
 * Read one string config value after env resolution.
 * 读取单个字符串配置值，并在内部先完成环境变量解析。
 *
 * Callers use this helper so they only need to care about precedence order,
 * not about trimming or placeholder expansion details.
 * 调用方使用这个函数时，只需要关注优先级顺序，
 * 不必重复处理 trim 和占位符展开细节。
 */
function readConfigString(raw: unknown, fallback = "") {
  const resolved = resolveConfigEnvValue(raw)
  return typeof resolved === "string" ? normalizeConfigText(resolved) : fallback
}

/**
 * Read one boolean config value after env resolution.
 * 读取单个布尔配置值，并在内部先完成环境变量解析。
 *
 * String forms are accepted because env-based config often arrives as text.
 * 这里接受字符串形式的布尔值，
 * 是因为基于环境变量的配置在很多场景下天然会以文本形式出现。
 */
function readConfigBoolean(raw: unknown, fallback: boolean) {
  const resolved = resolveConfigEnvValue(raw)
  if (typeof resolved === "boolean") return resolved
  if (typeof resolved === "string") {
    const normalized = normalizeConfigText(resolved).toLowerCase()
    if (["1", "true", "yes", "on"].includes(normalized)) return true
    if (["0", "false", "no", "off"].includes(normalized)) return false
  }
  return fallback
}

/**
 * Read one non-negative integer config value after env resolution.
 * 读取单个非负整数配置值，并在内部先完成环境变量解析。
 *
 * Timeout and implicit-memory settings share the same coercion rule, so the
 * integer normalization logic lives in one place.
 * 超时和隐式记忆轮数都遵循同一套数值约束，
 * 因此这里统一处理整数归一化逻辑。
 */
function readConfigInteger(raw: unknown, fallback: number) {
  const resolved = resolveConfigEnvValue(raw)
  if (typeof resolved === "number" && Number.isFinite(resolved)) {
    return Math.max(0, Math.floor(resolved))
  }
  if (typeof resolved === "string") {
    const parsed = Number(normalizeConfigText(resolved))
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }
  return fallback
}

/**
 * Resolve a layered string config according to precedence.
 * 按优先级解析分层字符串配置。
 *
 * The first non-empty candidate wins, matching the repo rule of local
 * overriding global and global overriding defaults.
 * 第一个非空候选值直接生效，
 * 这和仓库里 local 覆盖 global、global 覆盖 default 的规则一致。
 */
function readLayeredConfigString(candidates: unknown[], fallback = "") {
  for (const candidate of candidates) {
    const value = readConfigString(candidate, "")
    if (value) return value
  }
  return fallback
}

/**
 * Resolve a layered boolean config according to precedence.
 * 按优先级解析分层布尔配置。
 *
 * Boolean values must preserve explicit false, so they cannot reuse the string
 * resolver without losing the meaning of "configured but disabled".
 * 布尔值必须保留显式 false 的语义，
 * 因此不能直接复用字符串解析器，否则会丢失“已配置但关闭”的含义。
 */
function readLayeredConfigBoolean(candidates: unknown[], fallback: boolean) {
  for (const candidate of candidates) {
    const resolved = resolveConfigEnvValue(candidate)
    if (typeof resolved === "boolean") return resolved
    if (typeof resolved === "string") {
      const normalized = normalizeConfigText(resolved).toLowerCase()
      if (["1", "true", "yes", "on"].includes(normalized)) return true
      if (["0", "false", "no", "off"].includes(normalized)) return false
    }
  }
  return fallback
}

/**
 * Resolve a layered integer config according to precedence.
 * 按优先级解析分层整数配置。
 *
 * This is mainly used by timeout settings and implicit-memory warming rules.
 * 它主要服务于超时配置和隐式记忆保温轮数配置。
 */
function readLayeredConfigInteger(candidates: unknown[], fallback: number) {
  for (const candidate of candidates) {
    const resolved = resolveConfigEnvValue(candidate)
    if (typeof resolved === "number" && Number.isFinite(resolved)) {
      return Math.max(0, Math.floor(resolved))
    }
    if (typeof resolved === "string") {
      const normalized = normalizeConfigText(resolved)
      if (!normalized) continue
      const parsed = Number(normalized)
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed))
      }
    }
  }
  return fallback
}

/**
 * Normalize one strictly-positive integer config value with a fallback.
 * 使用兜底值归一化一条“必须为正整数”的配置值。
 *
 * Some runtime features, such as gRPC keepalive time/timeout, treat zero or
 * negative values as invalid and should fall back to conservative defaults
 * instead of preserving the broken number.
 * 某些运行时能力（例如 gRPC keepalive 的时间和超时）要求值必须是正整数，
 * 因此遇到 0、负数或非有限数字时，不应保留坏值，而应回退到保守默认值。
 */
export function normalizeStrictPositiveConfigInteger(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return fallback
  }
  return Math.floor(value)
}

/**
 * Normalize raw scope text into the supported runtime scope enum.
 * 把原始 scope 文本归一化成受支持的运行时 scope 枚举。
 *
 * Only `local` and `global` are supported, so everything else must collapse
 * early instead of leaking ambiguity deeper into TUI save flows.
 * 这里只支持 `local` 和 `global` 两种作用域，
 * 其他情况必须尽早收敛，避免模糊语义继续流入后续 TUI 保存流程。
 */
function normalizeConfigScope(raw: string | undefined): VmmConfigScope {
  return raw?.toLowerCase() === "global" ? "global" : "local"
}

/**
 * Render a user-facing config scope label.
 * 生成面向用户提示的配置作用域标签。
 *
 * This is used in TUI feedback so the user can immediately tell whether they
 * changed current-project config or global defaults.
 * 这个标签主要用于 TUI 反馈，
 * 让用户一眼看出自己改的是当前项目配置还是全局默认配置。
 */
export function getConfigScopeLabel(scope: VmmConfigScope, language: VmmLanguage = "en") {
  return scope === "global"
    ? tVmmShared(language, "scope_global")
    : tVmmShared(language, "scope_local")
}

/**
 * Render a storage-oriented scope label.
 * 生成面向存储层语义的作用域标签。
 *
 * Unlike the user-facing label above, this one is used in system text where we
 * want the literal storage scope wording.
 * 和上面的用户提示标签不同，
 * 这里更偏向系统文案里的字面存储层级表达。
 */
export function getConfigScopeStorageLabel(scope: VmmConfigScope) {
  return scope === "global" ? "global" : "local"
}

/**
 * Check whether gRPC transport is effectively enabled.
 * 检查 gRPC 传输链是否真正启用。
 *
 * Missing `vulcan_host_target` is treated as safe-disabled mode so the plugin can skip
 * memory-specific work without blocking normal chat behavior.
 * 缺失 `vulcan_host_target` 会被视为安全停用态，
 * 这样插件可以跳过记忆相关链路，同时不阻断普通对话。
 */
export function hasConfiguredGrpcTarget(config: Pick<VmmRuntimeConfig, "grpcTarget">) {
  return Boolean(normalizeConfigText(config.grpcTarget))
}

/**
 * Check whether one configured identifier is a valid non-zero decimal string.
 * 检查一个配置标识是否为合法的非零十进制字符串。
 *
 * Business RPCs now require numeric `user_id` and `project_id`, so TUI binding
 * and runtime gating both rely on the same validation rule.
 * 新业务 RPC 现在要求数字型 `user_id` 和 `project_id`，
 * 因此 TUI 绑定和运行时链路开关都要复用同一条校验规则。
 */
export function isNumericVmmIdentifier(value: string | undefined) {
  return VMM_NUMERIC_ID_REGEX.test(normalizeConfigText(value))
}

/**
 * Check whether the business chain has both required numeric bindings.
 * 检查业务链是否已经具备两个必需的数字绑定。
 *
 * This helper intentionally ignores transport config so callers can combine it
 * with `hasConfiguredGrpcTarget` based on their own flow needs.
 * 这个辅助函数刻意不关心传输层配置，
 * 这样调用方可以按自己的流程需求，再结合 `hasConfiguredGrpcTarget` 使用。
 */
export function hasConfiguredBusinessBindings(
  config: Pick<VmmRuntimeConfig, "projectId" | "userId">,
) {
  return isNumericVmmIdentifier(config.projectId) && isNumericVmmIdentifier(config.userId)
}

/**
 * Business binding fields that can block the runtime chain.
 * 可能阻断运行时业务链的业务绑定字段集合。
 *
 * The plugin only needs `user_id` and `project_id` at runtime, so diagnostics
 * keep the field list narrow and stable for toast/log rendering.
 * 运行时真正影响业务链的只有 `user_id` 和 `project_id`，
 * 因此这里把字段集合收窄，方便 toast 和日志稳定复用。
 */
export type VmmBusinessBindingField = "user_id" | "project_id"

/**
 * One normalized runtime diagnostic for VMM availability.
 * 一条归一化后的 VMM 运行时可用性诊断结果。
 *
 * Chat-time retrieval, post-answer writeback, and config UX all share this
 * structure so they can explain why VMM is disabled without diverging wording.
 * 聊天期检索、回答后写回和配置提示都会复用这个结构，
 * 这样在 VMM 被停用时可以统一解释原因，避免文案分叉。
 */
export type VmmBusinessScopeDiagnosis = {
  enabled: boolean
  reason:
    | "ready"
    | "missing-vulcan-host-target"
    | "business-bindings-incomplete"
    | "business-bindings-invalid"
    | "business-bindings-mixed"
  missingFields: VmmBusinessBindingField[]
  invalidFields: VmmBusinessBindingField[]
  toastMessage?: string
}

/**
 * Render one short field list for binding-related toast messages.
 * 为绑定类 toast 渲染一段简短字段列表。
 *
 * Keeping this helper centralized avoids slightly different Chinese wording
 * between "missing" and "invalid" branches for the same field group.
 * 这里统一处理字段列表，
 * 可以避免“缺失”和“无效”分支对同一组字段写出不一致的中文提示。
 */
function formatVmmBindingFieldList(fields: VmmBusinessBindingField[]) {
  return fields.map((field) => field).join("、")
}

/**
 * Render one short field list for English and other non-Chinese languages.
 * 为英语和其他非中文语言渲染简短字段列表。
 *
 * The runtime only needs stable field identifiers here, so we keep the raw
 * config keys visible instead of inventing separate display names.
 * 运行时在这里更需要稳定字段标识，
 * 因此直接保留配置键名，而不是再引入一套额外展示名。
 */
function formatVmmBindingFieldListEnglish(fields: VmmBusinessBindingField[]) {
  return fields.join(", ")
}

/**
 * Render one short rebinding hint that matches the affected fields.
 * 生成与受影响字段匹配的重新绑定提示。
 *
 * Users may hand-edit config files, so the toast should point them back to the
 * canonical slash commands instead of assuming they remember the exact syntax.
 * 用户可能会直接手改配置文件，
 * 因此这里会把提示重新收敛到标准 slash 命令，而不是假设用户记得语法。
 */
function formatVmmBindingRepairHint(fields: VmmBusinessBindingField[], language: VmmLanguage = "en") {
  const needsUser = fields.includes("user_id")
  const needsProject = fields.includes("project_id")

  if (needsUser && needsProject) {
    return tVmmShared(language, "binding_repair_both")
  }

  if (needsUser) {
    return tVmmShared(language, "binding_repair_user")
  }

  if (needsProject) {
    return tVmmShared(language, "binding_repair_project")
  }

  return tVmmShared(language, "binding_repair_generic")
}

/**
 * Diagnose whether the runtime business scope is complete enough to call VMM.
 * 诊断当前运行时业务作用域是否足以发起 VMM 调用。
 *
 * The plugin treats missing or malformed bindings as a hard disable for both
 * retrieval and writeback, and this helper provides the shared reason text.
 * 插件会把缺失或格式错误的绑定视为检索和写回的硬停用条件，
 * 这里统一给出可复用的原因文本。
 */
export function diagnoseVmmBusinessScope(
  config: Pick<VmmRuntimeConfig, "grpcTarget" | "projectId" | "userId" | "language">,
): VmmBusinessScopeDiagnosis {
  const language = config.language ?? "en"
  if (!hasConfiguredGrpcTarget(config)) {
    return {
      enabled: false,
      reason: "missing-vulcan-host-target",
      missingFields: [],
      invalidFields: [],
      toastMessage: tVmmShared(language, "missing_vulcan_host_target"),
    }
  }

  const missingFields: VmmBusinessBindingField[] = []
  const invalidFields: VmmBusinessBindingField[] = []

  const userId = normalizeConfigText(config.userId)
  const projectId = normalizeConfigText(config.projectId)

  // Check presence first so a blank config file value is reported as "missing"
  // instead of the noisier "invalid numeric identifier".
  // 这里先检查是否缺失，
  // 避免把空值误报成更吵的“数字标识无效”。
  if (!userId) {
    missingFields.push("user_id")
  } else if (!isNumericVmmIdentifier(userId)) {
    invalidFields.push("user_id")
  }

  if (!projectId) {
    missingFields.push("project_id")
  } else if (!isNumericVmmIdentifier(projectId)) {
    invalidFields.push("project_id")
  }

  if (missingFields.length === 0 && invalidFields.length === 0) {
    return {
      enabled: true,
      reason: "ready",
      missingFields,
      invalidFields,
    }
  }

  const missingText =
    missingFields.length > 0
      ? language === "zh-CN"
        ? `缺少 ${formatVmmBindingFieldList(missingFields)}`
        : `missing ${formatVmmBindingFieldListEnglish(missingFields)}`
      : undefined
  const invalidText =
    invalidFields.length > 0
      ? language === "zh-CN"
        ? `${formatVmmBindingFieldList(invalidFields)} 无效`
        : `${formatVmmBindingFieldListEnglish(invalidFields)} invalid`
      : undefined
  const issueText = [missingText, invalidText]
    .filter(Boolean)
    .join(language === "zh-CN" ? "，且 " : " and ")

  return {
    enabled: false,
    reason:
      missingFields.length > 0 && invalidFields.length > 0
        ? "business-bindings-mixed"
        : missingFields.length > 0
          ? "business-bindings-incomplete"
          : "business-bindings-invalid",
    missingFields,
    invalidFields,
    toastMessage: [
      language === "zh-CN"
        ? `尚未完成 VMM 绑定（${issueText}），当前已跳过记忆检索与写回。`
        : `VMM bindings are incomplete (${issueText}). Retrieval and writeback are currently skipped.`,
      formatVmmBindingRepairHint([...new Set([...missingFields, ...invalidFields])], language),
    ].join(" "),
  }
}

/**
 * Resolve the OpenCode user home used for config bootstrap and migration.
 * 解析 OpenCode 用户目录，用于配置引导和旧路径迁移。
 *
 * Tests can override this location, so home resolution is centralized here.
 * 测试环境允许覆盖这个位置，因此 home 目录解析逻辑集中在这里统一处理。
 */
function getOpencodeUserHomeDirectory() {
  return process.env["OPENCODE_TEST_HOME"] || os.homedir()
}

/**
 * Build the bundled default config record used by VMM bootstrap.
 * 构建 VMM 引导阶段使用的内置默认配置记录。
 *
 * These defaults feed both the repository template and the auto-generated
 * global config file when no global config exists yet.
 * 这些默认值会同时服务于仓库模板和自动生成的全局配置文件，
 * 用于覆盖“首次启动还没有全局配置”的场景。
 */
function buildDefaultConfigRecord() {
  return {
    project_id: "",
    user_id: "",
    language: "en",
    notification_surface_mode: DEFAULT_NOTIFICATION_SURFACE_MODE,
    vulcan_host_target: "${VULCAN_HOST_GRPC_TARGET}",
    grpc_api_key: "${VMM_GRPC_API_KEY}",
    grpc_handshake_timeout_ms: DEFAULT_GRPC_HANDSHAKE_TIMEOUT_MS,
    grpc_receive_timeout_ms: DEFAULT_GRPC_RECEIVE_TIMEOUT_MS,
    grpc_keepalive_time_ms: DEFAULT_GRPC_KEEPALIVE_TIME_MS,
    grpc_keepalive_timeout_ms: DEFAULT_GRPC_KEEPALIVE_TIMEOUT_MS,
    grpc_keepalive_permit_without_calls: DEFAULT_GRPC_KEEPALIVE_PERMIT_WITHOUT_CALLS,
    visible_memory_injection: DEFAULT_VISIBLE_MEMORY_INJECTION,
    implicit_memory_turns: DEFAULT_IMPLICIT_MEMORY_TURNS,
    profile_refresh_turns: DEFAULT_PROFILE_REFRESH_TURNS,
    session_compact_recall: DEFAULT_SESSION_COMPACT_RECALL,
  }
}

/**
 * Resolve the local/global/template file paths used by VMM.
 * 解析 VMM 使用到的本地、全局和模板文件路径。
 *
 * Session persistence also depends on this path bundle, so config code and
 * session-state code can agree on the same `.opencode` layout.
 * session 持久化也依赖这组路径，
 * 这样配置代码和 session 状态代码才能共用同一套 `.opencode` 布局。
 */
export function getVmmPaths(directory: string): VmmPathSet {
  const userHomeDirectory = getOpencodeUserHomeDirectory()
  const globalOpencodeDir = path.join(userHomeDirectory, ".config", "opencode")
  const opencodeDir = path.join(directory, ".opencode")
  return {
    opencodeDir,
    globalOpencodeDir,
    configPath: path.join(opencodeDir, VMM_CONFIG_FILENAME),
    globalConfigPath: path.join(globalOpencodeDir, VMM_CONFIG_FILENAME),
    legacyGlobalConfigPath: path.join(userHomeDirectory, ".opencode", VMM_CONFIG_FILENAME),
    sessionStatePath: path.join(opencodeDir, VMM_SESSION_STATE_FILENAME),
    bundledDefaultConfigPath: path.join(
      PLUGIN_ROOT_DIR,
      VMM_TEMPLATE_DIRNAME,
      VMM_DEFAULT_TEMPLATE_FILENAME,
    ),
  }
}

/**
 * Read a JSON object from disk if the file exists.
 * 如果文件存在，则从磁盘读取一个 JSON 对象。
 *
 * Missing files are treated as a normal cold-start case and return undefined.
 * 文件不存在会被视为正常冷启动情况，并返回 undefined。
 */
export async function readJsonObjectIfExists(filePath: string) {
  try {
    const existing = await fs.readFile(filePath, "utf8")
    const parsed = JSON.parse(existing)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : undefined
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code === "ENOENT") return undefined
    // Treat malformed JSON as an absent file rather than crashing the caller.
    // 把格式错误的 JSON 视为文件不存在，而不是让调用方崩溃。
    if (error instanceof SyntaxError) return undefined
    throw error
  }
}

/**
 * Load the bundled default config template from the repository.
 * 从仓库里加载内置默认配置模板。
 *
 * If the template file is missing, we fall back to the hardcoded defaults so
 * plugin bootstrap still works in partially packaged development setups.
 * 如果模板文件缺失，就回退到内置硬编码默认值，
 * 这样在某些不完整打包的开发环境里仍然可以正常引导启动。
 */
async function loadBundledDefaultConfig(paths: VmmPathSet) {
  return (await readJsonObjectIfExists(paths.bundledDefaultConfigPath)) ?? buildDefaultConfigRecord()
}

/**
 * Ensure the global VMM config file exists in the current OpenCode config dir.
 * 确保当前 OpenCode 全局配置目录下存在 VMM 全局配置文件。
 *
 * If an older `~/.opencode/.vmm.json` is found, it is copied forward once so
 * path migration does not silently wipe user settings.
 * 如果发现旧的 `~/.opencode/.vmm.json`，这里会做一次前向复制，
 * 避免路径迁移时悄悄把用户设置抹掉。
 */
async function ensureGlobalVmmConfig(paths: VmmPathSet, defaults: Record<string, unknown>) {
  const existing = await readJsonObjectIfExists(paths.globalConfigPath)
  if (existing) return paths.globalConfigPath

  // Read the legacy config with graceful fallback. If the legacy file exists
  // but contains invalid JSON, treat it as empty and start fresh with defaults.
  // 读取旧版配置时做优雅降级：如果旧版文件存在但 JSON 损坏，
  // 视为空配置，使用默认值重新初始化。
  let legacyExisting: Record<string, unknown> | undefined
  try {
    legacyExisting = await readJsonObjectIfExists(paths.legacyGlobalConfigPath)
  } catch {
    // Malformed legacy JSON — proceed with defaults.
    // 旧版 JSON 格式损坏，继续使用默认值。
    process.stderr.write(
      `[vmm-config] WARNING: legacy config at "${paths.legacyGlobalConfigPath}" contains invalid JSON, discarding and using defaults.\n`,
    )
  }

  await fs.mkdir(paths.globalOpencodeDir, { recursive: true })
  await fs.writeFile(
    paths.globalConfigPath,
    JSON.stringify(legacyExisting ?? defaults, null, 2) + "\n",
    "utf8",
  )
  return paths.globalConfigPath
}

/**
 * Load the effective runtime config using local/global/default precedence.
 * 按 local/global/default 优先级加载最终生效的运行时配置。
 *
 * Transport keys and business keys are resolved together here so the rest of
 * the plugin can consume one normalized config object.
 * 传输层配置和业务配置都在这里统一完成解析，
 * 这样插件其余部分只需要消费一份归一化后的配置对象。
 */
export async function loadVmmConfig(directory: string): Promise<VmmRuntimeConfig> {
  const paths = getVmmPaths(directory)
  const defaults = (await loadBundledDefaultConfig(paths)) as Record<string, unknown>
  await ensureGlobalVmmConfig(paths, defaults)
  const globalConfig = ((await readJsonObjectIfExists(paths.globalConfigPath)) ??
    {}) as Record<string, unknown>
  const localConfig = ((await readJsonObjectIfExists(paths.configPath)) ??
    {}) as Record<string, unknown>
  const resolvedLanguage = resolveVmmLanguage(
    readLayeredConfigString(
      [localConfig["language"], globalConfig["language"], defaults["language"]],
      "",
    ),
  )
  /**
   * Resolve the vulcan-host target before building the normalized config.
   * 在构建归一化配置前先解析 vulcan-host 地址。
   *
   * The plugin only connects to vulcan-host. VMM direct connection settings
   * belong to the host process and must not leak back into plugin config.
   * 插件只连接 vulcan-host。
   * VMM 直连配置属于宿主进程，不应再回流到插件配置里。
   */
  const endpointPlan = buildVmmEndpointPlan({
    vulcanHostTarget: readLayeredConfigString(
      [
        localConfig["vulcan_host_target"],
        globalConfig["vulcan_host_target"],
        defaults["vulcan_host_target"],
      ],
      "",
    ),
  })

  return {
    projectId: readLayeredConfigString(
      [localConfig["project_id"], globalConfig["project_id"], defaults["project_id"]],
      "",
    ),
    userId: readLayeredConfigString(
      [localConfig["user_id"], globalConfig["user_id"], defaults["user_id"]],
      "",
    ),
    language: resolvedLanguage.code,
    languageRaw: resolvedLanguage.raw,
    languageFallbackApplied: !resolvedLanguage.matched && Boolean(resolvedLanguage.raw.trim()),
    notificationSurfaceMode: normalizeVmmNotificationSurfaceMode(
      readLayeredConfigString(
        [
          localConfig["notification_surface_mode"],
          localConfig["提示路由模式"],
          globalConfig["notification_surface_mode"],
          globalConfig["提示路由模式"],
          defaults["notification_surface_mode"],
        ],
        DEFAULT_NOTIFICATION_SURFACE_MODE,
      ),
    ),
    grpcTarget: endpointPlan.effectiveTarget,
    vulcanHostTarget: endpointPlan.vulcanHostTarget,
    grpcApiKey: readLayeredConfigString(
      [localConfig["grpc_api_key"], globalConfig["grpc_api_key"], defaults["grpc_api_key"]],
      "",
    ),
    grpcHandshakeTimeoutMs: readLayeredConfigInteger(
      [
        localConfig["grpc_handshake_timeout_ms"],
        globalConfig["grpc_handshake_timeout_ms"],
        defaults["grpc_handshake_timeout_ms"],
      ],
      DEFAULT_GRPC_HANDSHAKE_TIMEOUT_MS,
    ),
    grpcReceiveTimeoutMs: readLayeredConfigInteger(
      [
        localConfig["grpc_receive_timeout_ms"],
        globalConfig["grpc_receive_timeout_ms"],
        defaults["grpc_receive_timeout_ms"],
      ],
      DEFAULT_GRPC_RECEIVE_TIMEOUT_MS,
    ),
    grpcKeepaliveTimeMs: readLayeredConfigInteger(
      [
        localConfig["grpc_keepalive_time_ms"],
        globalConfig["grpc_keepalive_time_ms"],
        defaults["grpc_keepalive_time_ms"],
      ],
      DEFAULT_GRPC_KEEPALIVE_TIME_MS,
    ),
    grpcKeepaliveTimeoutMs: readLayeredConfigInteger(
      [
        localConfig["grpc_keepalive_timeout_ms"],
        globalConfig["grpc_keepalive_timeout_ms"],
        defaults["grpc_keepalive_timeout_ms"],
      ],
      DEFAULT_GRPC_KEEPALIVE_TIMEOUT_MS,
    ),
    grpcKeepalivePermitWithoutCalls: readLayeredConfigInteger(
      [
        localConfig["grpc_keepalive_permit_without_calls"],
        globalConfig["grpc_keepalive_permit_without_calls"],
        defaults["grpc_keepalive_permit_without_calls"],
      ],
      DEFAULT_GRPC_KEEPALIVE_PERMIT_WITHOUT_CALLS,
    ),
    visibleMemoryInjection: readLayeredConfigBoolean(
      [
        localConfig["visible_memory_injection"],
        localConfig["开启显示提示"],
        globalConfig["visible_memory_injection"],
        globalConfig["开启显示提示"],
        defaults["visible_memory_injection"],
      ],
      DEFAULT_VISIBLE_MEMORY_INJECTION,
    ),
    implicitMemoryTurns: readLayeredConfigInteger(
      [
        localConfig["implicit_memory_turns"],
        localConfig["隐式提示注入轮数"],
        globalConfig["implicit_memory_turns"],
        globalConfig["隐式提示注入轮数"],
        defaults["implicit_memory_turns"],
      ],
      DEFAULT_IMPLICIT_MEMORY_TURNS,
    ),
    profileRefreshTurns: readLayeredConfigInteger(
      [
        localConfig["profile_refresh_turns"],
        localConfig["画像刷新轮数"],
        globalConfig["profile_refresh_turns"],
        globalConfig["画像刷新轮数"],
        defaults["profile_refresh_turns"],
      ],
      DEFAULT_PROFILE_REFRESH_TURNS,
    ),
    sessionCompactRecall: readLayeredConfigBoolean(
      [
        localConfig["session_compact_recall"],
        globalConfig["session_compact_recall"],
        defaults["session_compact_recall"],
      ],
      DEFAULT_SESSION_COMPACT_RECALL,
    ),
  }
}

/**
 * Persist one config key into either local or global VMM config.
 * 把单个配置键写入本地或全局 VMM 配置文件。
 *
 * This function is used by the TUI control center and a few runtime repair
 * flows, so it only handles direct key replacement and keeps policy decisions
 * in the caller.
 * 这个函数主要服务于 TUI 控制中心和少量运行时修复链路，
 * 因此它只负责直接替换键值，而把策略判断留给调用方处理。
 */
export async function saveVmmConfig(
  directory: string,
  scope: VmmConfigScope,
  key: VmmWritableConfigKey,
  value: VmmConfigWritableValue,
) {
  const paths = getVmmPaths(directory)
  const configPath = scope === "global" ? paths.globalConfigPath : paths.configPath
  const baseDir = scope === "global" ? paths.globalOpencodeDir : paths.opencodeDir
  const current = (await readJsonObjectIfExists(configPath)) ?? {}

  const next = {
    ...current,
    [key]: value,
  }

  await fs.mkdir(baseDir, { recursive: true })
  await fs.writeFile(configPath, JSON.stringify(next, null, 2) + "\n", "utf8")
  return configPath
}

