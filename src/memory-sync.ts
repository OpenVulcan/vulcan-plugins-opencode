/**
 * Memory sync transport for VMM.
 * VMM 记忆同步传输层。
 *
 * This file belongs to the transport/integration layer. It is used by the
 * plugin runtime after extraction is done, mainly on the pre-answer context
 * retrieval path and the post-answer writeback path.
 * 这个文件属于传输与集成层，会在插件完成对话提取之后被调用，
 * 主要服务于“回答前检索注入”和“回答后写回上报”两条链路。
 */
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import {
  deliverHostToast,
  type HostToastClient,
  type HostToastVariant,
} from "./host-toast.js"
import {
  createWritebackOutboxMutationQueueState,
  runSerializedWritebackOutboxMutation,
} from "./writeback-outbox-mutation-queue.js"
import {
  callVmmListProjects,
  callVmmPostAction,
  callVmmPreCheck,
  callVmmResolveProject,
  callVmmResolveUser,
  normalizeGrpcTarget,
  type VmmGrpcPostActionRequest,
  type VmmGrpcPreCheckRequest,
  type VmmGrpcTimelineItem,
  type VmmGrpcTransportConfig,
  type VmmGrpcUnaryResult,
} from "./vmm-grpc.js"
import {
  resolveVmmNotificationRoute,
  type VmmNotificationStage,
  type VmmNotificationSurfaceMode,
} from "./vmm-notification-routing.js"
import { extractPreCheckContextLines } from "./precheck-context-lines.js"
import { tVmmShared, type VmmLanguage } from "./vmm-language.js"

/**
 * Shared runtime locations for transport logs and retry queue files.
 * 传输层共享路径常量，用于统一日志和重试队列的落盘位置。
 *
 * These values are kept together because both context retrieval and writeback
 * need the same filesystem anchors during debugging and failure recovery.
 * 这些常量集中定义，是因为检索和写回两条链在调试和失败恢复时
 * 都依赖同一组文件系统锚点。
 */
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LOG_DIR = path.join(ROOT_DIR, "logs")
const MEMORY_SYNC_LOG_FILE = path.join(LOG_DIR, "memory-sync-debug.jsonl")
const WRITEBACK_OUTBOX_FILENAME = ".vmm-writeback-outbox.json"

/**
 * Maximum number of workspace health states to retain.
 * 健康状态 Map 的最大容量，防止无限增长。
 *
 * When the limit is reached the oldest entries are pruned to keep memory
 * bounded. If the limit is too low for active workspaces, the eviction
 * window should be raised accordingly.
 * 达到上限时会裁剪最旧的条目，以控制内存占用。
 */
const GRPC_TRANSPORT_HEALTH_STATES_MAX = 500

/**
 * Directory-scoped serialization state for writeback outbox mutations.
 * 写回 outbox 修改使用的按目录串行化状态。
 *
 * The persisted outbox file is shared by every session in one workspace. A
 * dedicated queue keeps load/flush/enqueue/save cycles strictly ordered so
 * concurrent finalize paths cannot overwrite each other's snapshots.
 * 同一工作区里的所有 session 共享同一个持久化 outbox 文件。
 * 因此这里单独维护一份按目录串行化队列，确保 load/flush/enqueue/save
 * 周期严格有序，避免并发 finalize 路径互相覆盖快照。
 */
const writebackOutboxMutationQueueState = createWritebackOutboxMutationQueueState()

/**
 * Delay between background reconnect probe attempts.
 * 后台重连探活之间的固定等待时间。
 *
 * The delay is long enough to avoid hammering an unavailable backend, while
 * still short enough to surface recovery during normal chat usage.
 * 这个间隔既要避免对暂时不可用的后端持续施压，
 * 也要足够短，保证用户在正常对话过程中能较快看到恢复提示。
 */
const GRPC_RECONNECT_RETRY_DELAY_MS = 15000

/**
 * Soft timeout budget for best-effort transport host toasts.
 * 传输层最佳努力宿主 toast 的软超时预算。
 *
 * Web and terminal hosts can expose different notification paths, so
 * transport-side UI hints must degrade quickly instead of blocking recovery
 * or writeback flows.
 * web 和终端宿主可能暴露不同的通知路径，
 * 因此传输层 UI 提示必须尽快降级，而不是卡住恢复或写回流程。
 */
const MEMORY_SYNC_HOST_TOAST_SOFT_TIMEOUT_MS = 250

/**
 * One structured timeline item sent to the writeback API.
 * 写回 API 使用的单条时间线项。
 *
 * The backend consumes timeline items as ordered user/assistant messages, so
 * the plugin keeps the structure explicit instead of sending one flattened
 * outline string.
 * 后端按有序的 user/assistant 消息消费时间线，
 * 因此插件这里显式保留结构，而不再发送一整段扁平化 outline 字符串。
 */
type MemorySyncTimelineItem = VmmGrpcTimelineItem

/**
 * Request body sent to the writeback API.
 * 发送给写回 API 的请求体。
 *
 * This shape matches the external backend contract and intentionally excludes
 * local-only runtime metadata such as worktree paths and debug fields.
 * 这个结构直接对应后端接口协议，
 * 刻意排除了工作目录、调试字段等只在插件本地有意义的运行时元数据。
 */
type MemorySyncWritebackBody = VmmGrpcPostActionRequest

/**
 * Internal writeback payload wrapper used by transport, logs, and retry queue.
 * 供传输层、日志和重试队列使用的内部写回 payload 包装结构。
 *
 * The plugin still needs local filesystem context and debug metadata around the
 * API body, so those fields stay outside the external request body.
 * 插件在 API 请求体之外，仍然需要本地文件系统上下文和调试元数据，
 * 因此这些字段会保留在外层包装结构里。
 */
type MemorySyncPayload = {
  directory: string
  worktree: string
  body: MemorySyncWritebackBody
  meta: Record<string, unknown>
}

/**
 * Retrieval payload used before the assistant starts a new real turn.
 * 回答前检索 payload 类型。
 *
 * The current PreCheck RPC contract is intentionally minimal and only
 * carries the identity fields plus the current user text to be cleaned and
 * judged by the backend.
 * 当前 PreCheck RPC 协议被刻意收窄，
 * 只携带身份字段和当前用户文本，供后端做净化和注入判断。
 */
type MemoryContextPayload = VmmGrpcPreCheckRequest

/**
 * Transport-level config used by gRPC requests.
 * gRPC 传输层配置。
 *
 * These fields sit below the extraction layer and only control where the API
 * is called and how aggressively the request should time out.
 * 这些字段位于提取层之下，只负责控制 API 调用地址以及超时策略，
 * 不参与对话语义提取本身。
 */
type MemorySyncTransportConfig = VmmGrpcTransportConfig
  & {
    language?: VmmLanguage
    notificationSurfaceMode?: VmmNotificationSurfaceMode
  }

