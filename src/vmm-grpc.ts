/**
 * gRPC client helpers for the VMM transport and workspace command layer.
 * VMM 传输层与工作区命令层使用的 gRPC 客户端辅助模块。
 *
 * This file belongs to the transport/integration layer. It is used by
 * `memory-sync.ts` for the business chain, and by `plugin.ts` for workspace
 * administration commands that bind or mutate users and projects.
 * 这个文件属于传输与集成层，既服务于 `memory-sync.ts` 的业务链调用，
 * 也服务于 `plugin.ts` 的工作区管理命令，用来绑定或变更用户与项目。
 */
import crypto from "crypto"
import * as http2 from "node:http2"
import path from "path"
import { fileURLToPath } from "url"
import type * as grpcType from "@grpc/grpc-js"
import { writeLog } from "./logger.js"
import {
  DEFAULT_GRPC_KEEPALIVE_TIME_MS,
  DEFAULT_GRPC_KEEPALIVE_TIMEOUT_MS,
  DEFAULT_GRPC_KEEPALIVE_PERMIT_WITHOUT_CALLS,
  normalizeStrictPositiveConfigInteger,
  type VmmRuntimeConfig,
} from "./vmm-config.js"

/**
 * Runtime module candidates exposed by different hosts for CommonJS packages.
 * 不同宿主在加载 CommonJS 包时可能暴露出来的运行时模块形态。
 *
 * OpenCode `web` does not always mirror Node's namespace import surface, so
 * the transport layer normalizes `default` and `module.exports` shims here.
 * OpenCode `web` 不一定完全复刻 Node 的命名空间导入表面，
 * 因此传输层在这里统一兼容 `default` 与 `module.exports` 这类宿主包装。
 */
type VmmRuntimeModuleCandidate<T extends object> =
  | T
  | {
      default?: T
      "module.exports"?: T
    }

/**
 * Static type surface exported by `@grpc/proto-loader`.
 * `@grpc/proto-loader` 暴露出来的静态类型表面。
 *
 * The transport keeps the package as type-only information here, then loads
 * the actual runtime lazily through dynamic import for host compatibility.
 * 这里把该包只保留为类型信息，真正的运行时则通过动态导入按需加载，
 * 以兼容不同宿主的模块互操作差异。
 */
type VmmProtoLoaderModule = typeof import("@grpc/proto-loader")

/**
 * Static type surface exported by `@grpc/grpc-js`.
 * `@grpc/grpc-js` 暴露出来的静态类型表面。
 *
 * Splitting runtime loading from type references avoids depending on any
 * specific ESM namespace wrapping behavior from the host process.
 * 把运行时加载与类型引用拆开，可以避免依赖宿主进程对 ESM 命名空间
 * 的某一种特定包装行为。
 */
type VmmGrpcModule = typeof import("@grpc/grpc-js")

/**
 * Minimal proto-loader surface needed by this transport file.
 * 当前传输文件真正依赖的 proto-loader 最小运行时能力。
 *
 * Narrowing the contract keeps host-compat normalization explicit, so a
 * partial or wrapped export fails fast with a clear transport error.
 * 这里把契约收窄到当前文件真正需要的能力，
 * 是为了让宿主兼容归一化更明确，并在导出不完整时快速抛出可定位错误。
 */
type VmmProtoLoaderRuntime = Pick<VmmProtoLoaderModule, "load">

/**
 * Minimal grpc-js surface needed by this transport file.
 * 当前传输文件真正依赖的 grpc-js 最小运行时能力。
 *
 * The plugin only needs package loading and insecure local credentials in the
 * current architecture, so the normalized runtime stays intentionally small.
 * 现阶段插件架构只依赖包定义加载与本地非加密凭据，
 * 因而这里故意保持最小运行时表面，避免把宿主差异扩散到其他逻辑。
 */
type VmmGrpcRuntime = Pick<VmmGrpcModule, "loadPackageDefinition" | "credentials" | "Metadata" | "status">

/**
 * Async runtime-module loader contract shared by production and tests.
 * 生产链路与测试链路共用的异步运行时模块加载契约。
 *
 * Tests override this loader so they can deterministically simulate import
 * failures and fake grpc runtimes without mutating the real host environment.
 * 测试会覆盖这条加载器，
 * 以便稳定模拟动态导入失败和伪造 grpc 运行时，
 * 而不必去篡改真实宿主环境。
 */
type VmmRuntimeModuleLoader = <T extends object>(
  moduleName: string,
) => Promise<VmmRuntimeModuleCandidate<T>>

/**
 * Decide whether a candidate exposes proto-loader's async load API.
 * 判断候选对象是否暴露了 proto-loader 的异步 load API。
 *
 * This guard is used for host compatibility because some runtimes wrap the
 * CommonJS export one layer deeper.
 * 这个守卫用于宿主兼容判断，
 * 因为有些运行时会把 CommonJS 导出再包一层。
 */
function isProtoLoaderRuntime(candidate: unknown): candidate is VmmProtoLoaderRuntime {
  return typeof (candidate as VmmProtoLoaderRuntime | undefined)?.load === "function"
}

/**
 * Decide whether a candidate exposes grpc-js package loading primitives.
 * 判断候选对象是否暴露了 grpc-js 的包加载基础能力。
 *
 * The `credentials.createInsecure` check matters because the plugin creates
 * local loopback clients, and a partial export would still break later calls.
 * 这里额外校验 `credentials.createInsecure`，
 * 是因为插件后续会创建本地回环客户端，半残导出会在更晚的位置再次出错。
 */
function isGrpcRuntime(candidate: unknown): candidate is VmmGrpcRuntime {
  return (
    typeof (candidate as VmmGrpcRuntime | undefined)?.loadPackageDefinition === "function" &&
    typeof (candidate as VmmGrpcRuntime | undefined)?.credentials?.createInsecure === "function"
  )
}

/**
 * Normalize wrapped CommonJS exports into the actual runtime object we need.
 * 把被宿主包装过的 CommonJS 导出归一化成当前真正需要的运行时对象。
 *
 * Web and CLI hosts can shape namespace imports differently. Resolving the
 * runtime surface once at module load time prevents repeated branching during
 * every chat turn and keeps transport failures deterministic.
 * `web` 与 CLI 宿主对命名空间导入的包装方式可能不同。
 * 在模块初始化时一次性解析真实运行时表面，可以避免每轮对话重复分支，
 * 也让传输层失败表现保持稳定可预测。
 */
function collectRuntimeCandidates(moduleCandidate: unknown) {
  const candidates: unknown[] = []
  const queue: unknown[] = [moduleCandidate]
  const visited = new Set<unknown>()

  while (queue.length > 0) {
    const current = queue.shift()
    if (current === undefined || current === null || visited.has(current)) {
      continue
    }

    visited.add(current)
    candidates.push(current)

    if (typeof current !== "object" && typeof current !== "function") {
      continue
    }

    const wrappedCandidate = current as {
      default?: unknown
      "module.exports"?: unknown
    }
    queue.push(wrappedCandidate.default, wrappedCandidate["module.exports"])
  }

  return candidates
}

/**
 * Normalize wrapped CommonJS exports into the actual runtime object we need.
 * 把被宿主包装过的 CommonJS 导出归一化成当前真正需要的运行时对象。
 *
 * Some hosts can wrap CommonJS packages through several nested `default` or
 * `module.exports` layers. The transport therefore walks those wrappers
 * recursively instead of assuming a fixed wrapper depth.
 * 某些宿主会把 CommonJS 包套上多层 `default` 或 `module.exports` 包装。
 * 因此这里改为递归展开这些包装，而不再假设它只有固定的一层。
 */
function resolveRuntimeModule<T extends object>(
  moduleCandidate: VmmRuntimeModuleCandidate<T>,
  predicate: (candidate: unknown) => candidate is T,
  moduleName: string,
) {
  const candidateList = collectRuntimeCandidates(moduleCandidate)

  for (const candidate of candidateList) {
    if (predicate(candidate)) {
      return candidate
    }
  }

  throw new Error(`Failed to resolve runtime module surface for ${moduleName}`)
}

/**
 * Default runtime-module loader used by production requests.
 * 生产请求默认使用的运行时模块加载器。
 *
 * The implementation stays isolated here so tests can temporarily swap the
 * loader while keeping the rest of the transport logic unchanged.
 * 这里把默认实现单独收口，
 * 是为了让测试可以临时替换加载器，
 * 同时不改动其余传输层逻辑。
 */
