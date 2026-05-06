/**
 * Node bridge used by TUI screens to execute VMM gRPC calls outside the TUI host runtime.
 * 供 TUI 页面在宿主运行时之外执行 VMM gRPC 调用的 Node 桥接层。
 *
 * This file belongs to the TUI transport bridge layer. It is used by overlay
 * screens such as user manager, project manager, profile center, and admin
 * tools whenever they need backend RPC data but must avoid loading the gRPC
 * stack inside the npm-installed OpenCode TUI runtime itself.
 * 这个文件属于 TUI 传输桥接层。
 * 它会被用户管理、项目管理、画像中心、管理工具等覆盖层页面使用，
 * 在这些页面需要后端 RPC 数据时，把调用切到独立 Node 进程里执行，
 * 从而避免在 npm 安装版 OpenCode 的 TUI 宿主里直接加载 gRPC 运行时。
 */

import { spawn } from "child_process"
import path from "path"
import { fileURLToPath } from "url"
import type {
  VmmGrpcApplyProfileInstructionRequest,
  VmmGrpcApplyProfileInstructionResponse,
  VmmGrpcDeleteProjectRequest,
  VmmGrpcDeleteProjectResponse,
  VmmGrpcDeleteUserRequest,
  VmmGrpcDeleteUserResponse,
  VmmGrpcEnsureProjectRequest,
  VmmGrpcEnsureProjectResponse,
  VmmGrpcGetProfileBundleRequest,
  VmmGrpcGetProfileBundleResponse,
  VmmGrpcGetProfileNodesRequest,
  VmmGrpcGetProfileNodesResponse,
  VmmGrpcGetTurnDetailsRequest,
  VmmGrpcGetTurnDetailsResponse,
  VmmGrpcHealthzResponse,
  VmmGrpcListProjectsResponse,
  VmmGrpcListUsersResponse,
  VmmGrpcMigrateProjectRequest,
  VmmGrpcMigrateProjectResponse,
  VmmGrpcResolveUserRequest,
  VmmGrpcResolveUserResponse,
  VmmGrpcSearchMemoryEventsRequest,
  VmmGrpcSearchMemoryEventsResponse,
  VmmGrpcTransportConfig,
  VmmGrpcUnaryResult,
  VmmGrpcWriteMemoriesRequest,
  VmmGrpcWriteMemoriesResponse,
} from "./vmm-grpc.js"

/**
 * Repository root used to resolve the built bridge worker from source-loaded TUI files.
 * 供源码态 TUI 文件解析构建产物 worker 的仓库根目录。
 *
 * The TUI plugin entry is loaded directly from `src`, while the bridge worker
 * is executed from `dist` so the child process can stay on the regular Node
 * runtime instead of the host TUI runtime.
 * TUI 插件入口是直接从 `src` 加载的，
 * 而桥接 worker 会从 `dist` 执行，这样子进程就能稳定跑在常规 Node 运行时，
 * 而不是继续落在当前正在排查的 TUI 宿主运行时里。
 */
const VMM_TUI_BRIDGE_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const VMM_TUI_BRIDGE_WORKER_PATH = path.join(
  VMM_TUI_BRIDGE_ROOT_DIR,
  "dist",
  "vmm-tui-grpc-bridge-worker.js",
)
const VMM_TUI_BRIDGE_NODE_EXECUTABLE = "node"

/**
 * Maximum number of concurrent child processes allowed at any time.
 * 同时允许运行的最大子进程数量。
 *
 * TUI screens can fire multiple bridge calls in rapid succession (e.g., loading
 * profile nodes, then bundle, then search). Without a cap, this spawns many
 * child processes that each consume memory. A small semaphore keeps the queue
 * bounded while keeping the API surface unchanged for callers.
 * TUI 页面可能快速连续发起多个桥接调用（例如加载画像节点、bundle、搜索）。
 * 如果不上限，会同时产生大量子进程消耗内存。
 * 用一个小型信号量保持队列有界，同时不改变调用者的 API 表面。
 */
const VMM_TUI_BRIDGE_MAX_CONCURRENT = 5
let activeBridgeProcesses = 0
const bridgeQueue: Array<() => void> = []