/**
 * Normalized retrieval result returned to the plugin runtime.
 * 返回给插件运行时的统一检索结果。
 *
 * The backend may respond with different shapes, so this type is the canonical
 * shape consumed by the rest of the plugin after response normalization.
 * 后端返回结构可能会变化，因此这里定义的是经过归一化之后、
 * 供插件其余部分统一消费的标准结果。
 */
type MemoryContextResult = {
  inject: boolean
  reason: string
  lines: string[]
}

/**
 * One normalized writeback submission outcome returned to the plugin runtime.
 * 返回给插件运行时的统一写回结果摘要。
 *
 * Profile refresh should only happen after a turn has been successfully
 * accepted by PostAction, so the plugin needs one explicit outcome object
 * instead of guessing from transport side effects.
 * 画像刷新只能挂在 PostAction 已成功接收之后，
 * 因此插件需要一份明确的结果摘要，而不能再靠传输侧副作用去猜测。
 */
export type MemorySyncSubmitResult = {
  outcome:
    | "accepted"
    | "missing-vulcan-host-target"
    | "outbox-stalled"
    | "scope-invalid"
    | "queued-for-retry"
  flushedBeforeCurrent: number
}

/**
 * FIFO queue entry for deferred writeback.
 * 延迟写回的 FIFO 队列项。
 *
 * We persist the whole payload because post-answer writeback should not be lost
 * when the network is temporarily unavailable.
 * 这里会持久化完整 payload，
 * 因为回答后的写回在网络暂时异常时也不应该直接丢失。
 */
type WritebackOutboxEntry = {
  enqueued_at: string
  payload: MemorySyncPayload
}

/**
 * One normalized replay result after flushing queued writebacks.
 * 冲刷排队写回后的统一结果结构。
 *
 * PostAction can fail for transient transport reasons or for permanent
 * user/project binding problems, so replay needs to report whether it stalled
 * on a retryable failure or dropped invalid-scope entries along the way.
 * PostAction 既可能因为临时传输问题失败，也可能因为 user/project
 * 绑定永久无效而失败，因此重放结果需要区分“可重试卡住”和
 * “沿途丢弃了无效作用域条目”这两类情况。
 */
type WritebackOutboxFlushResult = {
  flushed: number
  stalled: boolean
  droppedInvalidScope: number
  stalledResult?: MemorySyncRpcResult<{ accepted?: boolean }>
}

/**
 * Minimal client surface used by this file.
 * 当前文件使用到的最小 client 能力。
 *
 * Transport only needs host toast feedback, so this local type avoids coupling
 * the transport layer to the entire plugin client contract.
 * 传输层只依赖宿主 toast 提示，因此这里单独定义最小 client 形态，
 * 避免把整个插件 client 协议都耦合进来。
 */
type SyncClient = HostToastClient

/**
 * Unified result for gRPC unary attempts.
 * gRPC unary 请求的统一结果结构。
 *
 * The caller needs to distinguish handshake timeout, receive timeout,
 * transport failure, and successful proto responses without re-parsing grpc
 * errors in every branch.
 * 调用方需要区分握手超时、接收超时、传输失败和成功的 proto 响应，
 * 因此这里统一收敛成一个结果类型，避免每个分支都重复解析 gRPC 错误。
 */
type MemorySyncRpcResult<TResponse> = VmmGrpcUnaryResult<TResponse>

/**
 * One read-only probe plan used by the background reconnect loop.
 * 后台重连循环使用的一条只读探活计划。
 *
 * Reconnect probes must avoid writeback side effects, so they only use safe
 * workspace or resolve RPCs that can confirm link recovery without mutating
 * memory state.
 * 重连探活不能带来写回副作用，
 * 因此这里只允许使用安全的只读工作区或解析类 RPC 来确认链路恢复。
 */
type GrpcReconnectProbe =
  | {
      kind: "resolve-project"
      projectID: string
    }
  | {
      kind: "resolve-user"
      userID: string
    }
  | {
      kind: "list-projects"
    }

/**
 * Per-target connection health state remembered across turns.
 * 按目标地址记忆的连接健康状态。
 *
 * The plugin only wants one warning toast for the current outage window, then
 * silent background retries until the link comes back and a success toast can
 * reopen the next warning window.
 * 插件在同一段故障窗口里只希望提示一次失败，
 * 随后静默后台重试，直到链路恢复后再用一次成功提示重新打开下一轮告警窗口。
 */
type GrpcTransportHealthState = {
  client: SyncClient
  directory: string
  target: string
  config: MemorySyncTransportConfig
  language: VmmLanguage
  probe: GrpcReconnectProbe
  failureToastShown: boolean
  retryScheduled: boolean
  reconnecting: boolean
}

/**
 * Remember active outage windows by workspace and target.
 * 按工作区与目标地址记住当前仍在持续的故障窗口。
 *
 * Presence in this map means warning toasts are already rate-limited for the
 * current outage and background reconnect probes should keep running.
 * 只要这张表里还有对应条目，就表示当前故障窗口已经进入告警节流状态，
 * 后台探活也应该继续运行直到恢复。
 */
const grpcTransportHealthStates = new Map<string, GrpcTransportHealthState>()

/**
 * Decide whether a PostAction RPC result was actually accepted by VMM.
 * 判断一条 PostAction RPC 结果是否真的被 VMM 接收。
 *
 * gRPC transport success only means the unary call completed. The writeback
 * path must still inspect `accepted` so semantic rejections do not get treated
 * as durable success.
 * gRPC 传输成功只代表 unary 调用完成，
 * 写回链仍然必须检查 `accepted`，
 * 否则服务端的语义性拒绝会被误判成真正成功。
 */
function isAcceptedPostAction(result: MemorySyncRpcResult<{ accepted?: boolean }>) {
  return result.ok && result.response?.accepted === true
}

/**
 * Convert log payloads into a JSON-safe structure.
 * 把日志对象转换成可安全 JSON 化的结构。
 *
 * This is used on the debug log path so circular refs, bigint values, and
 * errors do not break logging while we are diagnosing transport problems.
 * 这个函数服务于调试日志链路，避免循环引用、bigint 或 Error
 * 把日志写入过程本身搞坏，影响排障。
 */
function serialize(value: unknown): unknown {
  const seen = new WeakSet<object>()
  const serialized = JSON.stringify(value, (_key, currentValue) => {
    if (typeof currentValue === "bigint") {
      return `${currentValue}n`
    }

    if (currentValue instanceof Error) {
      return {
        name: currentValue.name,
        message: currentValue.message,
        stack: currentValue.stack,
      }
    }

    if (currentValue instanceof URL) {
      return currentValue.toString()
    }

    if (typeof currentValue === "function") {
      return `[Function ${currentValue.name || "anonymous"}]`
    }

    if (currentValue && typeof currentValue === "object") {
      if (seen.has(currentValue as object)) {
        return "[Circular]"
      }
      seen.add(currentValue as object)
    }

    return currentValue
  })

  // Guard the root-level `undefined` case so preview logging never throws
  // before the actual gRPC result can be handled by the plugin runtime.
  // 这里专门兜住根值为 `undefined` 的情况，避免预览日志先抛错，
  // 抢先打断插件运行时对真实 gRPC 结果的处理。
  if (serialized === undefined) {
    return undefined
  }

  return JSON.parse(serialized)
}

