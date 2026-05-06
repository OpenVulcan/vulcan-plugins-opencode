/**
 * Remote-first host adapter relay facade.
 * 远程优先的宿主适配器中转门面。
 *
 * This file belongs to the adapter runtime layer. It asks vulcan-host for
 * host adapter runtime and tool refresh guidance when available, then falls
 * back to the local TypeScript contract so older hosts remain usable.
 * 这个文件属于适配器运行时层。
 * 当 vulcan-host 可用时，它会优先请求宿主适配器运行时与 tool 刷新提示；
 * 当宿主版本较旧或不可达时，则回退到本地 TypeScript 契约，保证旧宿主仍可使用。
 */

import {
  buildVmmHostAdapterRuntime,
  getVmmHostAdapterDescriptor,
  type VmmHostAdapterRuntime,
  type VmmHostAdapterRuntimeInput,
} from "./vmm-host-adapter.js"
import { callVmmHostAdapterRuntime, callVmmHostAdapterToolRefreshNotice } from "./vmm-host-adapter-grpc.js"
import { buildVmmToolRefreshNotice, type VmmToolRefreshNotice } from "./vmm-tool-refresh-notice.js"
import { type VmmToolRegistrySnapshot } from "./vmm-tool-registry-snapshot.js"
import { extractTransportConfig, normalizeGrpcTarget, type VmmGrpcTransportConfig } from "./vmm-grpc.js"
import { type VmmRuntimeConfig } from "./vmm-config.js"

/**
 * Source used for one relay facade result.
 * 单次中转门面结果使用的来源。
 */
export type VmmHostAdapterRelaySource = "remote" | "local-fallback"

/**
 * Result returned after resolving host adapter runtime remotely or locally.
 * 远程或本地解析宿主适配器运行时后的结果。
 */
export type VmmHostAdapterRuntimeRelayResult = {
  /**
   * Runtime object used by the caller.
   * 调用方实际使用的运行时对象。
   */
  runtime: VmmHostAdapterRuntime

  /**
   * Whether the value came from vulcan-host or local fallback.
   * 该值来自 vulcan-host 还是本地 fallback。
   */
  source: VmmHostAdapterRelaySource

  /**
   * Fallback reason when source is local-fallback.
   * source 为 local-fallback 时的回退原因。
   */
  fallbackReason?: string
}

/**
 * Result returned after resolving one tool refresh notice remotely or locally.
 * 远程或本地解析一条 tool 刷新提示后的结果。
 */
export type VmmToolRefreshNoticeRelayResult = {
  /**
   * Notice object used by the caller.
   * 调用方实际使用的提示对象。
   */
  notice: VmmToolRefreshNotice

  /**
   * Whether the value came from vulcan-host or local fallback.
   * 该值来自 vulcan-host 还是本地 fallback。
   */
  source: VmmHostAdapterRelaySource

  /**
   * Fallback reason when source is local-fallback.
   * source 为 local-fallback 时的回退原因。
   */
  fallbackReason?: string
}

/**
 * Remote runtime client function used by production and tests.
 * 生产链路与测试共用的远程 runtime client 函数。
 */
export type VmmHostAdapterRuntimeRemoteClient = (
  config: VmmGrpcTransportConfig,
  input: VmmHostAdapterRuntimeInput,
) => Promise<VmmHostAdapterRuntime | undefined>

/**
 * Remote refresh-notice client function used by production and tests.
 * 生产链路与测试共用的远程刷新提示 client 函数。
 */
export type VmmToolRefreshNoticeRemoteClient = (
  config: VmmGrpcTransportConfig,
  hostKind: string,
  previous: VmmToolRegistrySnapshot,
  next: VmmToolRegistrySnapshot,
) => Promise<VmmToolRefreshNotice | undefined>

/**
 * Build one transport config that targets only vulcan-host.
 * 构建一份只指向 vulcan-host 的传输配置。
 */
function buildHostAdapterTransportConfig(runtimeConfig: VmmRuntimeConfig): VmmGrpcTransportConfig {
  return {
    ...extractTransportConfig(runtimeConfig),
    grpcTarget: runtimeConfig.vulcanHostTarget,
  }
}

/**
 * Return whether the configured vulcan-host relay target can be called.
 * 返回当前配置的 vulcan-host 中转地址是否可调用。
 */
function hasHostAdapterRelayTarget(config: VmmGrpcTransportConfig) {
  return Boolean(normalizeGrpcTarget(config.grpcTarget))
}

/**
 * Build a stable gRPC client context for host adapter relay calls.
 * 为宿主适配器中转调用构建稳定的 gRPC 客户端上下文。
 */
function buildHostAdapterClientContext() {
  return {
    client_name: "opencode",
    client_version: "vmm-opencode-plugin",
  }
}

/**
 * Parse one JSON response field from vulcan-host into the expected object.
 * 把 vulcan-host 返回的一段 JSON 字段解析为期望对象。
 */
