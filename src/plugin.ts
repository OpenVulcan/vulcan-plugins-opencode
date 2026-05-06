/**
 * Main OpenCode VMM plugin runtime.
 * OpenCode 的 VMM 插件主运行时。
 *
 * This file belongs to the extraction/orchestration layer. It owns session
 * state, turn extraction, memory injection decisions, and the handoff into
 * transport after a turn is finalized.
 * 这个文件属于提取与编排层，负责会话状态、轮次提取、记忆注入决策，
 * 以及 turn finalized 之后到传输层的交接。
 */

import fs from "fs/promises"
import {
  deliverHostToast,
  type HostToastClient,
  type HostToastVariant,
} from "./host-toast.js"
import { writeLog } from "./logger.js"
import {
  requestMemoryContext,
  submitMemorySyncCandidate,
  type MemorySyncSubmitResult,
} from "./memory-sync.js"
import {
  diagnoseVmmBusinessScope,
  getVmmPaths,
  loadVmmConfig,
  readJsonObjectIfExists,
  type VmmRuntimeConfig,
} from "./vmm-config.js"
import {
  callVmmChatCompact,
  callVmmGetProfileBundle,
  extractTransportConfig,
  type VmmGrpcChatCompactRequest,
  type VmmGrpcGetProfileBundleResponse,
  type VmmGrpcPreCheckRecallMode,
} from "./vmm-grpc.js"
import {
  getSupportedVmmLanguages,
  tVmmShared,
} from "./vmm-language.js"
import { naturalizeUserMessageParts } from "./user-message-naturalization.js"
import { derivePresentedPreCheckMemoryResult } from "./precheck-memory-status.js"
import { buildImplicitPreCheckInjectionBlock } from "./precheck-context-lines.js"
import { ensureVmmCriticalCitationRulesSystemAtTop } from "./vmm-critical-citation-rules.js"
import {
  resolveVmmNotificationRoute,
  type VmmNotificationStage,
} from "./vmm-notification-routing.js"
import { loadVmmFeatureStatus, type VmmFeatureStatus } from "./vmm-feature-status.js"
import { buildVmmLuaSkillTools } from "./vmm-luaskills-tools.js"
import { buildVmmMemoryTools } from "./vmm-memory-tools.js"
import { admitRootSession, probeRootSession } from "./root-session-probe.js"
import { clearSessionEventDedupeState } from "./session-event-dedupe.js"
import { shouldProcessSessionEventSummary } from "./session-event-summary-dedupe.js"
import { disposeSessionRuntime } from "./session-runtime-disposal.js"
import {
  deleteRootSession,
  hasRootSession,
  peekRootSession,
  rememberRootSession,
} from "./root-session-registry.js"
import {
  peekDeletedSessionBarrier,
  rememberDeletedSessionBarrier,
} from "./deleted-session-barrier.js"
import {
  createPluginRuntimeScopeAccessor,
  getPluginRuntimeScope,
  peekPluginRuntimeScope,
  releasePluginRuntimeScopeIfIdle,
  MAX_FINALIZE_TIMERS,
} from "./plugin-runtime-scope.js"
import {
  createSessionStateFileMutationQueueState,
  runSerializedSessionStateFileMutation,
} from "./session-state-file-mutation-queue.js"
import {
  createSessionRuntimeMutationQueueState,
  runSerializedSessionRuntimeMutation,
} from "./session-runtime-mutation-queue.js"
import { resolveFinalizeCompletionSignal } from "./finalize-completion-signal.js"
import { shouldCancelFinalizeOnSessionStatus } from "./finalize-session-status-policy.js"

const EVENT_TYPES_TO_LOG = new Set([
  "session.created",
  "session.deleted",
  "session.idle",
  "session.status",
  "session.error",
  "permission.asked",
  "question.asked",
  "question.replied",
  "question.rejected",
  "message.updated",
])

/**
 * Core timing and config defaults for finalize/follow-up/gRPC transport.
 * finalize、follow-up 与 gRPC 传输相关的核心默认常量。
 *
 * These values are grouped because they define how aggressive the plugin is
 * when deciding whether to wait, recover, or stop on unstable runtime input.
 * 这些值集中定义，是因为它们共同决定了插件在面对不稳定运行时输入时，
 * 应该等待多久、何时恢复、以及何时直接停止相关链路。
 */
const FINALIZE_SETTLE_DELAY_MS = 500
const SESSION_STATE_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
const FOLLOWUP_SOFT_TTL_MS = 7 * 24 * 60 * 60 * 1000
const FOLLOWUP_HARD_TTL_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Soft timeout budget for best-effort host toasts.
 * 非关键宿主提示的软超时预算。
 *
 * Web and terminal hosts can expose notification surfaces with different
 * responsiveness, so toast delivery must not block chat-message handling.
 * web 和终端宿主虽然都可能暴露通知能力，但响应特征并不完全一致，
 * 因此 toast 发送绝不能阻塞 chat.message 主链。
 */
const VMM_HOST_TOAST_SOFT_TIMEOUT_MS = 250

const SHORT_FOLLOWUP_PATTERNS = [
  /^(?:\d+|[A-Za-z])$/u,
  /^第?[一二三四五六七八九十\d]+个$/u,
  /^第?[ABCabc]$/u,
  /^(?:第一个|第二个|第三个|都行|随便|你决定|你来选|按你说的|按第一个|按第二个|继续)$/u,
]

type SessionMessageResponseItem = {
  info?: Record<string, unknown>
  parts?: unknown[]
}

type VmmClient = HostToastClient & {
  session?: {
    abort?: (options: {
      path: {
        id: string
      }
      query?: {
        directory?: string
      }
    }) => Promise<unknown>
    messages?: (options: {
      path: {
        id: string
      }
      query?: {
        directory?: string
      }
    }) => Promise<{ data?: SessionMessageResponseItem[] } | SessionMessageResponseItem[]>
    get?: (options: {
      path: {
        id: string
      }
      query?: {
        directory?: string
      }
    }) => Promise<
      | {
          data?: {
            id?: string
            parentID?: string
            time?: {
              created?: number
              updated?: number
            }
          }
        }
      | {
          id?: string
          parentID?: string
          time?: {
            created?: number
            updated?: number
          }
        }
    >
  }
}

type TextPartRecord = Record<string, unknown> & {
  type: "text"
  text?: string
  ignored?: boolean
}

type ModelTarget = {
  providerID?: string
  modelID?: string
}

type ActiveMemory = {
  id: string
  key: string
  lines: string[]
  remainingTurns: number
  createdAt: number
  sourceTurn: number
}

type StoredTurn = {
  user: string
  assistant: string
  completedAt: number
}

/**
 * Cached full-profile bundle kept in session state for implicit injection.
 * 保存在 session 状态里的完整画像 bundle 缓存，用于隐式注入。
 *
 * The profile bundle belongs to one concrete user/project pair. Keeping the
 * signature and fetched turn count together lets the plugin detect when the
 * scope changed or when the periodic refresh threshold has been crossed.
 * 画像 bundle 只属于一组确定的 user/project 绑定。
 * 把绑定签名和获取时的“成功提交轮次计数”一起持久化后，
 * 插件就能判断“绑定是否变化”以及“是否已经跨过定期刷新阈值”。
 */
type ProfileBundleState = {
  signature: string
  userId: string
  projectId: string
  bundleText: string
  traceID?: string
  fetchedAt: number
  fetchedAtSubmittedTurnCount: number
}

type AssistantState = {
  lastMessageID?: string
  lastText?: string
  lastFinish?: string
  lastCompletedAt?: number
  lastErrorName?: string
  lastErrorMessage?: string
  stableMessageID?: string
  stableText?: string
  stableFinish?: string
  stableCompletedAt?: number
}

type BackgroundState = {
  waitingLikely: boolean
  cancelIssued: boolean
  taskHints: string[]
  launchedTaskIDs: string[]
}

type TurnPhase = "collecting" | "awaiting_followup" | "sealed" | "dropped"

type FollowupReplyKind = "short_choice" | "yes_no" | "clarification"

type FollowupQuestion = {
  header: string
  question: string
  options: string[]
  multiple: boolean
}

type FollowupTimelineEvent = {
  kind: "assistant_prompt" | "user_answer"
  requestID?: string
  text: string
  recordedAt: number
}

type FollowupState = {
  status: "awaiting" | "resolved" | "expired" | "cancelled"
  askedAt: number
  lastTouchedAt: number
  expiresAt: number
  requestID?: string
  promptText?: string
  questions?: FollowupQuestion[]
  answerText?: string
  events?: FollowupTimelineEvent[]
  expectedReplyKind?: FollowupReplyKind
}

type ActiveTurnState = {
  epoch: number
  userTexts: string[]
  userMessageIDs: string[]
  createdAt: number
  updatedAt: number
  phase: TurnPhase
  commandLike: boolean
  internalContinuationSeen: boolean
  postAnswerContinuation: boolean
  assistantQuestionLike: boolean
  awaitingFollowup: boolean
  followup?: FollowupState
  permissionAsked: boolean
  questionAsked: boolean
  hardInterrupted: boolean
  errored: boolean
  aborted: boolean
  superseded: boolean
  droppedReason?: string
  assistant: AssistantState
  background: BackgroundState
}

type SessionRuntimeState = {
  turnCount: number
  submittedTurnCount: number
  currentEpoch: number
  lastTouchedAt: number
  activeMemories: ActiveMemory[]
  profileBundle?: ProfileBundleState
  initialProfileFetchPending: boolean
  recentTurns: StoredTurn[]
  sealedTurns: ActiveTurnState[]
  activeTurn?: ActiveTurnState
  lastCommittedAssistantMessageID?: string
  skipNextApiSyncReason?: string
}

/**
 * One normalized lifecycle probe used to decide whether a session is still new.
 * 判断 session 是否仍处于“首轮新会话”的归一化探针结果。
 *
 * The user explicitly asked us not to infer this only from local history, so
 * the runtime first trusts OpenCode session metadata, and then falls back to
 * the `session.created` hint we persisted from host events.
 * 用户明确要求这里不能只靠本地历史猜测，
 * 因此运行时会优先读取 OpenCode session 元数据，
 * 然后再回退到宿主事件里持久化下来的 `session.created` 提示。
 */
type SessionInitialProbe = {
  isInitial: boolean
  source: "session.get" | "event-hint" | "unknown"
  createdAt?: number
  updatedAt?: number
  parentID?: string
}

type VmmSessionStateFile = {
  sessions: Record<string, SessionRuntimeState>
}

/**
 * One structured timeline item carried into writeback.
 * 写回时携带的单条结构化时间线项。
 *
 * The backend now expects a typed timeline instead of one flattened outline
 * string, so committed turns expose the ordered user/assistant items directly.
 * 后端现在要求结构化时间线，而不是一整段扁平 outline 字符串，
 * 因此 committed turn 会直接暴露有序的 user/assistant 条目。
 */
type CommittedTimelineItem = {
  type: "user" | "assistant"
  content: string
}

type ExtractedCommittedTurn = {
  user: string
  assistant: string
  timeline: CommittedTimelineItem[]
  assistantMessageID?: string
  assistantFinish?: string
  assistantCompletedAt?: number
  extractedFromSessionMessages: boolean
}

/**
 * Process-local queue that serializes access to one directory's shared
 * persisted session-state file.
 * 进程内的目录级队列，用于串行化访问某个目录共享的持久化 session 状态文件。
 *
 * The persisted file is owned by the workspace rather than any one session, so
 * all read/modify/write cycles for the same directory must flow through the
 * same queue even when different sessions triggered them.
 * 持久化状态文件属于整个工作区，而不是某个单独 session，
 * 因此只要目录相同，不同 session 触发的读/改/写流程也必须共用同一条队列。
 */
const sessionStateMutationQueue = createSessionStateFileMutationQueueState()

/**
 * Process-local queue that preserves logical mutation order for one
 * `(directory, sessionID)` pair.
 * 进程内的按 `(directory, sessionID)` 维度保持逻辑修改顺序的队列。
 *
 * Shared file I/O only needs directory-level serialization, but the actual
 * state machine for one session must still stay strictly ordered even when its
 * mutation callback temporarily waits on host or network I/O.
 * 共享文件 I/O 只需要目录级串行化，
 * 但单个 session 的真实状态机即便中途等待宿主或网络 I/O，
 * 其状态迁移顺序也仍必须严格保持。
 */
const sessionRuntimeMutationQueue = createSessionRuntimeMutationQueueState()

/**
 * Check whether one session is currently known as a root session for one directory.
 * 检查某个 session 在指定目录下当前是否已知为 root session。
 *
 * Root-session cache is directory-scoped because multiple workspaces may live
 * inside the same process. Reading through the directory runtime scope keeps
 * those workspaces isolated while preserving hot-path TTL refresh behavior.
 * root-session 缓存必须按目录隔离，
 * 因为同一进程中可能同时存在多个工作区。
 * 通过目录作用域读取，既能保持工作区隔离，也能保留热路径上的 TTL 续期语义。
 */
function isRootSessionInDirectory(directory: string, sessionID: string | undefined) {
  const runtimeScope = peekPluginRuntimeScope(directory)
  if (!runtimeScope) return false
  return Boolean(
    sessionID &&
      !peekDeletedSessionBarrier({
        state: runtimeScope.deletedSessionBarrier,
        sessionID,
      }) &&
      peekRootSession({
        state: runtimeScope.rootSessionRegistry,
        sessionID,
      }),
  )
}

/**
 * Check whether one session is currently blocked by the deleted-session barrier.
 * 检查某个 session 当前是否正被删除会话屏障阻断。
 *
 * This guard is intentionally side-effect free so late chat/events can be
 * rejected without accidentally extending the lifetime of the tombstone.
 * 这个守卫刻意保持无副作用，
 * 这样迟到的 chat/event 在被拒绝时不会反过来延长 tombstone 的寿命。
 */
function isDeletedSessionInDirectory(directory: string, sessionID: string | undefined) {
  const runtimeScope = peekPluginRuntimeScope(directory)
  if (!runtimeScope || !sessionID) return false
  return peekDeletedSessionBarrier({
    state: runtimeScope.deletedSessionBarrier,
    sessionID,
  })
}

/**
 * Remember one confirmed root session inside one directory runtime scope.
 * 在指定目录的运行时作用域里记录一条已确认的 root session。
 *
 * Compact and root-probe flows may confirm a root session before later chat
 * traffic arrives. Persisting that verdict per directory avoids redundant host
 * lookups without leaking the result into other workspaces.
 * compact 与 root-probe 链路可能会在后续聊天流量到达前先确认 root session。
 * 按目录持久化这个结论，既能避免重复宿主查询，也不会把结果泄露到其他工作区。
 */
function registerRootSessionInDirectory(directory: string, sessionID: string | undefined) {
  if (!sessionID) return
  const runtimeScope = getPluginRuntimeScope(directory)
  if (
    peekDeletedSessionBarrier({
      state: runtimeScope.deletedSessionBarrier,
      sessionID,
    })
  ) {
    return
  }
  rememberRootSession({
    state: runtimeScope.rootSessionRegistry,
    sessionID,
  })
}

/**
 * Remember that one session has been explicitly deleted in this directory.
 * 在指定目录里记录某个 session 已被显式删除。
 *
 * The tombstone blocks late root admission and stale detached savebacks until
 * the short deleted-session barrier window naturally expires.
 * 这条 tombstone 会在短暂的删除屏障窗口内阻断迟到的 root 准入与陈旧 detached 写回，
 * 直到它自然过期。
 */
function registerDeletedSessionInDirectory(directory: string, sessionID: string | undefined) {
  if (!sessionID) return
  const runtimeScope = getPluginRuntimeScope(directory)
  rememberDeletedSessionBarrier({
    state: runtimeScope.deletedSessionBarrier,
    sessionID,
  })
}

function getSessionID(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined
  const record = input as Record<string, unknown>
  const sessionID = record["sessionID"]
  return typeof sessionID === "string" ? sessionID : undefined
}

function getMessageID(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined
  const record = input as Record<string, unknown>
  const messageID = record["messageID"]
  return typeof messageID === "string" ? messageID : undefined
}

function getModelTarget(input: unknown): ModelTarget | undefined {
  if (!input || typeof input !== "object") return undefined
  const record = input as Record<string, unknown>
  const model = record["model"]
  if (!model || typeof model !== "object") return undefined
  const modelRecord = model as Record<string, unknown>
  const providerID = modelRecord["providerID"]
  const modelID = modelRecord["modelID"] ?? modelRecord["id"]
  return {
    providerID: typeof providerID === "string" ? providerID : undefined,
    modelID: typeof modelID === "string" ? modelID : undefined,
  }
}

function getSessionIDFromEvent(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined
  const eventRecord = event as { type?: string; properties?: Record<string, unknown> }
  const props = eventRecord.properties
  if (!props || typeof props !== "object") return undefined

  const direct = props["sessionID"]
  if (typeof direct === "string") return direct

  const info = props["info"]
  if (info && typeof info === "object") {
    const infoRecord = info as Record<string, unknown>
    const nested = infoRecord["sessionID"] ?? infoRecord["id"]
    if (typeof nested === "string") return nested
  }

  return undefined
}

function extractTextParts(parts: unknown): string[] {
  if (!Array.isArray(parts)) return []
  return parts
    .filter((part) => part && typeof part === "object")
    .map((part) => {
      const record = part as Record<string, unknown>
      if (record["type"] !== "text") return undefined
      return typeof record["text"] === "string" ? record["text"] : undefined
    })
    .filter((text): text is string => Boolean(text))
}

function normalizeText(value: string | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim()
}

function isInternalContinuation(text: string) {
  const trimmed = normalizeText(text)
  if (!trimmed) return false
  return (
    trimmed.startsWith("[SYSTEM DIRECTIVE:") ||
    trimmed.startsWith("<system-reminder>") ||
    trimmed.includes("[ALL BACKGROUND TASKS COMPLETE]")
  )
}

function looksLikeShortFollowup(text: string) {
  const trimmed = normalizeText(text)
  if (!trimmed || trimmed.length > 24) return false
  return SHORT_FOLLOWUP_PATTERNS.some((pattern) => pattern.test(trimmed))
}

function isAbortLikeErrorName(name: string | undefined) {
  return name === "MessageAbortedError" || name === "AbortError"
}

function isSuccessfulAssistantFinish(finish: string | undefined) {
  return Boolean(finish && finish !== "tool-calls" && finish !== "unknown")
}

function rewriteUserTextParts(
  parts: unknown,
  memoryLines: string[],
  language: VmmRuntimeConfig["language"],
) {
  if (!Array.isArray(parts)) return false

  const textParts = parts.filter(
    (part): part is TextPartRecord =>
      Boolean(part) &&
      typeof part === "object" &&
      (part as Record<string, unknown>)["type"] === "text",
  )
  if (!textParts.length) return false

  const originalText = textParts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("\n")
    .trim()

  if (!originalText || isInternalContinuation(originalText)) return false

  const prefix = getVisibleMemoryPrefix(language)
  /**
   * Render one memory item into a quoted multi-line bullet block.
   * 把单条记忆项渲染成带引用前缀的多行项目块。
   *
   * Structured PreCheck items can contain multi-line summaries. Continuation
   * lines need the same visible quote prefix, otherwise the rewritten user
   * prompt breaks into malformed paragraphs.
   * 结构化 PreCheck 项可能天然带多行摘要，
   * 因此续行也必须带上同样的可见引用前缀，否则改写后的用户提示会断裂成畸形段落。
   */
  const renderVisibleMemoryItem = (memoryLine: string) => {
    const segments = normalizeText(memoryLine)
      .split("\n")
      .map((segment) => segment.trim())
      .filter((segment) => segment.length > 0)
    if (segments.length === 0) return ""
    return segments
      .map((segment, index) => (index === 0 ? `> - ${segment}` : `>   ${segment}`))
      .join("\n")
  }
  const visibleBlock = [
    prefix.start,
    ...memoryLines.map((line) => renderVisibleMemoryItem(line)).filter((line) => line.length > 0),
    prefix.end,
    "",
    originalText,
  ].join("\n")

  textParts[0].text = visibleBlock
  for (let index = 1; index < textParts.length; index += 1) {
    textParts[index].ignored = true
    textParts[index].text = ""
  }

  return true
}

function renderImplicitMemorySystem(
  memoryLines: string[],
  language: VmmRuntimeConfig["language"],
) {
  return buildImplicitPreCheckInjectionBlock(memoryLines, language)
}

/**
 * Render the visible-memory wrapper shown in rewritten user prompts.
 * 改写后的用户提示里使用的显式记忆包裹文本。
 *
 * Visible injection is part of the user's visible prompt surface, so this
 * wrapper follows the configured VMM language rather than staying hard-coded.
 * 显式注入属于用户可见提示的一部分，
 * 因此这层包裹文案也要跟随当前配置语言切换，而不是继续写死。
 */
function getVisibleMemoryPrefix(language: VmmRuntimeConfig["language"]) {
  return {
    start: [
      tVmmShared(language, "visible_memory_title"),
      tVmmShared(language, "visible_memory_intro"),
    ].join("\n"),
    end: tVmmShared(language, "visible_memory_current_input"),
  }
}

function injectIntoUserMessageSystem(
  output: unknown,
  memoryLines: string[],
  language: VmmRuntimeConfig["language"],
) {
  return appendToUserMessageSystem(output, renderImplicitMemorySystem(memoryLines, language), language)
}

/**
 * Ensure the fixed VMM citation policy stays pinned to the top of one user message system prompt.
 * 保证固定 VMM 引用策略始终钉在一条用户消息 system prompt 的最顶部。
 *
 * This guard runs before every later system append so profile bundles,
 * implicit memory, and warning notices all stay below the fixed rules
 * instead of racing to become the first injected block.
 * 这个护栏会在后续每次 system 追加前先运行，
 * 让画像 bundle、隐式记忆和 warning notice 都稳定落在固定规则块之后，
 * 而不是彼此竞争“第一个注入块”的位置。
 */
function ensureCriticalCitationRulesSystem(
  output: unknown,
  language: VmmRuntimeConfig["language"],
) {
  if (!output || typeof output !== "object") return false
  const outputRecord = output as Record<string, unknown>
  const message = outputRecord["message"]
  if (!message || typeof message !== "object") return false

  const messageRecord = message as Record<string, unknown>
  const existing = typeof messageRecord["system"] === "string" ? messageRecord["system"] : undefined
  messageRecord["system"] = ensureVmmCriticalCitationRulesSystemAtTop(existing, language)
  return true
}

function appendToUserMessageSystem(
  output: unknown,
  systemText: string,
  language: VmmRuntimeConfig["language"],
) {
  if (!output || typeof output !== "object") return false
  const outputRecord = output as Record<string, unknown>
  const message = outputRecord["message"]
  if (!message || typeof message !== "object") return false

  const messageRecord = message as Record<string, unknown>
  ensureCriticalCitationRulesSystem(output, language)
  const existing = typeof messageRecord["system"] === "string" ? messageRecord["system"] : ""
  messageRecord["system"] = existing ? `${existing}\n\n${systemText}` : systemText
  return true
}

