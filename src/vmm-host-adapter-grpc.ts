/**
 * gRPC client for the vulcan-host HostAdapterService.
 * vulcan-host HostAdapterService 的 gRPC 客户端。
 *
 * This file belongs to the transport/integration layer. The plugin uses it to
 * ask vulcan-host for host profiles, adapter runtime context, tool registry
 * diffs, and refresh notices, while higher layers keep local fallback logic.
 * 这个文件属于传输与集成层。
 * 插件会用它向 vulcan-host 请求宿主画像、适配器运行时上下文、tool 注册表差异
 * 和刷新提示，而更高层会继续保留本地 fallback 逻辑。
 */

import path from "path"
import { fileURLToPath } from "url"
import type * as grpcType from "@grpc/grpc-js"

import {
  normalizeGrpcTarget,
  type VmmGrpcTransportConfig,
  type VmmGrpcUnaryResult,
} from "./vmm-grpc.js"

/**
 * Static type surface exported by `@grpc/proto-loader`.
 * `@grpc/proto-loader` 暴露出来的静态类型表面。
 */
type HostAdapterProtoLoaderModule = typeof import("@grpc/proto-loader")

/**
 * Static type surface exported by `@grpc/grpc-js`.
 * `@grpc/grpc-js` 暴露出来的静态类型表面。
 */
type HostAdapterGrpcModule = typeof import("@grpc/grpc-js")

/**
 * Minimal proto-loader runtime needed by this client.
 * 当前客户端需要的最小 proto-loader 运行时。
 */
type HostAdapterProtoLoaderRuntime = Pick<HostAdapterProtoLoaderModule, "load">

/**
 * Minimal grpc-js runtime needed by this client.
 * 当前客户端需要的最小 grpc-js 运行时。
 */
type HostAdapterGrpcRuntime = Pick<
  HostAdapterGrpcModule,
  "loadPackageDefinition" | "credentials" | "Metadata" | "status"
>

/**
 * Runtime module loader contract used by production and tests.
 * 生产链路与测试共用的运行时模块加载契约。
 */
type HostAdapterRuntimeModuleLoader = <T extends object>(moduleName: string) => Promise<T>

/**
 * Client context sent with every HostAdapterService request.
 * 每次 HostAdapterService 请求都会携带的客户端上下文。
 */
export type VmmHostAdapterGrpcClientContext = {
  client_name: string
  client_version?: string
  request_id?: string
}

/**
 * Request payload for GetHostAdapterProfile.
 * GetHostAdapterProfile 的请求载荷。
 */
export type VmmHostAdapterGrpcProfileRequest = {
  context: VmmHostAdapterGrpcClientContext
  host_kind: string
}

/**
 * Response payload for GetHostAdapterProfile.
 * GetHostAdapterProfile 的响应载荷。
 */
export type VmmHostAdapterGrpcProfileResponse = {
  adapter_json: string
  profile_json: string
  host_kind: string
  display_name: string
  refresh_mode: string
  identity_mode: string
  is_error: boolean
  message: string
  vmm_enabled: boolean
  vmm_status: string
}

/**
 * Request payload for BuildHostAdapterRuntime.
 * BuildHostAdapterRuntime 的请求载荷。
 */
export type VmmHostAdapterGrpcRuntimeRequest = {
  context: VmmHostAdapterGrpcClientContext
  host_kind: string
  adapter_host_kind?: string
  session_id?: string
  workmem_id?: string
  turn_id?: string
  workspace?: string
  user_message?: string
  conversation_id?: string
  root_session_id?: string
}

/**
 * Response payload for BuildHostAdapterRuntime.
 * BuildHostAdapterRuntime 的响应载荷。
 */
export type VmmHostAdapterGrpcRuntimeResponse = {
  runtime_json: string
  host_kind: string
  session_id: string
  workmem_id: string
  workmem_source: string
  identity_ready: boolean
  degraded_reasons: string[]
  is_error: boolean
  message: string
  vmm_enabled: boolean
  vmm_status: string
}

/**
 * Request payload for DiffToolRegistry.
 * DiffToolRegistry 的请求载荷。
 */