function parseRelayJson<TValue>(payload: string, fieldName: string): TValue {
  if (!payload.trim()) {
    throw new Error(`${fieldName} is empty`)
  }
  return JSON.parse(payload) as TValue
}

/**
 * Call vulcan-host to build one host adapter runtime.
 * 调用 vulcan-host 构建一个宿主适配器运行时。
 */
async function callRemoteRuntime(
  config: VmmGrpcTransportConfig,
  input: VmmHostAdapterRuntimeInput,
) {
  const result = await callVmmHostAdapterRuntime({
    config,
    request: {
      context: buildHostAdapterClientContext(),
      host_kind: input.hostKind ?? "",
      adapter_host_kind: input.adapterHostKind,
      session_id: input.sessionId,
      workmem_id: input.workmemId,
      turn_id: input.turnId,
      workspace: input.workspace,
      user_message: input.userMessage,
      conversation_id: input.conversationId,
      root_session_id: input.rootSessionId,
    },
  })

  if (!result.ok || !result.response || result.response.is_error) {
    return undefined
  }

  return parseRelayJson<VmmHostAdapterRuntime>(result.response.runtime_json, "runtime_json")
}

/**
 * Call vulcan-host to build one tool refresh notice.
 * 调用 vulcan-host 构建一条 tool 刷新提示。
 */
async function callRemoteNotice(
  config: VmmGrpcTransportConfig,
  hostKind: string,
  previous: VmmToolRegistrySnapshot,
  next: VmmToolRegistrySnapshot,
) {
  const result = await callVmmHostAdapterToolRefreshNotice({
    config,
    request: {
      context: buildHostAdapterClientContext(),
      host_kind: hostKind,
      previous_snapshot_json: JSON.stringify(previous),
      next_snapshot_json: JSON.stringify(next),
    },
  })

  if (!result.ok || !result.response || result.response.is_error) {
    return undefined
  }

  return parseRelayJson<VmmToolRefreshNotice>(result.response.notice_json, "notice_json")
}

/**
 * Resolve host adapter runtime by asking vulcan-host first and local fallback second.
 * 先请求 vulcan-host、再本地 fallback，以解析宿主适配器运行时。
 */
export async function buildVmmHostAdapterRuntimeWithRelay(args: {
  runtimeConfig: VmmRuntimeConfig
  input: VmmHostAdapterRuntimeInput
  remoteClient?: VmmHostAdapterRuntimeRemoteClient
}): Promise<VmmHostAdapterRuntimeRelayResult> {
  const transportConfig = buildHostAdapterTransportConfig(args.runtimeConfig)
  const remoteClient = args.remoteClient ?? callRemoteRuntime

  if (hasHostAdapterRelayTarget(transportConfig)) {
    try {
      const runtime = await remoteClient(transportConfig, args.input)
      if (runtime) {
        return {
          runtime,
          source: "remote",
        }
      }
    } catch (error) {
      return {
        runtime: buildVmmHostAdapterRuntime(args.input),
        source: "local-fallback",
        fallbackReason: String(error),
      }
    }
  }

  return {
    runtime: buildVmmHostAdapterRuntime(args.input),
    source: "local-fallback",
    fallbackReason: "HostAdapterService target is unavailable or returned no usable runtime.",
  }
}

/**
 * Resolve tool refresh notice by asking vulcan-host first and local fallback second.
 * 先请求 vulcan-host、再本地 fallback，以解析 tool 刷新提示。
 */
export async function buildVmmToolRefreshNoticeWithRelay(args: {
  runtimeConfig: VmmRuntimeConfig
  hostKind: string
  previous: VmmToolRegistrySnapshot
  next: VmmToolRegistrySnapshot
  remoteClient?: VmmToolRefreshNoticeRemoteClient
}): Promise<VmmToolRefreshNoticeRelayResult> {
  const transportConfig = buildHostAdapterTransportConfig(args.runtimeConfig)
  const remoteClient = args.remoteClient ?? callRemoteNotice

  if (hasHostAdapterRelayTarget(transportConfig)) {
    try {
      const notice = await remoteClient(transportConfig, args.hostKind, args.previous, args.next)
      if (notice) {
        return {
          notice,
          source: "remote",
        }
      }
    } catch (error) {
      return {
        notice: buildVmmToolRefreshNotice({
          previous: args.previous,
          next: args.next,
          adapter: getVmmHostAdapterDescriptor(args.hostKind),
        }),
        source: "local-fallback",
        fallbackReason: String(error),
      }
    }
  }

  return {
    notice: buildVmmToolRefreshNotice({
      previous: args.previous,
      next: args.next,
      adapter: getVmmHostAdapterDescriptor(args.hostKind),
    }),
    source: "local-fallback",
    fallbackReason: "HostAdapterService target is unavailable or returned no usable notice.",
  }
}