/**
 * Check whether one memory result reason means the business scope is invalid.
 * 判断一条记忆结果原因是否表示业务作用域已经失效。
 *
 * Retrieval may be the first place where the backend notices a manually edited
 * config points at a non-existent binding, so finalize should be skipped too.
 * 检索阶段可能是后端首次发现“用户手改配置后绑定已失效”的地方，
 * 因此这里要把后续 finalize 也一起停掉。
 */
function isVmmBusinessScopeRuntimeErrorReason(reason: string | undefined) {
  const normalizedReason = normalizeText(reason)
  return normalizedReason.startsWith("invalid-business-scope")
}

/**
 * Build one stable signature for the currently bound profile scope.
 * 为当前绑定的画像作用域构建一条稳定签名。
 *
 * The profile bundle is keyed by `user_id + project_id`, so this signature is
 * the single comparison key used by both pre-answer injection and post-submit
 * refresh checks.
 * 画像 bundle 的唯一键就是 `user_id + project_id` 组合，
 * 因此回答前注入和提交后刷新都会共用这一条签名做比较。
 */
function buildProfileBundleSignature(userId: string, projectId: string) {
  return `${normalizeText(userId)}::${normalizeText(projectId)}`
}

/**
 * Convert one bundle RPC response into the text used for hidden prompt injection.
 * 把一条 bundle RPC 响应转换成真正用于隐式注入的文本。
 *
 * The plugin only uses FULL mode today, so the hidden injection text is read
 * directly from the backend-owned `combined_text`.
 * 插件当前只会走 FULL 模式，
 * 因此隐式注入文本会直接读取后端权威提供的 `combined_text`。
 */
function extractProfileBundleText(response: VmmGrpcGetProfileBundleResponse | undefined) {
  return normalizeText(response?.combined_text)
}

/**
 * Render the hidden profile-bundle system block appended before model answer.
 * 渲染回答前追加到 system 上下文里的隐藏画像 bundle 区块。
 *
 * Profile context should stay implicit and durable across turns, so this block
 * is always injected through system text rather than visible user prompt text.
 * 画像上下文应该保持隐式且跨轮持久，
 * 因此这里始终通过 system 文本注入，而不会改写成用户可见 prompt。
 */
function renderImplicitProfileBundleSystem(bundleText: string) {
  return [
    "## Persistent Profile Bundle",
    "The following profile bundle is the latest persisted background context for the current user and project scope.",
    "Sections may appear as [TEAM], [SPACE], [PROJECT], and [USER].",
    "Treat it as hidden durable background context, and let explicit user instructions in the current turn override it when they conflict.",
    "",
    bundleText,
  ].join("\n")
}

/**
 * Normalize one persisted profile-bundle cache entry from session state.
 * 把 session 状态里持久化的单条画像 bundle 缓存归一化。
 *
 * Session state may survive plugin upgrades, so this helper keeps malformed or
 * half-written historical values from leaking into prompt injection.
 * session 状态会跨插件升级保留，
 * 因此这里要拦住格式损坏或半写入的历史值，避免它们污染 prompt 注入。
 */
function normalizeProfileBundleState(
  raw: Partial<ProfileBundleState> | undefined,
): ProfileBundleState | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const signature = normalizeText(typeof raw.signature === "string" ? raw.signature : undefined)
  const userId = normalizeText(typeof raw.userId === "string" ? raw.userId : undefined)
  const projectId = normalizeText(typeof raw.projectId === "string" ? raw.projectId : undefined)
  const bundleText = typeof raw.bundleText === "string" ? raw.bundleText.trim() : ""
  if (!signature || !userId || !projectId) return undefined
  return {
    signature,
    userId,
    projectId,
    bundleText,
    traceID: typeof raw.traceID === "string" ? raw.traceID : undefined,
    fetchedAt: typeof raw.fetchedAt === "number" ? raw.fetchedAt : Date.now(),
    // Keep old persisted state readable while the runtime migrates from
    // open-turn counting to accepted-turn counting.
    // 在运行时从“开启轮次计数”迁移到“成功提交轮次计数”期间，
    // 这里继续兼容旧状态文件里已经写下去的字段。
    fetchedAtSubmittedTurnCount:
      typeof raw.fetchedAtSubmittedTurnCount === "number" &&
      Number.isFinite(raw.fetchedAtSubmittedTurnCount)
        ? Math.max(0, Math.floor(raw.fetchedAtSubmittedTurnCount))
        : typeof (raw as Record<string, unknown>).fetchedAtTurnCount === "number" &&
            Number.isFinite((raw as Record<string, unknown>).fetchedAtTurnCount)
          ? Math.max(0, Math.floor((raw as Record<string, unknown>).fetchedAtTurnCount as number))
          : 0,
  }
}

/**
 * Read one OpenCode session object from the SDK response envelope.
 * 从 SDK 响应包里提取一条 OpenCode session 对象。
 *
 * Different SDK calls may return either `{ data }` envelopes or the plain
 * payload directly, so this helper keeps the plugin-side parsing stable.
 * SDK 在不同链路下可能返回 `{ data }` 包装结构，也可能直接返回实体，
 * 因此这里统一做一次提取，避免插件侧重复解析。
 */
function extractSessionEnvelopeData(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined
  const record = raw as Record<string, unknown>
  const candidate =
    record["data"] && typeof record["data"] === "object"
      ? (record["data"] as Record<string, unknown>)
      : record
  return candidate
}

/**
 * Probe whether the current session is still a brand-new root session.
 * 探测当前 session 是否仍然处于“刚创建的根会话”状态。
 *
 * The user explicitly asked us not to infer this only from local message
 * history, so we first consult the OpenCode session API and only then fall
 * back to the persisted `session.created` event hint.
 * 用户明确要求这里不能只靠本地消息历史猜测，
 * 因此这里会先查询 OpenCode 的 session 元数据，
 * 只有在宿主接口不可用时才回退到持久化的 `session.created` 提示。
 */
async function probeInitialSessionState(args: {
  client: VmmClient
  directory: string
  sessionID: string
}): Promise<SessionInitialProbe> {
  if (typeof args.client.session?.get === "function") {
    try {
      const raw = await args.client.session.get({
        path: { id: args.sessionID },
        query: { directory: args.directory },
      })
      const session = extractSessionEnvelopeData(raw)
      const parentID = typeof session?.["parentID"] === "string" ? session["parentID"] : undefined
      const timeRecord =
        session?.["time"] && typeof session["time"] === "object"
          ? (session["time"] as Record<string, unknown>)
          : undefined
      const createdAt =
        typeof timeRecord?.["created"] === "number" ? timeRecord["created"] : undefined
      const updatedAt =
        typeof timeRecord?.["updated"] === "number" ? timeRecord["updated"] : undefined
      return {
        isInitial: !parentID && typeof createdAt === "number" && createdAt === updatedAt,
        source: "session.get",
        createdAt,
        updatedAt,
        parentID,
      }
    } catch {
      // Fall through to the event-backed hint below when the host session API
      // is unavailable in the current runtime shape.
      // 如果当前宿主运行时里拿不到 session API，
      // 就回退到下面基于事件持久化的提示，不在这里中断主链。
    }
  }

  const { result } = await withSerializedSessionState(
    args.directory,
    args.sessionID,
    (runtimeState) => runtimeState.initialProfileFetchPending,
  )
  return {
    isInitial: result,
    source: result ? "event-hint" : "unknown",
  }
}

/**
 * Snapshot the profile-bundle state used by one session before pre-answer work.
 * 在回答前逻辑启动前，读取当前 session 的画像 bundle 快照。
 *
 * We snapshot first and fetch later so gRPC latency does not block the state
 * file lock for longer than necessary.
 * 这里先读快照、再决定是否发起 gRPC，
 * 是为了避免把 session 状态文件锁长时间占在网络请求上。
 */
async function readProfileBundleSnapshot(directory: string, sessionID: string) {
  const { result } = await withSerializedSessionState(
    directory,
    sessionID,
    (runtimeState) => ({
      profileBundle: runtimeState.profileBundle,
      initialProfileFetchPending: runtimeState.initialProfileFetchPending,
      turnCount: runtimeState.turnCount,
    }),
  )
  return result
}

/**
 * Fetch the current FULL profile bundle for one concrete user/project pair.
 * 针对一组具体的 user/project 绑定读取当前 FULL 画像 bundle。
 *
 * The plugin always uses FULL mode here because the runtime needs the final
 * assembled hidden prompt block, not the split inspection-oriented fields.
 * 插件在运行时这里固定使用 FULL 模式，
 * 因为它真正需要的是最终隐式注入用的组合提示词，而不是拆分检查字段。
 *
 * `include_explanation` is intentionally enabled because the backend now folds
 * the explanation and scope legend directly into the FULL `combined_text`.
 * 这里会显式打开 `include_explanation`，
 * 因为后端现在会把解释文本和 scope 图例直接折叠进 FULL `combined_text`。
 */
async function fetchFullProfileBundle(args: {
  runtimeConfig: Pick<
    VmmRuntimeConfig,
    | "grpcTarget"
    | "vulcanHostTarget"
    | "grpcApiKey"
    | "grpcHandshakeTimeoutMs"
    | "grpcReceiveTimeoutMs"
    | "grpcKeepaliveTimeMs"
    | "grpcKeepaliveTimeoutMs"
    | "grpcKeepalivePermitWithoutCalls"
    | "userId"
    | "projectId"
  >
}) {
  return callVmmGetProfileBundle({
    request: {
      user_id: args.runtimeConfig.userId,
      project_id: args.runtimeConfig.projectId,
      mode: "PROFILE_BUNDLE_MODE_FULL",
      include_explanation: true,
    },
    config: extractTransportConfig(args.runtimeConfig),
  })
}

/**
 * Prepare one profile-bundle warmup decision before a new chat request.
 * 在一次新聊天请求前准备画像 bundle 的预热决策。
 *
 * The return value tells the orchestrator whether it should inject the cached
 * bundle immediately, fetch a fresh one first, or clear a stale bundle whose
 * binding signature no longer matches the current config.
 * 返回结果会告诉编排层：当前应该直接注入缓存 bundle，
 * 还是先拉一份新的，或者先清掉签名已经和当前配置不匹配的旧 bundle。
 */
async function prepareProfileBundleWarmup(args: {
  client: VmmClient
  directory: string
  sessionID: string
  runtimeConfig: VmmRuntimeConfig
}) {
  const initialProbe = await probeInitialSessionState({
    client: args.client,
    directory: args.directory,
    sessionID: args.sessionID,
  })
  const snapshot = await readProfileBundleSnapshot(args.directory, args.sessionID)
  const signature = buildProfileBundleSignature(args.runtimeConfig.userId, args.runtimeConfig.projectId)
  const existingBundle = snapshot.profileBundle
  const signatureChanged = Boolean(existingBundle && existingBundle.signature !== signature)
  const missingBundle = !existingBundle
  const needsInitialSessionFetch = initialProbe.isInitial || snapshot.initialProfileFetchPending
  const shouldFetch = missingBundle || signatureChanged || needsInitialSessionFetch

  if (!shouldFetch) {
    return {
      initialProbe,
      signature,
      missingBundle,
      signatureChanged,
      needsInitialSessionFetch,
      fetchResult: undefined,
      fetchedBundleText: undefined,
    }
  }

  const fetchResult = await fetchFullProfileBundle({
    runtimeConfig: args.runtimeConfig,
  })
  return {
    initialProbe,
    signature,
    missingBundle,
    signatureChanged,
    needsInitialSessionFetch,
    fetchResult,
    fetchedBundleText: fetchResult.ok ? extractProfileBundleText(fetchResult.response) : undefined,
  }
}

/**
 * Persist one warmup result and expose the effective injected bundle text.
 * 持久化一次 warmup 结果，并返回最终用于注入的 bundle 文本。
 *
 * This second phase runs under the serialized session-state lock so the cached
 * bundle and the `initialProfileFetchPending` flag stay consistent with the
 * exact request that is about to be sent.
 * 第二阶段会在串行 session 状态锁里执行，
 * 这样缓存 bundle 和 `initialProfileFetchPending` 标记就能和当前即将发送的请求严格对齐。
 */
async function applyProfileBundleWarmup(args: {
  directory: string
  sessionID: string
  runtimeConfig: VmmRuntimeConfig
  warmup: Awaited<ReturnType<typeof prepareProfileBundleWarmup>>
}) {
  const { result } = await withSerializedSessionState(
    args.directory,
    args.sessionID,
    (runtimeState) => {
      runtimeState.lastTouchedAt = Date.now()

      if (args.warmup.fetchResult) {
        if (args.warmup.fetchResult.ok) {
          runtimeState.profileBundle = {
            signature: args.warmup.signature,
            userId: args.runtimeConfig.userId,
            projectId: args.runtimeConfig.projectId,
            bundleText: args.warmup.fetchedBundleText ?? "",
            traceID: args.warmup.fetchResult.response?.trace_id,
            fetchedAt: Date.now(),
            fetchedAtSubmittedTurnCount: runtimeState.submittedTurnCount,
          }
          runtimeState.initialProfileFetchPending = false
        } else if (args.warmup.signatureChanged || args.warmup.missingBundle) {
          runtimeState.profileBundle = undefined
        }
      }

      const activeBundle =
        runtimeState.profileBundle?.signature === args.warmup.signature
          ? runtimeState.profileBundle
          : undefined

      return {
        injectedBundleText: activeBundle?.bundleText || undefined,
        fetched: Boolean(args.warmup.fetchResult),
        fetchOk: args.warmup.fetchResult?.ok ?? false,
        fetchReason:
          args.warmup.signatureChanged
            ? "scope-changed"
            : args.warmup.needsInitialSessionFetch
              ? "initial-session"
              : args.warmup.missingBundle
                ? "missing-cache"
                : "cache-reuse",
        fetchErrorDetails: args.warmup.fetchResult?.details,
        traceID:
          activeBundle?.traceID ?? args.warmup.fetchResult?.response?.trace_id ?? undefined,
        initialProbeSource: args.warmup.initialProbe.source,
        initialProbeCreatedAt: args.warmup.initialProbe.createdAt,
        initialProbeUpdatedAt: args.warmup.initialProbe.updatedAt,
      }
    },
  )

  return result
}

/**
 * Refresh the cached profile bundle after one turn has been accepted by VMM.
 * 在一条 turn 被 VMM 成功接收之后刷新缓存中的画像 bundle。
 *
 * Periodic refresh runs after writeback instead of before answering so the
 * bundle can observe the newest committed turn while still keeping request-time
 * latency out of the user-visible path.
 * 周期刷新被刻意放在写回成功之后，而不是回答前，
 * 这样 bundle 才能看到最新提交的 turn，同时又不会把额外延迟压到用户可见请求路径上。
 */
async function maybeRefreshProfileBundleAfterWriteback(args: {
  directory: string
  sessionID: string
  runtimeConfig: VmmRuntimeConfig
}) {
  const { result } = await withSerializedSessionState(
    args.directory,
    args.sessionID,
    (runtimeState) => {
      runtimeState.lastTouchedAt = Date.now()
      runtimeState.submittedTurnCount += 1
      const currentSignature = buildProfileBundleSignature(
        args.runtimeConfig.userId,
        args.runtimeConfig.projectId,
      )
      const currentBundle = runtimeState.profileBundle
      const signatureChanged = currentBundle?.signature !== currentSignature
      const refreshTurns = Math.max(0, args.runtimeConfig.profileRefreshTurns)
      const turnsSinceFetch = currentBundle
        ? Math.max(
            0,
            runtimeState.submittedTurnCount - currentBundle.fetchedAtSubmittedTurnCount,
          )
        : 0
      const shouldRefresh =
        !currentBundle ||
        signatureChanged ||
        (refreshTurns > 0 && turnsSinceFetch >= refreshTurns)

      return {
        shouldRefresh,
        signatureChanged,
        reason: !currentBundle
          ? "missing-cache"
          : signatureChanged
            ? "scope-changed"
            : "refresh-threshold",
        submittedTurnCount: runtimeState.submittedTurnCount,
      }
    },
  )

  if (!result.shouldRefresh) return { refreshed: false, reason: "not-needed" as const }

  const bundleResult = await fetchFullProfileBundle({
    runtimeConfig: args.runtimeConfig,
  })
  const refreshedBundleText = bundleResult.ok ? extractProfileBundleText(bundleResult.response) : ""
  const currentSignature = buildProfileBundleSignature(
    args.runtimeConfig.userId,
    args.runtimeConfig.projectId,
  )

  await withSerializedSessionState(args.directory, args.sessionID, (runtimeState) => {
    runtimeState.lastTouchedAt = Date.now()
    if (bundleResult.ok) {
      runtimeState.profileBundle = {
        signature: currentSignature,
        userId: args.runtimeConfig.userId,
        projectId: args.runtimeConfig.projectId,
        bundleText: refreshedBundleText,
        traceID: bundleResult.response?.trace_id,
        fetchedAt: Date.now(),
        fetchedAtSubmittedTurnCount: runtimeState.submittedTurnCount,
      }
      runtimeState.initialProfileFetchPending = false
      return
    }

    if (result.signatureChanged) {
      runtimeState.profileBundle = undefined
    }
  })

  return {
    refreshed: bundleResult.ok,
    reason: result.reason,
    ok: bundleResult.ok,
    details: bundleResult.details,
    traceID: bundleResult.response?.trace_id,
  }
}

/**
 * Resolve all project/global/default file paths used by VMM.
 * 解析 VMM 运行时涉及的项目、本地、全局和模板路径。
 *
 * This path bundle is the foundation for config layering, session persistence,
 * template bootstrap, and legacy global-config migration.
 * 这组路径是配置分层、session 持久化、模板引导和旧全局配置迁移的共同基础。
 */
function normalizeAssistantState(raw: Partial<AssistantState> | undefined): AssistantState {
  return {
    lastMessageID: typeof raw?.lastMessageID === "string" ? raw.lastMessageID : undefined,
    lastText: typeof raw?.lastText === "string" ? raw.lastText : undefined,
    lastFinish: typeof raw?.lastFinish === "string" ? raw.lastFinish : undefined,
    lastCompletedAt: typeof raw?.lastCompletedAt === "number" ? raw.lastCompletedAt : undefined,
    lastErrorName: typeof raw?.lastErrorName === "string" ? raw.lastErrorName : undefined,
    lastErrorMessage: typeof raw?.lastErrorMessage === "string" ? raw.lastErrorMessage : undefined,
    stableMessageID: typeof raw?.stableMessageID === "string" ? raw.stableMessageID : undefined,
    stableText: typeof raw?.stableText === "string" ? raw.stableText : undefined,
    stableFinish: typeof raw?.stableFinish === "string" ? raw.stableFinish : undefined,
    stableCompletedAt: typeof raw?.stableCompletedAt === "number" ? raw.stableCompletedAt : undefined,
  }
}

function normalizeBackgroundState(raw: Partial<BackgroundState> | undefined): BackgroundState {
  return {
    waitingLikely: Boolean(raw?.waitingLikely),
    cancelIssued: Boolean(raw?.cancelIssued),
    taskHints: Array.isArray(raw?.taskHints)
      ? raw.taskHints.filter((item): item is string => typeof item === "string").slice(-8)
      : [],
    launchedTaskIDs: Array.isArray(raw?.launchedTaskIDs)
      ? raw.launchedTaskIDs.filter((item): item is string => typeof item === "string").slice(-12)
      : [],
  }
}

function normalizeFollowupQuestion(raw: Partial<FollowupQuestion> | undefined): FollowupQuestion | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const question = typeof raw.question === "string" ? raw.question : ""
  if (!question) return undefined
  return {
    header: typeof raw.header === "string" ? raw.header : "",
    question,
    options: Array.isArray(raw.options)
      ? raw.options.filter((item): item is string => typeof item === "string")
      : [],
    multiple: Boolean(raw.multiple),
  }
}

function normalizeFollowupTimelineEvent(
  raw: Partial<FollowupTimelineEvent> | undefined,
): FollowupTimelineEvent | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const text = normalizeText(typeof raw.text === "string" ? raw.text : undefined)
  if (!text) return undefined
  const kind =
    raw.kind === "assistant_prompt" || raw.kind === "user_answer" ? raw.kind : undefined
  if (!kind) return undefined
  return {
    kind,
    requestID: typeof raw.requestID === "string" ? raw.requestID : undefined,
    text,
    recordedAt: typeof raw.recordedAt === "number" ? raw.recordedAt : Date.now(),
  }
}

function extractFollowupQuestions(raw: unknown) {
  if (!Array.isArray(raw)) return undefined

  const questions = raw
    .map((item) => {
      if (!item || typeof item !== "object") return undefined
      const record = item as Record<string, unknown>
      const question = normalizeText(typeof record["question"] === "string" ? record["question"] : undefined)
      if (!question) return undefined
      const header = normalizeText(typeof record["header"] === "string" ? record["header"] : undefined)
      const options = Array.isArray(record["options"])
        ? record["options"]
            .map((option) => {
              if (!option || typeof option !== "object") return ""
              const optionRecord = option as Record<string, unknown>
              return normalizeText(typeof optionRecord["label"] === "string" ? optionRecord["label"] : undefined)
            })
            .filter(Boolean)
        : []
      const multiple = Boolean(record["multiple"])
      return normalizeFollowupQuestion({
        header,
        question,
        options,
        multiple,
      })
    })
    .filter((question): question is FollowupQuestion => Boolean(question))

  return questions.length ? questions : undefined
}

function extractQuestionAnswers(raw: unknown) {
  if (!Array.isArray(raw)) return undefined

  const answers = raw
    .map((group) => {
      if (!Array.isArray(group)) return []
      return group.map((item) => normalizeText(typeof item === "string" ? item : undefined)).filter(Boolean)
    })
    .filter((group) => group.length > 0)

  return answers.length ? answers : undefined
}

function normalizeFollowupState(raw: Partial<FollowupState> | undefined): FollowupState | undefined {
  if (!raw || typeof raw !== "object") return undefined
  const askedAt = typeof raw.askedAt === "number" ? raw.askedAt : Date.now()
  const lastTouchedAt = typeof raw.lastTouchedAt === "number" ? raw.lastTouchedAt : askedAt
  const expiresAt =
    typeof raw.expiresAt === "number" ? raw.expiresAt : askedAt + FOLLOWUP_SOFT_TTL_MS

  return {
    status:
      raw.status === "awaiting" ||
      raw.status === "resolved" ||
      raw.status === "expired" ||
      raw.status === "cancelled"
        ? raw.status
        : "awaiting",
    askedAt,
    lastTouchedAt,
    expiresAt,
    requestID: typeof raw.requestID === "string" ? raw.requestID : undefined,
    promptText: typeof raw.promptText === "string" ? raw.promptText : undefined,
    questions: Array.isArray(raw.questions)
      ? raw.questions
          .map((question) => normalizeFollowupQuestion(question))
          .filter((question): question is FollowupQuestion => Boolean(question))
      : undefined,
    answerText: typeof raw.answerText === "string" ? raw.answerText : undefined,
    events: Array.isArray(raw.events)
      ? raw.events
          .map((event) => normalizeFollowupTimelineEvent(event))
          .filter((event): event is FollowupTimelineEvent => Boolean(event))
          .slice(-12)
      : undefined,
    expectedReplyKind:
      raw.expectedReplyKind === "short_choice" ||
      raw.expectedReplyKind === "yes_no" ||
      raw.expectedReplyKind === "clarification"
        ? raw.expectedReplyKind
        : undefined,
  }
}

