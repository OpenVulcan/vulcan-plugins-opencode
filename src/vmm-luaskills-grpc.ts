/**
 * gRPC client for the vulcan-host LuaSkillsService.
 * vulcan-host LuaSkillsService 的 gRPC 客户端。
 *
 * This file belongs to the transport/integration layer. OpenCode plugin tools
 * use it to list dynamic LuaSkills runtime tools at startup and relay tool
 * invocations back through vulcan-host without creating per-host Lua engines.
 * 这个文件属于传输与集成层。
 * OpenCode 插件 tools 会用它在启动时枚举 LuaSkills 动态运行时工具，
 * 并把工具调用经由 vulcan-host 中转回去，避免每个宿主各自创建 Lua 引擎。
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
type LuaSkillsProtoLoaderModule = typeof import("@grpc/proto-loader")

/**
 * Static type surface exported by `@grpc/grpc-js`.
 * `@grpc/grpc-js` 暴露出来的静态类型表面。
 */
type LuaSkillsGrpcModule = typeof import("@grpc/grpc-js")

/**
 * Minimal proto-loader runtime needed by this client.
 * 当前客户端需要的最小 proto-loader 运行时。
 */
type LuaSkillsProtoLoaderRuntime = Pick<LuaSkillsProtoLoaderModule, "load">

/**
 * Minimal grpc-js runtime needed by this client.
 * 当前客户端需要的最小 grpc-js 运行时。
 */
type LuaSkillsGrpcRuntime = Pick<
  LuaSkillsGrpcModule,
  "loadPackageDefinition" | "credentials" | "Metadata" | "status"
>

/**
 * Runtime module loader contract used by production and tests.
 * 生产链路与测试共用的运行时模块加载契约。
 */
type LuaSkillsRuntimeModuleLoader = <T extends object>(moduleName: string) => Promise<T>

/**
 * Client context sent with every LuaSkillsService request.
 * 每次 LuaSkillsService 请求都会携带的客户端上下文。
 */
export type VmmLuaSkillsGrpcClientContext = {
  client_name: string
  client_version?: string
  request_id?: string
}

/**
 * Projection context declares whether the host can hide and inject LUASKILL_SID automatically.
 * 投影上下文声明宿主是否可以自动隐藏并注入 LUASKILL_SID。
 */
export type VmmLuaSkillsGrpcProjectionContext = {
  supports_managed_luaskill_sid: boolean
  session_id?: string
}

/**
 * Dynamic LuaSkills tool descriptor returned by vulcan-host.
 * vulcan-host 返回的动态 LuaSkills 工具描述。
 */
export type VmmLuaSkillsGrpcToolDescriptor = {
  name: string
  description: string
  input_schema_json: string
  annotations_json: string
  skill_id: string
  entry_name: string
  root_name: string
  skill_dir: string
}

/**
 * Request payload for ListTools.
 * ListTools 的请求载荷。
 */
export type VmmLuaSkillsGrpcListToolsRequest = {
  context: VmmLuaSkillsGrpcClientContext
  projection?: VmmLuaSkillsGrpcProjectionContext
}

/**
 * Response payload for ListTools.
 * ListTools 的响应载荷。
 */
export type VmmLuaSkillsGrpcListToolsResponse = {
  tools: VmmLuaSkillsGrpcToolDescriptor[]
}

/**
 * Request payload for CallTool.
 * CallTool 的请求载荷。
 */
export type VmmLuaSkillsGrpcCallToolRequest = {
  context: VmmLuaSkillsGrpcClientContext
  tool_name: string
  arguments_json: string
  projection?: VmmLuaSkillsGrpcProjectionContext
}

/**
 * Response payload for CallTool.
 * CallTool 的响应载荷。
 */
export type VmmLuaSkillsGrpcCallToolResponse = {
  result_json: string
  text: string
  is_error: boolean
  message: string
}

/**
 * Stable text response returned by LuaSkills management RPCs.
 * LuaSkills 管理 RPC 返回的稳定文本响应。
 */
export type VmmLuaSkillsGrpcTextResponse = {
  text: string
  is_error: boolean
  message: string
}

