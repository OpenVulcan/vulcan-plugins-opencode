/**
 * Shared host toast delivery helpers for OpenCode runtime notifications.
 * OpenCode 运行时通知共用的宿主 toast 投递辅助模块。
 *
 * This file belongs to the integration/runtime boundary. It is used by the
 * main plugin runtime and the memory transport layer to send one best-effort
 * host toast only when the current host explicitly exposes a toast endpoint.
 * 这个文件属于集成与运行时边界层，供主插件运行时和记忆传输层共同使用，
 * 只在当前宿主明确暴露 toast 端点时发送一条最佳努力宿主提示。
 */

/**
 * Notification variants supported by the host toast surface.
 * 宿主 toast 通知面支持的提示等级。
 *
 * The list intentionally matches the OpenCode SDK contract so runtime helpers
 * can pass values through without remapping per host.
 * 这里故意与 OpenCode SDK 契约保持一致，
 * 这样运行时辅助逻辑就不需要为不同宿主做二次映射。
 */
export type HostToastVariant = "info" | "success" | "warning" | "error"

/**
 * Minimal body shared by runtime toast calls.
 * 运行时 toast 调用共用的最小消息体。
 *
 * Keeping a single body shape prevents delivery helpers and callers from
 * drifting apart as the runtime notification text evolves.
 * 统一消息体结构可以防止投递 helper 与调用方在运行时提示文案演进时
 * 逐渐出现细微漂移。
 */
export type HostToastBody = {
  title?: string
  message: string
  variant: HostToastVariant
  duration?: number
}

/**
 * Request payload understood by the host toast helper.
 * 宿主 toast helper 接收的请求参数。
 *
 * The helper owns timeout and routing decisions centrally so callers only need
 * to provide one normalized toast payload and the current workspace directory.
 * 由 helper 集中负责超时和路由决策后，调用方只需提供一份标准化 toast
 * 负载以及当前工作目录即可。
 */
export type HostToastInput = HostToastBody & {
  directory: string
  timeoutMs: number
}

/**
 * Minimal request options supported by the generated SDK client methods.
 * 生成 SDK 客户端方法支持的最小请求选项。
 *
 * We only depend on `AbortSignal` here because timeout cancellation is the
 * critical behavior that keeps notification delivery off the foreground path.
 * 这里仅依赖 `AbortSignal`，因为真正关键的是超时取消能力，
 * 它决定了通知投递不会重新阻塞前台链路。
 */
type HostToastRequestOptions = {
  signal?: AbortSignal
}

/**
 * Minimal host client surface needed to deliver runtime notifications.
 * 运行时通知投递所需的最小宿主 client 表面。
 *
 * We intentionally depend only on the explicit `showToast` endpoint. Browser
 * hosts without a confirmed plugin-toast bridge are treated as silent instead
 * of betting on unpublished event assumptions or brittle fallback surfaces.
 * 这里刻意只依赖显式的 `showToast` 端点。对于没有确认插件 toast 桥的
 * 浏览器宿主，我们会直接视为静默场景，
 * 而不是继续押注未证实的事件桥或脆弱的回退提示面。
 */
export type HostToastClient = {
  tui?: {
    showToast?: (
      options?: {
        body?: HostToastBody
        query?: {
          directory?: string
        }
      },
      requestOptions?: HostToastRequestOptions,
    ) => Promise<unknown>
  }
}

/**
 * Delivery channel names understood by the shared host toast helper.
 * 共享宿主 toast helper 识别的投递通道名称。
 *
 * We keep the enum explicit so logs and tests can describe whether the toast
 * went through the explicit toast endpoint.
 * 这里显式列出通道名称，是为了让日志和测试都能清楚区分通知是否真的走到了
 * 显式 toast 端点。
 */
export type HostToastChannel = "showToast"

/**
 * Result emitted after one best-effort host toast attempt finishes.
 * 一次最佳努力宿主 toast 尝试结束后返回的结果。
 *
 * Callers use this structured result to record accurate diagnostics without
 * duplicating timeout and fallback branching logic.
 * 调用方依赖这份结构化结果记录准确诊断信息，
 * 从而避免在多处重复实现超时和回退分支。
 */
export type HostToastDeliveryResult =
  | {
      status: "delivered"
      channel: HostToastChannel
    }
  | {
      status: "skipped"
      reason: "no-channel" | "timeout"
      channel?: HostToastChannel
    }
  | {
      status: "failed"
      channel: HostToastChannel
      error: unknown
    }

/**
 * One concrete sender candidate built from the host client surface.
 * 基于宿主 client 表面构造出来的一条具体发送候选。
 *
 * The helper still models senders as a list so timeout handling stays uniform,
 * even though the runtime now only trusts the explicit toast endpoint.
 * helper 仍把发送器建模成列表，是为了复用统一的超时处理；
 * 只是当前运行时已经只信任显式 toast 端点。
 */