export type VmmHostAdapterGrpcDiffRequest = {
  context: VmmHostAdapterGrpcClientContext
  previous_snapshot_json: string
  next_snapshot_json: string
  refresh_mode?: string
  dynamic_tool_refresh_supported?: boolean
  host_restart_required?: boolean
}

/**
 * Response payload for DiffToolRegistry.
 * DiffToolRegistry 的响应载荷。
 */
export type VmmHostAdapterGrpcDiffResponse = {
  diff_json: string
  changed_tool_ids: string[]
  added_tool_ids: string[]
  removed_tool_ids: string[]
  updated_tool_ids: string[]
  restart_required: boolean
  summary: string
  is_error: boolean
  message: string
}

/**
 * Request payload for BuildToolRefreshNotice.
 * BuildToolRefreshNotice 的请求载荷。
 */
export type VmmHostAdapterGrpcNoticeRequest = {
  context: VmmHostAdapterGrpcClientContext
  host_kind: string
  previous_snapshot_json: string
  next_snapshot_json: string
}

/**
 * Response payload for BuildToolRefreshNotice.
 * BuildToolRefreshNotice 的响应载荷。
 */
export type VmmHostAdapterGrpcNoticeResponse = {
  notice_json: string
  changed: boolean
  refresh_mode: string
  severity: string
  restart_required: boolean
  changed_tool_ids: string[]
  model_message: string
  user_message: string
  is_error: boolean
  message: string
}

/**
 * Request payload for GetVmmStatus.
 * GetVmmStatus 的请求载荷。
 */
export type VmmHostAdapterGrpcVmmStatusRequest = {
  context: VmmHostAdapterGrpcClientContext
}

/**
 * Response payload for GetVmmStatus.
 * GetVmmStatus 的响应载荷。
 */
export type VmmHostAdapterGrpcVmmStatusResponse = {
  vmm_enabled: boolean
  vmm_status: string
  is_error: boolean
  message: string
}

/**
 * Stable tool descriptor returned by HostAdapterService metadata calls.
 * HostAdapterService 元信息调用返回的稳定工具描述。
 */
export type VmmHostAdapterGrpcToolDescriptor = {
  name: string
  description: string
  input_schema_json: string
  annotations_json: string
  source: string
}

/**
 * Request payload for ListVmmMemoryTools.
 * ListVmmMemoryTools 的请求载荷。
 */
export type VmmHostAdapterGrpcListVmmMemoryToolsRequest = {
  context: VmmHostAdapterGrpcClientContext
}

/**
 * Response payload for ListVmmMemoryTools.
 * ListVmmMemoryTools 的响应载荷。
 */
export type VmmHostAdapterGrpcListVmmMemoryToolsResponse = {
  tools: VmmHostAdapterGrpcToolDescriptor[]
  is_error: boolean
  message: string
  vmm_enabled: boolean
  vmm_status: string
}

/**
 * Dynamic grpc-js client shape for HostAdapterService.
 * HostAdapterService 的动态 grpc-js 客户端形态。
 */
type HostAdapterServiceClient = grpcType.Client & {
  GetHostAdapterProfile(
    request: VmmHostAdapterGrpcProfileRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmHostAdapterGrpcProfileResponse) => void,
  ): void
  BuildHostAdapterRuntime(
    request: VmmHostAdapterGrpcRuntimeRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmHostAdapterGrpcRuntimeResponse) => void,
  ): void
  DiffToolRegistry(
    request: VmmHostAdapterGrpcDiffRequest & {
      has_dynamic_tool_refresh_supported: boolean
      dynamic_tool_refresh_supported: boolean
      host_restart_required: boolean
    },
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmHostAdapterGrpcDiffResponse) => void,
  ): void
  BuildToolRefreshNotice(
    request: VmmHostAdapterGrpcNoticeRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmHostAdapterGrpcNoticeResponse) => void,
  ): void
  GetVmmStatus(
    request: VmmHostAdapterGrpcVmmStatusRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmHostAdapterGrpcVmmStatusResponse) => void,
  ): void
  ListVmmMemoryTools(
    request: VmmHostAdapterGrpcListVmmMemoryToolsRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmHostAdapterGrpcListVmmMemoryToolsResponse) => void,
  ): void
}

/**
 * Cached runtime set shared by HostAdapterService calls.
 * HostAdapterService 调用共享的运行时缓存。
 */
