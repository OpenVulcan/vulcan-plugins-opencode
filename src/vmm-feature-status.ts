/**
 * Runtime VMM feature-status gate for OpenCode plugin paths.
 * OpenCode 插件路径使用的运行时 VMM 功能状态门控。
 *
 * This file belongs to the host integration layer. Startup and memory-related
 * hooks use it to ask vulcan-host whether VMM is actually enabled before
 * exposing VMM tools or running VMM memory orchestration.
 * 这个文件属于宿主集成层。启动流程和记忆相关 hooks 会通过它询问
 * vulcan-host 当前是否真正启用了 VMM，再决定是否暴露 VMM tools 或执行 VMM 记忆编排。
 */

import { loadVmmConfig } from "./vmm-config.js"
import {
  extractTransportConfig,
  type VmmGrpcTransportConfig,
  type VmmGrpcUnaryResult,
} from "./vmm-grpc.js"
import {
  callVmmHostAdapterGetVmmStatus,
  type VmmHostAdapterGrpcVmmStatusRequest,
  type VmmHostAdapterGrpcVmmStatusResponse,
} from "./vmm-host-adapter-grpc.js"

/**
 * Source category for one VMM feature-status decision.
 * 单次 VMM 功能状态判定的来源类别。
 */
export type VmmFeatureStatusSource =
  | "remote"
  | "missing-target"
  | "remote-error"
  | "remote-unavailable"

/**
 * Stable plugin-side VMM feature-status decision.
 * 插件侧稳定的 VMM 功能状态判定结果。
 */
export type VmmFeatureStatus = {
  /**
   * Whether VMM-dependent plugin paths may run.
   * 依赖 VMM 的插件路径是否可以运行。
   */
  enabled: boolean

  /**
   * Source used to make this decision.
   * 本次判定使用的来源。
   */
  source: VmmFeatureStatusSource

  /**
   * Human-readable status message for logs and diagnostics.
   * 用于日志和诊断的人类可读状态消息。
   */
  message: string
}

/**
 * Probe function used to retrieve VMM status from the host adapter service.
 * 用于从宿主适配服务读取 VMM 状态的探测函数。
 */
export type VmmFeatureStatusProbe = (args: {
  config: VmmGrpcTransportConfig
  request: VmmHostAdapterGrpcVmmStatusRequest
}) => Promise<VmmGrpcUnaryResult<VmmHostAdapterGrpcVmmStatusResponse>>

/**
 * Optional dependencies for loading VMM feature status.
 * 加载 VMM 功能状态时可注入的可选依赖。
 */
export type VmmFeatureStatusLoadOptions = {
  /**
   * Probe override used by tests and future embedded hosts.
   * 测试和未来嵌入式宿主可使用的探测覆盖实现。
   */
  getVmmStatus?: VmmFeatureStatusProbe
}

/**
 * Stable client name sent to HostAdapterService for VMM status checks.
 * 发送给 HostAdapterService 做 VMM 状态检查的稳定客户端名称。
 */
const VMM_FEATURE_STATUS_CLIENT_NAME = "opencode"

/**
 * Stable client version marker used in VMM status diagnostics.
 * VMM 状态诊断使用的稳定客户端版本标记。
 */
const VMM_FEATURE_STATUS_CLIENT_VERSION = "vmm-opencode-plugin"

/**
 * Return the disabled status used when the plugin cannot verify VMM availability.
 * 返回插件无法确认 VMM 可用时使用的禁用状态。
 */
function disabledStatus(source: VmmFeatureStatusSource, message: string): VmmFeatureStatus {
  return {
    enabled: false,
    source,
    message,
  }
}

/**
 * Load the remote VMM feature status from vulcan-host.
 * 从 vulcan-host 加载远端 VMM 功能状态。
 *
 * The gate is intentionally fail-closed: if vulcan-host is missing, unreachable,
 * or returns an error, VMM-dependent plugin behavior stays disabled because
 * those paths cannot complete successfully anyway.
 * 这个门控刻意采用失败关闭策略：如果 vulcan-host 缺失、不可达或返回错误，
 * 依赖 VMM 的插件行为会保持关闭，因为这些路径本来也无法成功完成。
 */
export async function loadVmmFeatureStatus(
  directory: string,
  options: VmmFeatureStatusLoadOptions = {},
): Promise<VmmFeatureStatus> {
  const runtimeConfig = await loadVmmConfig(directory)
  const transportConfig = extractTransportConfig(runtimeConfig)

  if (!transportConfig.grpcTarget?.trim()) {
    return disabledStatus(
      "missing-target",
      "vulcan_host_target is not configured, so VMM-dependent plugin features are disabled.",
    )
  }

  try {
    // Resolve the status probe late so production keeps the real gRPC path,
    // while tests can cover remote states without starting a host process.
    // 这里延迟解析状态探测函数，让生产链路继续使用真实 gRPC，
    // 同时测试可以在不启动宿主进程的情况下覆盖远端状态分支。
    const getVmmStatus = options.getVmmStatus ?? callVmmHostAdapterGetVmmStatus
    const result = await getVmmStatus({
      config: transportConfig,
      request: {
        context: {
          client_name: VMM_FEATURE_STATUS_CLIENT_NAME,
          client_version: VMM_FEATURE_STATUS_CLIENT_VERSION,
          request_id: "startup:vmm-feature-status",
        },
      },
    })

    if (!result.ok || !result.response) {
      return disabledStatus(
        "remote-unavailable",
        result.details || "HostAdapterService VMM status is unavailable.",
      )
    }

    if (result.response.is_error) {
      return disabledStatus(
        "remote-error",
        result.response.message || "HostAdapterService returned an error while checking VMM status.",
      )
    }

    return {
      enabled: result.response.vmm_enabled,
      source: "remote",
      message: result.response.vmm_status || result.response.message,
    }
  } catch (error) {
    return disabledStatus(
      "remote-unavailable",
      error instanceof Error ? error.message : String(error),
    )
  }
}