/**
 * Append one structured transport record to the memory sync log.
 * 向记忆同步日志追加一条结构化记录。
 *
 * Both context retrieval and writeback use the same log sink so that backend
 * integration can be debugged from a single timeline file.
 * 检索和写回共用同一个日志落点，
 * 这样联调时可以在一份时间线里看到完整的传输过程。
 */
async function appendMemorySyncLog(entry: Record<string, unknown>) {
  await fs.mkdir(LOG_DIR, { recursive: true })
  await fs.appendFile(MEMORY_SYNC_LOG_FILE, JSON.stringify(serialize(entry)) + "\n", "utf8")
}

/**
 * Surface transport status to the user without blocking the main flow.
 * 用宿主 toast 向用户反馈传输状态，而不阻塞主流程。
 *
 * The transport layer uses short UI feedback so fail-open retrieval, queued
 * writeback, and link recovery stay visible without turning logs into the only
 * source of truth.
 * 传输层使用简短 UI 提示，是为了让 fail-open 检索、写回入队和链路恢复
 * 这些状态保持可见，而不是只能靠日志判断当前发生了什么。
 */
async function showToast(
  client: SyncClient,
  directory: string,
  message: string,
  variant: HostToastVariant,
) {
  const result = await deliverHostToast(client, {
    directory,
    message,
    variant,
    duration: 3000,
    timeoutMs: MEMORY_SYNC_HOST_TOAST_SOFT_TIMEOUT_MS,
  })

  if (result.status === "delivered") {
    return
  }

  if (result.status === "skipped") {
    await appendMemorySyncLog({
      timestamp: new Date().toISOString(),
      kind: "memory.toast.skipped",
      directory,
      variant,
      timeout_ms: MEMORY_SYNC_HOST_TOAST_SOFT_TIMEOUT_MS,
      reason: result.reason,
      channel: result.channel,
      message:
        result.reason === "no-channel"
          ? "transport toast skipped because no compatible host notification channel was available"
          : "transport toast skipped because the host notification channel did not respond in time",
    })
    return
  }

  await appendMemorySyncLog({
    timestamp: new Date().toISOString(),
    kind: "memory.toast.error",
    directory,
    variant,
    channel: result.channel,
    error: result.error,
  })
}

/**
 * Run one detached transport task without leaking unhandled rejections.
 * 运行一条脱离主链路的传输层任务，并避免泄露未处理的 promise 拒绝。
 *
 * Background reconnect and recovery toasts should never crash the foreground
 * chat flow, so detached tasks are always wrapped and logged here.
 * 后台重连和恢复提示绝不能把前台对话链路打崩，
 * 因此所有脱离主链路的异步任务都统一在这里包裹并记录错误。
 */
function runDetachedTransportTask(label: string, task: Promise<unknown>) {
  void task.catch((error) => {
    void appendMemorySyncLog({
      timestamp: new Date().toISOString(),
      kind: "memory.grpc.detached_task_error",
      label,
      error,
    })
  })
}

/**
 * Normalize one diagnostic string before matching error categories.
 * 在匹配错误类别之前标准化诊断字符串。
 *
 * gRPC error details may contain extra whitespace or casing differences, so
 * this helper keeps runtime issue detection predictable across environments.
 * gRPC 错误详情可能带有额外空白或大小写差异，
 * 因此这里先做统一规整，保证运行时问题识别稳定。
 */
function normalizeDiagnosticText(value: string | undefined) {
  return (value ?? "").trim()
}

/**
 * One backend-reported business-scope issue detected at runtime.
 * 一条在运行时由后端判定出的业务作用域问题。
 *
 * This is used when a hand-edited config looks locally valid but the backend
 * still rejects the bound user/project as unknown or unusable.
 * 这个结构用于处理“本地格式看似合法，但后端仍判定 user/project
 * 不存在或不可用”的情况，常见于用户直接手改配置文件之后。
 */
type VmmBusinessScopeRuntimeIssue = {
  reason: string
  retrievalToastMessage: string
  writebackToastMessage: string
}

/**
 * Resolve the effective UI language for transport-side toasts.
 * 解析传输层 toast 使用的最终界面语言。
 *
 * Transport is called below the orchestration layer, so it receives the
 * effective language through config rather than reading files again.
 * 传输层位于编排层之下，
 * 因此这里通过 config 接收最终语言，而不是再次回到文件系统读配置。
 */
function getTransportLanguage(config: MemorySyncTransportConfig | undefined): VmmLanguage {
  return config?.language ?? "en"
}

/**
 * Decide whether one transport-side toast should be emitted under the current
 * notification surface mode.
 * 按当前通知面模式判断某条传输层 toast 是否应该真正发出。
 *
 * Transport only owns host toast. Any model-visible warning notice is handled
 * by the orchestration layer instead of the transport helpers.
 * 传输层只负责宿主 toast；
 * 任何模型可见的 warning 提示都由编排层处理，而不是在传输层 helper 中处理。
 */
function shouldEmitTransportToast(
  config: MemorySyncTransportConfig | undefined,
  stage: VmmNotificationStage,
) {
  return resolveVmmNotificationRoute({
    mode: config?.notificationSurfaceMode ?? "auto",
    stage,
  }).toast
}

/**
 * Surface one transport notice only when the current routing policy allows it.
 * 仅在当前路由策略允许时，才真正发出一条传输层提示。
 *
 * This keeps manual `transcript` mode from still emitting host toasts through
 * recovery and outbox paths that do not own transcript rendering themselves.
 * 这样在显式 `transcript` 模式下，恢复提示和 outbox 提示等
 * 传输层路径就不会继续偷偷弹宿主 toast。
 */
async function showTransportToast(args: {
  client: SyncClient
  directory: string
  config?: MemorySyncTransportConfig
  stage: VmmNotificationStage
  message: string
  variant: HostToastVariant
}) {
  if (!shouldEmitTransportToast(args.config, args.stage)) {
    return
  }

  await showToast(args.client, args.directory, args.message, args.variant)
}

/**
 * Build one stable key for connection health state.
 * 为连接健康状态构建一条稳定键值。
 *
 * Different workspaces may point at different VMM targets, so the reconnect
 * window must be isolated by both local directory and resolved gRPC target.
 * 不同工作区可能指向不同的 VMM 地址，
 * 因此重连窗口需要同时按本地目录和归一化后的 gRPC 目标地址隔离。
 */
function buildGrpcTransportHealthKey(directory: string, target: string) {
  return `${directory}\n${target}`
}