type HostAdapterGrpcRuntimeSet = {
  protoLoaderRuntime: HostAdapterProtoLoaderRuntime
  grpcRuntime: HostAdapterGrpcRuntime
}

/**
 * Runtime client pool entry keyed by target.
 * 以 target 为键的运行时客户端池条目。
 */
type HostAdapterClientPoolEntry = {
  client: HostAdapterServiceClient
}

const HOST_ADAPTER_PROTO_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "proto",
  "v1",
  "mcp_service.proto",
)

/**
 * Conservative handshake timeout used when transport config omits one.
 * 传输配置未提供握手超时时使用的保守默认值。
 */
const DEFAULT_HOST_ADAPTER_GRPC_HANDSHAKE_TIMEOUT_MS = 5_000

/**
 * Conservative receive timeout used when transport config omits one.
 * 传输配置未提供接收超时时使用的保守默认值。
 */
const DEFAULT_HOST_ADAPTER_GRPC_RECEIVE_TIMEOUT_MS = 120_000

let runtimeModuleLoaderOverrideForTests: HostAdapterRuntimeModuleLoader | undefined
let cachedRuntimeSet: HostAdapterGrpcRuntimeSet | undefined
let cachedConstructor: grpcType.ServiceClientConstructor | undefined
const clientPool = new Map<string, HostAdapterClientPoolEntry>()

/**
 * Load one runtime module through dynamic import.
 * 通过动态 import 加载一个运行时模块。
 */
async function loadRuntimeModule<T extends object>(moduleName: string) {
  if (runtimeModuleLoaderOverrideForTests) {
    return runtimeModuleLoaderOverrideForTests<T>(moduleName)
  }

  return import(moduleName) as Promise<T>
}

/**
 * Resolve the proto-loader and grpc-js runtime set.
 * 解析 proto-loader 与 grpc-js 运行时集合。
 */
async function getRuntimeSet() {
  if (cachedRuntimeSet) {
    return cachedRuntimeSet
  }

  const protoLoaderRuntime = await loadRuntimeModule<HostAdapterProtoLoaderRuntime>("@grpc/proto-loader")
  const grpcRuntime = await loadRuntimeModule<HostAdapterGrpcRuntime>("@grpc/grpc-js")
  cachedRuntimeSet = {
    protoLoaderRuntime,
    grpcRuntime,
  }
  return cachedRuntimeSet
}

/**
 * Resolve the HostAdapterService constructor from the vendored proto file.
 * 从内置 proto 文件解析 HostAdapterService 构造器。
 */
async function getServiceConstructor() {
  if (cachedConstructor) {
    return cachedConstructor
  }

  const { protoLoaderRuntime, grpcRuntime } = await getRuntimeSet()
  const packageDefinition = await protoLoaderRuntime.load(HOST_ADAPTER_PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  })
  const loaded = grpcRuntime.loadPackageDefinition(packageDefinition) as {
    vulcan?: {
      mcp?: {
        v1?: {
          HostAdapterService?: grpcType.ServiceClientConstructor
        }
      }
    }
  }
  const constructor = loaded.vulcan?.mcp?.v1?.HostAdapterService

  if (!constructor) {
    throw new Error(`Failed to load HostAdapterService from proto: ${HOST_ADAPTER_PROTO_PATH}`)
  }

  cachedConstructor = constructor
  return constructor
}

/**
 * Get or create one HostAdapterService client for a specific target.
 * 获取或创建指定 target 的 HostAdapterService 客户端。
 */
async function getClient(target: string) {
  const existing = clientPool.get(target)
  if (existing) {
    return existing.client
  }

  const { grpcRuntime } = await getRuntimeSet()
  const constructor = await getServiceConstructor()
  const client = new constructor(
    target,
    grpcRuntime.credentials.createInsecure(),
  ) as unknown as HostAdapterServiceClient
  clientPool.set(target, { client })
  return client
}

/**
 * Build metadata for HostAdapterService calls.
 * 为 HostAdapterService 调用构建 metadata。
 */
function createMetadata(grpcRuntime: HostAdapterGrpcRuntime, requestID: string | undefined) {
  const metadata = new grpcRuntime.Metadata()
  if (requestID) {
    metadata.set("x-request-id", requestID)
  }
  return metadata
}