/**
 * Supported bridge operations required by current TUI screens.
 * 当前 TUI 页面需要的桥接操作集合。
 */
type VmmTuiGrpcBridgeRequest =
  | {
      kind: "healthz"
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "list-users"
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "resolve-user"
      request: VmmGrpcResolveUserRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "delete-user"
      request: VmmGrpcDeleteUserRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "list-projects"
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "ensure-project"
      request: VmmGrpcEnsureProjectRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "delete-project"
      request: VmmGrpcDeleteProjectRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "migrate-project"
      request: VmmGrpcMigrateProjectRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "get-profile-nodes"
      request: VmmGrpcGetProfileNodesRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "get-profile-bundle"
      request: VmmGrpcGetProfileBundleRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "apply-profile-instruction"
      request: VmmGrpcApplyProfileInstructionRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "search-memory-events"
      request: VmmGrpcSearchMemoryEventsRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "get-turn-details"
      request: VmmGrpcGetTurnDetailsRequest
      config?: VmmGrpcTransportConfig
    }
  | {
      kind: "write-memories"
      request: VmmGrpcWriteMemoriesRequest
      config?: VmmGrpcTransportConfig
    }

/**
 * Stable unary result map used to keep every bridge wrapper strongly typed.
 * 让每个桥接包装函数保持强类型的稳定 unary 结果映射。
 */
type VmmTuiGrpcBridgeResultMap = {
  healthz: VmmGrpcUnaryResult<VmmGrpcHealthzResponse>
  "list-users": VmmGrpcUnaryResult<VmmGrpcListUsersResponse>
  "resolve-user": VmmGrpcUnaryResult<VmmGrpcResolveUserResponse>
  "delete-user": VmmGrpcUnaryResult<VmmGrpcDeleteUserResponse>
  "list-projects": VmmGrpcUnaryResult<VmmGrpcListProjectsResponse>
  "ensure-project": VmmGrpcUnaryResult<VmmGrpcEnsureProjectResponse>
  "delete-project": VmmGrpcUnaryResult<VmmGrpcDeleteProjectResponse>
  "migrate-project": VmmGrpcUnaryResult<VmmGrpcMigrateProjectResponse>
  "get-profile-nodes": VmmGrpcUnaryResult<VmmGrpcGetProfileNodesResponse>
  "get-profile-bundle": VmmGrpcUnaryResult<VmmGrpcGetProfileBundleResponse>
  "apply-profile-instruction": VmmGrpcUnaryResult<VmmGrpcApplyProfileInstructionResponse>
  "search-memory-events": VmmGrpcUnaryResult<VmmGrpcSearchMemoryEventsResponse>
  "get-turn-details": VmmGrpcUnaryResult<VmmGrpcGetTurnDetailsResponse>
  "write-memories": VmmGrpcUnaryResult<VmmGrpcWriteMemoriesResponse>
}

/**
 * Worker-level fallback payload emitted when the child process catches a non-gRPC failure.
 * 子进程捕获到非 gRPC 失败时输出的 worker 级兜底结果结构。
 *
 * The parent bridge normalizes this shape back into the same unary result
 * contract that the rest of the plugin already understands.
 * 父级桥接层会把这类结果再次归一化成插件现有逻辑已经能理解的 unary 结果契约。
 */
type VmmTuiGrpcWorkerFailure = {
  ok: false
  workerError: true
  name: string
  message: string
  stack?: string
}

/**
 * Detect whether one parsed bridge payload is a worker-level fallback failure.
 * 判断一条已解析桥接结果是否属于 worker 级兜底失败结构。
 */
function isWorkerFailure(value: unknown): value is VmmTuiGrpcWorkerFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "workerError" in value &&
    (value as { workerError?: unknown }).workerError === true
  )
}

/**
 * Build one normalized unary failure from a worker-level exception payload.
 * 从 worker 级异常结果构建一条归一化 unary 失败结构。
 */