const defaultRuntimeModuleLoader: VmmRuntimeModuleLoader = async <T extends object>(moduleName: string) => {
  try {
    return (await import(moduleName)) as VmmRuntimeModuleCandidate<T>
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to import runtime module ${moduleName}: ${message}`)
  }
}

/**
 * Optional runtime-module loader override used only by regression tests.
 * 仅供回归测试使用的可选运行时模块加载覆盖器。
 *
 * Production code leaves this as `undefined`. Tests set it explicitly so they
 * can drive the transport through failure and recovery paths deterministically.
 * 生产代码会把它保持为 `undefined`。
 * 测试会显式设置它，用来稳定驱动传输层经过失败与恢复路径。
 */
let runtimeModuleLoaderOverrideForTests: VmmRuntimeModuleLoader | undefined

/**
 * Load one runtime module through the host's dynamic import semantics.
 * 通过宿主的动态导入语义加载一个运行时模块。
 *
 * Some OpenCode hosts reject synchronous `require()` for async-wrapped
 * packages, so transport runtime resolution must stay fully async here.
 * 某些 OpenCode 宿主会拒绝对异步包装包执行同步 `require()`，
 * 因而这里的传输层运行时解析必须保持完全异步。
 */
async function loadRuntimeModule<T extends object>(moduleName: string) {
  const activeLoader = runtimeModuleLoaderOverrideForTests ?? defaultRuntimeModuleLoader
  return activeLoader<T>(moduleName)
}

/**
 * Cached runtime set shared by all gRPC loading and client construction paths.
 * 所有 proto 加载与客户端构造路径共用的运行时缓存集合。
 *
 * Runtime resolution is deferred until the transport is actually used so the
 * plugin can still boot in hosts that only support async module loading.
 * 这里把运行时解析延迟到真正使用传输层时再执行，
 * 这样插件即使运行在只支持异步模块加载的宿主里也能先正常启动。
 */
type VmmResolvedTransportRuntime = {
  protoLoaderRuntime: VmmProtoLoaderRuntime
  grpcRuntime: VmmGrpcRuntime
}

/**
 * One lazy promise caches the runtime normalization for the whole process.
 * 一条惰性 Promise 缓存整个进程的运行时归一化结果。
 *
 * Both CLI and `web` may invoke many RPC helpers in one session. Sharing a
 * single resolved runtime avoids repeated dynamic imports and keeps behavior
 * identical after the first successful normalization.
 * CLI 与 `web` 在一个会话里都可能多次进入 RPC 辅助函数。
 * 共享一份已解析运行时，既能避免重复动态导入，
 * 也能保证首次成功归一化后后续行为保持一致。
 */
let cachedTransportRuntimePromise: Promise<VmmResolvedTransportRuntime> | undefined

/**
 * Resolve and cache the gRPC runtime set needed by this transport file.
 * 解析并缓存当前传输文件所需的 gRPC 运行时集合。
 *
 * The helper normalizes dynamic-import results once so every RPC path can rely
 * on the same `proto-loader` and `grpc-js` surface afterwards.
 * 该辅助函数会把动态导入结果统一归一化一次，
 * 让后续所有 RPC 路径都依赖同一份 `proto-loader` 与 `grpc-js` 表面。
 */
async function getTransportRuntimeSet() {
  if (!cachedTransportRuntimePromise) {
    const runtimePromise = (async () => {
      const protoLoaderCandidate = await loadRuntimeModule<VmmProtoLoaderModule>("@grpc/proto-loader")
      const grpcCandidate = await loadRuntimeModule<VmmGrpcModule>("@grpc/grpc-js")
      const protoLoaderRuntime = resolveRuntimeModule(
        protoLoaderCandidate,
        isProtoLoaderRuntime,
        "@grpc/proto-loader",
      )
      const grpcRuntime = resolveRuntimeModule(grpcCandidate, isGrpcRuntime, "@grpc/grpc-js")

      return {
        protoLoaderRuntime,
        grpcRuntime,
      } satisfies VmmResolvedTransportRuntime
    })()

    const guardedRuntimePromise = runtimePromise.catch((error) => {
      if (cachedTransportRuntimePromise === guardedRuntimePromise) {
        cachedTransportRuntimePromise = undefined
      }
      throw error
    })
    cachedTransportRuntimePromise = guardedRuntimePromise
  }

  return cachedTransportRuntimePromise
}

/**
 * Proto loading constants shared by all gRPC calls.
 * 所有 gRPC 调用共用的 proto 加载常量。
 *
 * The plugin vendors the proto locally so runtime transport does not depend on
 * a sibling backend repository being present on disk.
 * 插件把 proto 内置在仓库里，是为了让运行时传输不依赖旁边的后端仓库
 * 必须同时存在于磁盘上。
 */
const PLUGIN_ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const VMM_PROTO_PATH = path.join(PLUGIN_ROOT_DIR, "proto", "v1", "vmm.proto")
const VMM_SERVICE_METHOD_HEALTHZ = "vmm.v1.VMMService/Healthz"
const VMM_SERVICE_METHOD_LIST_PROJECTS = "vmm.v1.VMMService/ListProjects"
const VMM_SERVICE_METHOD_RESOLVE_PROJECT = "vmm.v1.VMMService/ResolveProject"
const VMM_SERVICE_METHOD_ENSURE_PROJECT = "vmm.v1.VMMService/EnsureProject"
const VMM_SERVICE_METHOD_DELETE_PROJECT = "vmm.v1.VMMService/DeleteProject"
const VMM_SERVICE_METHOD_MIGRATE_PROJECT = "vmm.v1.VMMService/MigrateProject"
const VMM_SERVICE_METHOD_RESOLVE_USER = "vmm.v1.VMMService/ResolveUser"
const VMM_SERVICE_METHOD_LIST_USERS = "vmm.v1.VMMService/ListUsers"
const VMM_SERVICE_METHOD_DELETE_USER = "vmm.v1.VMMService/DeleteUser"
const VMM_SERVICE_METHOD_GET_PROFILE_NODES = "vmm.v1.VMMService/GetProfileNodes"
const VMM_SERVICE_METHOD_GET_PROFILE_BUNDLE = "vmm.v1.VMMService/GetProfileBundle"
const VMM_SERVICE_METHOD_APPLY_PROFILE_INSTRUCTION = "vmm.v1.VMMService/ApplyProfileInstruction"
const VMM_SERVICE_METHOD_SEARCH_MEMORY_EVENTS = "vmm.v1.VMMService/SearchMemoryEvents"
const VMM_SERVICE_METHOD_GET_TURN_DETAILS = "vmm.v1.VMMService/GetTurnDetails"
const VMM_SERVICE_METHOD_WRITE_MEMORIES = "vmm.v1.VMMService/WriteMemories"
const VMM_SERVICE_METHOD_DELETE_MEMORIES = "vmm.v1.VMMService/DeleteMemories"
const VMM_SERVICE_METHOD_CHAT_COMPACT = "vmm.v1.VMMService/ChatCompact"
const VMM_SERVICE_METHOD_PRE_CHECK = "vmm.v1.VMMService/PreCheck"
const VMM_SERVICE_METHOD_POST_ACTION = "vmm.v1.VMMService/PostAction"

/**
 * Shared transport config understood by the gRPC client layer.
 * gRPC 客户端层理解的通用传输配置。
 *
 * The transport layer uses explicit gRPC naming so config, logs, and runtime
 * behavior all point at the same protocol.
 * 传输层使用显式的 gRPC 命名，
 * 让配置、日志和运行时行为都指向同一种协议语义。
 */
export type VmmGrpcTransportConfig = {
  /**
   * Primary gRPC endpoint used for VMM calls, normally the vulcan-host relay.
   * VMM 调用使用的首选 gRPC 端点，通常是 vulcan-host 中转地址。
   */
  grpcTarget?: string
  grpcApiKey?: string
  grpcHandshakeTimeoutMs?: number
  grpcReceiveTimeoutMs?: number
  grpcKeepaliveTimeMs?: number
  grpcKeepaliveTimeoutMs?: number
  grpcKeepalivePermitWithoutCalls?: number
}

/**
 * Extract the gRPC transport config subset from a full runtime config.
 * 从完整运行时配置中提取 gRPC 传输配置子集。
 *
 * The plugin passes transport config to multiple gRPC call helpers. Using this
 * centralized extractor avoids manual field-by-field mapping at every call site
 * and ensures new transport fields are propagated automatically.
 * 插件会把传输配置传给多个 gRPC 调用辅助函数。使用这个集中提取函数，
 * 可以避免在每个调用点手动逐字段映射，并确保新增传输字段能自动传播。
 */
export function extractTransportConfig(
  config: Pick<
    VmmRuntimeConfig,
    | "grpcTarget"
    | "vulcanHostTarget"
    | "grpcApiKey"
    | "grpcHandshakeTimeoutMs"
    | "grpcReceiveTimeoutMs"
    | "grpcKeepaliveTimeMs"
    | "grpcKeepaliveTimeoutMs"
    | "grpcKeepalivePermitWithoutCalls"
  >,
): VmmGrpcTransportConfig {
  return {
    grpcTarget: config.vulcanHostTarget || config.grpcTarget,
    grpcApiKey: config.grpcApiKey,
    grpcHandshakeTimeoutMs: config.grpcHandshakeTimeoutMs,
    grpcReceiveTimeoutMs: config.grpcReceiveTimeoutMs,
    grpcKeepaliveTimeMs: config.grpcKeepaliveTimeMs,
    grpcKeepaliveTimeoutMs: config.grpcKeepaliveTimeoutMs,
    grpcKeepalivePermitWithoutCalls: config.grpcKeepalivePermitWithoutCalls,
  }
}

/**
 * Narrow keepalive option slice passed into grpc-js client constructors.
 * 传给 grpc-js 客户端构造器的 keepalive 选项切片。
 *
 * Keeping this as a dedicated shape makes pooling decisions deterministic when
 * the same target is reused with different keepalive settings later.
 * 单独抽出这组结构，是为了让同一 target 在后续使用不同 keepalive 配置时，
 * 连接池能够做出确定性的复用或重建决策。
 */
type VmmGrpcKeepaliveChannelOptions = {
  "grpc.keepalive_time_ms": number
  "grpc.keepalive_timeout_ms": number
  "grpc.keepalive_permit_without_calls": 0 | 1
}

/**
 * One canonical project node returned by admin RPCs.
 * 管理 RPC 返回的一条标准项目节点。
 *
 * Numeric identifiers stay as decimal strings here because JavaScript number
 * cannot safely represent every uint64 value without precision loss.
 * 这里把数字标识保留成十进制字符串，
 * 是因为 JavaScript number 无法无损表示所有 uint64 值。
 */
export type VmmGrpcProjectEntry = {
  project_id: string
  team_id: string
  space_id: string
  team_name: string
  space_name: string
  project_name: string
  display_path: string
}

/**
 * One canonical user node returned by admin RPCs.
 * 管理 RPC 返回的一条标准用户节点。
 */
export type VmmGrpcUserEntry = {
  user_id: string
  user_name: string
}

/**
 * Empty request body used by grpc empty methods.
 * gRPC 空请求方法使用的请求体。
 */
type VmmGrpcEmptyRequest = Record<string, never>

/**
 * Health-check response returned by the gateway liveness probe.
 * 网关存活探针返回的健康检查响应。
 *
 * TUI debug pages use this lightweight surface to distinguish “transport is
 * unreachable” from “business-scope ids are misconfigured”.
 * TUI 调试页会用这条轻量接口区分“传输链不可达”和“业务作用域配置错误”。
 */
export type VmmGrpcHealthzResponse = {
  status: string
  trace_id: string
}

/**
 * Workspace admin request and response contracts.
 * 工作区管理面请求与响应契约。
 *
 * These types mirror the current VMM gRPC contract so slash commands can
 * resolve, list, create, delete, and migrate scopes without guessing fields.
 * 这些类型直接对应当前 VMM 的 gRPC 契约，
 * 让 slash 命令可以准确执行解析、列表、创建、删除和迁移。
 */
export type VmmGrpcListProjectsResponse = {
  projects: VmmGrpcProjectEntry[]
  trace_id: string
}

export type VmmGrpcResolveProjectRequest = {
  project_ref: string
}

export type VmmGrpcResolveProjectResponse = {
  project?: VmmGrpcProjectEntry
  message: string
  trace_id: string
}

export type VmmGrpcEnsureProjectRequest = {
  project_path: string
  confirm_create: boolean
}

export type VmmGrpcEnsureProjectResponse = {
  project?: VmmGrpcProjectEntry
  message: string
  exists: boolean
  needs_confirm: boolean
  created_team: boolean
  created_space: boolean
  created_project: boolean
  missing_team: boolean
  missing_space: boolean
  trace_id: string
}

export type VmmGrpcDeleteProjectRequest = {
  project_path: string
  confirm_delete: boolean
}

export type VmmGrpcDeleteProjectResponse = {
  project?: VmmGrpcProjectEntry
  message: string
  needs_confirm: boolean
  deleted_sessions: number
  deleted_messages: number
  deleted_memories: number
  deleted_vector_rows: string
  trace_id: string
}

export type VmmGrpcMigrateProjectRequest = {
  source_project_path: string
  target_project_path: string
  confirm_migrate: boolean
}

export type VmmGrpcMigrateProjectResponse = {
  source_project?: VmmGrpcProjectEntry
  target_project?: VmmGrpcProjectEntry
  message: string
  needs_confirm: boolean
  migrated_sessions: number
  migrated_messages: number
  migrated_memories: number
  rebuilt_vector_rows: number
  trace_id: string
}

export type VmmGrpcResolveUserRequest = {
  user_ref: string
  confirm_create: boolean
}

export type VmmGrpcResolveUserResponse = {
  user?: VmmGrpcUserEntry
  message: string
  created: boolean
  exists: boolean
  trace_id: string
}

export type VmmGrpcListUsersResponse = {
  users: VmmGrpcUserEntry[]
  trace_id: string
}

export type VmmGrpcDeleteUserRequest = {
  user_ref: string
  confirmation_code: string
}

export type VmmGrpcDeleteUserResponse = {
  user?: VmmGrpcUserEntry
  message: string
  requires_confirmation: boolean
  confirmation_code: string
  deleted_sessions: number
  deleted_messages: number
  deleted_memories: number
  deleted_vector_rows: string
  trace_id: string
}

/**
 * Profile target enum names exposed by the current VMM gRPC contract.
 * 当前 VMM gRPC 契约暴露的画像目标枚举名称。
 *
 * The transport keeps enum values as string literals because `proto-loader`
 * is configured with `enums: String`, so callers can compare stable names
 * without depending on numeric enum ordinals.
 * 这里把枚举值保留成字符串字面量，
 * 是因为 `proto-loader` 以 `enums: String` 模式加载，
 * 这样调用方可以直接比较稳定名称，而不需要依赖数字枚举序号。
 */
export type VmmGrpcProfileTarget =
  | "PROFILE_TARGET_UNSPECIFIED"
  | "PROFILE_TARGET_USER"
  | "PROFILE_TARGET_PROJECT"
  | "PROFILE_TARGET_TEAM"
  | "PROFILE_TARGET_SPACE"
  | "PROFILE_TARGET_ALL"

/**
 * Profile node source enum names returned by the VMM profile surface.
 * VMM 画像接口返回的画像节点来源枚举名称。
 */
export type VmmGrpcProfileNodeSourceKind =
  | "PROFILE_NODE_SOURCE_KIND_UNSPECIFIED"
  | "PROFILE_NODE_SOURCE_KIND_TURN_EXTRACT"
  | "PROFILE_NODE_SOURCE_KIND_MANUAL_INSTRUCTION"
  | "PROFILE_NODE_SOURCE_KIND_SYSTEM_SEED"
  | "PROFILE_NODE_SOURCE_KIND_RETAINED_AFTER_USER_DELETE"

/**
 * Stable category labels returned by the AI-facing memory search surface.
 * 面向 AI 的记忆搜索接口返回的稳定分类标签。
 *
 * The backend now exposes human-readable labels instead of numeric enums so
 * tools and prompt orchestration can reason about memory categories directly.
 * 后端现在直接返回人类可读的标签，而不是数字枚举，
 * 这样 tools 和提示词编排层就能直接理解记忆类别语义。
 */
export type VmmGrpcMemoryCategoryLabel =
  | "general"
  | "architecture_decision"
  | "tech_spec_api"
  | "business_logic"
  | "requirement_todo"
  | "project_context"
  | "logical_bug_debt"
  | "security_policy"

/**
 * Compact numeric scope values accepted by the AI-facing memory-write surface.
 * 面向 AI 的记忆写入接口接受的紧凑数字 scope 值。
 *
 * The backend documentation freezes these concept numbers so the tool layer can
 * describe them clearly without forcing callers to spell proto enum names.
 * 后端文档已经冻结了这些概念数字，
 * 因此 tool 层可以直接向调用方说明含义，而不再要求输入 proto 枚举名。
 */
export type VmmGrpcMemoryScopeLevel = 0 | 1 | 2 | 3

/**
 * Compact numeric priority values accepted by the AI-facing memory-write surface.
 * 面向 AI 的记忆写入接口接受的紧凑数字 priority 值。
 */
export type VmmGrpcMemoryPriority = 0 | 1 | 2 | 3

/**
 * Compact numeric memory-level values accepted by the AI-facing write surface.
 * 面向 AI 的记忆写入接口接受的紧凑数字 memory level 值。
 */
export type VmmGrpcMemoryLevel = 0 | 1 | 2 | 3 | 4

/**
 * One active profile node returned by profile read or write RPCs.
 * 画像读写 RPC 返回的一条 active 画像节点。
 *
 * Long integer fields stay as decimal strings here for the same reason as
 * project/user ids: JavaScript numbers cannot safely represent every uint64.
 * 这里继续把长整数字段保留成十进制字符串，
 * 原因和 project/user id 一样：JavaScript number 不能安全承载所有 uint64。
 */
export type VmmGrpcProfileNodeEntry = {
  profile_node_id: string
  target: VmmGrpcProfileTarget
  bind_id: string
  content: string
  priority: string
  level: string
  refresh_weight: number
  profile_date: string
  expires_timestamp: string
  level_reason: string
  source_kind: VmmGrpcProfileNodeSourceKind
  source_id: string
}

/**
 * One retired profile node returned after a manual instruction review.
 * 手工画像指令评审后返回的一条退役画像节点。
 */
export type VmmGrpcRetiredProfileNodeEntry = {
  profile_node_id: string
  reason: string
}

/**
 * Profile-node read request understood by the transport layer.
 * 传输层理解的画像节点读取请求。
 *
 * Callers provide the effective bound ids as decimal strings while transport
 * forwards them onto the uint64 gRPC fields defined by the proto.
 * 调用方以十进制字符串形式提供当前生效绑定 id，
 * 传输层再把它们转发到 proto 定义的 uint64 字段上。
 */
export type VmmGrpcGetProfileNodesRequest = {
  target: VmmGrpcProfileTarget
  user_id: string
  project_id: string
  limit: number
}

/**
 * Profile-node read response exposed to command execution.
 * 暴露给命令执行层的画像节点读取响应。
 */
export type VmmGrpcGetProfileNodesResponse = {
  nodes: VmmGrpcProfileNodeEntry[]
  trace_id: string
}

/**
 * Profile bundle mode enum names returned by the VMM bundle surface.
 * VMM 画像 bundle 接口返回的 bundle 模式枚举名称。
 *
 * The transport keeps enum values as strings so the TUI test surface can
 * decide whether it received a full merged bundle or split scope blocks
 * without depending on numeric enum ordinals.
 * 这里继续把枚举值保留成字符串，
 * 这样 TUI 测试界面就可以直接判断自己拿到的是完整合并 bundle，
 * 还是拆分后的 scope 文本，而不需要依赖数字枚举序号。
 */
export type VmmGrpcProfileBundleMode =
  | "PROFILE_BUNDLE_MODE_UNSPECIFIED"
  | "PROFILE_BUNDLE_MODE_FULL"
  | "PROFILE_BUNDLE_MODE_SPLIT"

/**
 * Full-profile bundle request consumed by the transport layer.
 * 传输层消费的完整画像 bundle 请求。
 *
 * Bundle reads are keyed by the current user/project pair instead of one
 * single scope target. The caller also chooses whether the backend should
 * return one authoritative combined prompt text or keep the four
 * TEAM/SPACE/PROJECT/USER pieces split.
 * bundle 读取是按当前 user/project 组合取数，而不是按单个 scope 取数。
 * 同时调用方还要决定让后端返回一段权威的完整组合提示词，
 * 还是维持 TEAM / SPACE / PROJECT / USER 的拆分文本。
 *
 * `include_explanation` only affects FULL mode. The latest proto now models it
 * as an optional bool, so callers may omit it and let the backend choose the
 * default behavior.
 * `include_explanation` 只对 FULL 模式生效。
 * 最新 proto 已经把它建模成 optional bool，因此调用方既可以显式传值，
 * 也可以省略该字段并交给后端决定默认行为。
 */
export type VmmGrpcGetProfileBundleRequest = {
  user_id: string
  project_id: string
  mode: VmmGrpcProfileBundleMode
  include_explanation?: boolean
}

/**
 * Full-profile bundle response exposed to inspection surfaces.
 * 暴露给检查界面的完整画像 bundle 响应。
 *
 * The latest proto keeps both the split scope texts and the optionally
 * assembled prompt bundle on the same response, so callers should still follow
 * `mode` when deciding which shape to render.
 * 最新 proto 会在同一份响应里同时保留拆分 scope 文本和按需生成的组合提示词，
 * 因此调用方仍然应该依据 `mode` 决定实际渲染哪一种形态。
 */
export type VmmGrpcGetProfileBundleResponse = {
  mode: VmmGrpcProfileBundleMode
  include_explanation: boolean
  explanation_text: string
  environment_priority_text: string
  combined_text: string
  team_profile: string
  space_profile: string
  project_profile: string
  user_profile: string
  trace_id: string
}

/**
 * Manual profile instruction request consumed by the transport layer.
 * 传输层消费的手工画像指令请求。
 */
export type VmmGrpcApplyProfileInstructionRequest = {
  target: VmmGrpcProfileTarget
  user_id: string
  project_id: string
  instruction: string
}

/**
 * Manual profile instruction response exposed to command execution.
 * 暴露给命令执行层的手工画像指令响应。
 */
export type VmmGrpcApplyProfileInstructionResponse = {
  instruction_id: string
  accepted_nodes: VmmGrpcProfileNodeEntry[]
  retired_nodes: VmmGrpcRetiredProfileNodeEntry[]
  review_reason: string
  trace_id: string
}

/**
 * Active memory-search request understood by the transport layer.
 * 传输层理解的主动记忆搜索请求。
 *
 * The simplified AI-facing contract keeps only the resolved scope selectors,
 * one simple query list, and the per-query hit cap.
 * 收缩后的 AI 对外契约只保留已解析的范围选择参数、
 * 一个简单查询字符串列表，以及每条查询的命中上限。
 */
export type VmmGrpcSearchMemoryEventsRequest = {
  user_id: string
  project_id: string
  queries: string[]
  top_k: number
}

/**
 * One AI-facing hit returned by the active memory-search surface.
 * 主动记忆搜索接口返回的一条面向 AI 的命中结果。
 *
 * Search now returns one durable memory id, one optional source turn id, short
 * summary text, and the backend-owned display creation time.
 * 搜索结果现在只返回后续工具决策真正需要的最小字段：
 * 一条长期记忆 id、一条可选来源 turn id、简短摘要文本，
 * 以及由后端统一格式化的创建时间。
 */
export type VmmGrpcMemorySearchHit = {
  memory_id: string
  source_turn_id: string
  abstract: string
  details_preview: string
  category: VmmGrpcMemoryCategoryLabel | string
  created_datetime: string
}

/**
 * One grouped search result echoed back by the active memory-search surface.
 * 主动记忆搜索接口回显的一组查询结果。
 */
export type VmmGrpcMemorySearchGroupResult = {
  query_index: number
  query: string
  hits: VmmGrpcMemorySearchHit[]
}

/**
 * Active memory-search response exposed to the OpenCode tool layer.
 * 暴露给 OpenCode tool 层的主动记忆搜索响应。
 */
export type VmmGrpcSearchMemoryEventsResponse = {
  results: VmmGrpcMemorySearchGroupResult[]
  trace_id: string
}

/**
 * Exact turn-detail request understood by the transport layer.
 * 传输层理解的精确 turn 详情读取请求。
 */
export type VmmGrpcGetTurnDetailsRequest = {
  turn_ids: string[]
}

/**
 * One structured turn detail returned by the AI-facing detail surface.
 * 面向 AI 的详情接口返回的一条结构化 turn 详情。
 *
 * The simplified contract no longer exposes dehydrated storage blobs or budget
 * bookkeeping fields. Callers receive only the dialogue fields that matter for
 * reasoning and follow-up generation.
 * 收缩后的契约不再暴露脱水存储载荷或预算记账字段，
 * 调用方只会拿到真正影响推理和后续生成的结构化对话字段。
 */
export type VmmGrpcTurnDetailEntry = {
  turn_id: string
  user_question: string
  timeline: VmmGrpcTimelineItem[]
  assistant_answer: string
  detail: string
  previous_turn_ids: string[]
  next_turn_ids: string[]
}

/**
 * Exact turn-detail response exposed to debug and tool-facing surfaces.
 * 暴露给调试页和 tool 能力面的精确 turn 详情响应。
 */
export type VmmGrpcGetTurnDetailsResponse = {
  turns: VmmGrpcTurnDetailEntry[]
  trace_id: string
}

/**
 * One direct memory-write item accepted by the AI-facing write surface.
 * 面向 AI 的主动写记忆接口接受的一条直接写入项。
 *
 * The backend now expects compact numeric concept values for scope, priority,
 * and memory level. `details` remains required because AI callers should write
 * complete durable memory text rather than one abstract-only stub.
 * 后端现在要求 scope、priority 和 memory level 使用紧凑数字概念值；
 * `details` 继续保持必填，因为 AI 调用方应写入完整的长期记忆正文，
 * 而不是只有摘要的空壳记录。
 */
export type VmmGrpcWriteMemoryItem = {
  scope_level: VmmGrpcMemoryScopeLevel
  abstract: string
  details: string
  category: number
  priority: VmmGrpcMemoryPriority
  memory_level: VmmGrpcMemoryLevel
}

/**
 * Direct memory-write request understood by the transport layer.
 * 传输层理解的主动写记忆请求。
 *
 * The caller still provides the effective user/project binding and one
 * synthetic session id so backend auditing can attribute the write.
 * 调用方仍然需要提供当前生效的 user/project 绑定，
 * 以及一条合成 session id，便于后端审计本次写入来源。
 */
export type VmmGrpcWriteMemoriesRequest = {
  session_id: string
  user_id: string
  project_id: string
  items: VmmGrpcWriteMemoryItem[]
}

/**
 * One direct memory-write result returned by the backend.
 * 后端返回的一条主动写记忆结果。
 *
 * Write callers only need the resulting memory id and whether the backend
 * deduplicated the request onto an existing durable memory row.
 * 写入调用方只需要知道最终 memory id，以及这次写入是否被后端软幂等复用。
 */
export type VmmGrpcWriteMemoryResultItem = {
  memory_id: string
  deduped: boolean
}

/**
 * Direct memory-write response exposed to debug and tool-facing surfaces.
 * 暴露给调试页和 tool 相关能力面的主动写记忆响应。
 */
export type VmmGrpcWriteMemoriesResponse = {
  items: VmmGrpcWriteMemoryResultItem[]
  trace_id: string
}

/**
 * Direct memory-delete request understood by the transport layer.
 * 传输层理解的主动删除记忆请求。
 *
 * Deletion is intentionally keyed only by durable memory ids and the resolved
 * user/project scope. Source turn ids are read-only traceability handles and
 * must not be treated as delete targets.
 * 删除刻意只接受长期 memory id 与已解析 user/project 范围。
 * source turn id 只是只读追溯句柄，不能被当作删除目标。
 */
export type VmmGrpcDeleteMemoriesRequest = {
  user_id: string
  project_id: string
  memory_ids: string[]
  reason: string
}

/**
 * Direct memory-delete response exposed to debug and tool-facing surfaces.
 * 暴露给调试页和 tool 相关能力面的主动删记忆响应。
 */
export type VmmGrpcDeleteMemoriesResponse = {
  deleted_memory_ids: string[]
  not_found_memory_ids: string[]
  deleted_vector_rows: string
  trace_id: string
}

/**
 * PreCheck recall-mode enum names exposed by the current business contract.
 * 当前业务契约暴露的 PreCheck recall-mode 枚举名称。
 *
 * The backend now drives compact-aware recall through an explicit enum rather
 * than a loosely named boolean. Keeping the stable enum labels here lets the
 * plugin log and branch on the same vocabulary used by the proto contract.
 * 后端现在通过显式枚举驱动 compact-aware recall，而不是继续使用语义模糊的布尔值。
 * 这里保留稳定枚举名称，是为了让插件日志和分支判断直接复用 proto 契约里的同一套词汇。
 */
export type VmmGrpcPreCheckRecallMode =
  | "PRE_CHECK_RECALL_MODE_LEGACY"
  | "PRE_CHECK_RECALL_MODE_SESSION_COMPACT"

/**
 * PreCheck request contract consumed by the plugin.
 * 插件消费的 PreCheck 请求契约。
 *
 * The latest business chain keeps the identity fields minimal, but it also
 * lets the caller choose whether recall should stay legacy or become aware of
 * the session compact boundary maintained by `ChatCompact`.
 * 最新业务链虽然仍然保持最小身份字段，
 * 但现在还允许调用方显式选择：召回逻辑继续走 legacy，还是感知 `ChatCompact`
 * 维护的 session compact 边界。
 */
export type VmmGrpcPreCheckRequest = {
  session_id: string
  user_id: string
  project_id: string
  user_content: string
  recall_mode: VmmGrpcPreCheckRecallMode
}

/**
 * ChatCompact request contract consumed by the plugin.
 * 插件消费的 ChatCompact 请求契约。
 *
 * This request acknowledges that the host is about to compact the current
 * session, so the backend can freeze the latest persisted turn as the compact
 * boundary for future compact-aware pre-check recall.
 * 这条请求用于确认宿主即将压缩当前 session，
 * 让后端把最新已持久化 turn 冻结成后续 compact-aware pre-check 召回使用的边界。
 */
export type VmmGrpcChatCompactRequest = {
  session_id: string
  user_id: string
  project_id: string
}

/**
 * ChatCompact response shape exposed to the plugin runtime.
 * 暴露给插件运行时的 ChatCompact 响应结构。
 *
 * The backend reports whether the acknowledgement was accepted, whether it
 * changed the stored compact boundary, and which turn currently acts as that
 * anchor. The plugin only needs these fields for diagnostics and future
 * behavior audits.
 * 后端会返回这次确认是否被接受、是否真的更新了 compact 边界，以及当前担当锚点的 turn。
 * 插件这里只需要这些字段用于诊断和后续行为审计。
 */
export type VmmGrpcChatCompactResponse = {
  accepted: boolean
  updated: boolean
  compacted_turn_id: string
  trace_id: string
}

/**
 * PostAction timeline item contract used by the plugin.
 * 插件使用的 PostAction 时间线项契约。
 *
 * Timeline remains structured here so replay queues and debug logs do not need
 * to re-parse flattened strings back into role-tagged nodes.
 * 这里继续保留结构化时间线，
 * 这样重放队列和调试日志就不需要再把扁平字符串反解析回角色节点。
 */
export type VmmGrpcTimelineItem = {
  type: "user" | "assistant"
  content: string
}

/**
 * PostAction request contract consumed by the plugin.
 * 插件消费的 PostAction 请求契约。
 *
 * This mirrors the backend text-only ingestion contract: first user message,
 * final assistant answer, and middle timeline only.
 * 这个结构对应后端新的纯文本接入契约：
 * 首问、最终回答，以及仅包含中间过程的 timeline。
 */
export type VmmGrpcPostActionRequest = {
  session_id: string
  user_id: string
  project_id: string
  user_content: string
  assistant_content: string
  timeline: VmmGrpcTimelineItem[]
}

/**
 * One context item returned by PreCheck.
 * PreCheck 返回的一条上下文项。
 *
 * The transport layer now exposes only the current structured fields that the
 * plugin is expected to consume from VMM mainline builds.
 * 传输层现在只暴露插件应继续消费的当前结构化字段，
 * 不再把已放弃的兼容字段继续扩散到上层实现。
 */
export type VmmGrpcContextItem = {
  text: string
  score: number
  turn_id: string
  has_dialogue: boolean
  created_datetime: string
  memory_id: string
}

/**
 * Normalized PreCheck response shape exposed to the transport layer.
 * 暴露给传输层的归一化 PreCheck 响应结构。
 *
 * The latest backend uses this response to return the final adopted runtime
 * context for the current turn, not merely a placeholder no-injection verdict.
 * 最新后端会用这份响应返回当前轮次最终采纳的运行时上下文，
 * 而不再只是一个占位性质的“不注入”结论。
 *
 * The plugin consumes only the structured `context_items` payload from the
 * current proto contract.
 * 插件现在只消费结构化 `context_items` 载荷，
 * 并直接对齐当前 proto 契约。
 */
export type VmmGrpcPreCheckResponse = {
  should_inject: boolean
  context_items: VmmGrpcContextItem[]
  degraded: boolean
  trace_id: string
}

/**
 * Normalized PostAction response shape exposed to the transport layer.
 * 暴露给传输层的归一化 PostAction 响应结构。
 *
 * `accepted` now means the cleaned turn has been durably appended and the
 * async extraction follow-up was queued successfully.
 * 这里的 `accepted` 现在表示清洗后的 turn 已经稳定追加成功，
 * 并且后续异步提炼任务也已成功入队。
 */
export type VmmGrpcPostActionResponse = {
  accepted: boolean
  trace_id: string
}

/**
 * Unified unary RPC result used by memory-sync and command execution.
 * `memory-sync` 和命令执行共用的统一 unary RPC 结果结构。
 *
 * The caller needs both transport metadata and the decoded payload so logs,
 * toasts, system hints, and replay logic can all branch without re-inspecting
 * grpc errors.
 * 调用方同时需要传输层元数据和已解码响应，
 * 这样日志、toast、system 提示和重放逻辑都可以直接分支，
 * 不必重新解析 gRPC 错误。
 */
export type VmmGrpcUnaryResult<TResponse> = {
  ok: boolean
  target: string
  method: string
  response?: TResponse
  error?: unknown
  timedOutPhase?: "handshake" | "receive"
  grpcCode?: grpcType.status
  grpcCodeName?: string
  details?: string
}

/**
 * Dynamic client interface resolved from the vendored proto.
 * 从内置 proto 动态解析出来的客户端接口。
 *
 * The plugin models the business chain plus the current workspace admin RPCs
 * so command handlers and memory transport share one consistent client pool.
 * 这里同时建模业务链和当前工作区管理 RPC，
 * 让命令处理器和记忆传输层共用一套一致的客户端池。
 */
type VmmServiceClient = grpcType.Client & {
  Healthz(
    request: VmmGrpcEmptyRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcHealthzResponse) => void,
  ): grpcType.ClientUnaryCall
  ListProjects(
    request: VmmGrpcEmptyRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcListProjectsResponse) => void,
  ): grpcType.ClientUnaryCall
  ResolveProject(
    request: VmmGrpcResolveProjectRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcResolveProjectResponse) => void,
  ): grpcType.ClientUnaryCall
  EnsureProject(
    request: VmmGrpcEnsureProjectRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcEnsureProjectResponse) => void,
  ): grpcType.ClientUnaryCall
  DeleteProject(
    request: VmmGrpcDeleteProjectRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcDeleteProjectResponse) => void,
  ): grpcType.ClientUnaryCall
  MigrateProject(
    request: VmmGrpcMigrateProjectRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcMigrateProjectResponse) => void,
  ): grpcType.ClientUnaryCall
  ResolveUser(
    request: VmmGrpcResolveUserRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcResolveUserResponse) => void,
  ): grpcType.ClientUnaryCall
  ListUsers(
    request: VmmGrpcEmptyRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcListUsersResponse) => void,
  ): grpcType.ClientUnaryCall
  DeleteUser(
    request: VmmGrpcDeleteUserRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcDeleteUserResponse) => void,
  ): grpcType.ClientUnaryCall
  GetProfileNodes(
    request: VmmGrpcGetProfileNodesRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcGetProfileNodesResponse) => void,
  ): grpcType.ClientUnaryCall
  GetProfileBundle(
    request: VmmGrpcGetProfileBundleRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcGetProfileBundleResponse) => void,
  ): grpcType.ClientUnaryCall
  ApplyProfileInstruction(
    request: VmmGrpcApplyProfileInstructionRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcApplyProfileInstructionResponse) => void,
  ): grpcType.ClientUnaryCall
  SearchMemoryEvents(
    request: VmmGrpcSearchMemoryEventsRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcSearchMemoryEventsResponse) => void,
  ): grpcType.ClientUnaryCall
  GetTurnDetails(
    request: VmmGrpcGetTurnDetailsRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcGetTurnDetailsResponse) => void,
  ): grpcType.ClientUnaryCall
  WriteMemories(
    request: VmmGrpcWriteMemoriesRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcWriteMemoriesResponse) => void,
  ): grpcType.ClientUnaryCall
  DeleteMemories(
    request: VmmGrpcDeleteMemoriesRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcDeleteMemoriesResponse) => void,
  ): grpcType.ClientUnaryCall
  ChatCompact(
    request: VmmGrpcChatCompactRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcChatCompactResponse) => void,
  ): grpcType.ClientUnaryCall
  PreCheck(
    request: VmmGrpcPreCheckRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcPreCheckResponse) => void,
  ): grpcType.ClientUnaryCall
  PostAction(
    request: VmmGrpcPostActionRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, response?: VmmGrpcPostActionResponse) => void,
  ): grpcType.ClientUnaryCall
}

/**
 * Shared unary method name union.
 * 共用的一元方法名称联合类型。
 */
type VmmUnaryMethodName =
  | "Healthz"
  | "ListProjects"
  | "ResolveProject"
  | "EnsureProject"
  | "DeleteProject"
  | "MigrateProject"
  | "ResolveUser"
  | "ListUsers"
  | "DeleteUser"
  | "GetProfileNodes"
  | "GetProfileBundle"
  | "ApplyProfileInstruction"
  | "SearchMemoryEvents"
  | "GetTurnDetails"
  | "WriteMemories"
  | "DeleteMemories"
  | "ChatCompact"
  | "PreCheck"
  | "PostAction"

/**
 * Shared unary invoker shape used by the generic call helper.
 * 泛型调用辅助函数使用的统一 unary 调用签名。
 */
type VmmUnaryInvoker<TRequest, TResponse> = (
  request: TRequest,
  metadata: grpcType.Metadata,
  options: grpcType.CallOptions,
  callback: (error: grpcType.ServiceError | null, response?: TResponse) => void,
) => grpcType.ClientUnaryCall

/**
 * Cached dynamic constructor and client pool.
 * 缓存的动态构造器与客户端池。
 *
 * Reusing clients avoids paying the full channel setup cost on every turn,
 * while still keeping call deadlines per request.
 * 复用客户端可以避免每一轮都重新承担完整的 channel 建立成本，
 * 同时每次请求仍然各自拥有独立的 deadline。
 */
let cachedConstructor: grpcType.ServiceClientConstructor | undefined
/**
 * One pooled client entry remembered for a specific target.
 * 为某个特定 target 记住的一条连接池客户端记录。
 *
 * The pooled entry keeps both the live client and the keepalive option slice
 * that produced it, so the transport can rebuild the client if channel-level
 * keepalive settings change while the target stays the same.
 * 这条记录会同时保存活跃 client 和创建它时使用的 keepalive 配置切片，
 * 这样即使 target 不变，只要 channel 级 keepalive 参数发生变化，
 * 传输层也能主动重建 client。
 */
type VmmGrpcPooledClientEntry = {
  client: VmmServiceClient
  keepaliveOptions: VmmGrpcKeepaliveChannelOptions
}

const clientPool = new Map<string, VmmGrpcPooledClientEntry>()

/**
 * Normalize one keepalive permit flag into the grpc-js `0 | 1` wire shape.
 * 把一条 keepalive permit 标志归一化成 grpc-js 需要的 `0 | 1` 形态。
 *
 * Config files and callers may pass broader numeric values, but grpc-js only
 * needs the stable disabled/enabled integer pair here.
 * 配置文件和调用方可能传入更宽松的数字，
 * 但这里真正需要给 grpc-js 的只有稳定的启用/关闭整数对。
 */
function normalizeKeepalivePermitWithoutCalls(value: number | undefined): 0 | 1 {
  return (value ?? DEFAULT_GRPC_KEEPALIVE_PERMIT_WITHOUT_CALLS) > 0 ? 1 : 0
}

/**
 * Resolve one normalized keepalive channel option slice from transport config.
 * 从传输配置解析出一份归一化的 keepalive channel 选项切片。
 *
 * The transport keeps conservative defaults even when callers omit the
 * keepalive fields, so pooled clients continue to protect idle connections by
 * default instead of silently falling back to "no keepalive".
 * 即使调用方省略 keepalive 字段，传输层也会维持保守默认值，
 * 让复用连接默认仍具备基础空闲保活能力，而不是悄悄退回“完全无 keepalive”。
 */
function resolveKeepaliveChannelOptions(
  config: VmmGrpcTransportConfig | undefined,
): VmmGrpcKeepaliveChannelOptions {
  const keepaliveTimeMs = normalizeStrictPositiveConfigInteger(
    config?.grpcKeepaliveTimeMs,
    DEFAULT_GRPC_KEEPALIVE_TIME_MS,
  )
  const keepaliveTimeoutMs = normalizeStrictPositiveConfigInteger(
    config?.grpcKeepaliveTimeoutMs,
    DEFAULT_GRPC_KEEPALIVE_TIMEOUT_MS,
  )

  return {
    "grpc.keepalive_time_ms": keepaliveTimeMs,
    "grpc.keepalive_timeout_ms": keepaliveTimeoutMs,
    "grpc.keepalive_permit_without_calls": normalizeKeepalivePermitWithoutCalls(
      config?.grpcKeepalivePermitWithoutCalls,
    ),
  }
}

/**
 * Check whether two keepalive channel option slices are effectively identical.
 * 检查两份 keepalive channel 选项切片是否在语义上完全一致。
 *
 * Pool reuse is safe only when the current target and the channel-level
 * keepalive knobs both match, otherwise the stale client must be rebuilt.
 * 只有在当前 target 和 channel 级 keepalive 参数都一致时，连接池复用才安全；
 * 否则就必须重建旧 client。
 */
function areKeepaliveChannelOptionsEqual(
  left: VmmGrpcKeepaliveChannelOptions,
  right: VmmGrpcKeepaliveChannelOptions,
) {
  return (
    left["grpc.keepalive_time_ms"] === right["grpc.keepalive_time_ms"]
    && left["grpc.keepalive_timeout_ms"] === right["grpc.keepalive_timeout_ms"]
    && left["grpc.keepalive_permit_without_calls"] === right["grpc.keepalive_permit_without_calls"]
  )
}

/**
 * Close one pooled client defensively during pool pruning.
 * 在修剪连接池时，以防御式方式关闭一个已缓存客户端。
 *
 * grpc-js client shutdown should never be allowed to break later retries for
 * the current target, so stale-client close errors stay intentionally silent.
 * grpc-js 客户端关闭绝不能反过来打断当前 target 的后续重试，
 * 因此这里会刻意吞掉旧客户端关闭时的异常。
 */
function closeClientQuietly(client: VmmServiceClient | undefined) {
  if (!client) {
    return
  }
  try {
    client.close()
  } catch {
    // Ignore stale client close failures because the pool prune itself is best effort.
    // 旧客户端的关闭失败在这里属于最佳努力行为，因此直接忽略即可。
  }
}

/**
 * Keep only currently configured host targets in the pooled client map.
 * 在客户端池里只保留当前配置的宿主 target。
 *
 * Older host targets should be closed eagerly so config changes do not leave
 * stale channels alive after the plugin switches to another vulcan-host.
 * 旧宿主地址应被及时关闭，
 * 这样插件切换到另一个 vulcan-host 后不会留下过期通道。
 */
function pruneClientPoolExcept(targets: string[]) {
  const retainedTargets = new Set(targets.filter(Boolean))
  for (const [pooledTarget, entry] of clientPool.entries()) {
    if (retainedTargets.has(pooledTarget)) {
      continue
    }
    closeClientQuietly(entry.client)
    clientPool.delete(pooledTarget)
  }
}

/**
 * Wire-level enum mapping used by the manual business-RPC fallback.
 * 手工业务 RPC 回退链路使用的线级枚举映射。
 *
 * The `web` host currently breaks the `proto-loader` bridge, so manual
 * fallback keeps the few business enums it needs locally instead of trying to
 * recover the whole generated runtime surface.
 * 当前 `web` 宿主会把 `proto-loader` 运行时桥接打坏，
 * 因此手工回退只内置少量业务链真正需要的枚举映射，
 * 而不是继续尝试恢复整套生成运行时表面。
 */
const PROFILE_BUNDLE_MODE_TO_WIRE: Record<VmmGrpcProfileBundleMode, number> = {
  PROFILE_BUNDLE_MODE_UNSPECIFIED: 0,
  PROFILE_BUNDLE_MODE_FULL: 1,
  PROFILE_BUNDLE_MODE_SPLIT: 2,
}

/**
 * Reverse enum lookup used when decoding the manual bundle response.
 * 解码手工 bundle 响应时使用的反向枚举映射。
 */
const PROFILE_BUNDLE_MODE_FROM_WIRE = new Map<number, VmmGrpcProfileBundleMode>([
  [0, "PROFILE_BUNDLE_MODE_UNSPECIFIED"],
  [1, "PROFILE_BUNDLE_MODE_FULL"],
  [2, "PROFILE_BUNDLE_MODE_SPLIT"],
])

/**
 * Wire-level enum mapping used by compact-aware PreCheck manual fallback.
 * compact-aware PreCheck 手工回退链路使用的线级枚举映射。
 *
 * The manual HTTP/2 path must encode the new recall-mode enum exactly as the
 * proto defines it, otherwise compact-aware pre-check would silently fall back
 * to legacy behavior only on hosts that need the manual transport path.
 * 手工 HTTP/2 路径必须按 proto 定义精确编码新的 recall-mode 枚举；
 * 否则只有在依赖手工传输的宿主里，compact-aware pre-check 才会悄悄退回 legacy 行为。
 */
const PRE_CHECK_RECALL_MODE_TO_WIRE: Record<VmmGrpcPreCheckRecallMode, number> = {
  PRE_CHECK_RECALL_MODE_LEGACY: 0,
  PRE_CHECK_RECALL_MODE_SESSION_COMPACT: 1,
}

/**
 * Stable gRPC status-name lookup used by the manual HTTP/2 fallback.
 * 手工 HTTP/2 回退链路使用的稳定 gRPC 状态名映射。
 *
 * Downstream transport code matches semantic status names such as
 * `UNAVAILABLE` and `FAILED_PRECONDITION`, so the manual path must provide the
 * same vocabulary even when `grpc-js` cannot be loaded in `web`.
 * 下游传输逻辑会根据 `UNAVAILABLE`、`FAILED_PRECONDITION`
 * 这类语义状态名做分支，因此手工回退也必须提供同样的话语体系，
 * 不能在 `web` 里因为 `grpc-js` 失效就丢掉这些信息。
 */
const MANUAL_GRPC_STATUS_NAME_BY_CODE: Record<number, string> = {
  0: "OK",
  1: "CANCELLED",
  2: "UNKNOWN",
  3: "INVALID_ARGUMENT",
  4: "DEADLINE_EXCEEDED",
  5: "NOT_FOUND",
  6: "ALREADY_EXISTS",
  7: "PERMISSION_DENIED",
  8: "RESOURCE_EXHAUSTED",
  9: "FAILED_PRECONDITION",
  10: "ABORTED",
  11: "OUT_OF_RANGE",
  12: "UNIMPLEMENTED",
  13: "INTERNAL",
  14: "UNAVAILABLE",
  15: "DATA_LOSS",
  16: "UNAUTHENTICATED",
}

/**
 * Detect whether a failure came from host-specific runtime-surface resolution.
 * 判断某个失败是否来自宿主特有的运行时表面解析问题。
 *
 * Only this class of failure should trigger the manual `http2` fallback. Real
 * business, network, or backend errors must continue to use the primary path.
 * 只有这一类失败才应该触发手工 `http2` 回退；
 * 真实的业务、网络或后端错误仍应维持原始主路径行为。
 */
function isRuntimeSurfaceResolutionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return (
    message.includes("Failed to resolve runtime module surface for @grpc/proto-loader")
    || message.includes("Failed to resolve runtime module surface for @grpc/grpc-js")
    || message.includes("Failed to import runtime module @grpc/proto-loader")
    || message.includes("Failed to import runtime module @grpc/grpc-js")
  )
}

/**
 * Encode one unsigned protobuf varint.
 * 编码一个无符号 protobuf varint。
 *
 * The manual fallback only needs uint64/bool/enum fields for the current
 * business chain, and they all share the same varint wire representation.
 * 当前手工回退只需要覆盖业务链里的 uint64 / bool / enum 字段，
 * 它们在线上的 protobuf 线格式里都复用同一种 varint 表示。
 */
function encodeProtoVarint(value: bigint) {
  const bytes: number[] = []
  let current = value

  while (current >= 0x80n) {
    bytes.push(Number((current & 0x7fn) | 0x80n))
    current >>= 7n
  }
  bytes.push(Number(current))
  return Buffer.from(bytes)
}

/**
 * Encode one protobuf field key.
 * 编码一个 protobuf 字段 key。
 */
function encodeProtoFieldKey(fieldNumber: number, wireType: number) {
  return encodeProtoVarint(BigInt((fieldNumber << 3) | wireType))
}

/**
 * Encode one uint64 field for the manual gRPC fallback.
 * 为手工 gRPC 回退编码一个 uint64 字段。
 */
function encodeProtoUint64Field(fieldNumber: number, value: string) {
  return Buffer.concat([encodeProtoFieldKey(fieldNumber, 0), encodeProtoVarint(BigInt(value))])
}

/**
 * Encode one enum field for the manual gRPC fallback.
 * 为手工 gRPC 回退编码一个枚举字段。
 */
function encodeProtoEnumField(fieldNumber: number, value: number) {
  return Buffer.concat([encodeProtoFieldKey(fieldNumber, 0), encodeProtoVarint(BigInt(value))])
}

/**
 * Encode one bool field for the manual gRPC fallback.
 * 为手工 gRPC 回退编码一个布尔字段。
 */
function encodeProtoBoolField(fieldNumber: number, value: boolean) {
  return Buffer.concat([encodeProtoFieldKey(fieldNumber, 0), encodeProtoVarint(value ? 1n : 0n)])
}

/**
 * Encode one UTF-8 string field for the manual gRPC fallback.
 * 为手工 gRPC 回退编码一个 UTF-8 字符串字段。
 */
function encodeProtoStringField(fieldNumber: number, value: string) {
  const payload = Buffer.from(value, "utf8")
  return Buffer.concat([
    encodeProtoFieldKey(fieldNumber, 2),
    encodeProtoVarint(BigInt(payload.length)),
    payload,
  ])
}

/**
 * Encode one nested message field for the manual gRPC fallback.
 * 为手工 gRPC 回退编码一个嵌套消息字段。
 *
 * Repeated protobuf sub-messages in `PreCheck` and `PostAction` share the same
 * length-delimited framing, so one helper keeps the manual encoders aligned.
 * `PreCheck` 与 `PostAction` 里的 repeated 子消息都使用同一种
 * length-delimited 帧格式，因此这里统一成一个辅助函数，避免各处重复。
 */
function encodeProtoMessageField(fieldNumber: number, value: Buffer) {
  return Buffer.concat([
    encodeProtoFieldKey(fieldNumber, 2),
    encodeProtoVarint(BigInt(value.length)),
    value,
  ])
}

/**
 * Encode the GetProfileBundle request body without relying on proto-loader.
 * 在不依赖 proto-loader 的情况下编码 GetProfileBundle 请求体。
 *
 * The latest proto marks `include_explanation` as optional, so field `4` must
 * be omitted entirely when the caller does not want to assert presence.
 * 最新 proto 把 `include_explanation` 标成了 optional，
 * 因此当调用方不想声明 presence 时，这里的字段 `4` 必须完全省略。
 */
function encodeManualProfileBundleRequest(request: VmmGrpcGetProfileBundleRequest) {
  const fields = [
    encodeProtoUint64Field(1, request.user_id),
    encodeProtoUint64Field(2, request.project_id),
    encodeProtoEnumField(3, PROFILE_BUNDLE_MODE_TO_WIRE[request.mode]),
  ]

  if (typeof request.include_explanation === "boolean") {
    fields.push(encodeProtoBoolField(4, request.include_explanation))
  }

  return Buffer.concat(fields)
}

/**
 * Decode one protobuf varint starting at the provided offset.
 * 从给定偏移开始解码一个 protobuf varint。
 */
function decodeProtoVarint(buffer: Buffer, offset: number) {
  let result = 0n
  let shift = 0n
  let cursor = offset

  while (cursor < buffer.length) {
    const current = BigInt(buffer[cursor] ?? 0)
    result |= (current & 0x7fn) << shift
    cursor += 1

    if ((current & 0x80n) === 0n) {
      return {
        value: result,
        offset: cursor,
      }
    }

    shift += 7n
  }

  throw new Error("Failed to decode protobuf varint from manual profile-bundle payload")
}

/**
 * Read one length-delimited protobuf field payload.
 * 读取一个 length-delimited protobuf 字段载荷。
 *
 * Manual decoders for bundle/context/timeline all need the same boundary logic
 * so that nested messages can be parsed safely without proto-loader.
 * 手工解码 bundle / context / timeline 时都需要同样的边界处理，
 * 这样在没有 proto-loader 的情况下也能安全解析嵌套消息。
 */
function decodeProtoLengthDelimited(buffer: Buffer, offset: number) {
  const length = decodeProtoVarint(buffer, offset)
  const start = length.offset
  const end = start + Number(length.value)
  return {
    value: buffer.subarray(start, end),
    offset: end,
  }
}

/**
 * Skip one protobuf field that the manual decoder does not consume.
 * 跳过一段手工解码器当前不消费的 protobuf 字段。
 */
function skipProtoField(buffer: Buffer, offset: number, wireType: number) {
  if (wireType === 0) {
    return decodeProtoVarint(buffer, offset).offset
  }
  if (wireType === 1) {
    return offset + 8
  }
  if (wireType === 2) {
    const length = decodeProtoVarint(buffer, offset)
    return length.offset + Number(length.value)
  }
  if (wireType === 5) {
    return offset + 4
  }

  throw new Error(`Unsupported protobuf wire type ${wireType} in manual gRPC decoder`)
}

/**
 * Decode the GetProfileBundle response body without proto-loader support.
 * 在没有 proto-loader 支持时解码 GetProfileBundle 响应体。
 */
function decodeManualProfileBundleResponse(payload: Buffer): VmmGrpcGetProfileBundleResponse {
  const response: VmmGrpcGetProfileBundleResponse = {
    mode: "PROFILE_BUNDLE_MODE_UNSPECIFIED",
    include_explanation: false,
    explanation_text: "",
    environment_priority_text: "",
    combined_text: "",
    team_profile: "",
    space_profile: "",
    project_profile: "",
    user_profile: "",
    trace_id: "",
  }

  let offset = 0
  while (offset < payload.length) {
    const key = decodeProtoVarint(payload, offset)
    offset = key.offset
    const fieldNumber = Number(key.value >> 3n)
    const wireType = Number(key.value & 0x07n)

    if (wireType === 0) {
      const decoded = decodeProtoVarint(payload, offset)
      offset = decoded.offset
      if (fieldNumber === 1) {
        response.mode =
          PROFILE_BUNDLE_MODE_FROM_WIRE.get(Number(decoded.value)) ??
          "PROFILE_BUNDLE_MODE_UNSPECIFIED"
      } else if (fieldNumber === 2) {
        response.include_explanation = decoded.value !== 0n
      }
      continue
    }

    if (wireType === 2) {
      const decoded = decodeProtoLengthDelimited(payload, offset)
      const value = decoded.value.toString("utf8")
      offset = decoded.offset

      if (fieldNumber === 3) response.explanation_text = value
      else if (fieldNumber === 4) response.environment_priority_text = value
      else if (fieldNumber === 5) response.combined_text = value
      else if (fieldNumber === 6) response.team_profile = value
      else if (fieldNumber === 7) response.space_profile = value
      else if (fieldNumber === 8) response.project_profile = value
      else if (fieldNumber === 9) response.user_profile = value
      else if (fieldNumber === 10) response.trace_id = value
      continue
    }

    offset = skipProtoField(payload, offset, wireType)
  }

  return response
}

/**
 * Encode one PreCheck request body without relying on proto-loader.
 * 在不依赖 proto-loader 的情况下编码一份 PreCheck 请求体。
 */
function encodeManualPreCheckRequest(request: VmmGrpcPreCheckRequest) {
  return Buffer.concat([
    encodeProtoStringField(1, request.session_id),
    encodeProtoUint64Field(2, request.user_id),
    encodeProtoUint64Field(3, request.project_id),
    encodeProtoStringField(4, request.user_content),
    encodeProtoEnumField(5, PRE_CHECK_RECALL_MODE_TO_WIRE[request.recall_mode]),
  ])
}

/**
 * Encode one ChatCompact request body without relying on proto-loader.
 * 在不依赖 proto-loader 的情况下编码一份 ChatCompact 请求体。
 */
function encodeManualChatCompactRequest(request: VmmGrpcChatCompactRequest) {
  return Buffer.concat([
    encodeProtoStringField(1, request.session_id),
    encodeProtoUint64Field(2, request.user_id),
    encodeProtoUint64Field(3, request.project_id),
  ])
}

/**
 * Decode the ChatCompact response body without proto-loader support.
 * 在没有 proto-loader 支持时解码 ChatCompact 响应体。
 */
function decodeManualChatCompactResponse(payload: Buffer): VmmGrpcChatCompactResponse {
  const response: VmmGrpcChatCompactResponse = {
    accepted: false,
    updated: false,
    compacted_turn_id: "0",
    trace_id: "",
  }

  let offset = 0
  while (offset < payload.length) {
    const key = decodeProtoVarint(payload, offset)
    offset = key.offset
    const fieldNumber = Number(key.value >> 3n)
    const wireType = Number(key.value & 0x07n)

    if (wireType === 0) {
      const decoded = decodeProtoVarint(payload, offset)
      offset = decoded.offset
      if (fieldNumber === 1) response.accepted = decoded.value !== 0n
      else if (fieldNumber === 2) response.updated = decoded.value !== 0n
      else if (fieldNumber === 3) response.compacted_turn_id = decoded.value.toString()
      continue
    }

    if (wireType === 2 && fieldNumber === 4) {
      const decoded = decodeProtoLengthDelimited(payload, offset)
      offset = decoded.offset
      response.trace_id = decoded.value.toString("utf8")
      continue
    }

    offset = skipProtoField(payload, offset, wireType)
  }

  return response
}

/**
 * Decode one nested ContextItem used by the manual PreCheck response decoder.
 * 解码手工 PreCheck 响应里的一条嵌套 ContextItem。
 */
function decodeManualContextItem(payload: Buffer): VmmGrpcContextItem {
  const item: VmmGrpcContextItem = {
    text: "",
    score: 0,
    turn_id: "0",
    has_dialogue: false,
    created_datetime: "",
    memory_id: "0",
  }

  let offset = 0
  while (offset < payload.length) {
    const key = decodeProtoVarint(payload, offset)
    offset = key.offset
    const fieldNumber = Number(key.value >> 3n)
    const wireType = Number(key.value & 0x07n)

    if (wireType === 2) {
      const decoded = decodeProtoLengthDelimited(payload, offset)
      offset = decoded.offset

      if (fieldNumber === 1) item.text = decoded.value.toString("utf8")
      else if (fieldNumber === 5) item.created_datetime = decoded.value.toString("utf8")
      continue
    }

    if (wireType === 0) {
      const decoded = decodeProtoVarint(payload, offset)
      offset = decoded.offset

      if (fieldNumber === 3) item.turn_id = decoded.value.toString()
      else if (fieldNumber === 4) item.has_dialogue = decoded.value !== 0n
      else if (fieldNumber === 6) item.memory_id = decoded.value.toString()
      continue
    }

    if (wireType === 1 && fieldNumber === 2) {
      item.score = payload.readDoubleLE(offset)
      offset += 8
      continue
    }

    offset = skipProtoField(payload, offset, wireType)
  }

  return item
}

/**
 * Decode the PreCheck response body without proto-loader support.
 * 在没有 proto-loader 支持时解码 PreCheck 响应体。
 */
function decodeManualPreCheckResponse(payload: Buffer): VmmGrpcPreCheckResponse {
  const response: VmmGrpcPreCheckResponse = {
    should_inject: false,
    context_items: [],
    degraded: false,
    trace_id: "",
  }

  let offset = 0
  while (offset < payload.length) {
    const key = decodeProtoVarint(payload, offset)
    offset = key.offset
    const fieldNumber = Number(key.value >> 3n)
    const wireType = Number(key.value & 0x07n)

    if (wireType === 0) {
      const decoded = decodeProtoVarint(payload, offset)
      offset = decoded.offset
      if (fieldNumber === 1) response.should_inject = decoded.value !== 0n
      else if (fieldNumber === 3) response.degraded = decoded.value !== 0n
      continue
    }

    if (wireType === 2) {
      const decoded = decodeProtoLengthDelimited(payload, offset)
      offset = decoded.offset

      if (fieldNumber === 2) {
        response.context_items.push(decodeManualContextItem(decoded.value))
      } else if (fieldNumber === 4) {
        response.trace_id = decoded.value.toString("utf8")
      }
      continue
    }

    offset = skipProtoField(payload, offset, wireType)
  }

  return response
}

/**
 * Encode one nested PostAction timeline item for the manual request path.
 * 为手工请求路径编码一条嵌套 PostAction timeline 项。
 */
function encodeManualPostActionTimelineItem(item: VmmGrpcTimelineItem) {
  return Buffer.concat([
    encodeProtoStringField(1, item.type),
    encodeProtoStringField(2, item.content),
  ])
}

/**
 * Encode one PostAction request body without relying on proto-loader.
 * 在不依赖 proto-loader 的情况下编码一份 PostAction 请求体。
 */
function encodeManualPostActionRequest(request: VmmGrpcPostActionRequest) {
  return Buffer.concat([
    encodeProtoStringField(1, request.session_id),
    encodeProtoUint64Field(2, request.user_id),
    encodeProtoUint64Field(3, request.project_id),
    encodeProtoStringField(4, request.user_content),
    encodeProtoStringField(5, request.assistant_content),
    ...request.timeline.map((item) =>
      encodeProtoMessageField(6, encodeManualPostActionTimelineItem(item))),
  ])
}

/**
 * Decode the PostAction response body without proto-loader support.
 * 在没有 proto-loader 支持时解码 PostAction 响应体。
 */
function decodeManualPostActionResponse(payload: Buffer): VmmGrpcPostActionResponse {
  const response: VmmGrpcPostActionResponse = {
    accepted: false,
    trace_id: "",
  }

  let offset = 0
  while (offset < payload.length) {
    const key = decodeProtoVarint(payload, offset)
    offset = key.offset
    const fieldNumber = Number(key.value >> 3n)
    const wireType = Number(key.value & 0x07n)

    if (wireType === 0 && fieldNumber === 1) {
      const decoded = decodeProtoVarint(payload, offset)
      offset = decoded.offset
      response.accepted = decoded.value !== 0n
      continue
    }

    if (wireType === 2 && fieldNumber === 2) {
      const decoded = decodeProtoLengthDelimited(payload, offset)
      offset = decoded.offset
      response.trace_id = decoded.value.toString("utf8")
      continue
    }

    offset = skipProtoField(payload, offset, wireType)
  }

  return response
}

/**
 * Parse one gRPC status code coming back from the manual HTTP/2 path.
 * 解析手工 HTTP/2 路径返回的一条 gRPC 状态码。
 *
 * The manual transport only receives raw header values, so it normalizes them
 * into the same integer/status-name pair expected by the rest of the plugin.
 * 手工传输层拿到的只是原始 header 值，
 * 因此这里需要把它规整成插件其余部分能直接消费的整数码和状态名。
 */
function parseManualGrpcStatusCode(value: unknown) {
  const text = Array.isArray(value) ? String(value[0]) : String(value ?? "")
  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * Build one stable unary result for a manual gRPC status failure.
 * 为手工 gRPC 状态失败构建统一的一元结果对象。
 */
function buildManualGrpcStatusFailure<TResponse>(args: {
  target: string
  methodPath: string
  statusCode?: number
  details: string
}): VmmGrpcUnaryResult<TResponse> {
  return {
    ok: false,
    target: args.target,
    method: args.methodPath,
    grpcCode: args.statusCode as grpcType.status | undefined,
    grpcCodeName:
      args.statusCode !== undefined ? MANUAL_GRPC_STATUS_NAME_BY_CODE[args.statusCode] : undefined,
    error: new Error(args.details),
    details: args.details,
  } satisfies VmmGrpcUnaryResult<TResponse>
}

/**
 * Decode the unary gRPC frame payload returned by the manual fallback stream.
 * 解码手工回退流返回的一元 gRPC frame 载荷。
 */
function decodeGrpcUnaryPayload(buffer: Buffer) {
  if (buffer.length < 5) {
    throw new Error("Received incomplete gRPC frame for manual gRPC fallback")
  }

  const compressed = buffer[0] ?? 0
  if (compressed !== 0) {
    throw new Error("Compressed gRPC payloads are not supported by the manual gRPC fallback")
  }

  const length = buffer.readUInt32BE(1)
  const end = 5 + length
  if (buffer.length < end) {
    throw new Error("Received truncated gRPC payload for manual gRPC fallback")
  }

  return buffer.subarray(5, end)
}

/**
 * Open one insecure HTTP/2 session against the configured local gRPC target.
 * 针对当前配置的本地 gRPC target 打开一条非加密 HTTP/2 会话。
 */
async function connectManualGrpcSession(target: string, handshakeTimeoutMs: number) {
  return new Promise<http2.ClientHttp2Session>((resolve, reject) => {
    const session = http2.connect(`http://${target}`)
    const timer = setTimeout(() => {
      session.destroy()
      reject(new Error("manual-grpc-handshake-timeout"))
    }, handshakeTimeoutMs)

    const cleanup = () => {
      clearTimeout(timer)
      session.off("error", onError)
    }

    const onError = (error: Error) => {
      cleanup()
      session.destroy()
      reject(error)
    }

    session.once("connect", () => {
      cleanup()
      resolve(session)
    })
    session.once("error", onError)
  })
}

