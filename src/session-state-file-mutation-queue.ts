/**
 * Directory-scoped mutation queue for the shared session-state file.
 * 共享 session 状态文件使用的按目录串行化队列。
 *
 * This file belongs to the orchestration support layer. It protects the
 * single persisted session-state file that one workspace uses, so concurrent
 * mutations from different sessions inside the same directory cannot load and
 * overwrite each other's stale snapshots.
 * 这个文件属于编排支撑层。
 * 它保护同一工作区共享的那一个持久化 session 状态文件，
 * 避免同目录下不同 session 的并发修改各自读取旧快照后相互覆盖写回。
 */

import { normalizeRuntimeDirectoryKey } from "./runtime-directory-key.js"

/**
 * In-memory queue state for directory-scoped session-state mutations.
 * 按目录串行化 session 状态文件修改的内存队列状态。
 *
 * The queue is keyed by normalized directory because the persisted state file
 * itself is directory-scoped rather than session-scoped.
 * 这里按归一化目录建队列，
 * 因为持久化状态文件本身就是按目录共享，而不是按 session 拆分。
 */
export type SessionStateFileMutationQueueState = {
  pendingByDirectory: Map<string, Promise<void>>
}

/**
 * Compact summary of the current queue occupancy.
 * 当前队列占用情况的紧凑摘要。
 *
 * Tests use this to assert that completed mutations release their ownership
 * instead of leaving dead queue entries behind.
 * 测试会用这份摘要断言：
 * 已完成的修改不会把失效队列项遗留在内存里。
 */
export type SessionStateFileMutationQueueSummary = {
  pendingDirectoryCount: number
}

/**
 * Create one empty mutation queue state.
 * 创建一份空的状态文件修改队列。
 *
 * The plugin keeps one process-local queue state and reuses it across all
 * serialized session-state file mutations.
 * 插件会持有一份进程内队列状态，
 * 并让所有 session 状态文件的串行化修改都复用它。
 */
export function createSessionStateFileMutationQueueState(): SessionStateFileMutationQueueState {
  return {
    pendingByDirectory: new Map<string, Promise<void>>(),
  }
}

/**
 * Summarize how many directories currently hold queued state-file work.
 * 汇总当前有多少目录仍持有排队中的状态文件任务。
 *
 * This is intentionally small and test-oriented, so production code does not
 * depend on internal queue-map details.
 * 这个摘要刻意保持轻量且偏测试用途，
 * 这样生产代码就不需要依赖队列内部 Map 的细节。
 */
export function summarizeSessionStateFileMutationQueueState(args: {
  state: SessionStateFileMutationQueueState
}): SessionStateFileMutationQueueSummary {
  return {
    pendingDirectoryCount: args.state.pendingByDirectory.size,
  }
}

/**
 * Run one state-file mutation behind the directory-scoped queue.
 * 把一次状态文件修改放到按目录隔离的串行化队列后执行。
 *
 * Every session in the same workspace still writes back into one shared file,
 * so the correct serialization boundary is the directory. Using a narrower
 * `directory + session` key would allow parallel load/save cycles against the
 * same file and reintroduce lost-update races.
 * 同一工作区里的所有 session 最终仍会回写同一个共享文件，
 * 因此正确的串行化边界只能是目录。
 * 如果用更细的 `directory + session` 键，就会允许针对同一文件的并行读写，
 * 从而重新引入丢失更新的竞争窗口。
 */
export async function runSerializedSessionStateFileMutation<T>(args: {
  state: SessionStateFileMutationQueueState
  directory: string
  mutate: () => Promise<T> | T
}): Promise<T> {
  const directoryKey = normalizeRuntimeDirectoryKey({
    directory: args.directory,
  })
  const previous = args.state.pendingByDirectory.get(directoryKey) ?? Promise.resolve()

  const current = previous.catch(() => undefined).then(async () => args.mutate())
  const cleanup = current.then(
    () => undefined,
    () => undefined,
  )
  args.state.pendingByDirectory.set(directoryKey, cleanup)

  try {
    return await current
  } finally {
    if (args.state.pendingByDirectory.get(directoryKey) === cleanup) {
      args.state.pendingByDirectory.delete(directoryKey)
    }
  }
}