function normalizeActiveTurn(raw: Partial<ActiveTurnState> | undefined): ActiveTurnState | undefined {
  if (!raw || typeof raw !== "object") return undefined
  return {
    epoch: typeof raw.epoch === "number" ? raw.epoch : 0,
    userTexts: Array.isArray(raw.userTexts)
      ? raw.userTexts.filter((item): item is string => typeof item === "string")
      : [],
    userMessageIDs: Array.isArray(raw.userMessageIDs)
      ? raw.userMessageIDs.filter((item): item is string => typeof item === "string")
      : [],
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === "number" ? raw.updatedAt : Date.now(),
    phase:
      raw.phase === "collecting" ||
      raw.phase === "awaiting_followup" ||
      raw.phase === "sealed" ||
      raw.phase === "dropped"
        ? raw.phase
        : Boolean(raw.awaitingFollowup)
          ? "awaiting_followup"
          : "collecting",
    commandLike: Boolean(raw.commandLike),
    internalContinuationSeen: Boolean(raw.internalContinuationSeen),
    postAnswerContinuation: Boolean(raw.postAnswerContinuation),
    assistantQuestionLike: Boolean(raw.assistantQuestionLike),
    awaitingFollowup: Boolean(raw.awaitingFollowup),
    followup: normalizeFollowupState(raw.followup),
    permissionAsked: Boolean(raw.permissionAsked),
    questionAsked: Boolean(raw.questionAsked),
    hardInterrupted: Boolean(raw.hardInterrupted),
    errored: Boolean(raw.errored),
    aborted: Boolean(raw.aborted),
    superseded: Boolean(raw.superseded),
    droppedReason: typeof raw.droppedReason === "string" ? raw.droppedReason : undefined,
    assistant: normalizeAssistantState(raw.assistant),
    background: normalizeBackgroundState(raw.background),
  }
}

function normalizeSessionRuntimeState(raw: Partial<SessionRuntimeState> | undefined): SessionRuntimeState {
  const turnCount = typeof raw?.turnCount === "number" ? raw.turnCount : 0
  const submittedTurnCount =
    typeof raw?.submittedTurnCount === "number" && Number.isFinite(raw.submittedTurnCount)
      ? Math.max(0, Math.floor(raw.submittedTurnCount))
      : 0
  const currentEpoch =
    typeof raw?.currentEpoch === "number" ? raw.currentEpoch : turnCount

  return {
    turnCount,
    submittedTurnCount,
    currentEpoch,
    lastTouchedAt: typeof raw?.lastTouchedAt === "number" ? raw.lastTouchedAt : Date.now(),
    activeMemories: Array.isArray(raw?.activeMemories)
      ? raw.activeMemories.filter(Boolean).map((memory) => ({
          id: typeof memory?.id === "string" ? memory.id : `mem-${Date.now()}`,
          key: typeof memory?.key === "string" ? memory.key : "memory",
          lines: Array.isArray(memory?.lines)
            ? memory.lines.filter((line): line is string => typeof line === "string")
            : [],
          remainingTurns:
            typeof memory?.remainingTurns === "number" && Number.isFinite(memory.remainingTurns)
              ? Math.max(0, Math.floor(memory.remainingTurns))
              : 0,
          createdAt:
            typeof memory?.createdAt === "number" ? memory.createdAt : Date.now(),
          sourceTurn:
            typeof memory?.sourceTurn === "number" ? memory.sourceTurn : 0,
        }))
      : [],
    profileBundle: normalizeProfileBundleState(raw?.profileBundle),
    initialProfileFetchPending: Boolean(raw?.initialProfileFetchPending),
    recentTurns: Array.isArray(raw?.recentTurns)
      ? raw.recentTurns
          .filter(Boolean)
          .map((turn) => ({
            user: typeof turn?.user === "string" ? turn.user : "",
            assistant: typeof turn?.assistant === "string" ? turn.assistant : "",
            completedAt:
              typeof turn?.completedAt === "number" ? turn.completedAt : Date.now(),
          }))
          .filter((turn) => turn.user || turn.assistant)
      : [],
    sealedTurns: Array.isArray(raw?.sealedTurns)
      ? raw.sealedTurns
          .map((turn) => normalizeActiveTurn(turn))
          .filter((turn): turn is ActiveTurnState => Boolean(turn))
      : [],
    activeTurn: normalizeActiveTurn(raw?.activeTurn),
    lastCommittedAssistantMessageID:
      typeof raw?.lastCommittedAssistantMessageID === "string"
        ? raw.lastCommittedAssistantMessageID
        : undefined,
    skipNextApiSyncReason:
      typeof raw?.skipNextApiSyncReason === "string" ? raw.skipNextApiSyncReason : undefined,
  }
}

function pruneSessionState(state: VmmSessionStateFile) {
  const now = Date.now()
  for (const [sessionID, rawState] of Object.entries(state.sessions)) {
    const normalized = normalizeSessionRuntimeState(rawState)
    normalized.recentTurns = normalized.recentTurns.slice(-5)
    normalized.activeMemories = normalized.activeMemories.filter((memory) => memory.remainingTurns > 0)
    normalized.sealedTurns = normalized.sealedTurns
      .filter((turn) => {
        const followup = turn.followup
        if (!followup) return true
        return now - followup.lastTouchedAt <= FOLLOWUP_HARD_TTL_MS
      })
      .slice(-8)

    if (
      normalized.activeTurn?.awaitingFollowup &&
      normalized.activeTurn.followup &&
      now - normalized.activeTurn.followup.lastTouchedAt > FOLLOWUP_HARD_TTL_MS
    ) {
      normalized.activeTurn = undefined
    }

    if (
      !normalized.activeMemories.length &&
      !normalized.sealedTurns.length &&
      !normalized.activeTurn &&
      now - normalized.lastTouchedAt > SESSION_STATE_MAX_AGE_MS
    ) {
      delete state.sessions[sessionID]
      continue
    }
    state.sessions[sessionID] = normalized
  }
  return state
}

async function loadSessionState(directory: string): Promise<VmmSessionStateFile> {
  const { sessionStatePath } = getVmmPaths(directory)
  try {
    const existing = await fs.readFile(sessionStatePath, "utf8")
    const parsed = JSON.parse(existing) as VmmSessionStateFile
    return pruneSessionState({
      sessions: parsed?.sessions && typeof parsed.sessions === "object" ? parsed.sessions : {},
    })
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code !== "ENOENT") throw error
    return { sessions: {} }
  }
}

async function saveSessionState(directory: string, state: VmmSessionStateFile) {
  const { opencodeDir, sessionStatePath } = getVmmPaths(directory)
  await fs.mkdir(opencodeDir, { recursive: true })
  await fs.writeFile(sessionStatePath, JSON.stringify(pruneSessionState(state), null, 2) + "\n", "utf8")
  return sessionStatePath
}

function ensureSessionRuntimeState(state: VmmSessionStateFile, sessionID: string): SessionRuntimeState {
  const existing = state.sessions[sessionID]
  if (existing) {
    state.sessions[sessionID] = normalizeSessionRuntimeState(existing)
    return state.sessions[sessionID]
  }

  const created: SessionRuntimeState = {
    turnCount: 0,
    submittedTurnCount: 0,
    currentEpoch: 0,
    lastTouchedAt: Date.now(),
    activeMemories: [],
    profileBundle: undefined,
    initialProfileFetchPending: false,
    recentTurns: [],
    sealedTurns: [],
    activeTurn: undefined,
    lastCommittedAssistantMessageID: undefined,
    skipNextApiSyncReason: undefined,
  }
  state.sessions[sessionID] = created
  return created
}

/**
 * Load one detached runtime-state snapshot for a single session.
 * 为单个 session 加载一份脱离共享文件的运行时状态快照。
 *
 * The detached snapshot lets long-running session mutations do their async
 * work without keeping the directory-level shared-file queue occupied for the
 * whole duration.
 * 这份脱离共享文件的快照，允许长生命周期的 session 修改在执行异步工作时，
 * 不必把目录级共享文件队列整个时长都占住。
 */
async function loadDetachedSessionRuntimeState(directory: string, sessionID: string) {
  return runSerializedSessionStateFileMutation({
    state: sessionStateMutationQueue,
    directory,
    async mutate() {
      const stateFile = await loadSessionState(directory)
      return normalizeSessionRuntimeState(ensureSessionRuntimeState(stateFile, sessionID))
    },
  })
}

/**
 * Persist one detached runtime-state snapshot back into the shared directory file.
 * 把一份脱离的运行时状态快照重新持久化回目录共享文件。
 *
 * The helper reloads the latest directory state under the directory-level file
 * queue, then writes back only the owning session entry so concurrent updates
 * from other sessions are preserved.
 * 这个辅助函数会在目录级文件队列保护下重新加载最新目录状态，
 * 然后只回写所属 session 那一项，
 * 从而保留其他 session 并发产生的最新更新。
 */
async function saveDetachedSessionRuntimeState(
  directory: string,
  sessionID: string,
  runtimeState: SessionRuntimeState,
) {
  // Deleted-session barriers must block stale detached savebacks immediately,
  // otherwise a long-running async mutation that started before deletion could
  // recreate runtime state after the host already ended that session.
  // 删除会话屏障必须立刻阻断陈旧的 detached 写回，
  // 否则一个在删除前就已启动的长耗时异步修改，
  // 仍可能在宿主已经结束该 session 之后把运行时状态重新写活。
  if (isDeletedSessionInDirectory(directory, sessionID)) {
    return getVmmPaths(directory).sessionStatePath
  }
  return runSerializedSessionStateFileMutation({
    state: sessionStateMutationQueue,
    directory,
    async mutate() {
      const stateFile = await loadSessionState(directory)
      stateFile.sessions[sessionID] = normalizeSessionRuntimeState(runtimeState)
      return saveSessionState(directory, stateFile)
    },
  })
}

/**
 * Run one session-owned runtime mutation without monopolizing the directory file queue.
 * 在不独占目录文件队列的前提下，执行一次归属于单个 session 的运行时修改。
 *
 * The helper first snapshots one session under the short directory-level file
 * queue, then runs the actual mutation under the session-scoped logical queue,
 * and finally merges only that session back into the latest persisted file.
 * This preserves same-session ordering and cross-session file consistency at
 * the same time.
 * 这个辅助函数会先在短暂的目录级文件队列里读取单个 session 快照，
 * 再在按 session 隔离的逻辑队列里执行真正的状态修改，
 * 最后把该 session 的最新状态合并回当前持久化文件。
 * 这样既能保持同一 session 内的顺序语义，
 * 又能同时保住跨 session 的共享文件一致性。
 */
async function withSerializedSessionState<T>(
  directory: string,
  sessionID: string,
  mutate: (runtimeState: SessionRuntimeState) => Promise<T> | T,
): Promise<{ result: T; sessionStatePath: string }> {
  return runSerializedSessionRuntimeMutation({
    state: sessionRuntimeMutationQueue,
    directory,
    sessionID,
    async mutate() {
      const runtimeState = await loadDetachedSessionRuntimeState(directory, sessionID)
      const result = await mutate(runtimeState)
      const sessionStatePath = await saveDetachedSessionRuntimeState(directory, sessionID, runtimeState)
      return { result, sessionStatePath }
    },
  })
}

/**
 * Run one whole-file mutation while still respecting the owning session order.
 * 执行一次整文件级修改，同时继续尊重所属 session 的顺序语义。
 *
 * Session deletion currently uses this path to remove one session entry from
 * the shared file. Routing it through the session-scoped logical queue keeps
 * the delete operation ordered relative to any in-flight mutations for that
 * same session, preventing deleted sessions from being resurrected by a later
 * stale save.
 * 当前 session 删除会用这条路径把共享文件中的某个 session 条目移除。
 * 让它继续经过按 session 的逻辑队列，
 * 可以保证“删除”与该 session 已在途的其他修改保持顺序，
 * 避免一个已经删除的 session 又被后续陈旧写回重新写活。
 */
async function withSerializedStateFile<T>(
  directory: string,
  sessionID: string,
  mutate: (stateFile: VmmSessionStateFile) => Promise<T> | T,
): Promise<{ result: T; sessionStatePath: string }> {
  return runSerializedSessionRuntimeMutation({
    state: sessionRuntimeMutationQueue,
    directory,
    sessionID,
    async mutate() {
      return runSerializedSessionStateFileMutation({
        state: sessionStateMutationQueue,
        directory,
        async mutate() {
          const stateFile = await loadSessionState(directory)
          const result = await mutate(stateFile)
          const sessionStatePath = await saveSessionState(directory, stateFile)
          return { result, sessionStatePath }
        },
      })
    },
  })
}

async function consumeSkipNextApiSync(directory: string, sessionID: string) {
  const { result } = await withSerializedSessionState(directory, sessionID, (runtimeState) => {
    const reason = runtimeState.skipNextApiSyncReason
    runtimeState.lastTouchedAt = Date.now()
    runtimeState.skipNextApiSyncReason = undefined
    return reason
  })
  return result
}

function getJoinedUserText(turn: ActiveTurnState | undefined) {
  if (!turn) return ""
  return turn.userTexts.map((item) => normalizeText(item)).filter(Boolean).join("\n\n").trim()
}

function inferFollowupReplyKind(text: string | undefined): FollowupReplyKind {
  const trimmed = normalizeText(text)
  if (/^(?:是|否|要|不要|可以|不可以|行|不行)$/u.test(trimmed)) {
    return "yes_no"
  }
  if (looksLikeShortFollowup(trimmed)) {
    return "short_choice"
  }
  return "clarification"
}

function renderQuestionPrompt(questions: FollowupQuestion[] | undefined) {
  if (!questions?.length) return ""
  const rendered = questions.map((question, index) => {
    const title = question.header ? `${question.header}: ${question.question}` : question.question
    const options = question.options.map((option, optionIndex) => `${optionIndex + 1}. ${option}`)
    return [title, ...options].filter(Boolean).join("\n")
  })
  return compactForMemorySync(rendered.join("\n\n"), 2000)
}

function renderQuestionAnswers(
  questions: FollowupQuestion[] | undefined,
  answers: string[][] | undefined,
) {
  if (!Array.isArray(answers) || !answers.length) return ""
  const rendered = answers
    .map((answerGroup, index) => {
      const values = Array.isArray(answerGroup)
        ? answerGroup.map((item) => normalizeText(item)).filter(Boolean)
        : []
      if (!values.length) return ""
      const question = questions?.[index]
      const prefix = question?.header || question?.question || `answer ${index + 1}`
      return `${prefix}: ${values.join(question?.multiple ? ", " : " / ")}`
    })
    .filter(Boolean)
  return compactForMemorySync(rendered.join("\n"), 1000)
}

function countStructuredOptionLines(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.filter((line) => /^(?:[-*+]\s+|\d+[.)]\s+|[A-Za-z][.)]\s+)/u.test(line)).length
}

function countChoiceOptionLines(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  return lines.filter((line) => {
    const match = line.match(/^(?:[-*+]\s+|\d+[.)]\s+|[A-Za-z][.)]\s+)(.+)$/u)
    if (!match) return false
    const body = normalizeText(match[1])
    if (!body) return false
    if (body.includes(":") || body.includes("：")) return false
    return body.length <= 80
  }).length
}

function looksLikeOutstandingAskPrompt(text: string | undefined) {
  const cleaned = normalizeText(text)
  if (!cleaned) return false
  if (countChoiceOptionLines(cleaned) >= 2) return true
  return false
}

function hasSubstantialAssistantAnswer(text: string | undefined) {
  const trimmed = normalizeText(text)
  if (!trimmed) return false
  if (trimmed.includes("```")) return true

  const nonEmptyLines = trimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const optionLines = countStructuredOptionLines(trimmed)
  const nonOptionLines = Math.max(0, nonEmptyLines.length - optionLines)
  if (trimmed.length >= 180) return true
  if (nonOptionLines >= 3) return true
  if (optionLines >= 2 && nonOptionLines >= 1 && trimmed.length >= 100) return true
  return false
}

function shouldAwaitExplicitFollowup(turn: ActiveTurnState | undefined, text: string | undefined) {
  if (!turn) return false
  if (!turn.questionAsked) return false
  if (!turn.awaitingFollowup && turn.followup?.status !== "awaiting") return false
  const cleaned = normalizeText(text)
  if (!cleaned) return true
  if (hasSubstantialAssistantAnswer(cleaned)) return false
  if (!looksLikeOutstandingAskPrompt(cleaned)) return false
  return true
}

function markTurnAwaitingFollowup(
  turn: ActiveTurnState | undefined,
  promptText?: string,
  options?: {
    requestID?: string
    questions?: FollowupQuestion[]
    promptRecordedAt?: number
  },
) {
  if (!turn) return
  const now = Date.now()
  const existing = turn.followup
  const normalizedPrompt = normalizeText(promptText) || existing?.promptText
  turn.awaitingFollowup = true
  turn.phase = "awaiting_followup"
  turn.followup = {
    status: "awaiting",
    askedAt: existing?.askedAt ?? now,
    lastTouchedAt: now,
    expiresAt: now + FOLLOWUP_SOFT_TTL_MS,
    requestID: options?.requestID ?? existing?.requestID,
    promptText: normalizedPrompt,
    questions: options?.questions?.length ? options.questions : existing?.questions,
    answerText: existing?.answerText,
    events:
      options?.requestID && normalizedPrompt
        ? appendFollowupTimelineEvent(existing?.events, {
            kind: "assistant_prompt",
            requestID: options.requestID,
            text: normalizedPrompt,
            recordedAt: options.promptRecordedAt ?? now,
          })
        : existing?.events,
    expectedReplyKind: inferFollowupReplyKind(promptText ?? turn.assistant.lastText),
  }
  turn.updatedAt = now
}

function resolveTurnFollowup(turn: ActiveTurnState | undefined) {
  if (!turn) return
  turn.awaitingFollowup = false
  turn.phase = turn.phase === "sealed" ? "sealed" : "collecting"
  turn.assistantQuestionLike = false
  if (turn.followup) {
    turn.followup = {
      ...turn.followup,
      status: "resolved",
      lastTouchedAt: Date.now(),
    }
  }
  turn.updatedAt = Date.now()
}

function refreshTurnFollowupPrompt(turn: ActiveTurnState | undefined, promptText?: string) {
  if (!turn?.followup) return
  const cleaned = normalizeText(promptText)
  if (!cleaned) return
  turn.followup = {
    ...turn.followup,
    promptText: cleaned,
    lastTouchedAt: Date.now(),
  }
}

function buildFollowupPromptText(questions: FollowupQuestion[] | undefined, promptText?: string) {
  const rendered = renderQuestionPrompt(questions)
  if (rendered) return rendered
  return normalizeText(promptText)
}

function appendFollowupTimelineEvent(
  existing: FollowupTimelineEvent[] | undefined,
  next: FollowupTimelineEvent | undefined,
) {
  if (!next) return existing

  const normalized = normalizeFollowupTimelineEvent(next)
  if (!normalized) return existing

  const current = Array.isArray(existing) ? [...existing] : []
  const sameIndex = current.findIndex(
    (item) =>
      item.kind === normalized.kind &&
      item.requestID === normalized.requestID &&
      item.text === normalized.text,
  )

  if (sameIndex >= 0) {
    current[sameIndex] = normalized
    return current.slice(-12)
  }

  current.push(normalized)
  current.sort((left, right) => {
    if (left.recordedAt !== right.recordedAt) return left.recordedAt - right.recordedAt
    if (left.kind === right.kind) return 0
    return left.kind === "assistant_prompt" ? -1 : 1
  })
  return current.slice(-12)
}

function cancelTurnFollowup(turn: ActiveTurnState | undefined, reason: string) {
  if (!turn) return
  turn.awaitingFollowup = false
  turn.phase = "dropped"
  turn.assistantQuestionLike = false
  turn.droppedReason ??= reason
  if (turn.followup) {
    turn.followup = {
      ...turn.followup,
      status: "cancelled",
      lastTouchedAt: Date.now(),
    }
  }
  turn.updatedAt = Date.now()
}

function expireTurnFollowupIfNeeded(turn: ActiveTurnState | undefined, now = Date.now()) {
  if (!turn?.awaitingFollowup || !turn.followup) return false
  if (turn.followup.status !== "awaiting") return false
  if (turn.followup.expiresAt > now) return false

  turn.awaitingFollowup = false
  turn.phase = "dropped"
  turn.droppedReason ??= "followup_expired"
  turn.followup = {
    ...turn.followup,
    status: "expired",
    lastTouchedAt: now,
  }
  turn.updatedAt = now
  return true
}

function cleanupExpiredActiveTurn(state: SessionRuntimeState, now = Date.now()) {
  if (!state.activeTurn) return false
  if (!expireTurnFollowupIfNeeded(state.activeTurn, now)) return false
  state.activeTurn = undefined
  return true
}

function cloneTurn(turn: ActiveTurnState) {
  return normalizeActiveTurn(turn)
}

function removeSealedTurn(state: SessionRuntimeState, epoch: number) {
  state.sealedTurns = state.sealedTurns.filter((turn) => turn.epoch !== epoch)
}

function sealTurnForFinalize(
  state: SessionRuntimeState,
  turn: ActiveTurnState | undefined,
  reason: string,
) {
  if (!turn) return undefined

  const sealed = cloneTurn(turn)
  if (!sealed) return undefined
  sealed.phase = "sealed"
  sealed.awaitingFollowup = false
  sealed.followup = sealed.followup
    ? {
        ...sealed.followup,
        status: sealed.followup.status === "awaiting" ? "cancelled" : sealed.followup.status,
        lastTouchedAt: Date.now(),
      }
    : undefined
  sealed.updatedAt = Date.now()
  sealed.droppedReason = sealed.droppedReason === "followup_expired" ? sealed.droppedReason : undefined

  removeSealedTurn(state, sealed.epoch)
  state.sealedTurns = [...state.sealedTurns, sealed].slice(-8)

  if (state.activeTurn?.epoch === sealed.epoch) {
    state.activeTurn = undefined
  }

  return sealed.epoch
}

