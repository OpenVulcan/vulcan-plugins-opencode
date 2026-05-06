/**
 * Directory-scoped mutation queue for the shared writeback outbox file.
 * 共享写回 outbox 文件使用的按目录串行化队列。
 *
 * This file belongs to the orchestration support layer. One workspace keeps a
 * single persisted `.vmm-writeback-outbox.json` file under `.opencode`, so all
 * finalize paths inside that directory must serialize load/flush/enqueue/save
 * cycles against the same file snapshot.
 * 这个文件属于编排支撑层。
 * 一个工作区会在 `.opencode` 下共享同一个持久化的
 * `.vmm-writeback-outbox.json` 文件，因此同目录内所有 finalize 路径都必须
 * 围绕同一份文件快照串行执行 load/flush/enqueue/save 周期。
 */

import { normalizeRuntimeDirectoryKey } from "./runtime-directory-key.js"

/**
 * In-memory queue state for directory-scoped writeback outbox mutations.
 * 按目录串行化写回 outbox 修改的内存队列状态。
 *
 * The queue key is the normalized directory because the persisted outbox file
 * itself is shared by every session inside one workspace.
 * 这里按归一化目录建队列，
 * 因为持久化 outbox 文件本身就是同一工作区内所有 session 共享的。
 */
export type WritebackOutboxMutationQueueState = {
  pendingByDirectory: Map<string, Promise<void>>
}

/**
 * Compact summary of current writeback-outbox queue occupancy.
 * 当前写回 outbox 队列占用情况的紧凑摘要。
 *
 * Tests use this to verify completed mutations release their directory slot
 * instead of leaving dead queue entries behind.
 * 测试会用它验证：
 * 已完成的修改不会把失效目录队列项遗留在内存里。
 */
export type WritebackOutboxMutationQueueSummary = {
  pendingDirectoryCount: number
}

/**
 * Create one empty writeback-outbox mutation queue state.
 * 创建一份空的写回 outbox 修改队列状态。
 *
 * The plugin keeps one process-local state and shares it across all serialized
 * outbox mutations.
 * 插件会持有一份进程内状态，
 * 并把它复用于所有串行化的 outbox 修改。
 */
export function createWritebackOutboxMutationQueueState(): WritebackOutboxMutationQueueState {
  return {
    pendingByDirectory: new Map<string, Promise<void>>(),
  }
}

/**
 * Summarize how many directories currently hold queued outbox work.
 * 汇总当前有多少目录仍持有排队中的 outbox 工作。
 *
 * Production code does not need internal queue details, so tests consume this
 * lightweight summary instead.
 * 生产代码不需要依赖队列内部细节，
 * 因此这里提供一份轻量摘要供测试使用。
 */
export function summarizeWritebackOutboxMutationQueueState(args: {
  state: WritebackOutboxMutationQueueState
}): WritebackOutboxMutationQueueSummary {
  return {
    pendingDirectoryCount: args.state.pendingByDirectory.size,
  }
}

/**
 * Run one writeback-outbox mutation behind the directory-scoped queue.
 * 把一次写回 outbox 修改放到按目录隔离的队列后执行。
 *
 * The correct serialization boundary is the directory because every session in
 * the same workspace shares the same persisted outbox file. A narrower
 * `directory + session` key would allow stale load/save snapshots to race each
 * other against that one file and reintroduce lost-update corruption.
 * 正确的串行化边界只能是目录，
 * 因为同一工作区里的所有 session 共享同一个持久化 outbox 文件。
 * 如果使用更细的 `directory + session` 键，就会允许旧的 load/save 快照
 * 围绕同一个文件彼此竞争，从而重新引入丢失更新损坏。
 */
export async function runSerializedWritebackOutboxMutation<T>(args: {
  state: WritebackOutboxMutationQueueState
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