/**
 * Tracker returned by the keepalive ping loop.
 * keepalive ping 循环返回的跟踪器。
 *
 * Since ClientHttp2Session.on("stream") only fires for server-pushed streams,
 * we need callers to explicitly register and unregister their request lifecycles
 * so the keepalive logic knows when there are active RPC calls.
 * 因为 ClientHttp2Session.on("stream") 只对服务端推送的流触发，
 * 需要调用方显式注册和注销请求生命周期，
 * 这样 keepalive 逻辑才能知道何时有活跃的 RPC 调用。
 */
type VmmManualKeepaliveTracker = {
  registerActiveRequest: () => void
  deregisterActiveRequest: () => void
  /**
   * Stop the ping loop and clean up all timers.
   * 停止 ping 循环并清理所有定时器。
   */
  stop(): void
}

/**
 * Start a keepalive PING loop on one manual HTTP/2 session.
 * 在一条手工 HTTP/2 会话上启动 keepalive PING 循环。
 *
 * The manual http2 fallback does not inherit grpc-js channel options, so we
 * need to implement the application-level keepalive ping semantics ourselves.
 * This sends an HTTP/2 PING frame at the configured interval and tears down
 * the session if the ACK does not arrive within the timeout.
 * 手工 http2 回退路径不会继承 grpc-js 的 channel options，
 * 因此我们需要自己实现应用层 keepalive ping 语义。
 * 这里按配置的间隔发送 HTTP/2 PING 帧，
 * 如果在超时时间内未收到 ACK，则销毁会话。
 */