/**
 * Build a safe read-only probe from the currently known bindings.
 * 根据当前已知绑定构建一条安全的只读探活方案。
 *
 * Project resolve is preferred because it is read-only and tiny, while user
 * resolve or project listing remain valid fallbacks when project scope is not
 * available in the current payload.
 * 这里优先用 project resolve，因为它只读且返回很小；
 * 如果当前 payload 没有 project scope，再退回到 user resolve 或项目列表探活。
 */
function buildGrpcReconnectProbe(args: { projectID?: string; userID?: string }): GrpcReconnectProbe {
  const projectID = normalizeDiagnosticText(args.projectID)
  if (projectID && projectID !== "0") {
    return {
      kind: "resolve-project",
      projectID,
    }
  }

  const userID = normalizeDiagnosticText(args.userID)
  if (userID && userID !== "0") {
    return {
      kind: "resolve-user",
      userID,
    }
  }

  return {
    kind: "list-projects",
  }
}

/**
 * Detect whether one gRPC failure still looks like a retryable link outage.
 * 检测一次 gRPC 失败是否仍然像是可重试的链路故障。
 *
 * Business-scope errors should stay actionable and visible, but network-style
 * failures are the ones that enter the "warn once, retry silently" window.
 * 业务作用域错误需要继续直接提示用户修配置，
 * 只有网络风格的失败才会进入“失败只提示一次、随后静默重试”的窗口。
 */
function isRetryableGrpcLinkFailure(result: MemorySyncRpcResult<unknown>) {
  if (detectBusinessScopeRuntimeIssue(result, "en")) {
    return false
  }

  const grpcCodeName = normalizeDiagnosticText(result.grpcCodeName).toUpperCase()
  if (result.timedOutPhase) {
    return true
  }

  return (
    !grpcCodeName ||
    grpcCodeName === "UNAVAILABLE" ||
    grpcCodeName === "DEADLINE_EXCEEDED" ||
    grpcCodeName === "CANCELLED" ||
    grpcCodeName === "UNKNOWN"
  )
}

/**
 * Detect whether one probe result already proves the gRPC link is reachable.
 * 检测一次探活结果是否已经足以证明 gRPC 链路可达。
 *
 * A reconnect probe only cares whether the server answered, so read-only
 * NOT_FOUND or INVALID_ARGUMENT responses also count as recovery signals.
 * 重连探活只关心服务端是否已经开始应答，
 * 因此像 NOT_FOUND 或 INVALID_ARGUMENT 这类只读返回也可以视作恢复信号。
 */
function isReachableGrpcProbeResult(result: MemorySyncRpcResult<unknown>) {
  if (result.ok) {
    return true
  }

  const grpcCodeName = normalizeDiagnosticText(result.grpcCodeName).toUpperCase()
  return (
    grpcCodeName === "INVALID_ARGUMENT" ||
    grpcCodeName === "NOT_FOUND" ||
    grpcCodeName === "FAILED_PRECONDITION"
  )
}

/**
 * Run one background reconnect probe without mutating remote memory state.
 * 运行一次后台重连探活，并保证不会修改远端记忆状态。
 */
async function runGrpcReconnectProbe(state: GrpcTransportHealthState): Promise<MemorySyncRpcResult<unknown>> {
  switch (state.probe.kind) {
    case "resolve-project":
      return callVmmResolveProject({
        request: {
          project_ref: state.probe.projectID,
        },
        config: state.config,
      })
    case "resolve-user":
      return callVmmResolveUser({
        request: {
          user_ref: state.probe.userID,
          confirm_create: false,
        },
        config: state.config,
      })
    default:
      return callVmmListProjects({
        config: state.config,
      })
  }
}

/**
 * Schedule the next background reconnect attempt for one failed link window.
 * 为一段失败中的链路窗口安排下一次后台重连尝试。
 *
 * Scheduling stays idempotent so repeated foreground failures only update the
 * remembered state and never create parallel reconnect loops.
 * 调度逻辑保持幂等，
 * 这样前台重复失败时只会更新记忆状态，而不会并行启动多个重连循环。
 */
function scheduleGrpcReconnectProbe(stateKey: string) {
  const state = grpcTransportHealthStates.get(stateKey)
  if (!state || state.retryScheduled || state.reconnecting) {
    return
  }

  // Refresh LRU order: re-set the key so recent access moves to the end.
  // 刷新 LRU 顺序：重新设置 key 使最近访问移到末尾。
  grpcTransportHealthStates.delete(stateKey)
  grpcTransportHealthStates.set(stateKey, state)

  state.retryScheduled = true
  const timeout = setTimeout(() => {
    runDetachedTransportTask("grpc-reconnect-probe", attemptGrpcReconnectProbe(stateKey))
  }, GRPC_RECONNECT_RETRY_DELAY_MS)
  // Allow the process to exit cleanly even while a reconnect timer is pending.
  // 让进程在重连定时器挂起时也能正常退出。
  timeout.unref()
}

/**
 * Finalize one recovered link window and optionally announce success.
 * 在链路恢复后收尾当前故障窗口，并按需提示成功。
 *
 * Success toasts should fire only once per outage window, then the state is
 * cleared so the next real outage can surface its own first warning again.
 * 成功提示在同一段故障窗口里只应该出现一次，
 * 随后就要清空状态，让下一次真实故障还能重新弹出首条失败提示。
 */