function buildWorkerFailureResult<TResponse>(
  kind: VmmTuiGrpcBridgeRequest["kind"],
  config: VmmGrpcTransportConfig | undefined,
  failure: VmmTuiGrpcWorkerFailure,
): VmmGrpcUnaryResult<TResponse> {
  return {
    ok: false,
    target: config?.grpcTarget ?? "",
    method: `node-bridge/${kind}`,
    error: new Error(failure.message),
    details: failure.message,
  }
}

/**
 * Parse one bridge stdout payload and normalize child-process failures.
 * 解析一次桥接 stdout 结果，并把子进程失败统一归一化。
 */
function parseBridgeResponse<TResponse>(
  kind: VmmTuiGrpcBridgeRequest["kind"],
  config: VmmGrpcTransportConfig | undefined,
  stdout: string,
): VmmGrpcUnaryResult<TResponse> {
  const trimmed = stdout.trim()
  if (!trimmed) {
    throw new Error("node bridge returned empty stdout")
  }

  const parsed = JSON.parse(trimmed) as VmmGrpcUnaryResult<TResponse> | VmmTuiGrpcWorkerFailure
  if (isWorkerFailure(parsed)) {
    return buildWorkerFailureResult<TResponse>(kind, config, parsed)
  }
  return parsed
}

/**
 * Execute one bridge request inside a dedicated Node child process.
 * 在独立 Node 子进程里执行一条桥接请求。
 *
 * The bridge now streams the JSON request through stdin/stdout instead of
 * squeezing the whole payload into one command-line argument. This avoids
 * Windows argument-length failures and keeps larger debug payloads usable.
 * 现在桥接层会通过 stdin/stdout 流式传输 JSON 请求，
 * 不再把整份载荷硬塞进单个命令行参数。
 * 这样既能规避 Windows 参数长度限制，也能让较大的调试载荷继续可用。
 */
/**
 * Acquire a concurrency slot or queue until one becomes available.
 * 获取并发槽位，如果没有可用槽位则排队等待。
 */
function tryAcquireBridgeSlot(): boolean {
  if (activeBridgeProcesses < VMM_TUI_BRIDGE_MAX_CONCURRENT) {
    activeBridgeProcesses++
    return true
  }
  return false
}

function releaseBridgeSlot() {
  activeBridgeProcesses--
  const next = bridgeQueue.shift()
  if (next) next()
}

/**
 * Execute one bridge request inside a dedicated Node child process.
 * 在独立 Node 子进程里执行一条桥接请求。
 *
 * The bridge now streams the JSON request through stdin/stdout instead of
 * squeezing the whole payload into one command-line argument. This avoids
 * Windows argument-length failures and keeps larger debug payloads usable.
 * 现在桥接层会通过 stdin/stdout 流式传输 JSON 请求，
 * 不再把整份载荷硬塞进单个命令行参数。
 * 这样既能规避 Windows 参数长度限制，也能让较大的调试载荷继续可用。
 */