function startManualGrpcKeepalivePingLoop(
  session: http2.ClientHttp2Session,
  keepaliveTimeMs: number,
  keepaliveTimeoutMs: number,
  permitWithoutCalls: number,
): VmmManualKeepaliveTracker {
  let activeRequests = 0
  let pingInFlight = false
  let currentPingTimeout: ReturnType<typeof setTimeout> | undefined
  let stopped = false

  const stopPingLoop = () => {
    if (stopped) return
    stopped = true
    clearInterval(pingInterval)
    if (currentPingTimeout) {
      clearTimeout(currentPingTimeout)
      currentPingTimeout = undefined
    }
  }

  const tracker: VmmManualKeepaliveTracker = {
    registerActiveRequest: () => {
      activeRequests++
    },
    deregisterActiveRequest: () => {
      if (activeRequests > 0) activeRequests--
    },
    stop: stopPingLoop,
  }

  const pingInterval = setInterval(() => {
    if (session.destroyed || session.closed) {
      clearInterval(pingInterval)
      return
    }

    // Skip ping when no active requests and permit_without_calls is disabled.
    // Use <= 0 defensively to handle potential counter drift.
    // 当没有活跃请求且禁用了无调用 ping 时，跳过 ping。
    // 使用 <= 0 进行防御性检查，以应对可能的计数器漂移。
    if (permitWithoutCalls === 0 && activeRequests <= 0) {
      return
    }

    // Skip if a previous ping is still pending to avoid accumulating timers.
    // 如果上一个 ping 仍未完成，则跳过，避免定时器累积。
    if (pingInFlight) {
      return
    }

    pingInFlight = true
    currentPingTimeout = setTimeout(() => {
      pingInFlight = false
      currentPingTimeout = undefined
      clearInterval(pingInterval)
      writeLog({
        kind: "vmm.grpc.keepalive_timeout",
        data: { message: "manual session destroyed due to ping ACK timeout" },
      })
      session.destroy()
    }, keepaliveTimeoutMs)

    session.ping((err) => {
      if (currentPingTimeout) {
        clearTimeout(currentPingTimeout)
        currentPingTimeout = undefined
      }
      pingInFlight = false
      if (err) {
        clearInterval(pingInterval)
        return
      }
      // Ping succeeded, session is still alive.
      // Ping 成功，会话仍然活跃。
    })
  }, keepaliveTimeMs)

  // Clean up all timers when the session closes.
  // 会话关闭时清理所有定时器。
  session.once("close", stopPingLoop)

  return tracker
}