async function markGrpcTransportRecovered(args: {
  client: SyncClient
  directory: string
  config?: MemorySyncTransportConfig
  announce: boolean
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  if (!target) {
    return false
  }

  const stateKey = buildGrpcTransportHealthKey(args.directory, target)
  const state = grpcTransportHealthStates.get(stateKey)
  if (!state) {
    return false
  }

  grpcTransportHealthStates.delete(stateKey)
  await appendMemorySyncLog({
    timestamp: new Date().toISOString(),
    kind: "memory.grpc.reconnected",
    directory: args.directory,
    target,
  })

  if (args.announce) {
    await showTransportToast({
      client: args.client,
      directory: args.directory,
      config: args.config,
      stage: "completion",
      message: tVmmShared(state.language, "memory_service_reconnected"),
      variant: "success",
    })
  }

  return true
}

/**
 * Remember one transport outage and start silent reconnect attempts.
 * 记住一次传输层故障，并启动静默后台重连。
 *
 * The first failure in one outage window still surfaces a warning toast, but
 * later failures only refresh the probe context until recovery is observed.
 * 同一段故障窗口里的第一条失败仍然会弹 warning，
 * 之后的失败只会刷新探活上下文，直到观察到恢复为止。
 */
async function noteGrpcTransportFailure(args: {
  client: SyncClient
  directory: string
  config?: MemorySyncTransportConfig
  probe: GrpcReconnectProbe
  failureMessage: string
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  if (!target) {
    return
  }

  const stateKey = buildGrpcTransportHealthKey(args.directory, target)
  const existingState = grpcTransportHealthStates.get(stateKey)
  const state: GrpcTransportHealthState = existingState ?? {
    client: args.client,
    directory: args.directory,
    target,
    config: {
      ...(args.config ?? {}),
      grpcTarget: target,
    },
    language: getTransportLanguage(args.config),
    probe: args.probe,
    failureToastShown: false,
    retryScheduled: false,
    reconnecting: false,
  }

  state.client = args.client
  state.directory = args.directory
  state.target = target
  state.config = {
    ...(args.config ?? {}),
    grpcTarget: target,
  }
  state.language = getTransportLanguage(args.config)
  state.probe = args.probe

  // Evict the oldest entry when the map exceeds capacity to bound memory.
  // 当 Map 超出容量时淘汰最旧的条目，以控制内存。
  if (grpcTransportHealthStates.size >= GRPC_TRANSPORT_HEALTH_STATES_MAX) {
    const oldestKey = grpcTransportHealthStates.keys().next().value as string
    grpcTransportHealthStates.delete(oldestKey)
  }
  grpcTransportHealthStates.set(stateKey, state)

  await appendMemorySyncLog({
    timestamp: new Date().toISOString(),
    kind: "memory.grpc.disconnected",
    directory: args.directory,
    target,
    probe_kind: args.probe.kind,
  })

  if (!state.failureToastShown) {
    state.failureToastShown = true
    await showTransportToast({
      client: args.client,
      directory: args.directory,
      config: args.config,
      stage: "warning",
      message: args.failureMessage,
      variant: "warning",
    })
  }

  scheduleGrpcReconnectProbe(stateKey)
}

/**
 * Execute one scheduled reconnect attempt and keep retrying until recovery.
 * 执行一次计划中的重连尝试，并在恢复前持续安排后续重试。
 */
async function attemptGrpcReconnectProbe(stateKey: string) {
  const state = grpcTransportHealthStates.get(stateKey)
  if (!state) {
    return
  }

  state.retryScheduled = false
  state.reconnecting = true

  const result = await runGrpcReconnectProbe(state)
  await appendMemorySyncLog({
    timestamp: new Date().toISOString(),
    kind: "memory.grpc.reconnect_probe",
    directory: state.directory,
    target: state.target,
    probe_kind: state.probe.kind,
    ok: result.ok,
    method: result.method,
    grpc_code: result.grpcCode,
    grpc_code_name: result.grpcCodeName,
    grpc_details: result.details,
    timed_out_phase: result.timedOutPhase,
    response_preview: previewRpcPayload(result.response),
    error: result.error,
  })

  const latestState = grpcTransportHealthStates.get(stateKey)
  if (!latestState) {
    return
  }

  latestState.reconnecting = false
  if (isReachableGrpcProbeResult(result)) {
    await markGrpcTransportRecovered({
      client: latestState.client,
      directory: latestState.directory,
      config: latestState.config,
      announce: true,
    })
    return
  }

  scheduleGrpcReconnectProbe(stateKey)
}

/**
 * Convert one affected binding group into the matching rebinding hint.
 * 按受影响的绑定分组生成对应的重新绑定提示。
 *
 * Runtime gRPC failures should still tell the user which slash command can fix
 * the issue, otherwise a warning toast would not be actionable enough.
 * 运行时 gRPC 失败仍然需要告诉用户该用哪条 slash 命令修复，
 * 否则 warning toast 的可执行性不够。
 */
function getBusinessScopeRepairHint(
  kind: "user" | "project" | "user-project" | "binding",
  language: VmmLanguage,
) {
  if (kind === "user") {
    return tVmmShared(language, "binding_repair_user")
  }

  if (kind === "project") {
    return tVmmShared(language, "binding_repair_project")
  }

  if (kind === "user-project") {
    return tVmmShared(language, "binding_repair_both")
  }

  return tVmmShared(language, "binding_repair_generic")
}

/**
 * Detect whether one gRPC failure actually means the configured binding is bad.
 * 检测一次 gRPC 失败是否本质上代表当前绑定已经失效。
 *
 * Manual config edits can produce numeric-looking IDs that pass local checks,
 * so the backend rejection must still be translated into a config warning.
 * 手改配置文件时可能会写出“看起来像数字、但后端里根本不存在”的 ID，
 * 因此后端拒绝也需要被翻译成配置告警，而不是继续当成网络问题。
 */
function detectBusinessScopeRuntimeIssue(
  result: MemorySyncRpcResult<unknown>,
  language: VmmLanguage,
): VmmBusinessScopeRuntimeIssue | undefined {
  const grpcCodeName = normalizeDiagnosticText(result.grpcCodeName).toUpperCase()
  if (!["INVALID_ARGUMENT", "NOT_FOUND", "FAILED_PRECONDITION"].includes(grpcCodeName)) {
    return undefined
  }

  const details = normalizeDiagnosticText(result.details).toLowerCase()
  const mentionsUser = details.includes("user")
  const mentionsProject = details.includes("project")
  const kind = mentionsUser && mentionsProject ? "user-project" : mentionsUser ? "user" : mentionsProject ? "project" : "binding"
  const repairHint = getBusinessScopeRepairHint(kind, language)

  if (kind === "user") {
    return {
      reason: "invalid-business-scope-user",
      retrievalToastMessage:
        language === "zh-CN"
          ? `当前 VMM user 绑定无效，本轮已跳过历史注入。 ${repairHint}`
          : `The current VMM user binding is invalid, so history injection was skipped for this turn. ${repairHint}`,
      writebackToastMessage:
        language === "zh-CN"
          ? `当前 VMM user 绑定无效，本次写回已跳过。 ${repairHint}`
          : `The current VMM user binding is invalid, so this writeback was skipped. ${repairHint}`,
    }
  }

  if (kind === "project") {
    return {
      reason: "invalid-business-scope-project",
      retrievalToastMessage:
        language === "zh-CN"
          ? `当前 VMM project 绑定无效，本轮已跳过历史注入。 ${repairHint}`
          : `The current VMM project binding is invalid, so history injection was skipped for this turn. ${repairHint}`,
      writebackToastMessage:
        language === "zh-CN"
          ? `当前 VMM project 绑定无效，本次写回已跳过。 ${repairHint}`
          : `The current VMM project binding is invalid, so this writeback was skipped. ${repairHint}`,
    }
  }

  if (kind === "user-project") {
    return {
      reason: "invalid-business-scope-user-project",
      retrievalToastMessage:
        language === "zh-CN"
          ? `当前 VMM user/project 绑定无效，本轮已跳过历史注入。 ${repairHint}`
          : `The current VMM user/project binding is invalid, so history injection was skipped for this turn. ${repairHint}`,
      writebackToastMessage:
        language === "zh-CN"
          ? `当前 VMM user/project 绑定无效，本次写回已跳过。 ${repairHint}`
          : `The current VMM user/project binding is invalid, so this writeback was skipped. ${repairHint}`,
    }
  }

  return {
    reason: "invalid-business-scope",
    retrievalToastMessage:
      language === "zh-CN"
        ? `当前 VMM user/project 绑定无效，本轮已跳过历史注入。 ${repairHint}`
        : `The current VMM user/project binding is invalid, so history injection was skipped for this turn. ${repairHint}`,
    writebackToastMessage:
      language === "zh-CN"
        ? `当前 VMM user/project 绑定无效，本次写回已跳过。 ${repairHint}`
        : `The current VMM user/project binding is invalid, so this writeback was skipped. ${repairHint}`,
  }
}

/**
 * Build a user-facing warning for retrieval failures.
 * 为检索失败生成面向用户的提示文案。
 *
 * Retrieval stays fail-open, but the user still needs lightweight feedback so
 * they can tell the difference between "no memory found" and "backend failed".
 * 检索链仍然保持 fail-open，但用户需要轻量提示来区分
 * “这轮没有可注入记忆”和“后端检索本身失败了”。
 */
function getContextFailureToastMessage(
  result: MemorySyncRpcResult<unknown>,
  language: VmmLanguage,
) {
  const scopeIssue = detectBusinessScopeRuntimeIssue(result, language)
  if (scopeIssue) {
    return scopeIssue.retrievalToastMessage
  }

  if (result.timedOutPhase === "handshake") {
    return tVmmShared(language, "memory_context_handshake_timeout")
  }

  if (result.timedOutPhase === "receive") {
    return tVmmShared(language, "memory_context_receive_timeout")
  }

  return tVmmShared(language, "memory_context_unavailable")
}

/**
 * Keep logged response payloads readable and bounded.
 * 对响应载荷做可读且有上限的日志预览裁剪。
 *
 * gRPC results are structured objects rather than response text, so the log
 * path serializes them into a bounded preview for debugging.
 * gRPC 结果本身是结构化对象而不是响应文本，
 * 因此日志链需要先把它们序列化成有上限的预览，方便调试。
 */
function previewRpcPayload(payload: unknown, limit = 1200) {
  const normalizedPayload = serialize(payload)
  if (normalizedPayload === undefined) return ""

  const serialized = JSON.stringify(normalizedPayload)
  if (!serialized) return ""
  return serialized.length > limit ? `${serialized.slice(0, limit)}...[truncated]` : serialized
}

/**
 * Resolve the per-project outbox path for deferred writeback payloads.
 * 解析当前项目的延迟写回队列文件路径。
 *
 * The queue is intentionally stored under project `.opencode` so writebacks are
 * replayed in the same project context that originally produced them.
 * 队列故意放在项目 `.opencode` 下，
 * 这样失败写回会在原项目语境里按顺序补交。
 */
function getWritebackOutboxPath(directory: string) {
  return path.join(directory, ".opencode", WRITEBACK_OUTBOX_FILENAME)
}

/**
 * Load the persisted FIFO outbox from disk.
 * 从磁盘加载持久化的 FIFO 写回队列。
 *
 * The loader is intentionally tolerant of a missing file because most sessions
 * will not have pending writebacks.
 * 这里对缺失文件保持容错，
 * 因为大多数正常会话本来就不会留下待补交记录。
 */
async function loadWritebackOutbox(directory: string) {
  const outboxPath = getWritebackOutboxPath(directory)
  try {
    const existing = await fs.readFile(outboxPath, "utf8")
    const parsed = JSON.parse(existing)
    if (!Array.isArray(parsed)) return [] as WritebackOutboxEntry[]
    return parsed
      .map((item) => {
        if (!item || typeof item !== "object") return undefined
        const record = item as Record<string, unknown>
        const payload = record["payload"]
        return payload && typeof payload === "object"
          ? {
              enqueued_at:
                typeof record["enqueued_at"] === "string"
                  ? record["enqueued_at"]
                  : new Date().toISOString(),
              payload: payload as MemorySyncPayload,
            }
          : undefined
      })
      .filter((item): item is WritebackOutboxEntry => Boolean(item))
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError?.code === "ENOENT") return [] as WritebackOutboxEntry[]
    throw error
  }
}

/**
 * Persist the current writeback queue state.
 * 持久化当前写回队列状态。
 *
 * Removing the file when the queue becomes empty keeps the runtime directory
 * clean and also makes "no pending replay" easy to inspect.
 * 当队列为空时直接删除文件，可以保持运行目录整洁，
 * 也能让“当前没有待补交记录”一眼可见。
 */
async function saveWritebackOutbox(directory: string, entries: WritebackOutboxEntry[]) {
  const outboxPath = getWritebackOutboxPath(directory)
  if (entries.length === 0) {
    await fs.rm(outboxPath, { force: true }).catch(() => undefined)
    return outboxPath
  }
  await fs.mkdir(path.dirname(outboxPath), { recursive: true })
  await fs.writeFile(outboxPath, JSON.stringify(entries, null, 2) + "\n", "utf8")
  return outboxPath
}

/**
 * Append the current failed payload to the end of the replay queue.
 * 把当前失败 payload 追加到重放队列尾部。
 *
 * We always append rather than insert because writeback replay must preserve
 * the original finalize order across turns.
 * 这里必须始终尾插而不能随意插队，
 * 因为写回补交需要保留原始 finalize 顺序。
 */
async function enqueueWritebackOutbox(directory: string, payload: MemorySyncPayload) {
  const entries = await loadWritebackOutbox(directory)
  entries.push({
    enqueued_at: new Date().toISOString(),
    payload,
  })
  return saveWritebackOutbox(directory, entries)
}

/**
 * Replay queued writebacks in FIFO order before sending a fresh one.
 * 在发送当前写回前，按 FIFO 顺序重放历史失败写回。
 *
 * The current writeback must not overtake older failed ones, otherwise the
 * backend would observe conversation history out of order.
 * 当前写回不能越过历史失败写回，
 * 否则后端看到的对话时间线就会乱序。
 */
async function flushWritebackOutbox(args: {
  directory: string
  config: MemorySyncTransportConfig
}) {
  const queue = await loadWritebackOutbox(args.directory)
  if (queue.length === 0) {
    return {
      flushed: 0,
      stalled: false,
      droppedInvalidScope: 0,
      stalledResult: undefined,
    } satisfies WritebackOutboxFlushResult
  }

  const language = getTransportLanguage(args.config)
  let flushed = 0
  let droppedInvalidScope = 0

  for (let index = 0; index < queue.length; index += 1) {
    const entry = queue[index]
    if (!entry) continue

    // Replay each queued payload through the same PostAction RPC so retry
    // behavior stays identical to the normal submission path.
    // 每条排队记录都走同一个 PostAction RPC，
    // 这样补交流程和正常提交流程的行为保持一致。
    const response = await callVmmPostAction({
      request: entry.payload.body,
      config: args.config,
    })

    await appendMemorySyncLog({
      timestamp: new Date().toISOString(),
      kind: "memory.sync.outbox.flush.attempt",
      session_id: entry.payload.body.session_id,
      index,
      target: response.target,
      method: response.method,
      ok: response.ok,
      grpc_code: response.grpcCode,
      grpc_code_name: response.grpcCodeName,
      grpc_details: response.details,
      accepted: response.response?.accepted,
      timed_out_phase: response.timedOutPhase,
      response_preview: previewRpcPayload(response.response),
      error: response.error,
    })

    if (isAcceptedPostAction(response)) {
      flushed += 1
      continue
    }

    // Drop queued payloads whose user/project binding is already known to be
    // invalid, because replaying them later under the same ids will never
    // succeed and should not keep blocking newer valid writebacks.
    // 已知 user/project 绑定无效的排队 payload 会被直接丢弃，
    // 因为它们在相同 id 下未来也不会成功，不应该持续阻塞后续有效写回。
    const scopeIssue = detectBusinessScopeRuntimeIssue(response, language)
    if (scopeIssue) {
      droppedInvalidScope += 1
      await appendMemorySyncLog({
        timestamp: new Date().toISOString(),
        kind: "memory.sync.outbox.scope_invalid",
        session_id: entry.payload.body.session_id,
        index,
        grpc_code: response.grpcCode,
        grpc_code_name: response.grpcCodeName,
        grpc_details: response.details,
        reason: scopeIssue.reason,
      })
      continue
    }

    await saveWritebackOutbox(args.directory, queue.slice(index))
    return {
      flushed,
      stalled: true,
      droppedInvalidScope,
      stalledResult: response,
    } satisfies WritebackOutboxFlushResult
  }

  await saveWritebackOutbox(args.directory, [])
  return {
    flushed,
    stalled: false,
    droppedInvalidScope,
    stalledResult: undefined,
  } satisfies WritebackOutboxFlushResult
}

/**
 * Decide whether one PostAction attempt failed before entering the use case.
 * 判断一次 PostAction 是否在进入用例前就被拦截失败。
 *
 * Invalid user/project bindings are rejected synchronously by the shared scope
 * resolution interceptor, so they must never be treated as accepted=false or
 * as a retryable transport failure.
 * 无效的 user/project 绑定会被共享的范围解析拦截器同步拒绝，
 * 因此这类失败绝不能被当成 accepted=false 的业务拒绝，
 * 也不能被当成可重试的临时传输故障。
 */
function detectPostActionScopeIssue(
  response: MemorySyncRpcResult<{ accepted?: boolean }>,
  language: VmmLanguage,
) {
  return detectBusinessScopeRuntimeIssue(response, language)
}

/**
 * Fetch retrieval context for a new real user turn.
 * 为新的真实用户轮次请求检索上下文。
 *
 * This path is fail-open by design: network problems should only skip memory
 * injection and must not block the normal chat flow.
 * 这条链路被设计成 fail-open：
 * 网络异常只应该导致跳过注入，而不能阻断正常对话。
 */
export async function requestMemoryContext(input: {
  client: SyncClient
  directory: string
  payload: MemoryContextPayload
  config?: MemorySyncTransportConfig
}) {
  const language = getTransportLanguage(input.config)
  await appendMemorySyncLog({
    timestamp: new Date().toISOString(),
    kind: "memory.context.request",
    payload: input.payload,
  })

  const grpcTarget = normalizeGrpcTarget(input.config?.grpcTarget)
  if (!grpcTarget) {
    return {
      inject: false,
      reason: "missing-vulcan-host-target",
      lines: [],
    } satisfies MemoryContextResult
  }

  // Ask the backend PreCheck RPC to validate the scope and return the adopted
  // runtime context payload for the current turn.
  // 调用后端 PreCheck RPC，对当前范围做校验，
  // 并返回本轮应采纳的运行时上下文载荷。
  const result = await callVmmPreCheck({
    request: input.payload,
    config: input.config,
  })

  await appendMemorySyncLog({
    timestamp: new Date().toISOString(),
    kind: result.ok ? "memory.context.response" : "memory.context.error",
    session_id: input.payload.session_id,
    target: result.target,
    method: result.method,
    ok: result.ok,
    grpc_code: result.grpcCode,
    grpc_code_name: result.grpcCodeName,
    grpc_details: result.details,
    timed_out_phase: result.timedOutPhase,
    response_preview: previewRpcPayload(result.response),
    error: result.error,
  })

  // Retrieval failures are intentionally converted into "do not inject" so the
  // assistant path can continue without waiting for manual recovery.
  // 检索失败会被故意降级成“不注入”，
  // 这样对话链可以继续，不需要人工先修网络。
  if (!result.ok) {
    const scopeIssue = detectBusinessScopeRuntimeIssue(result, language)
    if (scopeIssue) {
      await showTransportToast({
        client: input.client,
        directory: input.directory,
        config: input.config,
        stage: "warning",
        message: scopeIssue.retrievalToastMessage,
        variant: "warning",
      })
    } else if (isRetryableGrpcLinkFailure(result)) {
      runDetachedTransportTask(
        "grpc-transport-failure-retrieval",
        noteGrpcTransportFailure({
          client: input.client,
          directory: input.directory,
          config: input.config,
          probe: buildGrpcReconnectProbe({
            projectID: input.payload.project_id,
            userID: input.payload.user_id,
          }),
          failureMessage: getContextFailureToastMessage(result, language),
        }),
      )
    } else {
      await showTransportToast({
        client: input.client,
        directory: input.directory,
        config: input.config,
        stage: "warning",
        message: getContextFailureToastMessage(result, language),
        variant: "warning",
      })
    }
    return {
      inject: false,
      reason:
        scopeIssue?.reason ??
        (result.timedOutPhase ? `network-timeout-${result.timedOutPhase}` : "network-error"),
      lines: [],
    } satisfies MemoryContextResult
  }

  const responsePayload = result.response ?? {
    should_inject: false,
    context_items: [],
    degraded: false,
    trace_id: "",
  }
  runDetachedTransportTask(
    "grpc-transport-recovered-retrieval",
    markGrpcTransportRecovered({
      client: input.client,
      directory: input.directory,
      config: input.config,
      announce: true,
    }),
  )
  const lines = extractPreCheckContextLines(responsePayload)
  const inject =
    typeof responsePayload.should_inject === "boolean"
      ? Boolean(responsePayload.should_inject)
      : lines.length > 0

  return {
    inject,
    reason:
      typeof responsePayload.degraded === "boolean" && responsePayload.degraded
        ? "pre-check-degraded"
        : inject
          ? "pre-check-context-returned"
          : "pre-check-no-inject",
    lines,
  } satisfies MemoryContextResult
}

/**
 * Submit one finalized memory payload and preserve order on failure.
 * 提交单条最终记忆 payload，并在失败时保证顺序不丢。
 *
 * This path is intentionally stricter than retrieval: finalized data should be
 * queued locally for later replay rather than silently dropped.
 * 这条链比检索链更严格：
 * 已经 finalized 的数据不能静默丢弃，而要进入本地队列等待后续补交。
 */
export async function submitMemorySyncCandidate(input: {
  client: SyncClient
  payload: MemorySyncPayload
  config?: MemorySyncTransportConfig
}): Promise<MemorySyncSubmitResult> {
  return runSerializedWritebackOutboxMutation({
    state: writebackOutboxMutationQueueState,
    directory: input.payload.directory,
    mutate: async () => {
      const language = getTransportLanguage(input.config)
      await appendMemorySyncLog({
        timestamp: new Date().toISOString(),
        kind: "memory.sync.candidate",
        payload: input.payload,
      })

      const grpcTarget = normalizeGrpcTarget(input.config?.grpcTarget)
      if (!grpcTarget) {
        await appendMemorySyncLog({
          timestamp: new Date().toISOString(),
          kind: "memory.sync.not_configured",
          session_id: input.payload.body.session_id,
          directory: input.payload.directory,
          reason: "missing-vulcan-host-target",
        })
        return {
          outcome: "missing-vulcan-host-target",
          flushedBeforeCurrent: 0,
        } satisfies MemorySyncSubmitResult
      }

      // Always flush older failed writebacks first so the backend receives turns in
      // the same order they were originally finalized.
      // 先补交旧队列，再发当前写回，
      // 这样后端看到的顺序才和原始 finalize 顺序一致。
      const flushResult = await flushWritebackOutbox({
        directory: input.payload.directory,
        config: input.config ?? {},
      })
      if (flushResult.stalled) {
        const outboxPath = await enqueueWritebackOutbox(input.payload.directory, input.payload)
        await appendMemorySyncLog({
          timestamp: new Date().toISOString(),
          kind: "memory.sync.outbox.stalled",
          session_id: input.payload.body.session_id,
          flushed_before_stall: flushResult.flushed,
          outbox_path: outboxPath,
        })
        if (flushResult.stalledResult && isRetryableGrpcLinkFailure(flushResult.stalledResult)) {
          runDetachedTransportTask(
            "grpc-transport-failure-outbox-stalled",
            noteGrpcTransportFailure({
              client: input.client,
              directory: input.payload.directory,
              config: input.config,
              probe: buildGrpcReconnectProbe({
                projectID: input.payload.body.project_id,
                userID: input.payload.body.user_id,
              }),
              failureMessage: tVmmShared(language, "memory_sync_outbox_stalled"),
            }),
          )
        } else {
          await showTransportToast({
            client: input.client,
            directory: input.payload.directory,
            config: input.config,
            stage: "warning",
            message: tVmmShared(language, "memory_sync_outbox_stalled"),
            variant: "warning",
          })
        }
        return {
          outcome: "outbox-stalled",
          flushedBeforeCurrent: flushResult.flushed,
        } satisfies MemorySyncSubmitResult
      }

      // Submit the current finalized payload only after older queued items have
      // either been drained or deliberately stopped on a new failure.
      // 只有旧队列已经清空，或者在明确的新失败点停住后，
      // 才会轮到当前这一条最终 payload 去提交。
      const response = await callVmmPostAction({
        request: input.payload.body,
        config: input.config,
      })

      await appendMemorySyncLog({
        timestamp: new Date().toISOString(),
        kind: isAcceptedPostAction(response) ? "memory.sync.grpc.response" : "memory.sync.grpc.error",
        session_id: input.payload.body.session_id,
        target: response.target,
        method: response.method,
        ok: response.ok,
        grpc_code: response.grpcCode,
        grpc_code_name: response.grpcCodeName,
        grpc_details: response.details,
        accepted: response.response?.accepted,
        timed_out_phase: response.timedOutPhase,
        response_preview: previewRpcPayload(response.response),
        error: response.error,
      })

      // A failed writeback is persisted instead of dropped so the backend can catch
      // up later once connectivity is restored.
      // 写回失败时不会直接丢弃，而是持久化到本地队列，
      // 等网络恢复后再补交给后端。
      if (!isAcceptedPostAction(response)) {
        const scopeIssue = detectPostActionScopeIssue(response, language)
        if (scopeIssue) {
          await showTransportToast({
            client: input.client,
            directory: input.payload.directory,
            config: input.config,
            stage: "warning",
            message: scopeIssue.writebackToastMessage,
            variant: "warning",
          })
          await appendMemorySyncLog({
            timestamp: new Date().toISOString(),
            kind: "memory.sync.scope_invalid",
            session_id: input.payload.body.session_id,
            grpc_code: response.grpcCode,
            grpc_code_name: response.grpcCodeName,
            grpc_details: response.details,
            reason: scopeIssue.reason,
          })
          return {
            outcome: "scope-invalid",
            flushedBeforeCurrent: flushResult.flushed,
          } satisfies MemorySyncSubmitResult
        }

        const outboxPath = await enqueueWritebackOutbox(input.payload.directory, input.payload)
        if (isRetryableGrpcLinkFailure(response)) {
          runDetachedTransportTask(
            "grpc-transport-failure-writeback",
            noteGrpcTransportFailure({
              client: input.client,
              directory: input.payload.directory,
              config: input.config,
              probe: buildGrpcReconnectProbe({
                projectID: input.payload.body.project_id,
                userID: input.payload.body.user_id,
              }),
              failureMessage: tVmmShared(language, "memory_sync_outbox_enqueued"),
            }),
          )
        } else {
          await showTransportToast({
            client: input.client,
            directory: input.payload.directory,
            config: input.config,
            stage: "warning",
            message: tVmmShared(language, "memory_sync_outbox_enqueued"),
            variant: "warning",
          })
        }
        await appendMemorySyncLog({
          timestamp: new Date().toISOString(),
          kind: "memory.sync.outbox.enqueued",
          session_id: input.payload.body.session_id,
          outbox_path: outboxPath,
        })
        return {
          outcome: "queued-for-retry",
          flushedBeforeCurrent: flushResult.flushed,
        } satisfies MemorySyncSubmitResult
      }

      const recoveredConnection = await markGrpcTransportRecovered({
        client: input.client,
        directory: input.payload.directory,
        config: input.config,
        announce: true,
      })
      if (!recoveredConnection) {
        await showTransportToast({
          client: input.client,
          directory: input.payload.directory,
          config: input.config,
          stage: "completion",
          message:
            flushResult.flushed > 0
              ? tVmmShared(language, "memory_sync_success_with_flush", { count: flushResult.flushed })
              : tVmmShared(language, "memory_sync_success"),
          variant: "success",
        })
      }

      return {
        outcome: "accepted",
        flushedBeforeCurrent: flushResult.flushed,
      } satisfies MemorySyncSubmitResult
    },
  })
}

/**
 * Expose the transport log path for external tooling and debugging.
 * 暴露传输日志路径，便于外部工具和人工排障读取。
 *
 * Keeping this helper here avoids duplicating the log location across the
 * plugin runtime and supporting scripts.
 * 把这个辅助函数放在这里，可以避免插件运行时和辅助脚本
 * 重复硬编码同一份日志路径。
 */
export function memorySyncLogFilePath() {
  return MEMORY_SYNC_LOG_FILE
}