function createActiveTurn(epoch: number, userText: string, messageID: string | undefined): ActiveTurnState {
  return {
    epoch,
    userTexts: [normalizeText(userText)],
    userMessageIDs: messageID ? [messageID] : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    phase: "collecting",
    commandLike: false,
    internalContinuationSeen: false,
    postAnswerContinuation: false,
    assistantQuestionLike: false,
    awaitingFollowup: false,
    followup: undefined,
    permissionAsked: false,
    questionAsked: false,
    hardInterrupted: false,
    errored: false,
    aborted: false,
    superseded: false,
    droppedReason: undefined,
    assistant: normalizeAssistantState(undefined),
    background: normalizeBackgroundState(undefined),
  }
}

function turnHasAssistantActivity(turn: ActiveTurnState | undefined) {
  if (!turn) return false
  return Boolean(turn.assistant.lastMessageID || normalizeText(turn.assistant.lastText))
}

function turnHasStableAssistant(turn: ActiveTurnState | undefined) {
  if (!turn) return false
  return Boolean(
    normalizeText(turn.assistant.stableText) &&
      isSuccessfulAssistantFinish(turn.assistant.stableFinish),
  )
}

function shouldMergeIntoActiveTurn(turn: ActiveTurnState | undefined, nextUserText: string) {
  if (!turn) return false
  if (turn.commandLike || turn.hardInterrupted || turn.aborted || turn.errored || turn.superseded) {
    return false
  }
  if (!turnHasAssistantActivity(turn)) return true
  if (turn.awaitingFollowup && looksLikeShortFollowup(nextUserText)) {
    return true
  }
  return false
}

function supersedeActiveTurn(turn: ActiveTurnState | undefined, reason: string) {
  if (!turn) return
  turn.superseded = true
  turn.phase = "dropped"
  turn.droppedReason = reason
  turn.hardInterrupted = true
  turn.updatedAt = Date.now()
}

function openOrMergeActiveTurn(
  state: SessionRuntimeState,
  userText: string,
  messageID: string | undefined,
) {
  const cleaned = normalizeText(userText)
  if (!cleaned) {
    return {
      turn: state.activeTurn,
      merged: false,
      supersededPrevious: false,
      openedNewTurn: false,
      sealedEpoch: undefined,
    }
  }

  cleanupExpiredActiveTurn(state)

  if (shouldMergeIntoActiveTurn(state.activeTurn, cleaned) && state.activeTurn) {
    state.activeTurn.userTexts.push(cleaned)
    if (messageID) state.activeTurn.userMessageIDs.push(messageID)
    state.activeTurn.questionAsked = false
    state.activeTurn.assistantQuestionLike = false
    resolveTurnFollowup(state.activeTurn)
    state.activeTurn.updatedAt = Date.now()
    return {
      turn: state.activeTurn,
      merged: true,
      supersededPrevious: false,
      openedNewTurn: false,
      sealedEpoch: undefined,
    }
  }

  let supersededPrevious = false
  let sealedEpoch: number | undefined

  if (state.activeTurn) {
    if (turnHasStableAssistant(state.activeTurn) && !state.activeTurn.awaitingFollowup) {
      sealedEpoch = sealTurnForFinalize(state, state.activeTurn, "new_user_after_stable_answer")
    } else {
      if (state.activeTurn.awaitingFollowup && !looksLikeShortFollowup(cleaned)) {
        cancelTurnFollowup(state.activeTurn, "followup_superseded_by_new_user_turn")
      } else if (!turnHasStableAssistant(state.activeTurn)) {
        supersedeActiveTurn(state.activeTurn, "superseded_by_new_user_turn")
      }
      supersededPrevious = true
      state.activeTurn = undefined
    }
  }

  state.turnCount += 1
  state.currentEpoch = state.turnCount
  state.activeTurn = createActiveTurn(state.currentEpoch, cleaned, messageID)

  return { turn: state.activeTurn, merged: false, supersededPrevious, openedNewTurn: true, sealedEpoch }
}

function noteInternalContinuationOnTurn(turn: ActiveTurnState | undefined) {
  if (!turn) return
  turn.internalContinuationSeen = true
  if (turnHasStableAssistant(turn)) {
    turn.postAnswerContinuation = true
  }
  turn.updatedAt = Date.now()
}

function noteAssistantTextOnTurn(turn: ActiveTurnState | undefined, text: string | undefined) {
  if (!turn) return
  const cleaned = normalizeText(text)
  if (!cleaned) return
  turn.assistant.lastText = cleaned
  turn.assistantQuestionLike = false
  if (turn.questionAsked && turn.awaitingFollowup && !turn.followup?.promptText) {
    refreshTurnFollowupPrompt(turn, cleaned)
  }
  turn.updatedAt = Date.now()
}

function markTurnPermissionAsked(turn: ActiveTurnState | undefined) {
  if (!turn) return
  turn.permissionAsked = true
  turn.hardInterrupted = true
  turn.phase = "dropped"
  turn.droppedReason ??= "permission_asked"
  turn.updatedAt = Date.now()
}

function recordTurnQuestionAsked(
  turn: ActiveTurnState | undefined,
  options: {
    requestID?: string
    promptText?: string
    questions?: FollowupQuestion[]
  },
) {
  if (!turn) return
  const promptText = buildFollowupPromptText(options.questions, options.promptText ?? turn.assistant.lastText)
  turn.questionAsked = true
  markTurnAwaitingFollowup(turn, promptText, {
    requestID: options.requestID,
    questions: options.questions,
    promptRecordedAt: Date.now(),
  })
}

function markTurnQuestionReplied(
  turn: ActiveTurnState | undefined,
  requestID: string | undefined,
  answers: string[][] | undefined,
) {
  if (!turn) return
  const now = Date.now()
  const answerText = renderQuestionAnswers(turn.followup?.questions, answers)
  turn.questionAsked = true
  turn.awaitingFollowup = false
  turn.phase = turn.phase === "sealed" ? "sealed" : "collecting"
  turn.assistantQuestionLike = false
  turn.followup = {
    status: "resolved",
    askedAt: turn.followup?.askedAt ?? now,
    lastTouchedAt: now,
    expiresAt: turn.followup?.expiresAt ?? now + FOLLOWUP_SOFT_TTL_MS,
    requestID: requestID ?? turn.followup?.requestID,
    promptText: turn.followup?.promptText,
    questions: turn.followup?.questions,
    answerText: answerText || turn.followup?.answerText,
    events: answerText
      ? appendFollowupTimelineEvent(turn.followup?.events, {
          kind: "user_answer",
          requestID: requestID ?? turn.followup?.requestID,
          text: answerText,
          recordedAt: now,
        })
      : turn.followup?.events,
    expectedReplyKind: turn.followup?.expectedReplyKind,
  }
  turn.updatedAt = now
}

function markTurnQuestionRejected(turn: ActiveTurnState | undefined, requestID: string | undefined) {
  if (!turn) return
  const now = Date.now()
  turn.awaitingFollowup = false
  turn.phase = "dropped"
  turn.hardInterrupted = true
  turn.assistantQuestionLike = false
  turn.droppedReason ??= "question_rejected"
  turn.followup = {
    status: "cancelled",
    askedAt: turn.followup?.askedAt ?? now,
    lastTouchedAt: now,
    expiresAt: turn.followup?.expiresAt ?? now + FOLLOWUP_SOFT_TTL_MS,
    requestID: requestID ?? turn.followup?.requestID,
    promptText: turn.followup?.promptText,
    questions: turn.followup?.questions,
    answerText: turn.followup?.answerText,
    events: turn.followup?.events,
    expectedReplyKind: turn.followup?.expectedReplyKind,
  }
  turn.updatedAt = now
}

function markTurnErrored(
  turn: ActiveTurnState | undefined,
  errorName: string | undefined,
  errorMessage: string | undefined,
) {
  if (!turn) return

  const continuationError = Boolean(
    turn.postAnswerContinuation && turnHasStableAssistant(turn) && isAbortLikeErrorName(errorName),
  )
  turn.assistant.lastErrorName = errorName
  turn.assistant.lastErrorMessage = errorMessage

  if (continuationError) {
    turn.droppedReason ??= "continuation_aborted_after_stable_answer"
    turn.updatedAt = Date.now()
    return
  }

  turn.errored = true
  if (isAbortLikeErrorName(errorName)) {
    turn.aborted = true
    turn.droppedReason ??= "aborted"
  } else {
    turn.droppedReason ??= "session_error"
  }
  turn.phase = "dropped"
  turn.hardInterrupted = true
  turn.updatedAt = Date.now()
}

function applyAssistantMessageUpdate(turn: ActiveTurnState | undefined, info: ReturnType<typeof summarizeMessageInfo>) {
  if (!turn || !info || info.role !== "assistant") return

  turn.assistant.lastMessageID = info.id ?? turn.assistant.lastMessageID
  turn.assistant.lastFinish = info.finish ?? turn.assistant.lastFinish
  turn.assistant.lastCompletedAt = info.completed ?? turn.assistant.lastCompletedAt

  if (info.errorName || info.errorMessage) {
    markTurnErrored(turn, info.errorName, info.errorMessage)
    return
  }

  if (
    isSuccessfulAssistantFinish(info.finish) &&
    info.completed &&
    normalizeText(turn.assistant.lastText) &&
    !turn.postAnswerContinuation
  ) {
    if (turn.questionAsked && turn.awaitingFollowup) {
      const latestText = normalizeText(turn.assistant.lastText)
      const followupPrompt = normalizeText(turn.followup?.promptText)
      if (latestText) {
        if (!followupPrompt) {
          refreshTurnFollowupPrompt(turn, latestText)
        } else if (latestText !== followupPrompt && hasSubstantialAssistantAnswer(latestText)) {
          turn.assistant.stableMessageID = info.id ?? turn.assistant.stableMessageID
          turn.assistant.stableText = latestText
          turn.assistant.stableFinish = info.finish
          turn.assistant.stableCompletedAt = info.completed
          resolveTurnFollowup(turn)
          turn.background.waitingLikely = false
          turn.updatedAt = Date.now()
          return
        }
      }
    }

    if (shouldAwaitExplicitFollowup(turn, turn.assistant.lastText)) {
      markTurnAwaitingFollowup(turn, turn.assistant.lastText)
      turn.updatedAt = Date.now()
      return
    }

    turn.assistant.stableMessageID = info.id ?? turn.assistant.stableMessageID
    turn.assistant.stableText = turn.assistant.lastText
    turn.assistant.stableFinish = info.finish
    turn.assistant.stableCompletedAt = info.completed
    resolveTurnFollowup(turn)
    turn.background.waitingLikely = false
  }

  turn.updatedAt = Date.now()
}

function shouldSubmitTurn(turn: ActiveTurnState | undefined) {
  if (!turn) return false
  if (turn.phase === "dropped") return false
  if (turn.commandLike || turn.superseded || turn.permissionAsked) return false
  if (turn.hardInterrupted && !turnHasStableAssistant(turn)) return false
  if (turn.errored && !turnHasStableAssistant(turn)) return false
  if (turn.aborted && !turnHasStableAssistant(turn)) return false
  if (turn.awaitingFollowup) return false
  if (!getJoinedUserText(turn)) return false
  return turnHasStableAssistant(turn)
}

function createRetrievedMemory(lines: string[], turnIndex: number, turns: number): ActiveMemory {
  const normalizedLines = [...new Set(lines.map((line) => normalizeText(line)).filter(Boolean))]
  const keySeed = normalizedLines.join("|") || `turn-${turnIndex}`
  return {
    id: `retrieved-${turnIndex}-${keySeed.slice(0, 80)}`,
    key: `retrieved:${keySeed}`,
    lines: normalizedLines,
    remainingTurns: turns,
    createdAt: Date.now(),
    sourceTurn: turnIndex,
  }
}

function appendOrRefreshMemory(state: SessionRuntimeState, memory: ActiveMemory) {
  const existingIndex = state.activeMemories.findIndex((item) => item.key === memory.key)
  if (existingIndex >= 0) {
    state.activeMemories.splice(existingIndex, 1, memory)
    return
  }
  state.activeMemories.push(memory)
}

function peekActiveMemories(state: SessionRuntimeState) {
  return state.activeMemories.filter((memory) => memory.remainingTurns > 0)
}

function consumeActiveMemoriesForNewTurn(state: SessionRuntimeState) {
  const active = peekActiveMemories(state)
  for (const memory of active) {
    memory.remainingTurns -= 1
  }
  state.activeMemories = state.activeMemories.filter((memory) => memory.remainingTurns > 0)
  return active
}

function flattenMemoryLines(memories: ActiveMemory[]) {
  const lines = new Set<string>()
  for (const memory of memories) {
    for (const line of memory.lines) {
      const cleaned = normalizeText(line)
      if (cleaned) lines.add(cleaned)
    }
  }
  return [...lines]
}

function compactForMemorySync(text: string, limit: number) {
  let result = normalizeText(text)
  if (!result) return ""

  result = result.replace(/```([\s\S]*?)```/g, (block) => {
    if (block.length <= 800) return block
    return "```[code block omitted for memory sync]```"
  })

  result = result.replace(/\n{3,}/g, "\n\n")
  if (result.length > limit) {
    result = `${result.slice(0, limit)}\n[truncated]`
  }
  return result
}

type StructuredUserSlice = {
  text: string
  assistantOmittedBefore: boolean
  assistantPromptBefore?: string
  createdAt: number
}

type TurnOutlineBlock = {
  recordedAt: number
  order: number
  type: "user" | "assistant"
  content: string
}

type ExtractedTurnContext = {
  primaryUserText: string
  timeline: CommittedTimelineItem[]
}

function getMessageInfoRecord(message: SessionMessageResponseItem | undefined) {
  const info = message?.info
  return info && typeof info === "object" ? (info as Record<string, unknown>) : undefined
}

function getMessageTimeRecord(message: SessionMessageResponseItem | undefined) {
  const info = getMessageInfoRecord(message)
  const time = info?.["time"]
  return time && typeof time === "object" ? (time as Record<string, unknown>) : undefined
}

function getMessageCreatedAt(message: SessionMessageResponseItem | undefined, fallback: number) {
  const created = getMessageTimeRecord(message)?.["created"]
  return typeof created === "number" ? created : fallback
}

function getMessageCompletedAt(message: SessionMessageResponseItem | undefined) {
  const completed = getMessageTimeRecord(message)?.["completed"]
  return typeof completed === "number" ? completed : undefined
}

function getMessageIDFromItem(message: SessionMessageResponseItem | undefined) {
  const id = getMessageInfoRecord(message)?.["id"]
  return typeof id === "string" ? id : undefined
}

function getMessageParentID(message: SessionMessageResponseItem | undefined) {
  const parentID = getMessageInfoRecord(message)?.["parentID"]
  return typeof parentID === "string" ? parentID : undefined
}

function getMessageRole(message: SessionMessageResponseItem | undefined) {
  const role = getMessageInfoRecord(message)?.["role"]
  return typeof role === "string" ? role : undefined
}

function getMessageFinish(message: SessionMessageResponseItem | undefined) {
  const finish = getMessageInfoRecord(message)?.["finish"]
  return typeof finish === "string" ? finish : undefined
}

function findAssistantMessageIndexByID(
  messages: SessionMessageResponseItem[],
  assistantMessageID: string | undefined,
) {
  if (!assistantMessageID) return -1
  return messages.findIndex((message) => {
    const info = message?.info
    return Boolean(info && typeof info === "object" && info["id"] === assistantMessageID)
  })
}

function findTurnUserMessageIndices(messages: SessionMessageResponseItem[], turn: ActiveTurnState) {
  if (!turn.userMessageIDs.length) return []
  const ids = new Set(turn.userMessageIDs)
  return messages
    .map((message, index) => ({ id: getMessageIDFromItem(message), role: getMessageRole(message), index }))
    .filter((item) => item.role === "user" && item.id && ids.has(item.id))
    .map((item) => item.index)
}

function findNextDistinctUserIndex(
  messages: SessionMessageResponseItem[],
  startIndex: number,
  turn: ActiveTurnState,
) {
  const ids = new Set(turn.userMessageIDs)
  for (let index = startIndex + 1; index < messages.length; index += 1) {
    const message = messages[index]
    if (getMessageRole(message) !== "user") continue
    const id = getMessageIDFromItem(message)
    if (id && ids.has(id)) continue
    return index
  }
  return -1
}

function findAssistantCandidateFromWindow(
  messages: SessionMessageResponseItem[],
  turn: ActiveTurnState,
  lastCommittedAssistantMessageID: string | undefined,
) {
  const explicitCandidateIDs = [
    turn.assistant.stableMessageID,
    turn.assistant.lastMessageID,
  ].filter((item): item is string => typeof item === "string")

  for (const candidateID of explicitCandidateIDs) {
    const index = findAssistantMessageIndexByID(messages, candidateID)
    if (index < 0) continue
    const message = messages[index]
    const text = extractTextFromMessageItem(message)
    const finish = getMessageFinish(message)
    if (getMessageRole(message) !== "assistant") continue
    if (!isSuccessfulAssistantFinish(finish) || !text) continue
    return { message, index }
  }

  const boundaryIndex = findAssistantMessageIndexByID(messages, lastCommittedAssistantMessageID)
  const turnUserIndices = findTurnUserMessageIndices(messages, turn)
  const lastUserIndex = turnUserIndices.length ? Math.max(...turnUserIndices) : boundaryIndex
  const nextUserIndex = findNextDistinctUserIndex(messages, lastUserIndex, turn)
  const endIndex = nextUserIndex >= 0 ? nextUserIndex - 1 : messages.length - 1
  const startIndex = Math.max(boundaryIndex + 1, lastUserIndex + 1, 0)

  for (let index = endIndex; index >= startIndex; index -= 1) {
    const message = messages[index]
    const text = extractTextFromMessageItem(message)
    const finish = getMessageFinish(message)
    if (getMessageRole(message) !== "assistant") continue
    if (!isSuccessfulAssistantFinish(finish) || !text) continue
    return { message, index }
  }

  return undefined
}

function promoteStableAssistantFromMessages(
  messages: SessionMessageResponseItem[],
  turn: ActiveTurnState,
  lastCommittedAssistantMessageID: string | undefined,
) {
  if (turnHasStableAssistant(turn)) return false

  const candidate = findAssistantCandidateFromWindow(messages, turn, lastCommittedAssistantMessageID)
  if (!candidate) return false

  const text = normalizeText(extractTextFromMessageItem(candidate.message))
  const finish = getMessageFinish(candidate.message)
  if (!text || !isSuccessfulAssistantFinish(finish)) return false

  if (turn.questionAsked) {
    const promptText = normalizeText(turn.followup?.promptText)
    if (!promptText) {
      refreshTurnFollowupPrompt(turn, text)
    }
    if (shouldAwaitExplicitFollowup(turn, text)) {
      markTurnAwaitingFollowup(turn, text, {
        requestID: turn.followup?.requestID,
        questions: turn.followup?.questions,
      })
      return false
    }
  }

  turn.assistant.lastMessageID = getMessageIDFromItem(candidate.message) ?? turn.assistant.lastMessageID
  turn.assistant.lastText = text
  turn.assistant.lastFinish = finish ?? turn.assistant.lastFinish
  turn.assistant.lastCompletedAt =
    getMessageCompletedAt(candidate.message) ?? turn.assistant.lastCompletedAt
  turn.assistant.stableMessageID = getMessageIDFromItem(candidate.message) ?? turn.assistant.stableMessageID
  turn.assistant.stableText = text
  turn.assistant.stableFinish = finish
  turn.assistant.stableCompletedAt =
    getMessageCompletedAt(candidate.message) ?? turn.assistant.stableCompletedAt
  resolveTurnFollowup(turn)
  turn.background.waitingLikely = false
  turn.updatedAt = Date.now()
  return true
}

function stripVisibleMemoryWrapper(text: string) {
  const normalized = normalizeText(text)
  if (!normalized) return ""
  for (const language of getSupportedVmmLanguages()) {
    const marker = getVisibleMemoryPrefix(language.code).end
    const markerIndex = normalized.indexOf(marker)
    if (markerIndex >= 0) {
      return normalizeText(normalized.slice(markerIndex + marker.length))
    }
  }
  return normalized
}

function renderStructuredUserSlices(slices: StructuredUserSlice[], limit: number) {
  const normalized = slices
    .map((slice) => ({
      text: stripVisibleMemoryWrapper(slice.text),
      assistantOmittedBefore: slice.assistantOmittedBefore,
      assistantPromptBefore: normalizeText(slice.assistantPromptBefore),
    }))
    .filter((slice) => Boolean(slice.text))

  if (normalized.length === 0) return ""
  if (normalized.length === 1) return compactForMemorySync(normalized[0].text, limit)
  const rendered: string[] = []

  for (let position = 0; position < normalized.length; position += 1) {
    const slice = normalized[position]
    if (!slice) continue

    if (rendered.length > 0 && slice.assistantOmittedBefore) {
      rendered.push(
        slice.assistantPromptBefore
          ? `assistant: ${compactForMemorySync(slice.assistantPromptBefore, 1200)}`
          : "assistant: [intermediate response omitted]",
      )
    }

    rendered.push(`user: ${compactForMemorySync(slice.text, 1000)}`)
  }

  return compactForMemorySync(rendered.join("\n\n"), limit)
}

function buildOutlineBlocksFromSlices(slices: StructuredUserSlice[]) {
  if (slices.length <= 1) return [] as TurnOutlineBlock[]

  const blocks: TurnOutlineBlock[] = []
  for (let index = 1; index < slices.length; index += 1) {
    const slice = slices[index]
    if (!slice) continue
    if (slice.assistantOmittedBefore) {
      blocks.push({
        recordedAt: slice.createdAt,
        order: 0,
        type: "assistant",
        content: slice.assistantPromptBefore
          ? compactForMemorySync(slice.assistantPromptBefore, 1200)
          : "[intermediate response omitted]",
      })
    }
    blocks.push({
      recordedAt: slice.createdAt,
      order: 1,
      type: "user",
      content: compactForMemorySync(slice.text, 1000),
    })
  }
  return blocks
}

function buildSystemAskOutlineBlocks(turn: ActiveTurnState | undefined) {
  if (!turn?.questionAsked) return [] as TurnOutlineBlock[]
  const events = turn.followup?.events?.length
    ? turn.followup.events
    : (() => {
        const promptText = buildFollowupPromptText(turn.followup?.questions, turn.followup?.promptText)
        const answerText = normalizeText(turn.followup?.answerText)
        const fallbackEvents: FollowupTimelineEvent[] = []
        if (promptText) {
          fallbackEvents.push({
            kind: "assistant_prompt",
            requestID: turn.followup?.requestID,
            text: promptText,
            recordedAt: turn.followup?.askedAt ?? turn.createdAt,
          })
        }
        if (answerText) {
          fallbackEvents.push({
            kind: "user_answer",
            requestID: turn.followup?.requestID,
            text: answerText,
            recordedAt: turn.followup?.lastTouchedAt ?? turn.updatedAt,
          })
        }
        return fallbackEvents
      })()

  return events.map(
    (event): TurnOutlineBlock => ({
      recordedAt: event.recordedAt,
      order: event.kind === "assistant_prompt" ? 0 : 1,
      type: event.kind === "assistant_prompt" ? "assistant" : "user",
      content:
        event.kind === "assistant_prompt"
          ? compactForMemorySync(event.text, 1600)
          : compactForMemorySync(event.text, 1000),
    }),
  )
}