/**
 * Minimal codec contract for one manual unary business RPC.
 * 单条手工 unary 业务 RPC 的最小编解码契约。
 *
 * The manual transport only covers the few request/response shapes needed by
 * the chat business chain, so each method plugs in a tiny codec instead of a
 * whole generated client.
 * 手工传输只覆盖聊天业务链真正需要的少量请求/响应结构，
 * 因此这里为每个方法接一份很小的 codec，而不是重建整套生成客户端。
 */
type VmmManualUnaryCodec<TRequest, TResponse> = {
  methodName: VmmUnaryMethodName
  methodPath: string
  encodeRequest: (request: TRequest) => Buffer
  decodeResponse: (payload: Buffer) => TResponse
}

/**
 * Execute one business unary RPC over one manual HTTP/2 endpoint.
 * 通过一个手工 HTTP/2 端点执行一条业务 unary RPC。
 *
 * This endpoint-level helper exists only for the `web` host, where the normal
 * `grpc-js/proto-loader` runtime bridge currently collapses into empty
 * objects. The CLI should continue to use the primary transport path.
 * 这个端点级辅助函数只服务于 `web` 宿主，
 * 因为当前该宿主里的 `grpc-js/proto-loader` 运行时桥接会塌成空对象。
 * CLI 仍然应该优先走原本的主传输路径。
 */