/**
 * Wait for the HostAdapterService channel to become ready.
 * 等待 HostAdapterService channel 进入 ready 状态。
 */
async function waitForReady(client: HostAdapterServiceClient, timeoutMs: number) {
  await new Promise<void>((resolve, reject) => {
    client.waitForReady(Date.now() + timeoutMs, (error) => {
      if (error) {
        reject(error)
      } else {
        resolve()
      }
    })
  })
}

/**
 * Convert a service error into stable transport metadata.
 * 把服务错误转换成稳定传输元信息。
 */
function describeServiceError(grpcRuntime: HostAdapterGrpcRuntime, error: unknown) {
  const serviceError = error as grpcType.ServiceError | undefined
  const grpcCode = typeof serviceError?.code === "number" ? serviceError.code : grpcRuntime.status.UNKNOWN
  const grpcCodeName =
    Object.entries(grpcRuntime.status).find(([, value]) => value === grpcCode)?.[0] ?? "UNKNOWN"

  return {
    grpcCode,
    grpcCodeName,
    details: serviceError?.details ?? serviceError?.message ?? String(error),
  }
}

/**
 * Call one HostAdapterService unary RPC.
 * 调用一条 HostAdapterService unary RPC。
 */
async function callHostAdapterUnary<TRequest extends { context: VmmHostAdapterGrpcClientContext }, TResponse>(
  args: {
    config: VmmGrpcTransportConfig
    methodName:
      | "GetHostAdapterProfile"
      | "BuildHostAdapterRuntime"
      | "DiffToolRegistry"
      | "BuildToolRefreshNotice"
      | "GetVmmStatus"
      | "ListVmmMemoryTools"
    request: TRequest
  },
): Promise<VmmGrpcUnaryResult<TResponse>> {
  const target = normalizeGrpcTarget(args.config.grpcTarget)
  if (!target) {
    return {
      ok: false,
      method: args.methodName,
      target,
      grpcCode: undefined,
      grpcCodeName: "MISSING_TARGET",
      timedOutPhase: undefined,
      details: "HostAdapterService target is not configured.",
    }
  }

  try {
    const { grpcRuntime } = await getRuntimeSet()
    const client = await getClient(target)
    await waitForReady(
      client,
      args.config.grpcHandshakeTimeoutMs ?? DEFAULT_HOST_ADAPTER_GRPC_HANDSHAKE_TIMEOUT_MS,
    )
    const metadata = createMetadata(grpcRuntime, args.request.context.request_id)
    const options: grpcType.CallOptions = {
      deadline: Date.now() + (args.config.grpcReceiveTimeoutMs ?? DEFAULT_HOST_ADAPTER_GRPC_RECEIVE_TIMEOUT_MS),
    }

    const response = await new Promise<TResponse>((resolve, reject) => {
      const method = client[args.methodName] as unknown as (
        request: TRequest,
        metadata: grpcType.Metadata,
        options: grpcType.CallOptions,
        callback: (error: grpcType.ServiceError | null, payload?: TResponse) => void,
      ) => void
      method.call(client, args.request, metadata, options, (error, payload) => {
        if (error) {
          reject(error)
        } else if (!payload) {
          reject(new Error(`${args.methodName} returned an empty response.`))
        } else {
          resolve(payload)
        }
      })
    })

    return {
      ok: true,
      method: args.methodName,
      target,
      response,
    }
  } catch (error) {
    const { grpcRuntime } = await getRuntimeSet()
    const described = describeServiceError(grpcRuntime, error)
    return {
      ok: false,
      method: args.methodName,
      target,
      grpcCode: described.grpcCode,
      grpcCodeName: described.grpcCodeName,
      timedOutPhase: undefined,
      details: described.details,
    }
  }
}

/**
 * Call GetHostAdapterProfile on vulcan-host.
 * 调用 vulcan-host 的 GetHostAdapterProfile。
 */
export async function callVmmHostAdapterProfile(args: {
  config: VmmGrpcTransportConfig
  request: VmmHostAdapterGrpcProfileRequest
}) {
  return callHostAdapterUnary<VmmHostAdapterGrpcProfileRequest, VmmHostAdapterGrpcProfileResponse>({
    config: args.config,
    methodName: "GetHostAdapterProfile",
    request: args.request,
  })
}