type HostToastSender = {
  channel: HostToastChannel
  send: (requestOptions: HostToastRequestOptions) => Promise<unknown>
}

/**
 * Build the shared toast body from one normalized helper input.
 * 从一份标准化 helper 输入构造共享 toast 消息体。
 *
 * The body is shared by the runtime and transport layers so variant, text,
 * and title stay identical across all best-effort toast call sites.
 * 这份消息体会被运行时层和传输层共同复用，
 * 从而保证所有最佳努力 toast 调用点的等级、文案和标题保持一致。
 */
function buildHostToastBody(input: HostToastInput): HostToastBody {
  return {
    title: input.title,
    message: input.message,
    variant: input.variant,
    duration: input.duration,
  }
}

/**
 * Collect all toast senders exposed by the current host client.
 * 收集当前宿主 client 暴露出来的全部 toast 发送器。
 *
 * Only the explicit `showToast` endpoint is considered compatible now.
 * Published TUI events are intentionally ignored here because stock browser
 * hosts do not provide a confirmed plugin-toast render bridge.
 * 这里现在只把显式 `showToast` 端点视为兼容通道。
 * 发布式 TUI 事件会被刻意忽略，因为 stock 浏览器宿主没有确认存在
 * 插件 toast 渲染桥。
 */
function collectHostToastSenders(client: HostToastClient, input: HostToastInput) {
  const body = buildHostToastBody(input)
  const senderList: HostToastSender[] = []

  if (client.tui?.showToast) {
    senderList.push({
      channel: "showToast",
      send: (requestOptions) =>
        client.tui!.showToast!(
          {
            body,
            query: {
              directory: input.directory,
            },
          },
          requestOptions,
        ),
    })
  }

  return senderList
}

/**
 * Decide whether one thrown value represents a timeout-style cancellation.
 * 判断抛出的值是否属于超时风格的取消结果。
 *
 * Different runtimes may surface timeout cancellation with slightly different
 * names, so we normalize the decision in one place for consistent callers.
 * 不同运行时可能会用略有差异的名称表达超时取消，
 * 因此这里把判断集中起来，保证调用方看到的结果一致。
 */
function isTimeoutLikeError(error: unknown) {
  const errorName =
    typeof error === "object" && error && "name" in error && typeof error.name === "string"
      ? error.name
      : undefined
  return errorName === "AbortError" || errorName === "TimeoutError"
}

/**
 * Execute one sender under the shared soft-timeout budget.
 * 在共享软超时预算下执行一条发送器。
 *
 * Each attempt gets its own abort controller so one stalled channel cannot
 * prevent the helper from trying the next compatible host path.
 * 每次尝试都会分配独立的 abort controller，
 * 这样单个卡住的通道就不会阻止 helper 继续尝试下一个兼容宿主路径。
 */
async function runSenderWithTimeout(sender: HostToastSender, input: HostToastInput) {
  const controller = new AbortController()
  const timeout = setTimeout(() => {
    controller.abort()
  }, input.timeoutMs)
  // Allow the process to exit even while this timeout is pending.
  // 让进程在该定时器挂起时也能正常退出。
  timeout.unref()

  try {
    await sender.send({
      signal: controller.signal,
    })
    return {
      status: "delivered",
      channel: sender.channel,
    } as const
  } catch (error) {
    if (isTimeoutLikeError(error)) {
      return {
        status: "skipped",
        reason: "timeout",
        channel: sender.channel,
      } as const
    }

    return {
      status: "failed",
      channel: sender.channel,
      error,
    } as const
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Deliver one host toast using the best compatible notification channel.
 * 使用最兼容的通知通道投递一条宿主 toast。
 *
 * The helper now trusts only the explicit toast endpoint and otherwise skips
 * quickly. Browser-side hosts stay silent when that endpoint is unavailable
 * instead of trying speculative transcript or assistant-visible fallbacks.
 * 这里现在只信任显式 toast 端点，其余情况会快速跳过。
 * 浏览器侧在该端点不可用时会保持静默，
 * 而不是继续尝试推测性的 transcript 或 assistant 可见回退。
 */
export async function deliverHostToast(
  client: HostToastClient,
  input: HostToastInput,
): Promise<HostToastDeliveryResult> {
  const senderList = collectHostToastSenders(client, input)
  if (!senderList.length) {
    return {
      status: "skipped",
      reason: "no-channel",
    }
  }

  let timeoutResult: HostToastDeliveryResult | undefined
  let failureResult: HostToastDeliveryResult | undefined

  for (const sender of senderList) {
    const result = await runSenderWithTimeout(sender, input)
    if (result.status === "delivered") {
      return result
    }
    if (result.status === "skipped" && result.reason === "timeout") {
      timeoutResult = result
      continue
    }
    failureResult = result
  }

  if (timeoutResult) {
    return timeoutResult
  }

  return failureResult ?? {
    status: "skipped",
    reason: "no-channel",
  }
}