async function callManualGrpcUnaryOnce<TRequest, TResponse>(args: {
  target: string
  request: TRequest
  config?: VmmGrpcTransportConfig
  codec: VmmManualUnaryCodec<TRequest, TResponse>
}): Promise<VmmGrpcUnaryResult<TResponse>> {
  const handshakeTimeoutMs = args.config?.grpcHandshakeTimeoutMs ?? 1500
  const receiveTimeoutMs = args.config?.grpcReceiveTimeoutMs ?? 30000
  const traceId = buildTraceId({
    method: args.codec.methodName,
  })

  let session: http2.ClientHttp2Session | undefined
  let keepaliveTracker: VmmManualKeepaliveTracker | undefined
  try {
    session = await connectManualGrpcSession(args.target, handshakeTimeoutMs)

    // Start keepalive ping loop if configured.
    // 如果配置了 keepalive，则启动 ping 循环。
    if (args.config) {
      const keepaliveOptions = resolveKeepaliveChannelOptions(args.config)
      keepaliveTracker = startManualGrpcKeepalivePingLoop(
        session,
        keepaliveOptions["grpc.keepalive_time_ms"],
        keepaliveOptions["grpc.keepalive_timeout_ms"],
        keepaliveOptions["grpc.keepalive_permit_without_calls"],
      )
    }
  } catch (error) {
    return {
      ok: false,
      target: args.target,
      method: args.codec.methodPath,
      timedOutPhase: error instanceof Error && error.message === "manual-grpc-handshake-timeout" ? "handshake" : undefined,
      error,
      details: error instanceof Error ? error.message : String(error),
    } satisfies VmmGrpcUnaryResult<TResponse>
  }

  try {
    const requestPayload = args.codec.encodeRequest(args.request)
    const grpcFrame = Buffer.concat([
      Buffer.from([0, 0, 0, 0, 0]),
      requestPayload,
    ])
    grpcFrame.writeUInt32BE(requestPayload.length, 1)

    const headers: http2.OutgoingHttpHeaders = {
      ":method": "POST",
      ":path": `/${args.codec.methodPath}`,
      "content-type": "application/grpc+proto",
      te: "trailers",
      "x-trace-id": traceId,
      "user-agent": "vulcan-plugins-opencode/manual-h2",
    }
    if (args.config?.grpcApiKey) {
      headers.authorization = `Bearer ${args.config.grpcApiKey}`
    }

    // Register this request with the keepalive tracker so pings are only sent
    // while there are active RPC calls (when permit_without_calls is disabled).
    // 向 keepalive 跟踪器注册当前请求，
    // 这样只在有活跃 RPC 调用时发送 ping（当禁用了无调用 ping 时）。
    keepaliveTracker?.registerActiveRequest()
    let response: {
      data: Buffer
      headers: http2.IncomingHttpHeaders
      trailers: http2.IncomingHttpHeaders
    }
    try {
      response = await new Promise<{
        data: Buffer
        headers: http2.IncomingHttpHeaders
        trailers: http2.IncomingHttpHeaders
      }>((resolve, reject) => {
        const stream = session!.request(headers)
        const chunks: Buffer[] = []
        let responseHeaders: http2.IncomingHttpHeaders = {}
        let responseTrailers: http2.IncomingHttpHeaders = {}
        const timer = setTimeout(() => {
          stream.close(http2.constants.NGHTTP2_CANCEL)
          reject(new Error("manual-grpc-receive-timeout"))
        }, receiveTimeoutMs)

        const cleanup = () => clearTimeout(timer)
        stream.on("response", (incomingHeaders) => {
          responseHeaders = incomingHeaders
        })
        stream.on("trailers", (incomingTrailers) => {
          responseTrailers = incomingTrailers
        })
        stream.on("data", (chunk: Buffer) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        stream.on("end", () => {
          cleanup()
          resolve({
            data: Buffer.concat(chunks),
            headers: responseHeaders,
            trailers: responseTrailers,
          })
        })
        stream.on("error", (error) => {
          cleanup()
          reject(error)
        })
        stream.end(grpcFrame)
      })
    } finally {
      keepaliveTracker?.deregisterActiveRequest()
    }

    const grpcStatus =
      response.trailers["grpc-status"] ?? response.headers["grpc-status"] ?? response.headers[":status"]
    const grpcStatusCode = parseManualGrpcStatusCode(grpcStatus)
    if (grpcStatusCode !== undefined && grpcStatusCode !== 0 && grpcStatusCode !== 200) {
      const grpcMessage = response.trailers["grpc-message"] ?? response.headers["grpc-message"] ?? ""
      return buildManualGrpcStatusFailure<TResponse>({
        target: args.target,
        methodPath: args.codec.methodPath,
        statusCode: grpcStatusCode,
        details: typeof grpcMessage === "string" ? grpcMessage : String(grpcMessage),
      })
    }

    const payload = decodeGrpcUnaryPayload(response.data)
    return {
      ok: true,
      target: args.target,
      method: args.codec.methodPath,
      response: args.codec.decodeResponse(payload),
    } satisfies VmmGrpcUnaryResult<TResponse>
  } catch (error) {
    return {
      ok: false,
      target: args.target,
      method: args.codec.methodPath,
      timedOutPhase: error instanceof Error && error.message === "manual-grpc-receive-timeout" ? "receive" : undefined,
      error,
      details: error instanceof Error ? error.message : String(error),
    } satisfies VmmGrpcUnaryResult<TResponse>
  } finally {
    // Explicitly stop the keepalive ping loop before destroying the session.
    // The "close" event handler provides implicit cleanup, but calling stop()
    // here ensures the interval is always cleared even if the close event
    // behavior changes in a future Node version.
    // 显式停止 keepalive ping 循环再销毁 session。
    // "close" 事件处理器提供隐式清理，但这里调用 stop() 确保
    // 即使未来 Node 版本改变 close 事件行为，定时器也一定会被清除。
    keepaliveTracker?.stop()
    session?.destroy()
  }
}

/**
 * Execute one manual HTTP/2 business RPC against the configured host endpoint.
 * 针对当前配置的宿主端点执行一条手工 HTTP/2 业务 RPC。
 *
 * The manual path only compensates for host runtime-module issues. It must not
 * introduce a second VMM target because plugins now connect to vulcan-host only.
 * 手工路径只用于补偿宿主运行时模块加载问题。
 * 它不能再引入第二个 VMM 地址，因为插件现在只连接 vulcan-host。
 */
async function callManualGrpcUnary<TRequest, TResponse>(args: {
  target: string
  request: TRequest
  config?: VmmGrpcTransportConfig
  codec: VmmManualUnaryCodec<TRequest, TResponse>
}): Promise<VmmGrpcUnaryResult<TResponse>> {
  return callManualGrpcUnaryOnce<TRequest, TResponse>(args)
}

/**
 * Execute GetProfileBundle through the shared manual unary fallback.
 * 通过共享手工 unary 回退执行 GetProfileBundle。
 */
async function callVmmGetProfileBundleManually(args: {
  target: string
  request: VmmGrpcGetProfileBundleRequest
  config?: VmmGrpcTransportConfig
}): Promise<VmmGrpcUnaryResult<VmmGrpcGetProfileBundleResponse>> {
  return callManualGrpcUnary<VmmGrpcGetProfileBundleRequest, VmmGrpcGetProfileBundleResponse>({
    target: args.target,
    request: args.request,
    config: args.config,
    codec: {
      methodName: "GetProfileBundle",
      methodPath: VMM_SERVICE_METHOD_GET_PROFILE_BUNDLE,
      encodeRequest: encodeManualProfileBundleRequest,
      decodeResponse: decodeManualProfileBundleResponse,
    },
  })
}

/**
 * Execute PreCheck through the shared manual unary fallback.
 * 通过共享手工 unary 回退执行 PreCheck。
 */
async function callVmmPreCheckManually(args: {
  target: string
  request: VmmGrpcPreCheckRequest
  config?: VmmGrpcTransportConfig
}): Promise<VmmGrpcUnaryResult<VmmGrpcPreCheckResponse>> {
  return callManualGrpcUnary<VmmGrpcPreCheckRequest, VmmGrpcPreCheckResponse>({
    target: args.target,
    request: args.request,
    config: args.config,
    codec: {
      methodName: "PreCheck",
      methodPath: VMM_SERVICE_METHOD_PRE_CHECK,
      encodeRequest: encodeManualPreCheckRequest,
      decodeResponse: decodeManualPreCheckResponse,
    },
  })
}

/**
 * Execute ChatCompact through the shared manual unary fallback.
 * 通过共享手工 unary 回退执行 ChatCompact。
 */
async function callVmmChatCompactManually(args: {
  target: string
  request: VmmGrpcChatCompactRequest
  config?: VmmGrpcTransportConfig
}): Promise<VmmGrpcUnaryResult<VmmGrpcChatCompactResponse>> {
  return callManualGrpcUnary<VmmGrpcChatCompactRequest, VmmGrpcChatCompactResponse>({
    target: args.target,
    request: args.request,
    config: args.config,
    codec: {
      methodName: "ChatCompact",
      methodPath: VMM_SERVICE_METHOD_CHAT_COMPACT,
      encodeRequest: encodeManualChatCompactRequest,
      decodeResponse: decodeManualChatCompactResponse,
    },
  })
}

/**
 * Execute PostAction through the shared manual unary fallback.
 * 通过共享手工 unary 回退执行 PostAction。
 */
async function callVmmPostActionManually(args: {
  target: string
  request: VmmGrpcPostActionRequest
  config?: VmmGrpcTransportConfig
}): Promise<VmmGrpcUnaryResult<VmmGrpcPostActionResponse>> {
  return callManualGrpcUnary<VmmGrpcPostActionRequest, VmmGrpcPostActionResponse>({
    target: args.target,
    request: args.request,
    config: args.config,
    codec: {
      methodName: "PostAction",
      methodPath: VMM_SERVICE_METHOD_POST_ACTION,
      encodeRequest: encodeManualPostActionRequest,
      decodeResponse: decodeManualPostActionResponse,
    },
  })
}

/**
 * Normalize the configured endpoint into a gRPC target.
 * 把配置里的地址标准化成 gRPC target。
 *
 * The plugin expects a direct gRPC target such as `127.0.0.1:17625`.
 * 插件现在期望直接传入 gRPC target，例如 `127.0.0.1:17625`。
 */
export function normalizeGrpcTarget(value: string | undefined) {
  return (value ?? "").trim()
}

/**
 * Load the vendored VMM proto and return the service constructor.
 * 加载仓库内置的 VMM proto，并返回服务构造器。
 *
 * The constructor is cached because proto loading is static for the lifetime
 * of the plugin process.
 * 构造器会被缓存，因为对于插件进程生命周期来说，proto 加载是静态的。
 */
async function getServiceConstructor() {
  if (cachedConstructor) return cachedConstructor

  const { protoLoaderRuntime, grpcRuntime } = await getTransportRuntimeSet()
  const packageDefinition = await protoLoaderRuntime.load(VMM_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  })
  const loaded = grpcRuntime.loadPackageDefinition(packageDefinition) as {
    vmm?: {
      v1?: {
        VMMService?: grpcType.ServiceClientConstructor
      }
    }
  }

  const constructor = loaded.vmm?.v1?.VMMService
  if (!constructor) {
    throw new Error(`Failed to load VMM gRPC service from proto: ${VMM_PROTO_PATH}`)
  }

  cachedConstructor = constructor
  return constructor
}

