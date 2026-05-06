/**
 * Shared VMM tool runtime helpers.
 * 共享的 VMM tool 运行时辅助模块。
 *
 * This file belongs to the orchestration/integration layer. Memory tools use
 * it to resolve the current workspace binding before any gRPC call, and to
 * format transport failures into one stable model-readable JSON surface.
 * 这个文件属于编排与集成层。
 * 长期记忆 tools 会用它在发起任何 gRPC 调用前解析当前工作空间绑定，
 * 并把传输失败格式化成一份稳定、适合模型阅读的 JSON 面。
 */

import {
  diagnoseVmmBusinessScope,
  loadVmmConfig,
  type VmmRuntimeConfig,
} from "./vmm-config.js"
import type { VmmGrpcUnaryResult } from "./vmm-grpc.js"
import { type VmmHostAdapterRuntime } from "./vmm-host-adapter.js"
import { buildVmmHostAdapterRuntimeWithRelay } from "./vmm-host-adapter-relay.js"
import { normalizeVmmHostRuntimeContextText } from "./vmm-host-runtime-context.js"

/**
 * One normalized runtime bundle shared by AI-facing VMM tools.
 * AI-facing VMM tools 共享的一份归一化运行时信息。
 */
export type VmmWorkspaceToolRuntime = {
  runtimeConfig: VmmRuntimeConfig
  hostAdapter: VmmHostAdapterRuntime
  hostAdapterSource: "remote" | "local-fallback"
}

/**
 * Host context options accepted while loading one workspace tool runtime.
 * 加载单个工作区 tool runtime 时接收的宿主上下文选项。
 */
export type VmmWorkspaceToolRuntimeOptions = {
  /**
   * Native OpenCode session id supplied by the tool context.
   * tool 上下文提供的原生 OpenCode session id。
   */
  sessionID?: string

  /**
   * Optional WorkMem id supplied by degraded or future adapter paths.
   * 降级路径或未来适配器路径提供的可选 WorkMem id。
   */
  workmemID?: string

  /**
   * Optional turn id supplied by future scoped prompt or lifecycle paths.
   * 未来限定提示词或生命周期路径提供的可选 turn id。
   */
  turnID?: string
}

/**
 * One readiness result returned after resolving the current workspace binding.
 * 解析当前工作空间绑定后返回的一条就绪结果。
 */
export type VmmWorkspaceToolRuntimeResult =
  | {
      ready: true
      runtime: VmmWorkspaceToolRuntime
    }
  | {
      ready: false
      message: string
    }

/**
 * Build one stable user-facing unavailability message for workspace-bound tools.
 * 为依赖工作空间绑定的 tools 构建一条稳定的面向调用方的不可用提示。
 *
 * Public tools should explain that the binding itself is incomplete instead of
 * leaking one generic transport failure back to the model.
 * 对外 tool 应该直接解释“绑定本身不完整”，
 * 而不是把一条泛化传输错误重新抛给模型。
 */
function buildWorkspaceToolUnavailableMessage(reason: string) {
  return `VMM tool unavailable in the current workspace. ${reason}`
}

/**
 * Load and validate the current workspace runtime config for one AI-facing tool.
 * 为单个 AI-facing tool 加载并校验当前工作空间运行时配置。
 *
 * The public tool surface should not expose infrastructure selectors, so every
 * tool call derives `vulcan_host_target + user_id + project_id` from layered config
 * first and enters the transport layer only after the binding is confirmed.
 * 对外 tool 表面不应该暴露基础设施选择参数，
 * 因此每次 tool 调用都要先从分层配置里解析 `vulcan_host_target + user_id + project_id`，
 * 确认绑定完整后才能进入传输层。
 */
export async function loadReadyWorkspaceToolRuntime(
  directory: string,
  options: VmmWorkspaceToolRuntimeOptions = {},
): Promise<VmmWorkspaceToolRuntimeResult> {
  const runtimeConfig = await loadVmmConfig(directory)
  const diagnosis = diagnoseVmmBusinessScope(runtimeConfig)

  if (!diagnosis.enabled) {
    return {
      ready: false,
      message: buildWorkspaceToolUnavailableMessage(
        diagnosis.toastMessage ?? "The current workspace binding is incomplete.",
      ),
    }
  }

  const hostAdapterRelay = await buildVmmHostAdapterRuntimeWithRelay({
    runtimeConfig,
    input: {
      hostKind: "opencode",
      sessionId: options.sessionID,
      turnId: options.turnID,
      workmemId: options.workmemID,
      workspace: directory,
    },
  })

  return {
    ready: true,
    runtime: {
      runtimeConfig,
      hostAdapter: hostAdapterRelay.runtime,
      hostAdapterSource: hostAdapterRelay.source,
    },
  }
}

/**
 * Read one real OpenCode session id from the current tool context.
 * 从当前 tool 上下文中读取一条真实 OpenCode session id。
 *
 * Durable-memory writes should attribute their side effects to the active chat
 * session when one is available.
 * 长期记忆写入应在可用时把副作用归因到当前活跃聊天会话。
 */
export function readWorkspaceToolSessionID(sessionID: string | undefined) {
  return normalizeVmmHostRuntimeContextText(sessionID)
}

/**
 * Render one normalized gRPC failure into a readable tool output payload.
 * 把一条归一化 gRPC 失败渲染成可读的 tool 输出载荷。
 *
 * Returning a structured JSON object keeps transport diagnostics visible to
 * the model without forcing every tool module to duplicate the same fallback
 * formatting logic.
 * 返回结构化 JSON 可以让模型读到关键传输诊断，
 * 同时避免每个 tool 模块都重复一套兜底格式化逻辑。
 */
export function formatWorkspaceToolUnaryFailure<TResponse>(
  operation: string,
  result: VmmGrpcUnaryResult<TResponse>,
) {
  return JSON.stringify(
    {
      ok: false,
      operation,
      method: result.method,
      target: result.target,
      grpc_code: result.grpcCodeName,
      timed_out_phase: result.timedOutPhase,
      details: result.details,
    },
    null,
    2,
  )
}