/**
 * Build the final structured timeline sent to the writeback API.
 * 构建发送给写回 API 的最终结构化时间线。
 *
 * The backend treats `user_content` and `assistant_content` as the stable
 * endpoints, so this helper only normalizes the intermediate process line.
 * 后端把 `user_content` 和 `assistant_content` 视为稳定两端，
 * 因此这里仅负责归一化中间过程线。
 */
function buildCommittedTurnTimeline(blocks: TurnOutlineBlock[]) {
  return blocks
    .filter((block) => Boolean(normalizeText(block.content)))
    .sort((left, right) => {
      if (left.recordedAt !== right.recordedAt) return left.recordedAt - right.recordedAt
      if (left.order !== right.order) return left.order - right.order
      return left.content.localeCompare(right.content)
    })
    .map((block) => ({
      type: block.type,
      content: normalizeText(block.content),
    }))
    .filter(
      (item, index, items): item is CommittedTimelineItem =>
        Boolean(item.content) &&
        (index === 0 ||
          item.type !== items[index - 1]?.type ||
          item.content !== items[index - 1]?.content),
    )
}

function hasAssistantInteractionBeforeFinal(message: SessionMessageResponseItem | undefined) {
  const info = message?.info
  if (!info || typeof info !== "object") return false
  const finish = typeof info["finish"] === "string" ? info["finish"] : undefined
  const errorName = typeof info["errorName"] === "string" ? info["errorName"] : undefined
  const text = extractTextFromMessageItem(message)
  return Boolean(text || finish === "tool-calls" || isSuccessfulAssistantFinish(finish) || errorName)
}

function shouldExposeAskAssistantText(turn: ActiveTurnState | undefined, text: string | undefined) {
  if (!turn?.questionAsked) return false
  const cleaned = normalizeText(text)
  if (!cleaned) return false
  const promptText = normalizeText(turn.followup?.promptText)
  if (promptText) {
    return cleaned === promptText
  }
  return false
}

function extractTurnContextFromMessages(
  messages: SessionMessageResponseItem[],
  startIndex: number,
  turn: ActiveTurnState,
  stableAssistantID: string | undefined,
): ExtractedTurnContext | undefined {
  const stableAssistantIndex = findAssistantMessageIndexByID(messages, stableAssistantID)
  if (stableAssistantIndex < 0) return undefined

  const slices: StructuredUserSlice[] = []
  let assistantSeenSinceLastUser = false
  let assistantPromptSinceLastUser: string | undefined

  for (let index = startIndex; index <= stableAssistantIndex; index += 1) {
    const message = messages[index]
    const info = message?.info
    if (!info || typeof info !== "object") continue

    const role = info["role"]
    const text = extractTextFromMessageItem(message)

    if (role === "user") {
      const cleanedUserText = stripVisibleMemoryWrapper(text)
      if (cleanedUserText && !isInternalContinuation(cleanedUserText)) {
        slices.push({
          text: cleanedUserText,
          assistantOmittedBefore: slices.length > 0 && assistantSeenSinceLastUser,
          assistantPromptBefore:
            slices.length > 0 && assistantSeenSinceLastUser ? assistantPromptSinceLastUser : undefined,
          createdAt: getMessageCreatedAt(message, index),
        })
      }
      assistantSeenSinceLastUser = false
      assistantPromptSinceLastUser = undefined
      continue
    }

    if (role !== "assistant") continue
    if (index === stableAssistantIndex) break

    if (hasAssistantInteractionBeforeFinal(message)) {
      assistantSeenSinceLastUser = true
      if (shouldExposeAskAssistantText(turn, text)) {
        assistantPromptSinceLastUser = text
      }
    }
  }

  const primaryUserText = compactForMemorySync(slices[0]?.text ?? "", 4000)
  if (!primaryUserText) return undefined

  return {
    primaryUserText,
    timeline: buildCommittedTurnTimeline([
      ...buildOutlineBlocksFromSlices(slices),
      ...buildSystemAskOutlineBlocks(turn),
    ]),
  }
}

function buildStructuredUserContextFallback(turn: ActiveTurnState) {
  const texts = turn.userTexts
    .map((item) => normalizeText(item))
    .filter((text): text is string => Boolean(text))
  return compactForMemorySync(texts[0] ?? "", 4000)
}

function buildFallbackTimeline(turn: ActiveTurnState) {
  const texts = turn.userTexts
    .map((item) => normalizeText(item))
    .filter((text): text is string => Boolean(text))
  const askBlocks = buildSystemAskOutlineBlocks(turn)
  if (texts.length <= 1) {
    return buildCommittedTurnTimeline(askBlocks)
  }

  const slices: StructuredUserSlice[] = texts.map((text, index) => ({
    text,
    assistantOmittedBefore: index > 0 && turnHasAssistantActivity(turn),
    assistantPromptBefore:
      index === 1 && turn.followup?.promptText && shouldExposeAskAssistantText(turn, turn.followup.promptText)
        ? turn.followup.promptText
        : undefined,
    createdAt: turn.createdAt + index,
  }))
  return buildCommittedTurnTimeline([...buildOutlineBlocksFromSlices(slices), ...askBlocks])
}

/**
 * Deliver one non-critical host toast without blocking the main request pipeline.
 * 发送一条非关键宿主 toast，但不能阻塞主请求链路。
 *
 * The plugin only uses toast as auxiliary feedback. If the host has no
 * responsive notification channel, the call is aborted quickly and the main
 * flow keeps moving.
 * 插件里的 toast 只承担辅助反馈职责；如果宿主当前没有可响应的通知通道，
 * 这里会快速中止调用，并继续放行主流程。
 */
async function showToast(
  client: VmmClient,
  directory: string,
  message: string,
  variant: HostToastVariant,
) {
  const result = await deliverHostToast(client, {
    directory,
    message,
    variant,
    duration: 3000,
    timeoutMs: VMM_HOST_TOAST_SOFT_TIMEOUT_MS,
  })

  if (result.status === "delivered") {
    return
  }

  if (result.status === "skipped") {
    void writeLog({
      kind: "vmm.toast.skipped",
      data: {
        message:
          result.reason === "no-channel"
            ? "toast delivery was skipped because no compatible host notification channel was available"
            : "toast delivery was skipped because the host notification channel did not respond in time",
        variant,
        timeoutMs: VMM_HOST_TOAST_SOFT_TIMEOUT_MS,
        reason: result.reason,
        channel: result.channel,
      },
    })
    return
  }

  void writeLog({
    kind: "vmm.toast.error",
    data: {
      message: "failed to show host toast",
      channel: result.channel,
      error: result.error,
    },
  })
}

/**
 * Resolve the effective runtime-notice route for the current config and stage.
 * 按当前配置和提示阶段解析最终生效的运行态通知路由。
 *
 * OpenCode upstream does not currently pass a stable host enum into plugin
 * hooks, so runtime routing must stay policy-driven and capability-friendly
 * instead of pretending it can always distinguish `web` from `cli`.
 * OpenCode 上游当前还不会把稳定的宿主枚举传进插件 hook，
 * 因此这里的运行态路由必须保持“策略驱动、能力友好”，
 * 而不是假装自己总能准确区分 `web` 和 `cli`。
 */
function resolveRuntimeNotificationRoute(
  runtimeConfig: Pick<VmmRuntimeConfig, "notificationSurfaceMode">,
  stage: VmmNotificationStage,
) {
  return resolveVmmNotificationRoute({
    mode: runtimeConfig.notificationSurfaceMode,
    stage,
  })
}

/**
 * Build a completion toast for PreCheck results.
 * 为 PreCheck 结果生成结束提示。
 *
 * Retrieval already shows a start-of-flow toast. This helper adds the matching
 * end-state toast so users can distinguish "history injected" from "completed
 * with no matching memory" without reading hidden plugin logs.
 * 检索链已经会显示开始提示；这里再补一条结束态提示，
 * 让用户不用查看隐藏日志，也能区分“历史已注入”和“正常结束但没有命中记忆”。
 */
function buildMemoryContextCompletionToast(result: {
  inject: boolean
  reason: string
  lines: string[]
}, language: VmmRuntimeConfig["language"]) {
  const normalizedReason = normalizeText(result.reason)
  if (
    normalizedReason === "missing-vulcan-host-target" ||
    normalizedReason.startsWith("invalid-business-scope") ||
    normalizedReason.startsWith("network-timeout-") ||
    normalizedReason === "network-error"
  ) {
    return undefined
  }

  if (result.inject) {
    return {
      message: tVmmShared(language, "recall_complete_injected", { count: result.lines.length }),
      variant: "success" as const,
    }
  }

  return {
    message: tVmmShared(language, "recall_complete_empty"),
    variant: "info" as const,
  }
}

/**
 * Render one hidden system instruction that asks the model to surface a
 * runtime notice in the visible answer.
 * 渲染一段隐藏的 system 指令，让模型把运行时告警体现在可见回复里。
 *
 * Stock OpenCode web currently has no documented plugin-side web component
 * surface like TUI toast. When the backend can no longer rely on toast, the
 * next best compatible path is to ask the model to mention one short notice
 * before continuing the normal answer.
 * 当前 stock OpenCode web 没有公开的、可供插件直接挂载的 web 组件面，
 * 因此当后端不能再依赖 toast 时，最稳的兼容方案就是让模型先说一句简短告警，
 * 然后继续正常回答，而不是让告警完全消失。
 */
function renderUserVisibleRuntimeNoticeSystem(message: string) {
  const notice = normalizeText(message)
  if (!notice) return ""

  return [
    "## VMM Runtime Notice",
    "Before answering the user's request, start with one brief sentence that tells the user this runtime notice:",
    `- ${notice}`,
    "Then continue the normal answer.",
    "Do not ask the user to resend the prompt, and do not refuse the task only because this notice is present.",
  ].join("\n")
}

/**
 * Translate one retrieval result reason into one optional user-facing runtime
 * notice for hosts that still allow warning-stage visible prompts.
 * 把检索结果原因翻译成一条可选的用户可见运行时提示，
 * 供仍允许 warning 阶段可见提示的宿主使用。
 *
 * Retrieval still fails open, but the remaining visible-notice hosts need to
 * distinguish "no memory found" from "memory lookup was skipped or unavailable".
 * This helper keeps that mapping centralized next to the existing toast
 * decision logic.
 * 检索链仍然坚持 fail-open，
 * 但剩余允许可见提示的宿主仍需要分清
 * “这轮没有记忆可注入”和“记忆链本身被跳过或暂不可用”。
 * 这里把对应映射集中放在原有 toast 决策附近，避免分散复制。
 */
function buildMemoryContextRuntimeNotice(result: {
  inject: boolean
  reason: string
  lines: string[]
}, language: VmmRuntimeConfig["language"]) {
  const normalizedReason = normalizeText(result.reason)
  if (!normalizedReason || result.inject) {
    return undefined
  }

  if (normalizedReason === "missing-vulcan-host-target") {
    return tVmmShared(language, "missing_vulcan_host_target")
  }

  if (normalizedReason === "network-timeout-handshake") {
    return tVmmShared(language, "memory_context_handshake_timeout")
  }

  if (normalizedReason === "network-timeout-receive") {
    return tVmmShared(language, "memory_context_receive_timeout")
  }

  if (normalizedReason === "network-error") {
    return tVmmShared(language, "memory_context_unavailable")
  }

  if (normalizedReason === "invalid-business-scope-user") {
    const repairHint = tVmmShared(language, "binding_repair_user")
    return language === "zh-CN"
      ? `当前 VMM user 绑定无效，本轮已跳过历史注入。 ${repairHint}`
      : `The current VMM user binding is invalid, so history injection was skipped for this turn. ${repairHint}`
  }

  if (normalizedReason === "invalid-business-scope-project") {
    const repairHint = tVmmShared(language, "binding_repair_project")
    return language === "zh-CN"
      ? `当前 VMM project 绑定无效，本轮已跳过历史注入。 ${repairHint}`
      : `The current VMM project binding is invalid, so history injection was skipped for this turn. ${repairHint}`
  }

  if (
    normalizedReason === "invalid-business-scope-user-project" ||
    normalizedReason === "invalid-business-scope"
  ) {
    const repairHint = tVmmShared(language, "binding_repair_both")
    return language === "zh-CN"
      ? `当前 VMM user/project 绑定无效，本轮已跳过历史注入。 ${repairHint}`
      : `The current VMM user/project binding is invalid, so history injection was skipped for this turn. ${repairHint}`
  }

  return undefined
}

function isTopLevelUserMessage(input: unknown) {
  if (typeof getMessageID(input) !== "string") return false
  if (!input || typeof input !== "object") return false
  const record = input as Record<string, unknown>
  if (typeof record["variant"] === "string") return true
  return record["agent"] === "build"
}

function summarizeMessageInfo(info: unknown) {
  if (!info || typeof info !== "object") return undefined
  const record = info as Record<string, unknown>
  const time = record["time"]
  const timeRecord = time && typeof time === "object" ? (time as Record<string, unknown>) : undefined
  const error = record["error"]
  const errorRecord = error && typeof error === "object" ? (error as Record<string, unknown>) : undefined

  return {
    id: typeof record["id"] === "string" ? record["id"] : undefined,
    sessionID: typeof record["sessionID"] === "string" ? record["sessionID"] : undefined,
    role: typeof record["role"] === "string" ? record["role"] : undefined,
    parentID: typeof record["parentID"] === "string" ? record["parentID"] : undefined,
    agent: typeof record["agent"] === "string" ? record["agent"] : undefined,
    providerID: typeof record["providerID"] === "string" ? record["providerID"] : undefined,
    modelID: typeof record["modelID"] === "string" ? record["modelID"] : undefined,
    finish: typeof record["finish"] === "string" ? record["finish"] : undefined,
    created: typeof timeRecord?.["created"] === "number" ? timeRecord["created"] : undefined,
    completed: typeof timeRecord?.["completed"] === "number" ? timeRecord["completed"] : undefined,
    errorName: typeof errorRecord?.["name"] === "string" ? errorRecord["name"] : undefined,
    errorMessage: typeof errorRecord?.["message"] === "string" ? errorRecord["message"] : undefined,
  }
}

function summarizeChatMessage(output: unknown) {
  if (!output || typeof output !== "object") return {}
  const record = output as Record<string, unknown>
  const parts = Array.isArray(record["parts"]) ? (record["parts"] as unknown[]) : []
  const naturalized = naturalizeUserMessageParts(parts)
  return {
    partTypes: parts
      .map((part) => (part && typeof part === "object" ? (part as Record<string, unknown>)["type"] : undefined))
      .filter((value): value is string => typeof value === "string"),
    textCount: naturalized.textParts.length,
    attachmentCount: naturalized.attachmentSummaries.length,
    textPreview: naturalized.combinedText.slice(0, 500),
    messageKeys:
      record["message"] && typeof record["message"] === "object"
        ? Object.keys(record["message"] as Record<string, unknown>)
        : [],
  }
}

function sanitizeSessionMessages(output: unknown) {
  if (!output || typeof output !== "object") return []
  const record = output as Record<string, unknown>
  const messages = Array.isArray(record["messages"]) ? (record["messages"] as unknown[]) : []

  return messages.map((message) => {
    if (!message || typeof message !== "object") return message
    const msg = message as Record<string, unknown>
    const info = msg["info"]
    const infoRecord = info && typeof info === "object" ? (info as Record<string, unknown>) : {}
    const parts = Array.isArray(msg["parts"]) ? (msg["parts"] as unknown[]) : []

    return {
      id: typeof infoRecord["id"] === "string" ? infoRecord["id"] : undefined,
      role: typeof infoRecord["role"] === "string" ? infoRecord["role"] : undefined,
      agent: typeof infoRecord["agent"] === "string" ? infoRecord["agent"] : undefined,
      parentID: typeof infoRecord["parentID"] === "string" ? infoRecord["parentID"] : undefined,
      parts: parts.map((part) => {
        if (!part || typeof part !== "object") return part
        const partRecord = part as Record<string, unknown>
        return {
          type: partRecord["type"],
          text: typeof partRecord["text"] === "string" ? partRecord["text"] : undefined,
          mime: typeof partRecord["mime"] === "string" ? partRecord["mime"] : undefined,
          filename: typeof partRecord["filename"] === "string" ? partRecord["filename"] : undefined,
          synthetic: partRecord["synthetic"],
          ignored: partRecord["ignored"],
        }
      }),
    }
  })
}

function summarizeChatParamsInput(input: unknown) {
  if (!input || typeof input !== "object") return {}
  const inputRecord = input as Record<string, unknown>
  return {
    sessionID: typeof inputRecord["sessionID"] === "string" ? inputRecord["sessionID"] : undefined,
    agent:
      inputRecord["agent"] && typeof inputRecord["agent"] === "object"
        ? {
            name: (inputRecord["agent"] as Record<string, unknown>)["name"],
            mode: (inputRecord["agent"] as Record<string, unknown>)["mode"],
            model: (inputRecord["agent"] as Record<string, unknown>)["model"],
          }
        : undefined,
    model: inputRecord["model"],
    provider:
      inputRecord["provider"] && typeof inputRecord["provider"] === "object"
        ? {
            id: (inputRecord["provider"] as Record<string, unknown>)["id"],
            npm: (inputRecord["provider"] as Record<string, unknown>)["npm"],
          }
        : undefined,
    message:
      inputRecord["message"] && typeof inputRecord["message"] === "object"
        ? {
            id: (inputRecord["message"] as Record<string, unknown>)["id"],
            role: (inputRecord["message"] as Record<string, unknown>)["role"],
            variant: (inputRecord["message"] as Record<string, unknown>)["variant"],
            system: (inputRecord["message"] as Record<string, unknown>)["system"],
          }
        : undefined,
  }
}

function summarizeSystemTransform(input: unknown, output: unknown) {
  const inputRecord = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const outputRecord = output && typeof output === "object" ? (output as Record<string, unknown>) : {}
  const system = Array.isArray(outputRecord["system"]) ? (outputRecord["system"] as unknown[]) : []
  const systemStrings = system.filter((item): item is string => typeof item === "string")
  const last = systemStrings.at(-1) ?? ""

  return {
    sessionID: typeof inputRecord["sessionID"] === "string" ? inputRecord["sessionID"] : undefined,
    model:
      inputRecord["model"] && typeof inputRecord["model"] === "object"
        ? {
            id: (inputRecord["model"] as Record<string, unknown>)["id"],
            providerID: (inputRecord["model"] as Record<string, unknown>)["providerID"],
          }
        : undefined,
    systemCount: systemStrings.length,
    lastSystemPreview: last.slice(0, 300),
    lastSystemLength: last.length,
  }
}

function summarizeToolHook(input: unknown, output: unknown) {
  const inputRecord = input && typeof input === "object" ? (input as Record<string, unknown>) : {}
  const outputRecord = output && typeof output === "object" ? (output as Record<string, unknown>) : {}

  return {
    tool: typeof inputRecord["tool"] === "string" ? inputRecord["tool"] : undefined,
    callID: typeof inputRecord["callID"] === "string" ? inputRecord["callID"] : undefined,
    argKeys:
      outputRecord["args"] && typeof outputRecord["args"] === "object"
        ? Object.keys(outputRecord["args"] as Record<string, unknown>)
        : inputRecord["args"] && typeof inputRecord["args"] === "object"
          ? Object.keys(inputRecord["args"] as Record<string, unknown>)
          : [],
    outputPreview:
      typeof outputRecord["output"] === "string" ? outputRecord["output"].slice(0, 300) : undefined,
    title: typeof outputRecord["title"] === "string" ? outputRecord["title"] : undefined,
  }
}

function summarizeEvent(event: unknown) {
  if (!event || typeof event !== "object") return undefined
  const eventRecord = event as { type?: string; properties?: Record<string, unknown> }
  const type = eventRecord.type
  const props = eventRecord.properties ?? {}

  if (!type || !EVENT_TYPES_TO_LOG.has(type)) return undefined

  if (type === "session.status") {
    const sessionID = typeof props["sessionID"] === "string" ? props["sessionID"] : undefined
    const status = props["status"] && typeof props["status"] === "object" ? (props["status"] as Record<string, unknown>) : undefined
    return {
      type,
      sessionID,
      status,
    }
  }

  if (type === "message.updated") {
    const info = props["info"]
    const summary = summarizeMessageInfo(info)
    if (!summary?.id) return undefined
    const messageSessionID =
      summary.sessionID ?? (typeof props["sessionID"] === "string" ? props["sessionID"] : undefined)
    return {
      type,
      sessionID: messageSessionID,
      info: summary,
    }
  }

  if (type === "session.created") {
    const info = props["info"] && typeof props["info"] === "object" ? (props["info"] as Record<string, unknown>) : {}
    return {
      type,
      info: {
        id: typeof info["id"] === "string" ? info["id"] : undefined,
        title: typeof info["title"] === "string" ? info["title"] : undefined,
        parentID: typeof info["parentID"] === "string" ? info["parentID"] : undefined,
        directory: typeof info["directory"] === "string" ? info["directory"] : undefined,
      },
    }
  }

  if (type === "session.deleted") {
    const info = props["info"] && typeof props["info"] === "object" ? (props["info"] as Record<string, unknown>) : {}
    return {
      type,
      info: {
        id: typeof info["id"] === "string" ? info["id"] : undefined,
      },
      sessionID: typeof props["sessionID"] === "string" ? props["sessionID"] : undefined,
    }
  }

  if (type === "session.error") {
    const error = props["error"] && typeof props["error"] === "object" ? (props["error"] as Record<string, unknown>) : {}
    return {
      type,
      sessionID: typeof props["sessionID"] === "string" ? props["sessionID"] : undefined,
      error: {
        name: typeof error["name"] === "string" ? error["name"] : undefined,
        message: typeof error["message"] === "string" ? error["message"] : undefined,
      },
    }
  }

  if (type === "permission.asked") {
    return {
      type,
      sessionID: typeof props["sessionID"] === "string" ? props["sessionID"] : undefined,
      id: typeof props["id"] === "string" ? props["id"] : undefined,
      message: typeof props["message"] === "string" ? props["message"] : undefined,
    }
  }

  if (type === "question.asked") {
    return {
      type,
      sessionID: typeof props["sessionID"] === "string" ? props["sessionID"] : undefined,
      id: typeof props["id"] === "string" ? props["id"] : undefined,
      message: typeof props["message"] === "string" ? props["message"] : undefined,
      questions: extractFollowupQuestions(props["questions"]),
    }
  }

  if (type === "question.replied") {
    return {
      type,
      sessionID: typeof props["sessionID"] === "string" ? props["sessionID"] : undefined,
      requestID: typeof props["requestID"] === "string" ? props["requestID"] : undefined,
      answers: extractQuestionAnswers(props["answers"]),
    }
  }

  if (type === "question.rejected") {
    return {
      type,
      sessionID: typeof props["sessionID"] === "string" ? props["sessionID"] : undefined,
      requestID: typeof props["requestID"] === "string" ? props["requestID"] : undefined,
    }
  }

  if (type === "session.idle") {
    return {
      type,
      sessionID: typeof props["sessionID"] === "string" ? props["sessionID"] : undefined,
    }
  }

  return {
    type,
    properties: props,
  }
}