/**
 * Get or create one pooled gRPC client for the configured host target.
 * 获取或创建当前宿主 target 对应的复用 gRPC 客户端。
 *
 * Pooling by the active target is sufficient because plugins no longer keep a
 * second direct VMM channel beside the vulcan-host relay.
 * 现在只按活动 target 建池已经足够，
 * 因为插件不再在 vulcan-host 中转旁边保留第二条 VMM 直连通道。
 */
async function getClient(target: string, config?: VmmGrpcTransportConfig) {
  pruneClientPoolExcept([target])
  const keepaliveOptions = resolveKeepaliveChannelOptions(config)
  const existing = clientPool.get(target)
  if (existing) {
    if (areKeepaliveChannelOptionsEqual(existing.keepaliveOptions, keepaliveOptions)) {
      return existing.client
    }
    closeClientQuietly(existing.client)
    clientPool.delete(target)
  }

  const { grpcRuntime } = await getTransportRuntimeSet()
  const constructor = await getServiceConstructor()
  const created = new constructor(
    target,
    grpcRuntime.credentials.createInsecure(),
    keepaliveOptions,
  ) as unknown as VmmServiceClient
  clientPool.set(target, {
    client: created,
    keepaliveOptions,
  })
  return created
}

/**
 * Lightweight snapshot of gRPC transport cache state for regression tests.
 * 供回归测试读取的 gRPC 传输缓存轻量状态快照。
 *
 * Tests only need to know whether runtime/constructor caches exist and which
 * targets remain in the client pool; they should not depend on private object
 * internals beyond that.
 * 测试只需要知道运行时缓存、构造器缓存是否存在，
 * 以及 client pool 当前还保留了哪些 target，
 * 不应该继续依赖更私有的对象内部结构。
 */
export type VmmGrpcTransportDebugState = {
  hasCachedTransportRuntime: boolean
  hasCachedConstructor: boolean
  pooledTargets: string[]
}

/**
 * Install one temporary runtime-module loader override for tests.
 * 为测试安装一条临时运行时模块加载覆盖器。
 *
 * This helper exists so regression tests can simulate import failures and fake
 * grpc runtimes while keeping production call sites unchanged.
 * 这个辅助函数的存在，是为了让回归测试在不改生产调用面的前提下，
 * 稳定模拟导入失败和伪造 grpc 运行时。
 */
export function __setVmmGrpcRuntimeModuleLoaderForTests(
  loader: VmmRuntimeModuleLoader | undefined,
) {
  runtimeModuleLoaderOverrideForTests = loader
}

/**
 * Clear cached grpc transport state so each regression test starts fresh.
 * 清空缓存的 grpc 传输状态，让每条回归测试都从干净状态开始。
 *
 * The reset also closes pooled clients because otherwise stale fake clients
 * could leak across tests and invalidate pool-pruning assertions.
 * 这里会顺手关闭池中客户端，
 * 否则旧的伪造 client 可能跨测试残留，
 * 干扰后续对 pool 修剪行为的断言。
 */
export function __resetVmmGrpcTransportStateForTests() {
  runtimeModuleLoaderOverrideForTests = undefined
  cachedTransportRuntimePromise = undefined
  cachedConstructor = undefined
  for (const entry of clientPool.values()) {
    closeClientQuietly(entry.client)
  }
  clientPool.clear()
}

/**
 * Resolve the transport runtime directly for regression tests.
 * 供回归测试直接解析传输运行时。
 *
 * Tests use this helper to verify that a rejected first load does not poison
 * the cache forever and that a later call can recover successfully.
 * 测试会用这个入口验证：
 * 首次失败不会永久污染缓存，后续调用仍然可以恢复成功。
 */
export async function __resolveVmmGrpcTransportRuntimeForTests() {
  return getTransportRuntimeSet()
}

/**
 * Acquire one grpc client directly for regression tests.
 * 供回归测试直接获取一条 grpc client。
 *
 * This exposes the same pooling path used by production RPC calls, which lets
 * tests verify reuse and stale-target pruning without issuing real network IO.
 * 这个入口直接复用了生产 RPC 的同一路径，
 * 因此测试可以在不发真实网络请求的情况下，
 * 验证 client 复用与旧 target 修剪行为。
 */
export async function __acquireVmmGrpcClientForTests(
  target: string,
  config?: VmmGrpcTransportConfig,
) {
  return getClient(target, config)
}

/**
 * Describe current grpc transport cache state for regression tests.
 * 为回归测试描述当前 grpc 传输缓存状态。
 *
 * Keeping this as a narrow summary avoids exposing mutable private structures
 * while still giving tests enough observability to assert recovery behavior.
 * 这里故意只暴露狭窄摘要，
 * 是为了避免把可变私有结构直接泄漏出去，
 * 同时仍让测试有足够可观测性去断言恢复行为。
 */
export function __describeVmmGrpcTransportStateForTests(): VmmGrpcTransportDebugState {
  return {
    hasCachedTransportRuntime: cachedTransportRuntimePromise !== undefined,
    hasCachedConstructor: cachedConstructor !== undefined,
    pooledTargets: [...clientPool.keys()],
  }
}

/**
 * Build gRPC metadata shared by all unary calls.
 * 构建所有 unary 调用共用的 gRPC metadata。
 *
 * The transport forwards `x-trace-id` for easier cross-log correlation, and it
 * forwards `authorization` only when the caller configured an API key.
 * 传输层会透传 `x-trace-id`，方便跨日志关联；
 * 只有在调用方配置了 API key 时，才会附带 `authorization`。
 */
function createMetadata(args: {
  grpcRuntime: VmmGrpcRuntime
  grpcApiKey?: string
  method: string
}) {
  const metadata = new args.grpcRuntime.Metadata()
  metadata.set(
    "x-trace-id",
    buildTraceId({
      method: args.method,
    }),
  )
  if (args.grpcApiKey) {
    metadata.set("authorization", `Bearer ${args.grpcApiKey}`)
  }
  return metadata
}

/**
 * Normalize one RPC method name into the kebab-case token used by `x-trace-id`.
 * 把一条 RPC 方法名标准化为 `x-trace-id` 使用的 kebab-case token。
 *
 * The trace-id should stay stable, readable, and header-safe while never
 * leaking user inputs or workspace scope into transport metadata.
 * trace-id 需要同时满足稳定、可读、header 安全，
 * 并且绝不能把用户输入或工作区作用域泄漏到传输层 metadata 里。
 */
export function normalizeTraceMethodName(method: string) {
  const normalizedMethod = method.normalize("NFKC").trim() || "unknown-method"
  const readableToken = normalizedMethod
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
  return readableToken || "unknown-method"
}

/**
 * Build one `x-trace-id` value shared by grpc-js and manual http2 transports.
 * 构建 grpc-js 与手工 http2 传输共用的一份 `x-trace-id`。
 *
 * Every transport path must emit the same method-only trace-id format so logs
 * can be correlated without ever embedding request payload fragments.
 * 所有传输链路都必须输出同一套“仅含方法名”的 trace-id 格式，
 * 这样日志既能关联，又不会夹带请求体片段。
 */
export function buildTraceId(args: {
  method: string
}) {
  return `vmm-plugin-${normalizeTraceMethodName(args.method)}-${crypto.randomUUID()}`
}

/**
 * Wait until the client channel becomes ready or the handshake timeout expires.
 * 等待客户端 channel 就绪，或在握手超时到期后失败。
 *
 * This preserves the old two-stage timeout model: a short connectivity budget
 * before the actual RPC is allowed to spend a longer response budget.
 * 这保留了旧的“两段超时”语义：
 * 先用较短时间确认连通性，再给实际 RPC 一个更长的响应预算。
 */