/**
 * Request payload for ListInstalledSkills.
 * ListInstalledSkills 的请求载荷。
 */
export type VmmLuaSkillsGrpcListInstalledSkillsRequest = {
  context: VmmLuaSkillsGrpcClientContext
}

/**
 * Request payload for InstallSkill.
 * InstallSkill 的请求载荷。
 */
export type VmmLuaSkillsGrpcInstallRequest = {
  context: VmmLuaSkillsGrpcClientContext
  source: string
  source_type?: string
}

/**
 * Request payload for UpdateSkill.
 * UpdateSkill 的请求载荷。
 */
export type VmmLuaSkillsGrpcUpdateRequest = {
  context: VmmLuaSkillsGrpcClientContext
  skill_id: string
}

/**
 * Request payload for UninstallSkill.
 * UninstallSkill 的请求载荷。
 */
export type VmmLuaSkillsGrpcUninstallRequest = {
  context: VmmLuaSkillsGrpcClientContext
  skill_id: string
}

/**
 * Request payload for ReloadRuntimeConfigs.
 * ReloadRuntimeConfigs 的请求载荷。
 */
export type VmmLuaSkillsGrpcReloadRuntimeConfigsRequest = {
  context: VmmLuaSkillsGrpcClientContext
}

/**
 * Dynamic grpc-js client shape for LuaSkillsService.
 * LuaSkillsService 的动态 grpc-js 客户端形态。
 */
type LuaSkillsServiceClient = grpcType.Client & {
  ListTools(
    request: VmmLuaSkillsGrpcListToolsRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmLuaSkillsGrpcListToolsResponse) => void,
  ): void
  CallTool(
    request: VmmLuaSkillsGrpcCallToolRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmLuaSkillsGrpcCallToolResponse) => void,
  ): void
  ListInstalledSkills(
    request: VmmLuaSkillsGrpcListInstalledSkillsRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmLuaSkillsGrpcTextResponse) => void,
  ): void
  InstallSkill(
    request: VmmLuaSkillsGrpcInstallRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmLuaSkillsGrpcTextResponse) => void,
  ): void
  UpdateSkill(
    request: VmmLuaSkillsGrpcUpdateRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmLuaSkillsGrpcTextResponse) => void,
  ): void
  UninstallSkill(
    request: VmmLuaSkillsGrpcUninstallRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmLuaSkillsGrpcTextResponse) => void,
  ): void
  ReloadRuntimeConfigs(
    request: VmmLuaSkillsGrpcReloadRuntimeConfigsRequest,
    metadata: grpcType.Metadata,
    options: grpcType.CallOptions,
    callback: (error: grpcType.ServiceError | null, payload?: VmmLuaSkillsGrpcTextResponse) => void,
  ): void
}

/**
 * Cached runtime set shared by LuaSkillsService calls.
 * LuaSkillsService 调用共享的运行时缓存。
 */
type LuaSkillsGrpcRuntimeSet = {
  protoLoaderRuntime: LuaSkillsProtoLoaderRuntime
  grpcRuntime: LuaSkillsGrpcRuntime
}

/**
 * Runtime client pool entry keyed by target.
 * 以 target 为键的运行时客户端池条目。
 */
type LuaSkillsClientPoolEntry = {
  client: LuaSkillsServiceClient
}

