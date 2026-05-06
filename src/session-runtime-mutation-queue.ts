/**
 * Session-scoped logical mutation queue for runtime-state workflows.
 * 面向运行时状态工作流的按 session 逻辑修改队列。
 *
 * This file belongs to the orchestration support layer. It serializes all
 * session-owned state transitions for one `(directory, sessionID)` pair, while
 * still allowing different sessions in the same workspace to progress
 * independently between their short persisted-state file I/O windows.
 * 这个文件属于编排支撑层。
 * 它负责把同一个 `(directory, sessionID)` 的所有会话状态迁移严格串行化，
 * 同时又允许同一工作区里的不同 session 在各自短暂的持久化文件 I/O 窗口之外
 * 继续并发推进。
 */

import { normalizeRuntimeDirectoryKey } from "./runtime-directory-key.js"

/**
 * In-memory queue state for session-scoped logical mutations.
 * 按 session 逻辑修改使用的内存队列状态。
 *
 * The queue key includes both directory and session id because runtime-state
 * ordering must stay isolated per session even when many sessions share the
 * same persisted state file under one workspace.
 * 队列键同时包含 directory 与 session id，
 * 因为即便多个 session 共享同一个工作区状态文件，
 * 运行时状态的顺序语义也必须在 session 维度上保持隔离。
 */
export type SessionRuntimeMutationQueueState = {
  pendingBySession: Map<string, Promise<void>>
}

/**
 * Compact summary of current session-queue occupancy.
 * 当前 session 队列占用情况的紧凑摘要。
 *
 * Tests use this to confirm that completed logical mutations release queue
 * ownership instead of leaving dead entries behind.
 * 测试会用它确认：
 * 已完成的逻辑修改不会把失效队列项遗留在内存里。
 */
export type SessionRuntimeMutationQueueSummary = {
  pendingSessionCount: number
}

/**
 * Create one empty session-runtime mutation queue state.
 * 创建一份空的 session 运行时修改队列状态。
 *
 * The plugin keeps one process-local state and shares it across all
 * session-owned runtime transitions.
 * 插件会持有一份进程内状态，
 * 并把它复用于所有归属到 session 的运行时状态迁移。
 */
export function createSessionRuntimeMutationQueueState(): SessionRuntimeMutationQueueState {
  return {
    pendingBySession: new Map<string, Promise<void>>(),
  }
}

/**
 * Summarize how many session keys currently have queued work.
 * 汇总当前仍有排队工作的 session 键数量。
 *
 * Production code does not need internal queue details, so tests consume this
 * lightweight summary instead.
 * 生产代码不需要依赖队列内部细节，
 * 因此这里提供一份轻量摘要供测试使用。
 */
export function summarizeSessionRuntimeMutationQueueState(args: {
  state: SessionRuntimeMutationQueueState
}): SessionRuntimeMutationQueueSummary {
  return {
    pendingSessionCount: args.state.pendingBySession.size,
  }
}

/**
 * Run one logical runtime mutation behind the session-scoped queue.
 * 把一次逻辑运行时修改放到按 session 隔离的队列后执行。
 *
 * Session-owned state transitions such as precheck bookkeeping, turn merging,
 * and finalize state cleanup must keep their original order for one session.
 * At the same time, they should not unnecessarily block unrelated sessions in
 * the same workspace while waiting on network or host I/O.
 * 像 precheck 状态记账、turn 合并、finalize 清理这类 session 归属的状态迁移，
 * 必须在单个 session 内保持原始顺序。
 * 但与此同时，它们也不应该在等待网络或宿主 I/O 时，
 * 把同一工作区里无关 session 一起无谓阻塞住。
 */
export async function runSerializedSessionRuntimeMutation<T>(args: {
  state: SessionRuntimeMutationQueueState
  directory: string
  sessionID: string
  mutate: () => Promise<T> | T
}): Promise<T> {
  const directoryKey = normalizeRuntimeDirectoryKey({
    directory: args.directory,
  })
  const sessionKey = `${directoryKey}::${args.sessionID}`
  const previous = args.state.pendingBySession.get(sessionKey) ?? Promise.resolve()

  const current = previous.catch(() => undefined).then(async () => args.mutate())
  const cleanup = current.then(
    () => undefined,
    () => undefined,
  )
  args.state.pendingBySession.set(sessionKey, cleanup)

  try {
    return await current
  } finally {
    if (args.state.pendingBySession.get(sessionKey) === cleanup) {
      args.state.pendingBySession.delete(sessionKey)
    }
  }
}
