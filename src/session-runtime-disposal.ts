/**
 * Session runtime disposal helpers for terminal lifecycle events.
 * 终态生命周期事件使用的 session 运行时销毁辅助模块。
 *
 * This file belongs to the orchestration support layer. It is used when the
 * host reports that one session has already ended, and the plugin must clear
 * in-memory ownership state even if best-effort persistence cleanup fails.
 * 这个文件属于编排支撑层，
 * 用在宿主已经明确报告某个 session 结束之后，
 * 插件必须保证内存归属状态被清理干净，即便“尽力而为”的持久化清理失败也不能放弃。
 */

import type { SessionEventDedupeClearResult } from "./session-event-dedupe.js"

/**
 * One normalized cleanup error summary.
 * 一条归一化后的清理错误摘要。
 *
 * Session deletion logs should capture which cleanup stage failed without
 * depending on raw host error objects leaking directly into many call sites.
 * session 删除日志需要知道失败发生在哪个阶段，
 * 但又不应该让原始错误对象直接散落到各个调用点里。
 */
export type SessionRuntimeDisposalError = {
  stage: "finalize" | "persisted-state" | "dedupe-state" | "root-session"
  name?: string
  message?: string
}

/**
 * One structured result returned by session runtime disposal.
 * 一条 session 运行时销毁结果的结构化摘要。
 *
 * The plugin uses this result for lifecycle logging so future debugging can
 * tell whether finalize timers, persisted session state, root-session cache,
 * and dedupe ownership were all handled as expected.
 * 插件会把这份结果写入生命周期日志，
 * 这样后续排查时就能看出 finalize 定时器、持久化 session 状态、
 * root-session 缓存以及 dedupe 归属是否都按预期被处理了。
 */
export type SessionRuntimeDisposalResult = {
  sessionID: string
  finalizeStateCleared: boolean
  persistedStateCleared: boolean
  rootSessionRemoved: boolean
  clearedDedupeState: SessionEventDedupeClearResult
  cleanupErrors: SessionRuntimeDisposalError[]
  completedWithoutErrors: boolean
  inMemoryOwnershipCleared: boolean
}

/**
 * Pre-cleared disposal stages that were already handled before async disposal starts.
 * 在异步销毁开始前就已经提前处理过的清理阶段。
 *
 * Session deletion sometimes needs an immediate safety barrier, for example to
 * stop late root-guarded events or finalize timers before persisted cleanup
 * gets its turn in a queue. This structure lets callers report that those
 * stages were already handled, so disposal can keep accurate result semantics
 * without running the same stage twice.
 * session 删除有时需要先建立一道即时安全屏障，
 * 例如在排队等待持久化清理之前，先阻止迟到的 root-guarded 事件或 finalize timer。
 * 这个结构允许调用方声明“这些阶段已经被提前处理”，
 * 从而让销毁流程既保持结果语义准确，又不会把同一阶段重复执行两遍。
 */
export type SessionRuntimePreclearedDisposalState = {
  finalize?: {
    handled: true
    cleared: boolean
  }
  rootSession?: {
    handled: true
    removed: boolean
  }
  dedupeState?: {
    handled: true
    result: SessionEventDedupeClearResult
  }
}

/**
 * One callback bundle required to dispose session runtime state.
 * 销毁 session 运行时状态所需的一组回调。
 *
 * The helper keeps policy in one place while letting the plugin inject the
 * concrete finalize-state, persistence, root-cache, and dedupe implementations.
 * 这个辅助函数把生命周期策略集中在一个地方，
 * 同时仍允许插件把 finalize 状态、持久化清理、root 缓存和 dedupe 清理
 * 这几项具体实现作为回调注入进来。
 */
export type DisposeSessionRuntimeArgs = {
  sessionID: string
  cancelFinalizeState: () => Promise<void>
  clearPersistedState: () => Promise<void>
  clearRootSession: (sessionID: string) => boolean
  clearDedupeState: (sessionID: string) => SessionEventDedupeClearResult
  precleared?: SessionRuntimePreclearedDisposalState
}