const LUASKILLS_PROTO_PATH = path.join(
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
const DEFAULT_LUASKILLS_GRPC_HANDSHAKE_TIMEOUT_MS = 5_000

/**
 * Conservative receive timeout used when transport config omits one.
 * 传输配置未提供接收超时时使用的保守默认值。
 */
const DEFAULT_LUASKILLS_GRPC_RECEIVE_TIMEOUT_MS = 120_000

let runtimeModuleLoaderOverrideForTests: LuaSkillsRuntimeModuleLoader | undefined
let cachedRuntimeSet: LuaSkillsGrpcRuntimeSet | undefined
let cachedConstructor: grpcType.ServiceClientConstructor | undefined
const clientPool = new Map<string, LuaSkillsClientPoolEntry>()

/**
 * Load one runtime module through dynamic import.
 * 通过 dynamic import 加载一个运行时模块。
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

  const protoLoaderRuntime = await loadRuntimeModule<LuaSkillsProtoLoaderRuntime>("@grpc/proto-loader")
  const grpcRuntime = await loadRuntimeModule<LuaSkillsGrpcRuntime>("@grpc/grpc-js")
  cachedRuntimeSet = {
    protoLoaderRuntime,
    grpcRuntime,
  }
  return cachedRuntimeSet
}

/**
 * Resolve the LuaSkillsService constructor from the vendored proto file.
 * 从内置 proto 文件解析 LuaSkillsService 构造器。
 */
async function getServiceConstructor() {
  if (cachedConstructor) {
    return cachedConstructor
  }

  const { protoLoaderRuntime, grpcRuntime } = await getRuntimeSet()
  const packageDefinition = await protoLoaderRuntime.load(LUASKILLS_PROTO_PATH, {
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
          LuaSkillsService?: grpcType.ServiceClientConstructor
        }
      }
    }
  }
  const constructor = loaded.vulcan?.mcp?.v1?.LuaSkillsService

  if (!constructor) {
    throw new Error(`Failed to load LuaSkillsService from proto: ${LUASKILLS_PROTO_PATH}`)
  }

  cachedConstructor = constructor
  return constructor
}

/**
 * Get or create one LuaSkillsService client for a specific target.
 * 获取或创建指定 target 的 LuaSkillsService 客户端。
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
  ) as unknown as LuaSkillsServiceClient
  clientPool.set(target, { client })
  return client
}

/**
 * Build metadata for LuaSkillsService calls.
 * 为 LuaSkillsService 调用构建 metadata。
 */
function createMetadata(grpcRuntime: LuaSkillsGrpcRuntime, requestID: string | undefined) {
  const metadata = new grpcRuntime.Metadata()
  if (requestID) {
    metadata.set("x-request-id", requestID)
  }
  return metadata
}

/**
 * Wait for the LuaSkillsService channel to become ready.
 * 等待 LuaSkillsService channel 进入 ready 状态。
 */