/**
 * Call BuildHostAdapterRuntime on vulcan-host.
 * 调用 vulcan-host 的 BuildHostAdapterRuntime。
 */
export async function callVmmHostAdapterRuntime(args: {
  config: VmmGrpcTransportConfig
  request: VmmHostAdapterGrpcRuntimeRequest
}) {
  return callHostAdapterUnary<VmmHostAdapterGrpcRuntimeRequest, VmmHostAdapterGrpcRuntimeResponse>({
    config: args.config,
    methodName: "BuildHostAdapterRuntime",
    request: args.request,
  })
}

/**
 * Call DiffToolRegistry on vulcan-host.
 * 调用 vulcan-host 的 DiffToolRegistry。
 */
export async function callVmmHostAdapterDiff(args: {
  config: VmmGrpcTransportConfig
  request: VmmHostAdapterGrpcDiffRequest
}) {
  return callHostAdapterUnary<
    VmmHostAdapterGrpcDiffRequest & {
      has_dynamic_tool_refresh_supported: boolean
      dynamic_tool_refresh_supported: boolean
      host_restart_required: boolean
    },
    VmmHostAdapterGrpcDiffResponse
  >({
    config: args.config,
    methodName: "DiffToolRegistry",
    request: {
      ...args.request,
      dynamic_tool_refresh_supported: args.request.dynamic_tool_refresh_supported ?? false,
      has_dynamic_tool_refresh_supported: args.request.dynamic_tool_refresh_supported !== undefined,
      host_restart_required: args.request.host_restart_required ?? false,
    },
  })
}

/**
 * Call BuildToolRefreshNotice on vulcan-host.
 * 调用 vulcan-host 的 BuildToolRefreshNotice。
 */
export async function callVmmHostAdapterToolRefreshNotice(args: {
  config: VmmGrpcTransportConfig
  request: VmmHostAdapterGrpcNoticeRequest
}) {
  return callHostAdapterUnary<VmmHostAdapterGrpcNoticeRequest, VmmHostAdapterGrpcNoticeResponse>({
    config: args.config,
    methodName: "BuildToolRefreshNotice",
    request: args.request,
  })
}

/**
 * Call GetVmmStatus on vulcan-host.
 * 调用 vulcan-host 的 GetVmmStatus。
 */
export async function callVmmHostAdapterGetVmmStatus(args: {
  config: VmmGrpcTransportConfig
  request: VmmHostAdapterGrpcVmmStatusRequest
}) {
  return callHostAdapterUnary<
    VmmHostAdapterGrpcVmmStatusRequest,
    VmmHostAdapterGrpcVmmStatusResponse
  >({
    config: args.config,
    methodName: "GetVmmStatus",
    request: args.request,
  })
}

/**
 * Call ListVmmMemoryTools on vulcan-host.
 * 调用 vulcan-host 的 ListVmmMemoryTools。
 */
export async function callVmmHostAdapterListVmmMemoryTools(args: {
  config: VmmGrpcTransportConfig
  request: VmmHostAdapterGrpcListVmmMemoryToolsRequest
}) {
  return callHostAdapterUnary<
    VmmHostAdapterGrpcListVmmMemoryToolsRequest,
    VmmHostAdapterGrpcListVmmMemoryToolsResponse
  >({
    config: args.config,
    methodName: "ListVmmMemoryTools",
    request: args.request,
  })
}

/**
 * Install one temporary runtime-module loader override for tests.
 * 为测试安装一条临时运行时模块加载覆盖器。
 */
export function __setVmmHostAdapterGrpcRuntimeModuleLoaderForTests(
  loader: HostAdapterRuntimeModuleLoader | undefined,
) {
  runtimeModuleLoaderOverrideForTests = loader
}

/**
 * Clear cached HostAdapterService transport state for tests.
 * 为测试清空 HostAdapterService 传输缓存。
 */
export function __resetVmmHostAdapterGrpcStateForTests() {
  cachedRuntimeSet = undefined
  cachedConstructor = undefined
  for (const entry of clientPool.values()) {
    entry.client.close()
  }
  clientPool.clear()
}