function runVmmTuiGrpcBridge<TKey extends keyof VmmTuiGrpcBridgeResultMap>(
  request: Extract<VmmTuiGrpcBridgeRequest, { kind: TKey }>,
): Promise<VmmTuiGrpcBridgeResultMap[TKey]> {
  return new Promise((resolve, reject) => {
    /**
     * Serialize the request once so the worker can read it from stdin.
     * 先把请求序列化一次，让 worker 通过 stdin 读取。
     */
    const requestPayload = JSON.stringify(request)

    /**
     * Spawn the worker on the regular Node runtime rather than the TUI host runtime.
     * 让 worker 跑在常规 Node 运行时，而不是当前的 TUI 宿主运行时。
     */
    const child = spawn(
      VMM_TUI_BRIDGE_NODE_EXECUTABLE,
      [VMM_TUI_BRIDGE_WORKER_PATH],
      {
        cwd: VMM_TUI_BRIDGE_ROOT_DIR,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    )

    /**
     * Accumulate worker stdout/stderr so the parent can normalize the final outcome.
     * 聚合 worker 的 stdout/stderr，方便父级在结束后统一归一化结果。
     */
    let stdout = ""
    let stderr = ""
    let settled = false

    /**
     * Kill the child and reject if it does not exit within a bounded window.
     * Uses a two-phase kill: SIGTERM first, then SIGKILL after a grace period
     * to handle Windows where SIGTERM may not forcefully terminate.
     * 如果子进程在限定时间内未退出，则强制终止并 reject。
     * 使用两阶段终止：先 SIGTERM，再给一个宽限期后 SIGKILL，
     * 以应对 Windows 上 SIGTERM 可能无法强制终止的情况。
     */
    const bridgeTimeoutMs = 30_000
    const killGraceMs = 3_000
    let childKilled = false
    const timeout = setTimeout(() => {
      if (settled) return
      childKilled = true
      child.kill()
      // Schedule a force-kill if the child still hasn't exited.
      // 如果子进程在宽限期内仍未退出，则强制终止。
      setTimeout(() => {
        if (!settled) {
          try { child.kill("SIGKILL") } catch { /* already exited */ }
        }
      }, killGraceMs)
      settled = true
      reject(new Error(`node bridge timed out after ${bridgeTimeoutMs / 1000}s`))
    }, bridgeTimeoutMs)
    // Allow the event loop to exit even if this timer is still pending.
    // 让事件循环在该定时器挂起时也能正常退出。
    timeout.unref()

    function settleAndRelease() {
      clearTimeout(timeout)
      releaseBridgeSlot()
    }

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string | Buffer) => {
      stdout += String(chunk)
    })

    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string | Buffer) => {
      stderr += String(chunk)
    })

    child.on("error", (error) => {
      settleAndRelease()
      if (settled) return
      settled = true
      reject(new Error(`node bridge failed: ${error.message || "unknown child process error"}`))
    })

    child.on("close", (code, signal) => {
      settleAndRelease()
      if (settled) return
      settled = true

      const exitDetail =
        code !== null ? `exit code ${code}` : signal ? `signal ${signal}` : "unknown child process outcome"

      if (stdout.trim()) {
        try {
          resolve(
            parseBridgeResponse(
              request.kind,
              request.config,
              stdout,
            ) as VmmTuiGrpcBridgeResultMap[TKey],
          )
          return
        } catch (parseError) {
          // Kill the child to avoid leaving an orphaned process when
          // stdout parsing fails.
          // 当 stdout 解析失败时终止子进程，避免遗留孤儿进程。
          child.kill()
          reject(parseError)
          return
        }
      }

      reject(
        new Error(
          `node bridge failed: ${stderr.trim() || exitDetail || "unknown child process error"}`,
        ),
      )
    })

    /**
     * Write the request payload after the worker is online, then close stdin.
     * 在 worker 启动后写入请求载荷，并主动关闭 stdin。
     */
    child.stdin.setDefaultEncoding("utf8")
    child.stdin.on("error", () => {
      // Ignore late pipe errors because the close/error handlers above already
      // normalize the final child-process outcome.
      // 这里忽略迟到的管道错误，因为上面的 close/error 处理器已经会统一归一化最终结果。
    })
    try {
      child.stdin.end(requestPayload)
    } catch {
      // If stdin is already destroyed, ignore the write failure. The close
      // handler above will still fire and settle the promise.
      // 如果 stdin 已被销毁，忽略写入失败。上面的 close 处理器仍会触发并归一化结果。
    }
  })
}

/**
 * Execute the bridge request with concurrency limiting.
 * 在并发限制下执行桥接请求。
 */
function runBridgeWithConcurrency<TKey extends keyof VmmTuiGrpcBridgeResultMap>(
  request: Extract<VmmTuiGrpcBridgeRequest, { kind: TKey }>,
): Promise<VmmTuiGrpcBridgeResultMap[TKey]> {
  return new Promise((resolve, reject) => {
    function tryRun() {
      if (tryAcquireBridgeSlot()) {
        runVmmTuiGrpcBridge(request).then(resolve, reject)
      } else {
        bridgeQueue.push(tryRun)
      }
    }
    tryRun()
  })
}

/**
 * Fetch the live user list through the Node bridge.
 * 通过 Node bridge 获取实时用户列表。
 */
export function callVmmTuiListUsers(args: {
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "list-users",
    config: args.config,
  })
}

/**
 * Probe the backend liveness surface through the Node bridge.
 * 通过 Node bridge 探测后端存活接口。
 */