async function waitForReady(client: LuaSkillsServiceClient, timeoutMs: number) {
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
function describeServiceError(grpcRuntime: LuaSkillsGrpcRuntime, error: unknown) {
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
 * Call one LuaSkillsService unary RPC.
 * 调用一条 LuaSkillsService unary RPC。
 */
async function callLuaSkillsUnary<
  TRequest extends { context: VmmLuaSkillsGrpcClientContext },
  TResponse,
>(
  args: {
    config: VmmGrpcTransportConfig
    methodName:
      | "ListTools"
      | "CallTool"
      | "ListInstalledSkills"
      | "InstallSkill"
      | "UpdateSkill"
      | "UninstallSkill"
      | "ReloadRuntimeConfigs"
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
      details: "LuaSkillsService target is not configured.",
    }
  }

  try {
    const { grpcRuntime } = await getRuntimeSet()
    const client = await getClient(target)
    await waitForReady(
      client,
      args.config.grpcHandshakeTimeoutMs ?? DEFAULT_LUASKILLS_GRPC_HANDSHAKE_TIMEOUT_MS,
    )
    const metadata = createMetadata(grpcRuntime, args.request.context.request_id)
    const options: grpcType.CallOptions = {
      deadline: Date.now() + (args.config.grpcReceiveTimeoutMs ?? DEFAULT_LUASKILLS_GRPC_RECEIVE_TIMEOUT_MS),
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
 * Call ListTools on vulcan-host.
 * 调用 vulcan-host 的 ListTools。
 */
export async function callVmmLuaSkillsListTools(args: {
  config: VmmGrpcTransportConfig
  request: VmmLuaSkillsGrpcListToolsRequest
}) {
  return callLuaSkillsUnary<VmmLuaSkillsGrpcListToolsRequest, VmmLuaSkillsGrpcListToolsResponse>({
    config: args.config,
    methodName: "ListTools",
    request: args.request,
  })
}

/**
 * Call CallTool on vulcan-host.
 * 调用 vulcan-host 的 CallTool。
 */
export async function callVmmLuaSkillsCallTool(args: {
  config: VmmGrpcTransportConfig
  request: VmmLuaSkillsGrpcCallToolRequest
}) {
  return callLuaSkillsUnary<VmmLuaSkillsGrpcCallToolRequest, VmmLuaSkillsGrpcCallToolResponse>({
    config: args.config,
    methodName: "CallTool",
    request: args.request,
  })
}

/**
 * Call ListInstalledSkills on vulcan-host.
 * 调用 vulcan-host 的 ListInstalledSkills。
 */
export async function callVmmLuaSkillsListInstalled(args: {
  config: VmmGrpcTransportConfig
  request: VmmLuaSkillsGrpcListInstalledSkillsRequest
}) {
  return callLuaSkillsUnary<VmmLuaSkillsGrpcListInstalledSkillsRequest, VmmLuaSkillsGrpcTextResponse>({
    config: args.config,
    methodName: "ListInstalledSkills",
    request: args.request,
  })
}

/**
 * Call InstallSkill on vulcan-host.
 * 调用 vulcan-host 的 InstallSkill。
 */
export async function callVmmLuaSkillsInstall(args: {
  config: VmmGrpcTransportConfig
  request: VmmLuaSkillsGrpcInstallRequest
}) {
  return callLuaSkillsUnary<VmmLuaSkillsGrpcInstallRequest, VmmLuaSkillsGrpcTextResponse>({
    config: args.config,
    methodName: "InstallSkill",
    request: args.request,
  })
}

/**
 * Call UpdateSkill on vulcan-host.
 * 调用 vulcan-host 的 UpdateSkill。
 */
export async function callVmmLuaSkillsUpdate(args: {
  config: VmmGrpcTransportConfig
  request: VmmLuaSkillsGrpcUpdateRequest
}) {
  return callLuaSkillsUnary<VmmLuaSkillsGrpcUpdateRequest, VmmLuaSkillsGrpcTextResponse>({
    config: args.config,
    methodName: "UpdateSkill",
    request: args.request,
  })
}

/**
 * Call UninstallSkill on vulcan-host.
 * 调用 vulcan-host 的 UninstallSkill。
 */
export async function callVmmLuaSkillsUninstall(args: {
  config: VmmGrpcTransportConfig
  request: VmmLuaSkillsGrpcUninstallRequest
}) {
  return callLuaSkillsUnary<VmmLuaSkillsGrpcUninstallRequest, VmmLuaSkillsGrpcTextResponse>({
    config: args.config,
    methodName: "UninstallSkill",
    request: args.request,
  })
}

/**
 * Call ReloadRuntimeConfigs on vulcan-host.
 * 调用 vulcan-host 的 ReloadRuntimeConfigs。
 */
export async function callVmmLuaSkillsReloadRuntimeConfigs(args: {
  config: VmmGrpcTransportConfig
  request: VmmLuaSkillsGrpcReloadRuntimeConfigsRequest
}) {
  return callLuaSkillsUnary<VmmLuaSkillsGrpcReloadRuntimeConfigsRequest, VmmLuaSkillsGrpcTextResponse>({
    config: args.config,
    methodName: "ReloadRuntimeConfigs",
    request: args.request,
  })
}

/**
 * Install one temporary runtime-module loader override for tests.
 * 为测试安装一条临时运行时模块加载覆盖器。
 */
export function __setVmmLuaSkillsGrpcRuntimeModuleLoaderForTests(
  loader: LuaSkillsRuntimeModuleLoader | undefined,
) {
  runtimeModuleLoaderOverrideForTests = loader
}

/**
 * Clear cached LuaSkillsService transport state for tests.
 * 为测试清空 LuaSkillsService 传输缓存。
 */
export function __resetVmmLuaSkillsGrpcStateForTests() {
  cachedRuntimeSet = undefined
  cachedConstructor = undefined
  for (const entry of clientPool.values()) {
    entry.client.close()
  }
  clientPool.clear()
}