/**
 * Write one plugin hook log entry with optional root-session guard bypass.
 * 写入一条插件 hook 日志，并可选择绕过 root-session 守卫。
 *
 * Most runtime logs intentionally stay root-session only so child/background
 * sessions do not flood the debug log. Terminal lifecycle events such as
 * `session.deleted` are the exception: they may need to log after root state
 * has already been reclaimed.
 * 大多数运行时日志会刻意限制在 root session 内，
 * 以免子会话或后台会话把调试日志冲得过于嘈杂。
 * 但像 `session.deleted` 这种终态生命周期事件属于例外：
 * 它们可能需要在 root 状态已经被回收之后继续留下清理记录。
 */
/**
 * Write one plugin lifecycle log entry for one concrete directory.
 * 为某个具体目录写入一条插件生命周期日志。
 *
 * Root-session guard must be evaluated against the directory-scoped runtime
 * scope; otherwise the same process could suppress or emit logs based on
 * another workspace's root-session cache.
 * root-session 守卫必须基于目录作用域运行时状态判断，
 * 否则同一进程里不同工作区会互相影响日志是否被压制或放行。
 */
async function logHookForDirectory(
  directory: string,
  kind: string,
  input: unknown,
  output?: unknown,
  extra?: Record<string, unknown>,
  options?: {
    bypassRootGuard?: boolean
  },
) {
  const extraSessionID = typeof extra?.sessionID === "string" ? extra.sessionID : undefined
  const sessionID = getSessionID(input) ?? extraSessionID
  if (sessionID && !options?.bypassRootGuard && !isRootSessionInDirectory(directory, sessionID)) return
  void writeLog({
    kind,
    sessionID: typeof sessionID === "string" ? sessionID : undefined,
    data: {
      input: input as Record<string, unknown>,
      output: output as Record<string, unknown> | undefined,
      extra,
    },
  })
}

async function readSessionMessages(
  client: VmmClient,
  sessionID: string,
): Promise<SessionMessageResponseItem[]> {
  try {
    const response = await client.session?.messages?.({
      path: { id: sessionID },
    })

    if (Array.isArray(response)) {
      return response
    }

    if (response && typeof response === "object" && Array.isArray((response as { data?: unknown[] }).data)) {
      return (response as { data?: SessionMessageResponseItem[] }).data ?? []
    }

    return []
  } catch (error) {
    void writeLog({
      kind: "vmm.session.messages.error",
      sessionID,
      data: {
        message: "failed to read session messages during finalize",
        error,
      },
    })
    return []
  }
}

function extractTextFromMessageItem(item: SessionMessageResponseItem | undefined) {
  return normalizeText(naturalizeUserMessageParts(item?.parts).combinedText)
}

function extractCommittedTurnFromMessages(
  messages: SessionMessageResponseItem[],
  turn: ActiveTurnState,
  lastCommittedAssistantMessageID: string | undefined,
): ExtractedCommittedTurn | undefined {
  const stableMessageID = turn.assistant.stableMessageID
  const stableText = normalizeText(turn.assistant.stableText)

  let assistantEntry: SessionMessageResponseItem | undefined
  let assistantEntryIndex = -1
  if (stableMessageID) {
    assistantEntryIndex = findAssistantMessageIndexByID(messages, stableMessageID)
    assistantEntry = assistantEntryIndex >= 0 ? messages[assistantEntryIndex] : undefined
  }

  if (!assistantEntry && stableText) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]
      const info = message?.info
      if (!info || typeof info !== "object") continue
      if (info["role"] !== "assistant") continue
      const finish = typeof info["finish"] === "string" ? info["finish"] : undefined
      const error = info["error"]
      if (isSuccessfulAssistantFinish(finish) && !error && extractTextFromMessageItem(message) === stableText) {
        assistantEntryIndex = index
        break
      }
    }
    assistantEntry = assistantEntryIndex >= 0 ? messages[assistantEntryIndex] : undefined
  }

  const assistantText = compactForMemorySync(
    normalizeText(extractTextFromMessageItem(assistantEntry) || stableText),
    6000,
  )

  if (!assistantText) return undefined

  let userText = ""
  let timeline: CommittedTimelineItem[] = []
  if (turn.userMessageIDs.length > 0) {
    const boundaryIndex = findAssistantMessageIndexByID(messages, lastCommittedAssistantMessageID)
    const startIndex = boundaryIndex >= 0 ? boundaryIndex + 1 : 0
    const structuredContext = extractTurnContextFromMessages(
      messages,
      startIndex,
      turn,
      stableMessageID,
    )
    userText =
      structuredContext?.primaryUserText ??
      (() => {
        const wantedIDs = new Set(turn.userMessageIDs)
        const texts = messages
          .filter((message) => {
            const info = message?.info
            return Boolean(info && typeof info === "object" && wantedIDs.has(String(info["id"] ?? "")))
          })
          .map((message) => extractTextFromMessageItem(message))
          .filter((text) => Boolean(text) && !isInternalContinuation(text))
        return compactForMemorySync(texts.join("\n\n"), 4000)
      })()
    timeline = structuredContext?.timeline ?? []
  }

  if (!userText) {
    userText = buildStructuredUserContextFallback(turn)
  }

  if (!userText) return undefined

  const info = assistantEntry?.info && typeof assistantEntry.info === "object"
    ? (assistantEntry.info as Record<string, unknown>)
    : undefined
  const infoTime = info?.["time"] && typeof info["time"] === "object"
    ? (info["time"] as Record<string, unknown>)
    : undefined

  return {
    user: userText,
    assistant: assistantText,
    timeline,
    assistantMessageID: typeof info?.["id"] === "string" ? info["id"] : turn.assistant.stableMessageID,
    assistantFinish: typeof info?.["finish"] === "string" ? info["finish"] : turn.assistant.stableFinish,
    assistantCompletedAt:
      typeof infoTime?.["completed"] === "number"
        ? (infoTime["completed"] as number)
        : turn.assistant.stableCompletedAt,
    extractedFromSessionMessages: Boolean(assistantEntry) || Boolean(turn.userMessageIDs.length),
  }
}

async function buildCommittedTurn(
  client: VmmClient,
  sessionID: string,
  turn: ActiveTurnState,
  lastCommittedAssistantMessageID: string | undefined,
  existingMessages?: SessionMessageResponseItem[],
): Promise<ExtractedCommittedTurn | undefined> {
  const messages = existingMessages ?? (await readSessionMessages(client, sessionID))
  const extracted = extractCommittedTurnFromMessages(messages, turn, lastCommittedAssistantMessageID)
  if (extracted) return extracted

  const fallbackUser = compactForMemorySync(getJoinedUserText(turn), 4000)
  const fallbackAssistant = compactForMemorySync(normalizeText(turn.assistant.stableText), 6000)
  if (!fallbackUser || !fallbackAssistant) return undefined

  return {
    user: fallbackUser,
    assistant: fallbackAssistant,
    timeline: buildFallbackTimeline(turn),
    assistantMessageID: turn.assistant.stableMessageID,
    assistantFinish: turn.assistant.stableFinish,
    assistantCompletedAt: turn.assistant.stableCompletedAt,
    extractedFromSessionMessages: false,
  }
}

function getTurnByEpoch(
  state: SessionRuntimeState,
  epoch: number | undefined,
): { turn?: ActiveTurnState; source: "active" | "sealed" | "none" } {
  if (typeof epoch === "number") {
    if (state.activeTurn?.epoch === epoch) {
      return { turn: state.activeTurn, source: "active" }
    }
    const sealed = state.sealedTurns.find((item) => item.epoch === epoch)
    if (sealed) {
      return { turn: sealed, source: "sealed" }
    }
    return { source: "none" }
  }

  if (state.activeTurn) {
    return { turn: state.activeTurn, source: "active" }
  }

  const sealed = state.sealedTurns.at(-1)
  if (sealed) {
    return { turn: sealed, source: "sealed" }
  }

  return { source: "none" }
}

function getTurnForFollowupRequest(
  state: SessionRuntimeState,
  requestID: string | undefined,
): ActiveTurnState | undefined {
  if (requestID) {
    if (state.activeTurn?.followup?.requestID === requestID) {
      return state.activeTurn
    }
    for (let index = state.sealedTurns.length - 1; index >= 0; index -= 1) {
      const turn = state.sealedTurns[index]
      if (turn?.followup?.requestID === requestID) {
        return turn
      }
    }
  }

  if (state.activeTurn?.questionAsked) return state.activeTurn

  for (let index = state.sealedTurns.length - 1; index >= 0; index -= 1) {
    const turn = state.sealedTurns[index]
    if (turn?.questionAsked) {
      return turn
    }
  }

  return undefined
}

function clearTurnFromState(
  state: SessionRuntimeState,
  turn: ActiveTurnState | undefined,
  source: "active" | "sealed" | "none",
) {
  if (!turn || source === "none") return
  if (source === "active" && state.activeTurn?.epoch === turn.epoch) {
    state.activeTurn = undefined
    return
  }
  removeSealedTurn(state, turn.epoch)
}

async function finalizeSessionTurn(args: {
  client: VmmClient
  directory: string
  worktree: string
  sessionID: string
  epoch?: number
  reason: string
  vmmFeatureStatus?: VmmFeatureStatus
}) {
  if (isDeletedSessionInDirectory(args.directory, args.sessionID)) {
    await logHookForDirectory(args.directory, "memory.sync.skip", { sessionID: args.sessionID }, undefined, {
      sessionID: args.sessionID,
      reason: "session-deleted-barrier",
      epoch: args.epoch,
    }, {
      bypassRootGuard: true,
    })
    return
  }

  if (args.vmmFeatureStatus && !args.vmmFeatureStatus.enabled) {
    await logHookForDirectory(args.directory, "memory.sync.skip", { sessionID: args.sessionID }, undefined, {
      sessionID: args.sessionID,
      reason: "plugin-disabled-vmm-backend",
      vmmFeatureStatus: args.vmmFeatureStatus,
      epoch: args.epoch,
    })
    return
  }

  const runtimeConfig = await loadVmmConfig(args.directory)
  const scopeDiagnosis = diagnoseVmmBusinessScope(runtimeConfig)
  if (!scopeDiagnosis.enabled) {
    await logHookForDirectory(args.directory, "memory.sync.skip", { sessionID: args.sessionID }, undefined, {
      sessionID: args.sessionID,
      reason: "plugin-disabled-missing-business-scope",
      businessScopeReason: scopeDiagnosis.reason,
      missingBusinessBindings: scopeDiagnosis.missingFields,
      invalidBusinessBindings: scopeDiagnosis.invalidFields,
      epoch: args.epoch,
    })
    return
  }
  const { result, sessionStatePath } = await withSerializedSessionState(
    args.directory,
    args.sessionID,
    async (runtimeState) => {
      const { turn, source } = getTurnByEpoch(runtimeState, args.epoch)
      if (!turn) {
        return { type: "noop" as const }
      }

      runtimeState.lastTouchedAt = Date.now()
      const messages = await readSessionMessages(args.client, args.sessionID)
      promoteStableAssistantFromMessages(messages, turn, runtimeState.lastCommittedAssistantMessageID)
      if (expireTurnFollowupIfNeeded(turn)) {
        clearTurnFromState(runtimeState, turn, source)
        return {
          type: "skip" as const,
          reason: "followup_expired",
          epoch: turn.epoch,
        }
      }

      if (!shouldSubmitTurn(turn)) {
        if (
          turn.droppedReason ||
          turn.hardInterrupted ||
          turn.errored ||
          turn.aborted ||
          turn.superseded ||
          turn.phase === "dropped"
        ) {
          clearTurnFromState(runtimeState, turn, source)
        }
        return {
          type: "skip" as const,
          reason: turn.droppedReason ?? args.reason,
          epoch: turn.epoch,
          hasStableAssistant: turnHasStableAssistant(turn),
          awaitingFollowup: turn.awaitingFollowup,
          hardInterrupted: turn.hardInterrupted,
          errored: turn.errored,
          aborted: turn.aborted,
          superseded: turn.superseded,
        }
      }

      const extracted = await buildCommittedTurn(
        args.client,
        args.sessionID,
        turn,
        runtimeState.lastCommittedAssistantMessageID,
        messages,
      )
      if (!extracted) {
        turn.droppedReason = "extract_failed"
        clearTurnFromState(runtimeState, turn, source)
        return {
          type: "skip" as const,
          reason: "extract_failed",
          epoch: turn.epoch,
        }
      }

      const storedTurn: StoredTurn = {
        user: extracted.user,
        assistant: extracted.assistant,
        completedAt: Date.now(),
      }
      runtimeState.recentTurns = [...runtimeState.recentTurns, storedTurn].slice(-5)
      runtimeState.lastCommittedAssistantMessageID =
        extracted.assistantMessageID ?? turn.assistant.stableMessageID ?? runtimeState.lastCommittedAssistantMessageID
      clearTurnFromState(runtimeState, turn, source)

      return {
        type: "submit" as const,
        payload: {
          directory: args.directory,
          worktree: args.worktree,
          body: {
            session_id: args.sessionID,
            user_id: runtimeConfig.userId,
            project_id: runtimeConfig.projectId,
            user_content: extracted.user,
            assistant_content: extracted.assistant,
            timeline: extracted.timeline,
          },
          meta: {
            submitted_at: new Date().toISOString(),
            finalize_reason: args.reason,
            turn_epoch: turn.epoch,
            turn_started_at: turn.createdAt,
            turn_updated_at: turn.updatedAt,
            visible_memory_injection: runtimeConfig.visibleMemoryInjection,
            implicit_memory_turns: runtimeConfig.implicitMemoryTurns,
            session_compact_recall: runtimeConfig.sessionCompactRecall,
            assistant_message_id: extracted.assistantMessageID,
            last_committed_assistant_message_id: runtimeState.lastCommittedAssistantMessageID,
            assistant_finish: extracted.assistantFinish,
            assistant_completed_at: extracted.assistantCompletedAt,
            extracted_from_session_messages: extracted.extractedFromSessionMessages,
            background_waiting_likely: turn.background.waitingLikely,
            background_cancel_issued: turn.background.cancelIssued,
            task_hints: turn.background.taskHints,
            turn_phase: turn.phase,
            question_asked: turn.questionAsked,
            followup_status: turn.followup?.status,
            followup_asked_at: turn.followup?.askedAt,
            followup_expires_at: turn.followup?.expiresAt,
            followup_expected_reply_kind: turn.followup?.expectedReplyKind,
            internal_continuation_seen: turn.internalContinuationSeen,
            post_answer_continuation: turn.postAnswerContinuation,
          } as Record<string, unknown>,
        },
      }
    },
  )

  if (result.type === "noop") return

  if (result.type === "skip") {
    await logHookForDirectory(args.directory, "memory.sync.skip", { sessionID: args.sessionID }, undefined, {
      sessionID: args.sessionID,
      sessionStatePath,
      ...result,
    })
    return
  }

  if (isDeletedSessionInDirectory(args.directory, args.sessionID)) {
    await logHookForDirectory(args.directory, "memory.sync.skip", { sessionID: args.sessionID }, undefined, {
      sessionID: args.sessionID,
      sessionStatePath,
      reason: "session-deleted-barrier",
      epoch: args.epoch,
      skippedAfterStateMutation: true,
    }, {
      bypassRootGuard: true,
    })
    return
  }

  result.payload.meta = {
    ...result.payload.meta,
    session_state_path: sessionStatePath,
  }
  await logHookForDirectory(args.directory, "memory.sync.ready", { sessionID: args.sessionID }, result.payload, {
    sessionID: args.sessionID,
  })

  const submitResult: MemorySyncSubmitResult = await submitMemorySyncCandidate({
    client: args.client,
    payload: result.payload,
    config: {
      ...extractTransportConfig(runtimeConfig),
      language: runtimeConfig.language,
      notificationSurfaceMode: runtimeConfig.notificationSurfaceMode,
    },
  })

  await logHookForDirectory(args.directory, "memory.sync.result", { sessionID: args.sessionID }, undefined, {
    sessionID: args.sessionID,
    sessionStatePath,
    submitResult,
  })

  // Refresh the cached profile bundle only after the current turn has really
  // been accepted by VMM, so the refreshed bundle can observe the newest turn
  // without adding more latency to the user-visible request path.
  // 只有当前 turn 已经被 VMM 真正确认接收之后，
  // 才刷新缓存中的画像 bundle，这样新 bundle 才能看到最新 turn，
  // 同时又不会把额外延迟压到用户可见请求路径上。
  if (submitResult.outcome === "accepted") {
    const refreshResult = await maybeRefreshProfileBundleAfterWriteback({
      directory: args.directory,
      sessionID: args.sessionID,
      runtimeConfig,
    })
    await logHookForDirectory(args.directory, "memory.profile_bundle.refresh", { sessionID: args.sessionID }, undefined, {
      sessionID: args.sessionID,
      sessionStatePath,
      refreshResult,
    })
  }
}

/**
 * Extract a background task id from assistant/status text.
 * 从 assistant 或状态文本中提取后台任务 id。
 *
 * This parser helps the turn state recognize when old background work is still
 * flowing back, so those messages do not get mistaken for fresh user turns.
 * 这个解析器用于识别旧后台任务是否仍在回流，
 * 避免这些消息被误判成新的真实用户轮次。
 */
function parseBackgroundTaskID(text: string | undefined) {
  const source = normalizeText(text)
  if (!source) return undefined
  const match =
    source.match(/Background Task ID[:：]\s*([A-Za-z0-9_-]+)/u) ??
    source.match(/session_id[:：]\s*([A-Za-z0-9_-]+)/u)
  return match?.[1]
}

/**
 * Build the pre-answer payload for the backend PreCheck RPC.
 * 为后端 PreCheck RPC 构建回答前 payload。
 *
 * The backend still only needs identity fields plus the current user text,
 * but it now also expects one explicit recall mode so legacy and
 * session-compact-aware retrieval can stay deterministic.
 * 后端虽然仍然只需要身份字段和当前用户文本，
 * 但现在还要求显式传一条 recall mode，让 legacy 与 session-compact-aware
 * 两种检索路径都保持确定性。
 */
function buildMemoryContextPayload(args: {
  sessionID: string
  runtimeConfig: VmmRuntimeConfig
  query: string
}) {
  return {
    session_id: args.sessionID,
    user_id: args.runtimeConfig.userId,
    project_id: args.runtimeConfig.projectId,
    user_content: compactForMemorySync(args.query, 2500),
    recall_mode: resolvePreCheckRecallMode(args.runtimeConfig),
  }
}

/**
 * Resolve the PreCheck recall mode from the current runtime switch.
 * 根据当前运行时开关解析 PreCheck recall mode。
 *
 * One config switch governs both compact notifications and compact-aware
 * recall. Resolving the enum in one helper keeps those two transport paths on
 * the same behavioral contract.
 * 同一个配置开关会同时控制 compact 通知与 compact-aware recall。
 * 在一个辅助函数里统一解析枚举，可以让这两条传输链始终遵循同一套行为契约。
 */
function resolvePreCheckRecallMode(
  runtimeConfig: Pick<VmmRuntimeConfig, "sessionCompactRecall">,
): VmmGrpcPreCheckRecallMode {
  return runtimeConfig.sessionCompactRecall
    ? "PRE_CHECK_RECALL_MODE_SESSION_COMPACT"
    : "PRE_CHECK_RECALL_MODE_LEGACY"
}

/**
 * Build the compact acknowledgement payload for the backend ChatCompact RPC.
 * 为后端 ChatCompact RPC 构建 compact 确认 payload。
 *
 * The hook-facing contract is intentionally minimal: once the current session,
 * user, and project are resolved, the backend can mark the compact boundary
 * deterministically without any additional host-only fields.
 * 这条 hook 对接契约被故意压到最小：只要当前 session、user 和 project
 * 已经解析完成，后端就可以在不依赖任何宿主私有字段的前提下确定性地标记 compact 边界。
 */
function buildChatCompactPayload(args: {
  sessionID: string
  runtimeConfig: VmmRuntimeConfig
}): VmmGrpcChatCompactRequest {
  return {
    session_id: args.sessionID,
    user_id: args.runtimeConfig.userId,
    project_id: args.runtimeConfig.projectId,
  }
}

/**
 * Plugin entry that wires OpenCode hooks into VMM state and transport.
 * 插件入口，负责把 OpenCode hooks 接到 VMM 的状态机与传输层。
 *
 * This function sits at the orchestration boundary: it receives raw host
 * events, normalizes them into turn/session state, and triggers transport only
 * when the extraction layer has produced a safe committed result.
 * 这个函数位于编排边界上：
 * 它接收宿主原始事件，整理成 turn/session 状态，
 * 并且只在提取层确认结果可提交时才触发传输层。
 */