async function waitForReady(client: VmmServiceClient, handshakeTimeoutMs: number) {
  const deadline = new Date(Date.now() + handshakeTimeoutMs)
  return new Promise<void>((resolve, reject) => {
    client.waitForReady(deadline, (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

/**
 * Convert a service error into stable transport metadata.
 * 把服务错误转换成稳定的传输层元数据。
 *
 * Callers use this normalized view for logs and user-facing feedback instead of
 * reaching into grpc-specific error objects everywhere.
 * 调用方通过这个归一化视图写日志和做用户提示，
 * 不需要在各处直接访问 grpc 特定的错误对象。
 */
function describeServiceError(grpcRuntime: VmmGrpcRuntime, error: unknown) {
  const serviceError = error as grpcType.ServiceError | undefined
  const grpcCode =
    typeof serviceError?.code === "number" ? (serviceError.code as grpcType.status) : undefined
  const grpcCodeName = grpcCode !== undefined ? grpcRuntime.status[grpcCode] : undefined
  return {
    grpcCode,
    grpcCodeName,
    details: typeof serviceError?.details === "string" ? serviceError.details : undefined,
  }
}

/**
 * Call one unary RPC after the shared ready-check succeeds without target fallback.
 * 在共享 ready-check 成功后调用一条 unary RPC，但不执行 target 回退。
 *
 * This helper keeps business RPCs and admin RPCs on the same timeout,
 * metadata, and error-mapping behavior.
 * 这个辅助函数让业务 RPC 和管理 RPC 共用同一套超时、
 * metadata 和错误归一化行为。
 */
async function callUnaryOnce<TRequest, TResponse>(args: {
  target: string
  methodName: VmmUnaryMethodName
  methodPath: string
  request: TRequest
  config?: VmmGrpcTransportConfig
}) {
  if (!args.target || args.target.trim().length === 0) {
    return {
      ok: false,
      target: args.target,
      method: args.methodPath,
      error: new Error("missing grpc target: grpcTarget is empty or not configured"),
      details: "missing grpc target: grpcTarget is empty or not configured",
    } satisfies VmmGrpcUnaryResult<TResponse>
  }

  const { grpcRuntime } = await getTransportRuntimeSet()
  const client = await getClient(args.target, args.config)
  const handshakeTimeoutMs = args.config?.grpcHandshakeTimeoutMs ?? 1500
  const receiveTimeoutMs = args.config?.grpcReceiveTimeoutMs ?? 30000

  try {
    // Ensure connectivity first so connection failures surface quickly and do
    // not consume the longer response deadline budget.
    // 先确认连接可用，这样连接失败会尽快暴露，
    // 不会把更长的响应 deadline 也一起消耗掉。
    await waitForReady(client, handshakeTimeoutMs)
  } catch (error) {
    const described = describeServiceError(grpcRuntime, error)
    return {
      ok: false,
      target: args.target,
      method: args.methodPath,
      timedOutPhase: "handshake",
      error,
      grpcCode: described.grpcCode,
      grpcCodeName: described.grpcCodeName,
      details: described.details,
    } satisfies VmmGrpcUnaryResult<TResponse>
  }

  const metadata = createMetadata({
    grpcRuntime,
    grpcApiKey: args.config?.grpcApiKey,
    method: args.methodName,
  })
  const deadline = new Date(Date.now() + receiveTimeoutMs)

  try {
    const response = await new Promise<TResponse>((resolve, reject) => {
      const callback = (error: grpcType.ServiceError | null, payload?: TResponse) => {
        if (error) {
          reject(error)
          return
        }
        resolve(payload as TResponse)
      }

      // Dispatch through one dynamically selected unary method while keeping
      // the same metadata and deadline policy across admin and business calls.
      // 通过动态选择的一元方法发起调用，
      // 同时让管理面和业务面共用一套 metadata 与 deadline 策略。
      const invoke = client[args.methodName] as unknown as VmmUnaryInvoker<TRequest, TResponse>
      invoke.call(client, args.request, metadata, { deadline }, callback)
    })

    return {
      ok: true,
      target: args.target,
      method: args.methodPath,
      response,
    } satisfies VmmGrpcUnaryResult<TResponse>
  } catch (error) {
    const described = describeServiceError(grpcRuntime, error)
    return {
      ok: false,
      target: args.target,
      method: args.methodPath,
      timedOutPhase:
        described.grpcCode === grpcRuntime.status.DEADLINE_EXCEEDED ? "receive" : undefined,
      error,
      grpcCode: described.grpcCode,
      grpcCodeName: described.grpcCodeName,
      details: described.details,
    } satisfies VmmGrpcUnaryResult<TResponse>
  }
}

/**
 * Call one unary RPC against the configured vulcan-host endpoint.
 * 针对当前配置的 vulcan-host 端点调用一条 unary RPC。
 *
 * Target selection is intentionally single-hop. If vulcan-host cannot reach
 * VMM, the error must surface there instead of being hidden by plugin fallback.
 * 目标选择刻意保持单跳。
 * 如果 vulcan-host 无法访问 VMM，错误应在宿主层暴露，而不是被插件回退隐藏。
 */
async function callUnary<TRequest, TResponse>(args: {
  target: string
  methodName: VmmUnaryMethodName
  methodPath: string
  request: TRequest
  config?: VmmGrpcTransportConfig
}) {
  return callUnaryOnce<TRequest, TResponse>(args)
}

/**
 * Call the VMM ListProjects unary RPC.
 * 调用 VMM 的 ListProjects unary RPC。
 */
export async function callVmmListProjects(args: {
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcEmptyRequest, VmmGrpcListProjectsResponse>({
    target,
    methodName: "ListProjects",
    methodPath: VMM_SERVICE_METHOD_LIST_PROJECTS,
    request: {},
    config: args.config,
  })
}

/**
 * Call the VMM ResolveProject unary RPC.
 * 调用 VMM 的 ResolveProject unary RPC。
 */
export async function callVmmResolveProject(args: {
  request: VmmGrpcResolveProjectRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcResolveProjectRequest, VmmGrpcResolveProjectResponse>({
    target,
    methodName: "ResolveProject",
    methodPath: VMM_SERVICE_METHOD_RESOLVE_PROJECT,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM EnsureProject unary RPC.
 * 调用 VMM 的 EnsureProject unary RPC。
 */
export async function callVmmEnsureProject(args: {
  request: VmmGrpcEnsureProjectRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcEnsureProjectRequest, VmmGrpcEnsureProjectResponse>({
    target,
    methodName: "EnsureProject",
    methodPath: VMM_SERVICE_METHOD_ENSURE_PROJECT,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM DeleteProject unary RPC.
 * 调用 VMM 的 DeleteProject unary RPC。
 */
export async function callVmmDeleteProject(args: {
  request: VmmGrpcDeleteProjectRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcDeleteProjectRequest, VmmGrpcDeleteProjectResponse>({
    target,
    methodName: "DeleteProject",
    methodPath: VMM_SERVICE_METHOD_DELETE_PROJECT,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM MigrateProject unary RPC.
 * 调用 VMM 的 MigrateProject unary RPC。
 */
export async function callVmmMigrateProject(args: {
  request: VmmGrpcMigrateProjectRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcMigrateProjectRequest, VmmGrpcMigrateProjectResponse>({
    target,
    methodName: "MigrateProject",
    methodPath: VMM_SERVICE_METHOD_MIGRATE_PROJECT,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM ResolveUser unary RPC.
 * 调用 VMM 的 ResolveUser unary RPC。
 */
export async function callVmmResolveUser(args: {
  request: VmmGrpcResolveUserRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcResolveUserRequest, VmmGrpcResolveUserResponse>({
    target,
    methodName: "ResolveUser",
    methodPath: VMM_SERVICE_METHOD_RESOLVE_USER,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM ListUsers unary RPC.
 * 调用 VMM 的 ListUsers unary RPC。
 */
export async function callVmmListUsers(args: {
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcEmptyRequest, VmmGrpcListUsersResponse>({
    target,
    methodName: "ListUsers",
    methodPath: VMM_SERVICE_METHOD_LIST_USERS,
    request: {},
    config: args.config,
  })
}

/**
 * Call the VMM DeleteUser unary RPC.
 * 调用 VMM 的 DeleteUser unary RPC。
 */
export async function callVmmDeleteUser(args: {
  request: VmmGrpcDeleteUserRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcDeleteUserRequest, VmmGrpcDeleteUserResponse>({
    target,
    methodName: "DeleteUser",
    methodPath: VMM_SERVICE_METHOD_DELETE_USER,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM GetProfileNodes unary RPC.
 * 调用 VMM 的 GetProfileNodes unary RPC。
 *
 * Profile reads are command-driven inspection calls, so the caller explicitly
 * controls the scope target and the maximum node slice it wants to inspect.
 * 画像读取属于命令驱动的检查调用，
 * 因此由调用方显式指定目标 scope，以及本次想检查的最大节点切片大小。
 */
export async function callVmmGetProfileNodes(args: {
  request: VmmGrpcGetProfileNodesRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcGetProfileNodesRequest, VmmGrpcGetProfileNodesResponse>({
    target,
    methodName: "GetProfileNodes",
    methodPath: VMM_SERVICE_METHOD_GET_PROFILE_NODES,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM GetProfileBundle unary RPC.
 * 调用 VMM 的 GetProfileBundle unary RPC。
 *
 * This bundle read returns the backend-assembled TEAM/SPACE/PROJECT/USER
 * profile text as one deterministic unit tied to the current user/project
 * pair, so prompt orchestration can reuse one stable hidden profile block.
 * 这条 bundle 读取会返回后端按当前 user/project 组合组装出的
 * TEAM / SPACE / PROJECT / USER 完整画像文本，
 * 让提示词编排层能够复用一份稳定的隐藏画像块。
 */
export async function callVmmGetProfileBundle(args: {
  request: VmmGrpcGetProfileBundleRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)

  try {
    return await callUnary<VmmGrpcGetProfileBundleRequest, VmmGrpcGetProfileBundleResponse>({
      target,
      methodName: "GetProfileBundle",
      methodPath: VMM_SERVICE_METHOD_GET_PROFILE_BUNDLE,
      request: args.request,
      config: args.config,
    })
  } catch (error) {
    if (!isRuntimeSurfaceResolutionError(error)) {
      throw error
    }

    return callVmmGetProfileBundleManually({
      target,
      request: args.request,
      config: args.config,
    })
  }
}

/**
 * Call the VMM ApplyProfileInstruction unary RPC.
 * 调用 VMM 的 ApplyProfileInstruction unary RPC。
 *
 * Manual profile updates run synchronously through the backend review chain,
 * so transport treats them like a regular unary call with the shared timeout
 * and error normalization behavior.
 * 手工画像更新会同步走后端评审链，
 * 因此传输层把它视作普通 unary 调用，并复用共享超时与错误归一化逻辑。
 */
export async function callVmmApplyProfileInstruction(args: {
  request: VmmGrpcApplyProfileInstructionRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcApplyProfileInstructionRequest, VmmGrpcApplyProfileInstructionResponse>({
    target,
    methodName: "ApplyProfileInstruction",
    methodPath: VMM_SERVICE_METHOD_APPLY_PROFILE_INSTRUCTION,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM Healthz unary RPC.
 * 调用 VMM 的 Healthz unary RPC。
 *
 * Healthz is intentionally side-effect free, so debug surfaces can use it as
 * the lightest possible transport probe before touching business RPCs.
 * Healthz 天然不带业务副作用，
 * 因而调试界面可以先用它做最轻量的传输探针，再决定是否继续测试业务 RPC。
 */
export async function callVmmHealthz(args: {
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcEmptyRequest, VmmGrpcHealthzResponse>({
    target,
    methodName: "Healthz",
    methodPath: VMM_SERVICE_METHOD_HEALTHZ,
    request: {},
    config: args.config,
  })
}

/**
 * Call the VMM SearchMemoryEvents unary RPC.
 * 调用 VMM 的 SearchMemoryEvents unary RPC。
 *
 * This surface is intended for active agent-driven recall, so callers provide
 * only a simple query list while transport keeps scope resolution and gRPC
 * details outside the tool-facing layer.
 * 这条接口面向 agent 主动发起记忆召回，
 * 因此调用方现在只需要提供简单查询列表，
 * 由传输层把作用域解析和 gRPC 细节隔离在 tool 外面。
 */
export async function callVmmSearchMemoryEvents(args: {
  request: VmmGrpcSearchMemoryEventsRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcSearchMemoryEventsRequest, VmmGrpcSearchMemoryEventsResponse>({
    target,
    methodName: "SearchMemoryEvents",
    methodPath: VMM_SERVICE_METHOD_SEARCH_MEMORY_EVENTS,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM GetTurnDetails unary RPC.
 * 调用 VMM 的 GetTurnDetails unary RPC。
 *
 * This detail surface now returns structured dialogue fields that are ready for
 * tools, debug panes, and prompt follow-up decisions.
 * 这条详情接口现在直接返回适合 tools、调试面板和提示词后续决策使用的
 * 结构化对话字段。
 */
export async function callVmmGetTurnDetails(args: {
  request: VmmGrpcGetTurnDetailsRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcGetTurnDetailsRequest, VmmGrpcGetTurnDetailsResponse>({
    target,
    methodName: "GetTurnDetails",
    methodPath: VMM_SERVICE_METHOD_GET_TURN_DETAILS,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM WriteMemories unary RPC.
 * 调用 VMM 的 WriteMemories unary RPC。
 *
 * This surface persists one ordered batch of direct memory items and returns
 * only the created or deduplicated memory ids, keeping AI-facing write flows
 * intentionally small.
 * 这条接口会持久化一批有序的主动记忆项，
 * 并只返回新建或复用的 memory id，让面向 AI 的写入链路保持足够小巧。
 */
export async function callVmmWriteMemories(args: {
  request: VmmGrpcWriteMemoriesRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcWriteMemoriesRequest, VmmGrpcWriteMemoriesResponse>({
    target,
    methodName: "WriteMemories",
    methodPath: VMM_SERVICE_METHOD_WRITE_MEMORIES,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM DeleteMemories unary RPC.
 * 调用 VMM 的 DeleteMemories unary RPC。
 *
 * This tool-facing RPC requires exact durable memory ids. It deliberately does
 * not accept turn ids, because a turn can produce or reference multiple
 * memories while the delete operation targets only selected memory rows.
 * 这条面向 tool 的 RPC 要求传入精确的长期 memory id。
 * 它故意不接受 turn id，因为一条 turn 可能产生或关联多条记忆，
 * 而删除操作只应命中特定 memory 行。
 */
export async function callVmmDeleteMemories(args: {
  request: VmmGrpcDeleteMemoriesRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)
  return callUnary<VmmGrpcDeleteMemoriesRequest, VmmGrpcDeleteMemoriesResponse>({
    target,
    methodName: "DeleteMemories",
    methodPath: VMM_SERVICE_METHOD_DELETE_MEMORIES,
    request: args.request,
    config: args.config,
  })
}

/**
 * Call the VMM ChatCompact unary RPC.
 * 调用 VMM 的 ChatCompact unary RPC。
 *
 * This hook-facing RPC acknowledges one session compaction boundary so later
 * compact-aware PreCheck calls can avoid reopening the still-live tail of the
 * current session.
 * 这条供 hook 调用的 RPC 用于确认某个 session 的压缩边界，
 * 让后续 compact-aware PreCheck 不会重新打开当前 session 仍然存活的未压缩尾部。
 */
export async function callVmmChatCompact(args: {
  request: VmmGrpcChatCompactRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)

  try {
    return await callUnary<VmmGrpcChatCompactRequest, VmmGrpcChatCompactResponse>({
      target,
      methodName: "ChatCompact",
      methodPath: VMM_SERVICE_METHOD_CHAT_COMPACT,
      request: args.request,
      config: args.config,
    })
  } catch (error) {
    if (!isRuntimeSurfaceResolutionError(error)) {
      throw error
    }

    return callVmmChatCompactManually({
      target,
      request: args.request,
      config: args.config,
    })
  }
}

/**
 * Call the VMM PreCheck unary RPC.
 * 调用 VMM 的 PreCheck unary RPC。
 *
 * The caller keeps using decimal-string identifiers while transport internally
 * maps them onto the current gRPC uint64 fields.
 * 调用方仍然使用十进制字符串形式的标识，
 * 传输层内部会把它们映射到当前 gRPC 的 uint64 字段。
 */
export async function callVmmPreCheck(args: {
  request: VmmGrpcPreCheckRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)

  try {
    return await callUnary<VmmGrpcPreCheckRequest, VmmGrpcPreCheckResponse>({
      target,
      methodName: "PreCheck",
      methodPath: VMM_SERVICE_METHOD_PRE_CHECK,
      request: args.request,
      config: args.config,
    })
  } catch (error) {
    if (!isRuntimeSurfaceResolutionError(error)) {
      throw error
    }

    return callVmmPreCheckManually({
      target,
      request: args.request,
      config: args.config,
    })
  }
}

/**
 * Call the VMM PostAction unary RPC.
 * 调用 VMM 的 PostAction unary RPC。
 *
 * This keeps writeback on the new gRPC contract while preserving the plugin's
 * existing ordered outbox replay semantics.
 * 这个函数让写回链切到新的 gRPC 契约上，
 * 同时保留插件现有的顺序 outbox 重放语义。
 */
export async function callVmmPostAction(args: {
  request: VmmGrpcPostActionRequest
  config?: VmmGrpcTransportConfig
}) {
  const target = normalizeGrpcTarget(args.config?.grpcTarget)

  try {
    return await callUnary<VmmGrpcPostActionRequest, VmmGrpcPostActionResponse>({
      target,
      methodName: "PostAction",
      methodPath: VMM_SERVICE_METHOD_POST_ACTION,
      request: args.request,
      config: args.config,
    })
  } catch (error) {
    if (!isRuntimeSurfaceResolutionError(error)) {
      throw error
    }

    return callVmmPostActionManually({
      target,
      request: args.request,
      config: args.config,
    })
  }
}