/**
 * Normalize one unknown cleanup error into a compact structured summary.
 * 把未知清理错误归一化成紧凑的结构化摘要。
 *
 * Returning only name/message is enough for operational logs while keeping the
 * helper free from logger-specific serialization details.
 * 这里只返回 name/message 就足够支撑运维日志定位，
 * 同时也能避免这个辅助模块反向依赖 logger 的序列化细节。
 */
function summarizeCleanupError(
  stage: SessionRuntimeDisposalError["stage"],
  error: unknown,
): SessionRuntimeDisposalError {
  if (error instanceof Error) {
    return {
      stage,
      name: error.name,
      message: error.message,
    }
  }

  return {
    stage,
    message: typeof error === "string" ? error : String(error),
  }
}

/**
 * Dispose one deleted session's runtime artifacts with guaranteed in-memory cleanup.
 * 以“保证内存态清理”的方式销毁一个已删除 session 的运行时残留。
 *
 * Once the host has declared a session deleted, stale in-memory ownership is a
 * larger correctness risk than a failed best-effort file cleanup. This helper
 * therefore always clears root/dedupe state, and returns any finalize or
 * persistence error as structured data instead of rethrowing.
 * 一旦宿主已经宣布某个 session 被删除，
 * 那么遗留的内存归属状态会比一次失败的“尽力而为”文件清理更容易破坏正确性。
 * 因此这里会无条件清掉 root / dedupe 状态，
 * 同时把 finalize 或持久化失败以结构化结果返回，而不是重新抛出中断主链。
 */
export async function disposeSessionRuntime(
  args: DisposeSessionRuntimeArgs,
): Promise<SessionRuntimeDisposalResult> {
  let finalizeStateCleared = args.precleared?.finalize?.cleared ?? false
  let persistedStateCleared = false
  let rootSessionRemoved = args.precleared?.rootSession?.removed ?? false
  let clearedDedupeState: SessionEventDedupeClearResult = args.precleared?.dedupeState?.result ?? {
    clearedStatus: false,
    clearedMessageCount: 0,
  }
  const cleanupErrors: SessionRuntimeDisposalError[] = []

  // Finalize cancellation and persisted-state cleanup are both best-effort
  // stages. They must be attempted independently so one failure does not hide
  // another cleanup step that can still succeed.
  // finalize 取消和持久化状态清理都属于“尽力而为”阶段，
  // 因此必须彼此独立尝试，不能因为前一步失败就把后一步一起短路掉。
  if (!args.precleared?.finalize?.handled) {
    try {
      await args.cancelFinalizeState()
      finalizeStateCleared = true
    } catch (error) {
      cleanupErrors.push(summarizeCleanupError("finalize", error))
    }
  }

  try {
    await args.clearPersistedState()
    persistedStateCleared = true
  } catch (error) {
    cleanupErrors.push(summarizeCleanupError("persisted-state", error))
  }

  // In-memory ownership cleanup is also best-effort. Even though the current
  // implementations are synchronous, we still isolate them so one unexpected
  // throw cannot prevent the remaining release step from running.
  // 内存归属清理同样属于 best-effort 范畴。
  // 虽然当前实现是同步的，但这里仍然会把它们拆开，
  // 避免某个意外同步异常阻止后续释放步骤继续执行。
  if (!args.precleared?.dedupeState?.handled) {
    try {
      clearedDedupeState = args.clearDedupeState(args.sessionID)
    } catch (error) {
      cleanupErrors.push(summarizeCleanupError("dedupe-state", error))
    }
  }

  if (!args.precleared?.rootSession?.handled) {
    try {
      rootSessionRemoved = args.clearRootSession(args.sessionID)
    } catch (error) {
      cleanupErrors.push(summarizeCleanupError("root-session", error))
    }
  }

  return {
    sessionID: args.sessionID,
    finalizeStateCleared,
    persistedStateCleared,
    rootSessionRemoved,
    clearedDedupeState,
    cleanupErrors,
    completedWithoutErrors: cleanupErrors.length === 0,
    inMemoryOwnershipCleared: !cleanupErrors.some(
      (error) => error.stage === "dedupe-state" || error.stage === "root-session",
    ),
  }
}