const VmmOpenCodePlugin = async (ctx: {
  directory: string
  worktree: string
  serverUrl: URL
  client: unknown
}) => {
  const client = ctx.client as VmmClient
  const vmmFeatureStatus = await loadVmmFeatureStatus(ctx.directory)
  const luaSkillTools = await buildVmmLuaSkillTools(ctx.directory)
  const memoryTools = vmmFeatureStatus.enabled
    ? await buildVmmMemoryTools(ctx.directory)
    : {}
  const runtimeScopeAccessor = createPluginRuntimeScopeAccessor({
    directory: ctx.directory,
  })

  /**
   * Resolve the latest directory-bound runtime scope for this plugin instance.
   * 为当前插件实例解析最新的目录绑定运行时作用域。
   *
   * Idle scopes can now be released from the registry and recreated later.
   * Reading through this accessor keeps later events attached to the current
   * shared scope instead of mutating one stale object captured at startup.
   * 现在 idle scope 可能会从注册表里被释放，并在后续按需重建。
   * 通过这个访问器读取，可以保证后续事件始终连接到当前共享 scope，
   * 而不是继续修改启动时捕获的一份陈旧对象。
   */
  const getRuntimeScope = () => runtimeScopeAccessor.getScope()

  /**
   * Directory-bound root-session check for the current plugin instance.
   * 当前插件实例使用的、绑定到目录的 root-session 检查函数。
   *
   * The plugin factory works per directory, so this wrapper keeps later hook
   * code on the correct runtime scope without repeating the directory argument.
   * 插件工厂是按目录工作的，
   * 因此这个包装函数可以让后续 hook 始终落在正确的运行时作用域上，
   * 而不必在每个调用点反复传递目录参数。
   */
  const isRootSession = (sessionID: string | undefined) =>
    isRootSessionInDirectory(ctx.directory, sessionID)

  /**
   * Directory-bound deleted-session barrier check for the current plugin instance.
   * 当前插件实例使用的、绑定到目录的删除会话屏障检查函数。
   *
   * Once a host session is explicitly deleted, late events for that session
   * must be blocked before they can re-enter root admission or state
   * persistence paths.
   * 一旦宿主显式删除某个 session，
   * 该 session 的迟到事件就必须在重新进入 root 准入或状态持久化链路前被拦住。
   */
  const isDeletedSession = (sessionID: string | undefined) =>
    isDeletedSessionInDirectory(ctx.directory, sessionID)

  /**
   * Directory-bound root-session recorder for the current plugin instance.
   * 当前插件实例使用的、绑定到目录的 root-session 记录函数。
   *
   * Compact and chat hooks should update the same directory scope they read
   * from, otherwise hot-path cache behavior drifts across workspaces.
   * compact 与 chat hook 必须写回它们正在读取的同一份目录作用域，
   * 否则热路径缓存行为就会在不同工作区之间逐渐漂移。
   */
  const registerRootSession = (sessionID: string | undefined) =>
    registerRootSessionInDirectory(ctx.directory, sessionID)

  /**
   * Directory-bound deleted-session barrier recorder for the current plugin instance.
   * 当前插件实例使用的、绑定到目录的删除会话屏障记录函数。
   *
   * Session deletion establishes this barrier immediately so later late-arrival
   * events can be rejected even before queued persistence cleanup completes.
   * session 删除会立刻建立这道屏障，
   * 这样即使排队中的持久化清理还没完成，后续迟到事件也能先被拒绝。
   */
  const registerDeletedSession = (sessionID: string | undefined) =>
    registerDeletedSessionInDirectory(ctx.directory, sessionID)

  /**
   * Directory-bound lifecycle logger used by the current plugin instance.
   * 当前插件实例使用的、绑定到目录的生命周期日志函数。
   *
   * Root-guarded log decisions must resolve against the same directory scope as
   * the rest of this plugin instance.
   * root-guarded 日志是否放行，必须和当前插件实例的其他状态判断一样，
   * 落在同一份目录作用域上解析。
   */
  const logHook = (
    kind: string,
    input: unknown,
    output?: unknown,
    extra?: Record<string, unknown>,
    options?: {
      bypassRootGuard?: boolean
    },
  ) => logHookForDirectory(ctx.directory, kind, input, output, extra, options)

  const getFinalizeTimerKey = (sessionID: string, epoch: number | undefined) =>
    `${sessionID}:${typeof epoch === "number" ? epoch : "active"}`

  const cancelFinalize = async (sessionID: string, epoch: number | undefined, reason: string) => {
    const timerKey = getFinalizeTimerKey(sessionID, epoch)
    const finalizeTimers = getRuntimeScope().finalizeTimers
    const timer = finalizeTimers.get(timerKey)
    if (!timer) return
    clearTimeout(timer)
    finalizeTimers.delete(timerKey)
    await logHook("memory.finalize.cancelled", { sessionID }, undefined, {
      sessionID,
      epoch,
      reason,
    })
  }

  const cancelFinalizeForSession = async (sessionID: string, reason: string) => {
    const keys = drainFinalizeTimersForSession(sessionID)
    if (keys.length > 0) {
      await logHook("memory.finalize.cancelled", { sessionID }, undefined, {
        sessionID,
        reason,
        allEpochs: true,
      })
    }
  }

  /**
   * Drain every finalize timer currently owned by one session without waiting.
   * 立即清空某个 session 当前持有的全部 finalize timer。
   *
   * Session deletion needs this synchronous barrier before the persisted
   * cleanup gets its turn in the session queue. Otherwise a late finalize
   * timer may still fire during the deletion wait window and submit stale
   * memory sync for a session that has already been declared deleted.
   * session 删除需要这道同步屏障先行建立，
   * 不能等排队中的持久化清理真正轮到时才取消 timer。
   * 否则在删除等待窗口里，迟到的 finalize timer 仍可能触发，
   * 为一个已经被声明删除的 session 提交过期的 memory sync。
   */
  const drainFinalizeTimersForSession = (sessionID: string) => {
    const finalizeTimers = getRuntimeScope().finalizeTimers
    const keys = [...finalizeTimers.keys()].filter((key) => key.startsWith(`${sessionID}:`))
    for (const key of keys) {
      const timer = finalizeTimers.get(key)
      if (!timer) continue
      clearTimeout(timer)
      finalizeTimers.delete(key)
    }
    return keys
  }

  const scheduleFinalize = async (sessionID: string, epoch: number | undefined, reason: string) => {
    if (!vmmFeatureStatus.enabled) {
      await logHook("memory.finalize.skipped", { sessionID }, undefined, {
        sessionID,
        epoch,
        reason,
        skipped: "plugin-disabled-vmm-backend",
        vmmFeatureStatus,
      })
      return
    }

    if (isDeletedSession(sessionID)) {
      await logHook("memory.finalize.skipped", { sessionID }, undefined, {
        sessionID,
        epoch,
        reason,
        skipped: "session-deleted-barrier",
      }, {
        bypassRootGuard: true,
      })
      return
    }

    const timerKey = getFinalizeTimerKey(sessionID, epoch)
    const finalizeTimers = getRuntimeScope().finalizeTimers
    const existing = finalizeTimers.get(timerKey)
    if (existing) {
      clearTimeout(existing)
      finalizeTimers.delete(timerKey)
    }

    const timer = setTimeout(() => {
      void (async () => {
        getRuntimeScope().finalizeTimers.delete(timerKey)
        try {
          await finalizeSessionTurn({
            client,
            directory: ctx.directory,
            worktree: ctx.worktree,
            sessionID,
            epoch,
            reason,
            vmmFeatureStatus,
          })
        } finally {
          releasePluginRuntimeScopeIfIdle({
            directory: ctx.directory,
          })
        }
      })()
    }, FINALIZE_SETTLE_DELAY_MS)

    // Skip scheduling if the finalize timer budget is already exhausted.
    // 如果 finalize 定时器预算已耗尽，则跳过调度。
    if (finalizeTimers.size >= MAX_FINALIZE_TIMERS) {
      clearTimeout(timer)
      await logHook("memory.finalize.skipped", { sessionID }, undefined, {
        sessionID,
        epoch,
        reason,
        skipReason: "max_finalize_timers_reached",
      })
      return
    }

    finalizeTimers.set(timerKey, timer)
    await logHook("memory.finalize.scheduled", { sessionID }, undefined, {
      sessionID,
      epoch,
      reason,
      delayMs: FINALIZE_SETTLE_DELAY_MS,
    })
  }

  return {
    tool: {
      ...memoryTools,
      ...luaSkillTools,
    },

    "experimental.session.compacting": async (
      input: {
        sessionID: string
      },
      _output: {
        context: string[]
        prompt?: string
      },
    ) => {
      const sessionID = input.sessionID
      if (!sessionID) {
        await logHook("memory.compact.notify", { sessionID }, undefined, {
          sessionID,
          skipped: "missing-session-id",
        })
        return
      }

      if (isDeletedSession(sessionID)) {
        await logHook("memory.compact.notify", { sessionID }, undefined, {
          sessionID,
          skipped: "session-deleted-barrier",
        }, {
          bypassRootGuard: true,
        })
        return
      }

      // Compact notifications must stay root-session only, otherwise child or
      // background sessions could incorrectly advance the VMM compact anchor
      // for the real conversation thread.
      // compact 通知必须严格限定在 root session 内，
      // 否则子会话或后台会话也可能错误推进真实对话线程的 VMM compact 边界。
      const rootProbe = await probeRootSession({
        client,
        directory: ctx.directory,
        sessionID,
        knownRootSessionIDs: getRuntimeScope().rootSessionProbeCache,
      })
      if (!rootProbe.isRoot) {
        await logHook("memory.compact.notify", { sessionID }, undefined, {
          sessionID,
          skipped: "non-root-session",
          rootProbe,
        })
        return
      }
      registerRootSession(sessionID)

      if (!vmmFeatureStatus.enabled) {
        await logHook("memory.compact.notify", { sessionID }, undefined, {
          sessionID,
          skipped: "plugin-disabled-vmm-backend",
          vmmFeatureStatus,
        })
        return
      }

      const runtimeConfig = await loadVmmConfig(ctx.directory)
      const scopeDiagnosis = diagnoseVmmBusinessScope(runtimeConfig)
      if (!scopeDiagnosis.enabled) {
        await logHook("memory.compact.notify", { sessionID }, undefined, {
          sessionID,
          skipped: "plugin-disabled-missing-business-scope",
          businessScopeReason: scopeDiagnosis.reason,
          missingBusinessBindings: scopeDiagnosis.missingFields,
          invalidBusinessBindings: scopeDiagnosis.invalidFields,
        })
        return
      }

      if (!runtimeConfig.sessionCompactRecall) {
        await logHook("memory.compact.notify", { sessionID }, undefined, {
          sessionID,
          skipped: "session-compact-recall-disabled",
        })
        return
      }

      const request = buildChatCompactPayload({
        sessionID,
        runtimeConfig,
      })
      const result = await callVmmChatCompact({
        request,
        config: extractTransportConfig(runtimeConfig),
      })

      await logHook("memory.compact.notify", { sessionID }, undefined, {
        sessionID,
        request,
        result,
      })
    },

    event: async ({ event }: { event: unknown }) => {
      const summary = summarizeEvent(event)
      if (!summary) return

      const sessionID = getSessionIDFromEvent(event)
      if (summary.type === "session.created") {
        const created = summary.info
        if (created?.id) {
          if (isDeletedSession(created.id)) {
            await logHook("event.state.updated", { sessionID: created.id }, undefined, {
              sessionID: created.id,
              type: "session.created",
              skipped: "session-deleted-barrier",
            }, {
              bypassRootGuard: true,
            })
            return
          }

          // `session.created` is only a hint that a new session exists; it is
          // not strong enough by itself to permanently classify that session
          // as root. Reuse the same host-backed admission path as other
          // root-only flows so incomplete event payloads cannot poison the
          // cache.
          // `session.created` 只能说明“有个新 session 被创建了”，
          // 但它本身不足以永久把该 session 判成 root。
          // 这里复用与其他 root-only 链路相同的宿主探测准入路径，
          // 避免不完整事件载荷继续污染 root 缓存。
          const rootAdmission = await admitRootSession({
            client,
            directory: ctx.directory,
            sessionID: created.id,
            knownRootSessionIDs: getRuntimeScope().rootSessionAdmissionCache,
            eventHint: {
              kind: "session.created",
              id: created.id,
              parentID: created.parentID,
            },
          })
          if (!rootAdmission.admitted) {
            await logHook("event.state.updated", { sessionID: created.id }, undefined, {
              sessionID: created.id,
              type: "session.created",
              skipped: "non-root-session",
              rootAdmission,
            })
            return
          }

          const { result: initialState, sessionStatePath } = await withSerializedSessionState(
            ctx.directory,
            created.id,
            (runtimeState) => {
              runtimeState.lastTouchedAt = Date.now()
              runtimeState.initialProfileFetchPending = true
              return {
                initialProfileFetchPending: runtimeState.initialProfileFetchPending,
                turnCount: runtimeState.turnCount,
              }
            },
          )
          await logHook("event.state.updated", { sessionID: created.id }, undefined, {
            sessionID: created.id,
            type: "session.created",
            sessionStatePath,
            ...initialState,
          })
        }
      }

      if (sessionID && summary.type !== "session.deleted" && isDeletedSession(sessionID)) {
        await logHook("event.state.updated", { sessionID }, undefined, {
          sessionID,
          type: summary.type,
          skipped: "session-deleted-barrier",
        }, {
          bypassRootGuard: true,
        })
        return
      }

      if (sessionID && summary.type !== "session.deleted" && !isRootSession(sessionID)) return
      if (sessionID && summary.type !== "session.deleted") {
        /**
         * Refresh root-session warmth only after the event truly passes the
         * root-only guard, so real root activity extends cache life while
         * read-only log guards stay side-effect free.
         * 只有当事件真正通过 root-only 守卫后，才刷新 root-session 的活跃度。
         * 这样真实的 root 活动仍会续期缓存，而纯日志守卫继续保持无副作用。
         */
        registerRootSession(sessionID)
      }

      if (sessionID) {
        const eventRecord = event as { type?: string; properties?: Record<string, unknown> }
        const type = eventRecord?.type
        const props = eventRecord?.properties ?? {}

        if (type === "session.deleted") {
          registerDeletedSession(sessionID)

          /**
           * Establish the deletion barrier immediately on event receipt.
           * 在收到删除事件的第一时间建立删除屏障。
           *
           * Persisted-state cleanup may still need to wait behind earlier
           * same-session mutations, but late root-guarded events and finalize
           * timers must stop immediately once the host has declared the session
           * deleted. Otherwise stale work queued after the delete event could
           * recreate runtime state or even submit a late finalized turn.
           * 持久化状态清理仍可能要排在更早的同 session 修改后面，
           * 但一旦宿主已经声明该 session 删除，
           * 迟到的 root-guarded 事件和 finalize timer 就必须立刻停止。
           * 否则删除事件之后排队进来的陈旧工作仍可能把运行时状态重新写活，
           * 甚至提交一条晚到的 finalized turn。
           */
          const preclearedFinalizeTimerKeys = drainFinalizeTimersForSession(sessionID)
          const preclearedDedupeState = clearSessionEventDedupeState({
            state: getRuntimeScope().sessionEventDedupe,
            sessionID,
          })
          const preclearedRootSessionRemoved = deleteRootSession({
            state: getRuntimeScope().rootSessionRegistry,
            sessionID,
          })

          if (preclearedFinalizeTimerKeys.length > 0) {
            await logHook("memory.finalize.cancelled", { sessionID }, undefined, {
              sessionID,
              reason: "session-deleted",
              allEpochs: true,
              barrierPrecleared: true,
              clearedTimerCount: preclearedFinalizeTimerKeys.length,
            }, {
              bypassRootGuard: true,
            })
          }

          // Deleted-session cleanup must always release in-memory ownership
          // state, even if finalize cancellation or persisted-state cleanup
          // fails. Otherwise a long-running plugin process can keep poisoning
          // future sessions with stale root/dedupe state.
          // 已删除 session 的清理必须保证把内存归属状态释放干净，
          // 即便 finalize 取消或持久化状态删除失败也不能例外。
          // 否则长生命周期插件进程会继续用陈旧的 root / dedupe 状态污染后续会话。
          const disposal = await disposeSessionRuntime({
            sessionID,
            precleared: {
              finalize: {
                handled: true,
                cleared: preclearedFinalizeTimerKeys.length > 0,
              },
              rootSession: {
                handled: true,
                removed: preclearedRootSessionRemoved,
              },
              dedupeState: {
                handled: true,
                result: preclearedDedupeState,
              },
            },
            cancelFinalizeState: async () => {},
            clearPersistedState: async () => {
              await withSerializedStateFile(ctx.directory, sessionID, (stateFile) => {
                delete stateFile.sessions[sessionID]
              })
            },
            clearDedupeState: () => ({
              clearedStatus: false,
              clearedMessageCount: 0,
            }),
            clearRootSession: () => false,
          })
          await logHook("event.state.updated", { sessionID }, undefined, {
            sessionID,
            type,
            cleared: disposal.completedWithoutErrors,
            inMemoryOwnershipCleared: disposal.inMemoryOwnershipCleared,
            disposal,
          }, {
            bypassRootGuard: true,
          })
          releasePluginRuntimeScopeIfIdle({
            directory: ctx.directory,
          })
          return
        }

        if (
          type === "permission.asked" ||
          type === "question.asked" ||
          type === "question.replied" ||
          type === "question.rejected" ||
          type === "session.error" ||
          type === "session.idle" ||
          type === "message.updated" ||
          type === "session.status"
        ) {
          if (!vmmFeatureStatus.enabled) {
            await logHook("event.state.updated", { sessionID }, undefined, {
              sessionID,
              type,
              skipped: "plugin-disabled-vmm-backend",
              vmmFeatureStatus,
            })
            return
          }

          const runtimeConfig = await loadVmmConfig(ctx.directory)
          // Event-side memory bookkeeping is skipped entirely until the full
          // business scope is ready, so partial config never leaves the plugin
          // in a half-active state.
          // 只有在完整业务作用域就绪后，事件侧的记忆状态更新才会启用，
          // 避免配置半成品阶段出现“看似开启、实际不可用”的半激活状态。
          const scopeDiagnosis = diagnoseVmmBusinessScope(runtimeConfig)
          if (!scopeDiagnosis.enabled) {
            await logHook("event.state.updated", { sessionID }, undefined, {
              sessionID,
              type,
              skipped: "plugin-disabled-missing-business-scope",
              businessScopeReason: scopeDiagnosis.reason,
              missingBusinessBindings: scopeDiagnosis.missingFields,
              invalidBusinessBindings: scopeDiagnosis.invalidFields,
            })
            return
          }

          /**
           * Dedupe only after the event has cleared root-session and business-scope
           * eligibility checks.
           * 只有在事件已经通过 root-session 与 business-scope 资格校验后，
           * 才允许把它写入 dedupe 状态。
           *
           * Earlier eager dedupe let skipped events from non-processable paths
           * pollute session-owned caches, which could both retain dead state and
           * suppress the first later event that finally became processable.
           * 过早去重会让那些“本来就不会进入处理链”的事件污染 session 级缓存，
           * 不仅容易滞留无效状态，也可能把后续第一条真正可处理的事件一起压掉。
           */
          if (
            !shouldProcessSessionEventSummary({
              state: getRuntimeScope().sessionEventDedupe,
              summary,
            })
          ) {
            return
          }

          const { result, sessionStatePath } = await withSerializedSessionState(
            ctx.directory,
            sessionID,
            (runtimeState) => {
              runtimeState.lastTouchedAt = Date.now()

              if (type === "permission.asked") {
                markTurnPermissionAsked(runtimeState.activeTurn)
              }

              if (type === "question.asked") {
                const questions = extractFollowupQuestions(props["questions"])
                recordTurnQuestionAsked(runtimeState.activeTurn, {
                  requestID: typeof props["id"] === "string" ? props["id"] : undefined,
                  promptText: typeof props["message"] === "string" ? props["message"] : undefined,
                  questions,
                })
              }

              if (type === "question.replied") {
                const requestID = typeof props["requestID"] === "string" ? props["requestID"] : undefined
                const turn = getTurnForFollowupRequest(runtimeState, requestID)
                markTurnQuestionReplied(turn, requestID, extractQuestionAnswers(props["answers"]))
              }

              if (type === "question.rejected") {
                const requestID = typeof props["requestID"] === "string" ? props["requestID"] : undefined
                const turn = getTurnForFollowupRequest(runtimeState, requestID)
                markTurnQuestionRejected(turn, requestID)
              }

              if (type === "session.error") {
                const error =
                  props["error"] && typeof props["error"] === "object"
                    ? (props["error"] as Record<string, unknown>)
                    : undefined
                markTurnErrored(
                  runtimeState.activeTurn,
                  typeof error?.["name"] === "string" ? error["name"] : undefined,
                  typeof error?.["message"] === "string" ? error["message"] : undefined,
                )
              }

              // Capture the pre-update stability snapshot so we can detect
              // whether this exact message.updated event promoted the turn
              // into a stable, submittable state.
              // 先捕获更新前的稳定态快照，
              // 这样后面才能判断是不是这条 message.updated
              // 把当前 turn 推进到了可提交的稳定状态。
              const hadStableAssistantBeforeMessageUpdate =
                type === "message.updated" ? turnHasStableAssistant(runtimeState.activeTurn) : false

              if (type === "message.updated") {
                const messageInfo = summarizeMessageInfo(props["info"])
                applyAssistantMessageUpdate(runtimeState.activeTurn, messageInfo)
              }

              const status =
                type === "session.status" &&
                props["status"] &&
                typeof props["status"] === "object"
                  ? (props["status"] as Record<string, unknown>)
                  : undefined
              const statusType = typeof status?.["type"] === "string" ? status["type"] : undefined

              return {
                statusType,
                activeEpoch: runtimeState.activeTurn?.epoch,
                sealedTurnEpochs: runtimeState.sealedTurns.map((turn) => turn.epoch),
                activeTurn: runtimeState.activeTurn
                  ? {
                      epoch: runtimeState.activeTurn.epoch,
                      phase: runtimeState.activeTurn.phase,
                      awaitingFollowup: runtimeState.activeTurn.awaitingFollowup,
                      permissionAsked: runtimeState.activeTurn.permissionAsked,
                      questionAsked: runtimeState.activeTurn.questionAsked,
                      followupStatus: runtimeState.activeTurn.followup?.status,
                      followupRequestID: runtimeState.activeTurn.followup?.requestID,
                      followupQuestionCount: runtimeState.activeTurn.followup?.questions?.length,
                      followupHasAnswer: Boolean(runtimeState.activeTurn.followup?.answerText),
                      hardInterrupted: runtimeState.activeTurn.hardInterrupted,
                      errored: runtimeState.activeTurn.errored,
                      aborted: runtimeState.activeTurn.aborted,
                      superseded: runtimeState.activeTurn.superseded,
                      hasStableAssistant: turnHasStableAssistant(runtimeState.activeTurn),
                      stableFinish: runtimeState.activeTurn.assistant.stableFinish,
                      stableMessageID: runtimeState.activeTurn.assistant.stableMessageID,
                    }
                  : undefined,
                messageUpdateTransition: {
                  becameStable:
                    type === "message.updated" &&
                    !hadStableAssistantBeforeMessageUpdate &&
                    turnHasStableAssistant(runtimeState.activeTurn),
                },
              }
            },
          )

          if (
            shouldCancelFinalizeOnSessionStatus({
              statusType: result.statusType,
              activeTurn: result.activeTurn
                ? {
                    hasStableAssistant: result.activeTurn.hasStableAssistant,
                  }
                : undefined,
            }) &&
            typeof result.activeEpoch === "number"
          ) {
            await cancelFinalize(
              sessionID,
              result.activeEpoch,
              `session-status-${result.statusType}`,
            )
          }

          // Finalize scheduling now consumes one normalized completion-signal
          // adapter: `session.idle` keeps the legacy hint, while a late
          // assistant completion update can re-arm finalize without changing
          // the underlying turn-splitting state machine.
          // finalize 调度现在统一走一层完成信号适配：
          // `session.idle` 继续保留历史提示语义，
          // 较晚到达的 assistant 完成更新则可以在不改变 turn 切分状态机的前提下重新挂起 finalize。
          const completionSignal = resolveFinalizeCompletionSignal({
            eventType: type,
            messageUpdateTransition: result.messageUpdateTransition,
          })

          if (completionSignal && typeof result.activeEpoch === "number") {
            await scheduleFinalize(sessionID, result.activeEpoch, completionSignal)
          }

          await logHook("event.state.updated", { sessionID }, undefined, {
            sessionID,
            type,
            sessionStatePath,
            sealedTurnEpochs: result.sealedTurnEpochs,
            activeTurn: result.activeTurn,
          })
        }
      }

      void writeLog({
        kind: "event",
        sessionID,
        data: { event: summary },
      })
    },

    "chat.message": async (input: unknown, output: unknown) => {
      const sessionID = getSessionID(input)
      if (sessionID && isDeletedSession(sessionID)) {
        await logHook("chat.message", input, summarizeChatMessage(output), {
          skipped: "session-deleted-barrier",
        }, {
          bypassRootGuard: true,
        })
        return
      }

      if (sessionID && !isRootSession(sessionID) && isTopLevelUserMessage(input)) {
        const rootAdmission = await admitRootSession({
          client,
          directory: ctx.directory,
          sessionID,
          knownRootSessionIDs: getRuntimeScope().rootSessionAdmissionCache,
        })
        if (!rootAdmission.admitted) {
          await logHook("chat.message", input, summarizeChatMessage(output), {
            skipped: "non-root-session",
            rootAdmission,
          })
          return
        }
      }
      if (!isRootSession(sessionID)) return
      registerRootSession(sessionID)

      const joinedText = naturalizeUserMessageParts((output as Record<string, unknown>)["parts"]).combinedText
      if (!joinedText) {
        await logHook("chat.message", input, summarizeChatMessage(output), {
          skipped: "empty-user-text",
        })
        return
      }

      if (!vmmFeatureStatus.enabled) {
        await logHook("chat.message", input, summarizeChatMessage(output), {
          skipped: "plugin-disabled-vmm-backend",
          vmmFeatureStatus,
        })
        return
      }

      const runtimeConfig = await loadVmmConfig(ctx.directory)

      // Always pin the fixed VMM citation policy to the hidden system prompt
      // before any later branch appends profile, memory, or warning blocks.
      // 先把固定 VMM 引用规则钉到隐藏 system prompt 顶部，
      // 再进入后续分支追加画像、记忆或告警区块。
      const criticalCitationRulesInjected = ensureCriticalCitationRulesSystem(output, runtimeConfig.language)
      // Chat-time retrieval is disabled early until the full business scope is
      // ready, so normal chat never waits on a backend with incomplete user or
      // project bindings.
      // 在完整业务作用域就绪之前，聊天入口会尽早停用记忆检索，
      // 这样普通对话就不会去等待一个 user/project 绑定还不完整的后端。
      const scopeDiagnosis = diagnoseVmmBusinessScope(runtimeConfig)
      if (!scopeDiagnosis.enabled) {
        const warningRoute = resolveRuntimeNotificationRoute(runtimeConfig, "warning")
        const runtimeNoticeInjected =
          scopeDiagnosis.toastMessage && warningRoute.visibleAnswerNotice
            ? appendToUserMessageSystem(
              output,
              renderUserVisibleRuntimeNoticeSystem(scopeDiagnosis.toastMessage),
              runtimeConfig.language,
            )
            : false
        if (scopeDiagnosis.toastMessage && warningRoute.toast) {
          void showToast(client, ctx.directory, scopeDiagnosis.toastMessage, "warning")
        }
        await logHook("chat.message", input, summarizeChatMessage(output), {
          skipped: "plugin-disabled-missing-business-scope",
          businessScopeReason: scopeDiagnosis.reason,
          missingBusinessBindings: scopeDiagnosis.missingFields,
          invalidBusinessBindings: scopeDiagnosis.invalidFields,
          criticalCitationRulesInjected,
          runtimeNoticeInjected,
        })
        return
      }

      const effectiveSessionID = sessionID ?? "unknown"
      const activeEpochBeforeMessage = sessionID
        ? (await withSerializedSessionState(ctx.directory, effectiveSessionID, (runtimeState) => {
            runtimeState.lastTouchedAt = Date.now()
            runtimeState.skipNextApiSyncReason = undefined
            return runtimeState.activeTurn?.epoch
          })).result
        : undefined

      if (sessionID && typeof activeEpochBeforeMessage === "number") {
        await cancelFinalize(sessionID, activeEpochBeforeMessage, "incoming-chat-message")
      }

      if (isInternalContinuation(joinedText)) {
        const { result, sessionStatePath } = await withSerializedSessionState(
          ctx.directory,
          effectiveSessionID,
          (runtimeState) => {
            noteInternalContinuationOnTurn(runtimeState.activeTurn)
            return {
              activeTurnEpoch: runtimeState.activeTurn?.epoch,
            }
          },
        )
        await logHook("chat.message", input, summarizeChatMessage(output), {
          skipped: "internal-continuation",
          criticalCitationRulesInjected,
          sessionStatePath,
          activeTurnEpoch: result.activeTurnEpoch,
        })
        return
      }

      // Warm the persisted profile bundle before the main turn orchestration so
      // every real user request can reuse one hidden bundle block that matches
      // the current user/project binding.
      // 在主 turn 编排前先预热持久化的画像 bundle，
      // 这样每次真实用户请求都能复用一份和当前 user/project 绑定一致的隐藏画像块。
      let profileWarmupSummary:
        | Awaited<ReturnType<typeof applyProfileBundleWarmup>>
        | undefined
      let profileBundleInjected = false
      if (sessionID) {
        const profileWarmup = await prepareProfileBundleWarmup({
          client,
          directory: ctx.directory,
          sessionID,
          runtimeConfig,
        })
        profileWarmupSummary = await applyProfileBundleWarmup({
          directory: ctx.directory,
          sessionID,
          runtimeConfig,
          warmup: profileWarmup,
        })

        if (profileWarmupSummary.injectedBundleText) {
          profileBundleInjected = appendToUserMessageSystem(
            output,
            renderImplicitProfileBundleSystem(profileWarmupSummary.injectedBundleText),
            runtimeConfig.language,
          )
        }

      }

      const { result, sessionStatePath } = await withSerializedSessionState(
        ctx.directory,
        effectiveSessionID,
        async (runtimeState) => {
          runtimeState.lastTouchedAt = Date.now()
          runtimeState.skipNextApiSyncReason = undefined

          // First decide whether the user message should merge into the current
          // active turn or open a fresh real turn.
          // 先判断这条用户消息应该并入当前 active turn，
          // 还是开启一个新的真实 turn。
          const { turn, merged, supersededPrevious, openedNewTurn, sealedEpoch } = openOrMergeActiveTurn(
            runtimeState,
            joinedText,
            getMessageID(input),
          )

          const turnIndex = turn?.epoch ?? runtimeState.currentEpoch
          let contextPayload:
            | ReturnType<typeof buildMemoryContextPayload>
            | undefined
          let contextResult:
            | Awaited<ReturnType<typeof requestMemoryContext>>
            | undefined
          let contextPresentationResult:
            | ReturnType<typeof derivePresentedPreCheckMemoryResult>
            | undefined
          let rewritten = false
          let userSystemInjected = false
          let runtimeNoticeInjected = false
          /**
           * Track candidate lines separately from lines that were actually
           * committed into the current turn payload.
           * 把“候选注入行”和“真正写进当前轮载荷的注入行”拆开记录。
           *
           * PreCheck can return memory hits even when prompt mutation later
           * fails. User-facing success notices must only follow the committed
           * lines; otherwise the UI claims injection succeeded while the model
           * never received those lines.
           * PreCheck 可能先返回命中结果，但后续 prompt 改写仍可能失败。
           * 用户可见成功提示只能跟随真正落到当前轮载荷里的那部分行，
           * 否则界面会误报“已注入”，但模型实际上并没有收到这些内容。
           */
          let candidateInjectedLines: string[] = []
          let committedInjectedLines: string[] = []
          /**
           * Keep a separate presentation-only line set for user-visible recall
           * notices. Hidden carry-over memory may still be injected implicitly,
           * but the user only asked to see counts for fresh PreCheck hits.
           * 额外维护一份仅供展示层使用的注入行集合。
           * 隐式 carry-over 记忆仍然可以继续生效，但用户只希望看到“本轮新回顾命中”的数量。
           */
          let presentedInjectedLines: string[] = []

          if (!merged) {
            // Retrieval is only requested for a new real turn. Merged follow-up
            // messages intentionally reuse the active-turn context instead of
            // re-triggering a fresh retrieval round.
            // 只有新的真实 turn 才会触发检索。
            // 合并到当前轮次的 follow-up 会复用现有上下文，不会重复发起检索。
            contextPayload = buildMemoryContextPayload({
              sessionID: effectiveSessionID,
              runtimeConfig,
              query: getJoinedUserText(turn),
            })

            // Surface the retrieval step before the gRPC request is sent so the
            // user can see that history lookup is part of the current flow,
            // even when the backend later decides not to inject anything.
            // 在真正发起 gRPC 请求前先提示“正在回顾历史中”，
            // 这样即使后端最后判断为“不注入”，用户也能感知当前流程已经进入检索阶段。
            const progressRoute = resolveRuntimeNotificationRoute(runtimeConfig, "progress")
            if (progressRoute.toast) {
              void showToast(
                client,
                ctx.directory,
                tVmmShared(runtimeConfig.language, "recall_in_progress"),
                "info",
              )
            }

            contextResult = await requestMemoryContext({
              client,
              directory: ctx.directory,
              payload: contextPayload,
              config: {
                ...extractTransportConfig(runtimeConfig),
                language: runtimeConfig.language,
                notificationSurfaceMode: runtimeConfig.notificationSurfaceMode,
              },
            })

            // When retrieval already proves the configured user/project binding
            // is invalid, remember that result so the post-answer writeback
            // path does not enqueue another doomed submission.
            // 如果检索阶段已经证明当前 user/project 绑定无效，
            // 这里就提前记住结果，避免回答后写回再追加一条注定失败的提交。
            if (isVmmBusinessScopeRuntimeErrorReason(contextResult.reason)) {
              runtimeState.skipNextApiSyncReason = contextResult.reason
            }

            if (runtimeConfig.visibleMemoryInjection) {
              // Visible mode rewrites the user-visible prompt so the current
              // turn explicitly shows which memory lines were injected.
              // 显式模式会改写用户可见 prompt，
              // 让当前轮次直接展示本次注入了哪些记忆行。
              if (openedNewTurn) {
                runtimeState.activeMemories = []
              }
              if (contextResult.inject) {
                candidateInjectedLines = contextResult.lines
                rewritten = rewriteUserTextParts(
                  (output as Record<string, unknown>)["parts"],
                  contextResult.lines,
                  runtimeConfig.language,
                )
                if (rewritten) {
                  committedInjectedLines = candidateInjectedLines
                  presentedInjectedLines = contextResult.lines
                }
              }
            } else {
              // Implicit mode keeps memory out of the visible user text and
              // instead maintains a warming cache across turns.
              // 隐式模式不会把记忆直接写进用户可见文本，
              // 而是维护一份跨轮次保温的记忆缓存。
              const carriedMemories = openedNewTurn
                ? consumeActiveMemoriesForNewTurn(runtimeState)
                : peekActiveMemories(runtimeState)

              const carriedLines = flattenMemoryLines(carriedMemories)
              const currentRetrievedLines = contextResult.inject ? contextResult.lines : []

              // Newly retrieved implicit memory is stored only when a new real
              // turn starts, so the remaining-turns semantics stay consistent.
              // 新检索到的隐式记忆只会在新的真实 turn 开始时入缓存，
              // 这样 remaining-turns 的语义才保持一致。
              if (
                openedNewTurn &&
                contextResult.inject &&
                currentRetrievedLines.length > 0 &&
                runtimeConfig.implicitMemoryTurns > 0
              ) {
                appendOrRefreshMemory(
                  runtimeState,
                  createRetrievedMemory(currentRetrievedLines, turnIndex, runtimeConfig.implicitMemoryTurns),
                )
              }

              candidateInjectedLines = [...new Set([...carriedLines, ...currentRetrievedLines])]
              if (candidateInjectedLines.length > 0) {
                // Inject the merged implicit memory as system context only after
                // current-turn retrieval and carry-over memory are both known.
                // 只有在“当前轮新召回”与“历史保温记忆”都确定之后，
                // 才把合并后的隐式记忆注入到 system 上下文里。
                userSystemInjected = injectIntoUserMessageSystem(
                  output,
                  candidateInjectedLines,
                  runtimeConfig.language,
                )
                if (userSystemInjected) {
                  committedInjectedLines = candidateInjectedLines
                  presentedInjectedLines = contextResult.inject ? contextResult.lines : []
                }
              }
            }

            /**
             * Derive the user-facing recall result from the final injected lines.
             * 基于最终实际注入的记忆行，推导用户可见的回顾结果。
             *
             * Raw PreCheck may report "no fresh injection" while implicit mode
             * still injects carried memory from previous turns. User-facing
             * notices must follow the final injected payload rather than only
             * the raw retrieval verdict, otherwise the UI says "no memory"
             * while the model actually received memory lines.
             * 原始 PreCheck 可能报告“本轮没有新注入”，
             * 但隐式模式仍可能把前几轮保温中的记忆带入本轮。
             * 因此用户可见提示必须跟随最终注入载荷，而不能只跟随原始检索判定，
             * 否则界面会出现“提示无记忆、实际却已注入”的错配。
             */
            contextPresentationResult = derivePresentedPreCheckMemoryResult(
              contextResult,
              presentedInjectedLines,
            )

            const runtimeNotice = buildMemoryContextRuntimeNotice(
              contextResult,
              runtimeConfig.language,
            )
            const runtimeWarningRoute = resolveRuntimeNotificationRoute(runtimeConfig, "warning")
            if (runtimeNotice && runtimeWarningRoute.visibleAnswerNotice) {
              runtimeNoticeInjected = appendToUserMessageSystem(
                output,
                renderUserVisibleRuntimeNoticeSystem(runtimeNotice),
                runtimeConfig.language,
              )
            }
            if (runtimeNotice && runtimeWarningRoute.toast) {
              void showToast(client, ctx.directory, runtimeNotice, "warning")
            }
          }

          return {
            turn,
            merged,
            openedNewTurn,
            supersededPrevious,
            sealedEpoch,
            turnIndex,
            recallPerformed: !merged,
            recallSkippedReason: merged ? "merged-into-active-turn" : undefined,
            contextPayload,
            contextResult,
            contextPresentationResult,
            rewritten,
            userSystemInjected,
            runtimeNoticeInjected,
            turnMemoryInjected: committedInjectedLines,
            activeMemoryCount: runtimeState.activeMemories.length,
          }
        },
      )

      if (sessionID && typeof result.sealedEpoch === "number") {
        await scheduleFinalize(sessionID, result.sealedEpoch, "new-user-after-stable-answer")
      }

      if (result.recallPerformed && result.contextPayload && result.contextResult) {
        void writeLog({
          kind: "memory.context.result",
          sessionID,
          data: {
            payload: result.contextPayload,
            rawResult: {
              inject: result.contextResult.inject,
              reason: result.contextResult.reason,
              lines: result.contextResult.lines,
            },
            presentedResult: {
              inject: (result.contextPresentationResult ?? result.contextResult).inject,
              reason: (result.contextPresentationResult ?? result.contextResult).reason,
              lines: (result.contextPresentationResult ?? result.contextResult).lines,
            },
          },
        })

        // Mirror the start-of-flow retrieval toast with one completion toast so
        // users can tell whether memory was injected or the lookup ended empty.
        // 用一条结束提示和流程开始提示形成闭环，
        // 让用户能分清本轮是“已注入记忆”还是“检索完成但没有命中内容”。
        const completionToast = buildMemoryContextCompletionToast(
          result.contextPresentationResult ?? result.contextResult,
          runtimeConfig.language,
        )
        if (completionToast && resolveRuntimeNotificationRoute(runtimeConfig, "completion").toast) {
          void showToast(client, ctx.directory, completionToast.message, completionToast.variant)
        }
      }
      await logHook("chat.message", input, {
        ...summarizeChatMessage(output),
        merged: result.merged,
        openedNewTurn: result.openedNewTurn,
        supersededPrevious: result.supersededPrevious,
        sealedEpoch: result.sealedEpoch,
        recallPerformed: result.recallPerformed,
        recallSkippedReason: result.recallSkippedReason,
        rewritten: result.rewritten,
        userSystemInjected: result.userSystemInjected,
        runtimeNoticeInjected: result.runtimeNoticeInjected,
        turnIndex: result.turnIndex,
        runtimeConfig,
        ...(result.contextPayload && result.contextResult
          ? {
              contextPayload: result.contextPayload,
              contextResult: {
                inject: result.contextResult.inject,
                reason: result.contextResult.reason,
                lines: result.contextResult.lines,
              },
              contextPresentationResult: result.contextPresentationResult
                ? {
                    inject: result.contextPresentationResult.inject,
                    reason: result.contextPresentationResult.reason,
                    lines: result.contextPresentationResult.lines,
                  }
                : undefined,
            }
          : {}),
        turnMemoryInjected: result.turnMemoryInjected,
        sessionStatePath,
        activeMemoryCount: result.activeMemoryCount,
        awaitingFollowup: result.turn?.awaitingFollowup,
        criticalCitationRulesInjected,
        profileBundleInjected,
        ...(profileWarmupSummary
          ? {
              profileBundleWarmup: profileWarmupSummary,
            }
          : {}),
      })
    },

    "chat.params": async (input: unknown, output: unknown) => {
      const inputRecord = input as Record<string, unknown>
      const outputRecord = output as Record<string, unknown>
      await logHook(
        "chat.params",
        {
          sessionID: typeof inputRecord["sessionID"] === "string" ? inputRecord["sessionID"] : undefined,
          agent:
            inputRecord["agent"] && typeof inputRecord["agent"] === "object"
              ? (inputRecord["agent"] as Record<string, unknown>)["name"]
              : undefined,
          messageID:
            inputRecord["message"] && typeof inputRecord["message"] === "object"
              ? (inputRecord["message"] as Record<string, unknown>)["id"]
              : undefined,
        },
        {
          temperature: outputRecord["temperature"],
          topP: outputRecord["topP"],
          topK: outputRecord["topK"],
          optionKeys:
            outputRecord["options"] && typeof outputRecord["options"] === "object"
              ? Object.keys(outputRecord["options"] as Record<string, unknown>)
              : [],
        },
      )

      await logHook("llm.request.params", summarizeChatParamsInput(input), {
        temperature: outputRecord["temperature"],
        topP: outputRecord["topP"],
        topK: outputRecord["topK"],
        options: outputRecord["options"],
      })
    },

    "experimental.chat.messages.transform": async (input: unknown, output: unknown) => {
      await logHook("llm.request.messages", input, {
        injected: false,
        messages: sanitizeSessionMessages(output),
      })
    },

    "command.execute.before": async (input: unknown, output: unknown) => {
      const outputRecord = output as Record<string, unknown>
      const parts = Array.isArray(outputRecord["parts"]) ? (outputRecord["parts"] as unknown[]) : []
      await logHook("command.execute.before", input, {
        partTypes: parts
          .map((part) => (part && typeof part === "object" ? (part as Record<string, unknown>)["type"] : undefined))
          .filter((value): value is string => typeof value === "string"),
        textPreview: naturalizeUserMessageParts(parts).combinedText.slice(0, 400),
      })
    },

    "tool.execute.before": async (input: unknown, output: unknown) => {
      const sessionID = getSessionID(input)
      if (sessionID && isRootSession(sessionID)) {
        const inputRecord = input as Record<string, unknown>
        const tool = typeof inputRecord["tool"] === "string" ? inputRecord["tool"] : undefined
        if (tool === "task" || tool === "background_cancel") {
          await withSerializedSessionState(ctx.directory, sessionID, (runtimeState) => {
            runtimeState.lastTouchedAt = Date.now()

            if (tool === "task" && runtimeState.activeTurn) {
              runtimeState.activeTurn.background.waitingLikely = true
              runtimeState.activeTurn.background.taskHints = [
                ...runtimeState.activeTurn.background.taskHints,
                summarizeToolHook(input, output).title ?? "task",
              ].slice(-8)
            }

            if (tool === "background_cancel" && runtimeState.activeTurn) {
              runtimeState.activeTurn.background.cancelIssued = true
            }
          })
        }
      }

      await logHook("tool.execute.before", input, summarizeToolHook(input, output))
    },

    "tool.execute.after": async (input: unknown, output: unknown) => {
      const sessionID = getSessionID(input)
      if (sessionID && isRootSession(sessionID)) {
        const inputRecord = input as Record<string, unknown>
        const outputRecord = output as Record<string, unknown>
        const tool = typeof inputRecord["tool"] === "string" ? inputRecord["tool"] : undefined
        const outputPreview =
          typeof outputRecord["output"] === "string" ? outputRecord["output"] : undefined

        if (tool === "task" || tool === "background_cancel") {
          await withSerializedSessionState(ctx.directory, sessionID, (runtimeState) => {
            runtimeState.lastTouchedAt = Date.now()

            if (tool === "task" && runtimeState.activeTurn) {
              if (outputPreview?.includes("Background task launched")) {
                runtimeState.activeTurn.background.waitingLikely = true
              }
              const taskID = parseBackgroundTaskID(outputPreview)
              if (taskID) {
                runtimeState.activeTurn.background.launchedTaskIDs = [
                  ...runtimeState.activeTurn.background.launchedTaskIDs,
                  taskID,
                ].slice(-12)
              }
            }

            if (tool === "background_cancel" && runtimeState.activeTurn) {
              runtimeState.activeTurn.background.cancelIssued = true
              runtimeState.activeTurn.background.waitingLikely = false
            }
          })
        }
      }

      await logHook("tool.execute.after", input, summarizeToolHook(input, output))
    },

    "experimental.chat.system.transform": async (input: unknown, output: unknown) => {
      await logHook("experimental.chat.system.transform", input, summarizeSystemTransform(input, output), {
        injected: false,
      })
      await logHook(
        "llm.request.system",
        {
          sessionID: getSessionID(input),
          model: getModelTarget(input),
        },
        output,
        {
          injected: false,
        },
      )
    },

    "experimental.text.complete": async (input: unknown, output: unknown) => {
      const sessionID = getSessionID(input)
      if (sessionID && isRootSession(sessionID)) {
        const skipReason = await consumeSkipNextApiSync(ctx.directory, sessionID)
        if (skipReason) {
          const outputRecord = output as Record<string, unknown>
          await logHook("experimental.text.complete", input, {
            text: typeof outputRecord["text"] === "string" ? outputRecord["text"] : undefined,
            skipApiSync: true,
            skipApiSyncReason: skipReason,
          })
          return
        }
      }

      const outputRecord = output as Record<string, unknown>
      if (sessionID && isRootSession(sessionID)) {
        await withSerializedSessionState(ctx.directory, sessionID, (runtimeState) => {
          if (runtimeState.activeTurn) {
            noteAssistantTextOnTurn(
              runtimeState.activeTurn,
              typeof outputRecord["text"] === "string" ? outputRecord["text"] : undefined,
            )
            runtimeState.lastTouchedAt = Date.now()
          }
        })
      }

      await logHook("experimental.text.complete", input, {
        text: typeof outputRecord["text"] === "string" ? outputRecord["text"] : undefined,
      })
    },
  }
}

export default VmmOpenCodePlugin