export function callVmmTuiHealthz(args: {
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "healthz",
    config: args.config,
  })
}

/**
 * Resolve or create one user through the Node bridge.
 * 通过 Node bridge 解析或创建一个用户。
 */
export function callVmmTuiResolveUser(args: {
  request: VmmGrpcResolveUserRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "resolve-user",
    request: args.request,
    config: args.config,
  })
}

/**
 * Delete one user through the Node bridge.
 * 通过 Node bridge 删除一个用户。
 */
export function callVmmTuiDeleteUser(args: {
  request: VmmGrpcDeleteUserRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "delete-user",
    request: args.request,
    config: args.config,
  })
}

/**
 * Fetch the live project list through the Node bridge.
 * 通过 Node bridge 获取实时项目列表。
 */
export function callVmmTuiListProjects(args: {
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "list-projects",
    config: args.config,
  })
}

/**
 * Resolve or create one project path through the Node bridge.
 * 通过 Node bridge 解析或创建一条项目路径。
 */
export function callVmmTuiEnsureProject(args: {
  request: VmmGrpcEnsureProjectRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "ensure-project",
    request: args.request,
    config: args.config,
  })
}

/**
 * Delete one project through the Node bridge.
 * 通过 Node bridge 删除一个项目。
 */
export function callVmmTuiDeleteProject(args: {
  request: VmmGrpcDeleteProjectRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "delete-project",
    request: args.request,
    config: args.config,
  })
}

/**
 * Migrate one project through the Node bridge.
 * 通过 Node bridge 迁移一个项目。
 */
export function callVmmTuiMigrateProject(args: {
  request: VmmGrpcMigrateProjectRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "migrate-project",
    request: args.request,
    config: args.config,
  })
}

/**
 * Fetch profile nodes through the Node bridge.
 * 通过 Node bridge 获取画像节点。
 */
export function callVmmTuiGetProfileNodes(args: {
  request: VmmGrpcGetProfileNodesRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "get-profile-nodes",
    request: args.request,
    config: args.config,
  })
}

/**
 * Fetch the full profile bundle through the Node bridge.
 * 通过 Node bridge 获取完整画像 bundle。
 *
 * The TUI host should not touch the gRPC stack directly, so even this
 * temporary bundle-inspection surface keeps using the same worker-based
 * transport detour as the other profile RPCs.
 * TUI 宿主不应该直接触碰 gRPC 运行时，
 * 因此即便是这个临时 bundle 检查界面，也继续复用和其他画像 RPC
 * 一致的 worker 桥接传输路径。
 */
export function callVmmTuiGetProfileBundle(args: {
  request: VmmGrpcGetProfileBundleRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "get-profile-bundle",
    request: args.request,
    config: args.config,
  })
}

/**
 * Apply one profile instruction through the Node bridge.
 * 通过 Node bridge 提交一条画像指令。
 */
export function callVmmTuiApplyProfileInstruction(args: {
  request: VmmGrpcApplyProfileInstructionRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "apply-profile-instruction",
    request: args.request,
    config: args.config,
  })
}

/**
 * Execute grouped active memory search through the Node bridge.
 * 通过 Node bridge 执行分组主动记忆搜索。
 */
export function callVmmTuiSearchMemoryEvents(args: {
  request: VmmGrpcSearchMemoryEventsRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "search-memory-events",
    request: args.request,
    config: args.config,
  })
}

/**
 * Execute exact turn-detail lookup through the Node bridge.
 * 通过 Node bridge 执行精确 turn 详情查询。
 */
export function callVmmTuiGetTurnDetails(args: {
  request: VmmGrpcGetTurnDetailsRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "get-turn-details",
    request: args.request,
    config: args.config,
  })
}

/**
 * Execute one direct memory-write batch through the Node bridge.
 * 通过 Node bridge 执行一批主动写记忆请求。
 */
export function callVmmTuiWriteMemories(args: {
  request: VmmGrpcWriteMemoriesRequest
  config?: VmmGrpcTransportConfig
}) {
  return runBridgeWithConcurrency({
    kind: "write-memories",
    request: args.request,
    config: args.config,
  })
}
