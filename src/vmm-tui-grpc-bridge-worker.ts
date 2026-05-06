/**
 * Dedicated Node worker used by the TUI gRPC bridge.
 * 供 TUI gRPC bridge 使用的独立 Node worker。
 *
 * This file belongs to the TUI transport bridge layer. The TUI screens do not
 * talk to gRPC directly anymore; instead they spawn this worker on the regular
 * Node runtime so the existing transport implementation can run outside the
 * npm-installed OpenCode TUI host runtime.
 * 这个文件属于 TUI 传输桥接层。
 * TUI 页面不再直接访问 gRPC，而是启动这个跑在常规 Node 运行时里的 worker，
 * 让现有传输实现脱离 npm 安装版 OpenCode 的 TUI 宿主环境执行。
 */

import {
  callVmmApplyProfileInstruction,
  callVmmDeleteProject,
  callVmmDeleteUser,
  callVmmEnsureProject,
  callVmmGetProfileBundle,
  callVmmGetProfileNodes,
  callVmmGetTurnDetails,
  callVmmHealthz,
  callVmmListProjects,
  callVmmListUsers,
  callVmmMigrateProject,
  callVmmResolveUser,
  callVmmSearchMemoryEvents,
  callVmmWriteMemories,
  type VmmGrpcApplyProfileInstructionRequest,
  type VmmGrpcDeleteProjectRequest,
  type VmmGrpcDeleteUserRequest,
  type VmmGrpcEnsureProjectRequest,
  type VmmGrpcGetProfileBundleRequest,
  type VmmGrpcGetProfileNodesRequest,
  type VmmGrpcGetTurnDetailsRequest,
  type VmmGrpcMigrateProjectRequest,
  type VmmGrpcResolveUserRequest,
  type VmmGrpcSearchMemoryEventsRequest,
  type VmmGrpcTransportConfig,
  type VmmGrpcWriteMemoriesRequest,
} from "./vmm-grpc.js"

/**
 * Supported bridge request envelope accepted by this worker.
 * 这个 worker 接受的桥接请求信封结构。
 */
type VmmTuiGrpcBridgeWorkerRequest =
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
 * Read one full UTF-8 stdin payload from the parent bridge.
 * 从父级桥接层读取完整的 UTF-8 stdin 载荷。
 *
 * The worker now prefers stdin so large debug payloads are not constrained by
 * platform command-line argument limits.
 * worker 现在优先走 stdin，
 * 这样较大的调试载荷就不会再受平台命令行参数长度限制。
 *
 * A 15-second timeout is applied so the worker does not hang indefinitely
 * if the parent never closes stdin.
 * 设置 15 秒超时，避免父进程永远不关闭 stdin 时 worker 无限挂起。
 */
function readWorkerStdinPayload() {
  return new Promise<string>((resolve, reject) => {
    let body = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk: string | Buffer) => {
      body += String(chunk)
    })
    process.stdin.on("end", () => {
      clearTimeout(timeout)
      resolve(body)
    })
    process.stdin.on("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })

    // Keep the process alive with a timeout so a missing stdin "end" event
    // does not cause an indefinite hang.
    // 设置超时定时器，确保缺失 stdin "end" 事件时不会无限卡死。
    const timeout = setTimeout(() => {
      reject(new Error("stdin read timeout after 15s"))
    }, 15_000)
    timeout.unref()
  })
}

/**
 * Decode the request payload passed from the parent bridge.
 * 解析父级桥接层传入的请求载荷。
 *
 * Stdin is the primary transport. The legacy base64url argv path stays as a
 * narrow fallback so the worker remains tolerant during rolling updates.
 * stdin 是当前主传输方式。
 * 旧的 base64url argv 路径只作为窄兜底保留，方便滚动更新期间继续兼容。
 */
async function decodeWorkerRequest() {
  const encodedPayload = process.argv[2]
  if (typeof encodedPayload === "string" && encodedPayload.trim()) {
    const decodedPayload = Buffer.from(encodedPayload, "base64url").toString("utf8")
    return JSON.parse(decodedPayload) as VmmTuiGrpcBridgeWorkerRequest
  }

  const stdinPayload = (await readWorkerStdinPayload()).trim()
  if (!stdinPayload) {
    throw new Error("missing bridge payload")
  }

  return JSON.parse(stdinPayload) as VmmTuiGrpcBridgeWorkerRequest
}

/**
 * Execute the requested RPC and print the normalized unary result as JSON.
 * 执行指定 RPC，并把归一化 unary 结果以 JSON 输出。
 */
async function main() {
  const request = await decodeWorkerRequest()

  /**
   * Serialize the result safely, guarding against undefined return values
   * that would produce invalid JSON output.
   * 安全地序列化结果，防御返回 undefined 时产生无效 JSON 输出。
   */
  function safeWriteJson(value: unknown) {
    if (value === undefined || value === null) {
      process.stdout.write(
        JSON.stringify({
          ok: false,
          workerError: true,
          name: "Error",
          message: "worker returned undefined for this request",
        }),
      )
      return
    }
    process.stdout.write(JSON.stringify(value))
  }

  switch (request.kind) {
    case "healthz": {
      safeWriteJson(await callVmmHealthz({ config: request.config }))
      return
    }
    case "list-users": {
      safeWriteJson(await callVmmListUsers({ config: request.config }))
      return
    }
    case "resolve-user": {
      safeWriteJson(
        await callVmmResolveUser({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "delete-user": {
      safeWriteJson(
        await callVmmDeleteUser({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "list-projects": {
      safeWriteJson(await callVmmListProjects({ config: request.config }))
      return
    }
    case "ensure-project": {
      safeWriteJson(
        await callVmmEnsureProject({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "delete-project": {
      safeWriteJson(
        await callVmmDeleteProject({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "migrate-project": {
      safeWriteJson(
        await callVmmMigrateProject({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "get-profile-nodes": {
      safeWriteJson(
        await callVmmGetProfileNodes({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "get-profile-bundle": {
      safeWriteJson(
        await callVmmGetProfileBundle({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "apply-profile-instruction": {
      safeWriteJson(
        await callVmmApplyProfileInstruction({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "search-memory-events": {
      safeWriteJson(
        await callVmmSearchMemoryEvents({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "get-turn-details": {
      safeWriteJson(
        await callVmmGetTurnDetails({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    case "write-memories": {
      safeWriteJson(
        await callVmmWriteMemories({
          request: request.request,
          config: request.config,
        }),
      )
      return
    }
    default: {
      throw new Error("unsupported bridge request kind")
    }
  }
}

void main().catch((error) => {
  /**
   * Keep one stable stdout payload even when the worker itself fails.
   * 即使 worker 自身失败，也保持一份稳定的 stdout 结构给父级桥接层解析。
   *
   * Stack traces are intentionally omitted from stdout to avoid leaking
   * internal file paths.
   * 有意不在 stdout 中输出堆栈信息，避免泄露内部文件路径。
   */
  process.stdout.write(
    JSON.stringify({
      ok: false,
      workerError: true,
      name: error instanceof Error ? error.name : "Error",
      message: error instanceof Error ? error.message : String(error),
    }) + "\n",
  )
})
