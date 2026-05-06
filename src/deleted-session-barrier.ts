/**
 * Deleted-session barrier helpers for late-event suppression.
 * 用于压制迟到事件的已删除会话屏障辅助模块。
 *
 * This file belongs to the orchestration support layer. It records which
 * sessions were explicitly declared deleted by the host, so late chat/events
 * and stale async savebacks cannot immediately resurrect their runtime state.
 * 这个文件属于编排支撑层。
 * 它负责记录哪些 session 已被宿主显式声明删除，
 * 从而避免迟到的 chat/event 或陈旧的异步写回立刻把这些运行时状态重新写活。
 */

/**
 * Maximum idle age kept for one deleted-session barrier entry.
 * 单条已删除会话屏障条目的最大闲置时长。
 *
 * The barrier only needs to protect the short-to-medium window after explicit
 * deletion where late events may still arrive. It should stay bounded so one
 * long-running process does not keep deleted-session ids forever.
 * 这个屏障只需要保护“显式删除之后，迟到事件仍可能到达”的短中期窗口。
 * 它必须保持有界，避免长生命周期进程把已删除 session id 永久保留在内存里。
 */
export const DELETED_SESSION_BARRIER_TTL_MS = 12 * 60 * 60 * 1000

/**
 * In-memory state for the deleted-session barrier registry.
 * 已删除会话屏障注册表的内存状态。
 *
 * We keep both a membership set and a last-touched map so the barrier can stay
 * O(1) on checks while still aging out stale tombstones opportunistically.
 * 这里同时保留成员集合与最近触达时间表，
 * 这样既能保持 O(1) 级别的成员判断，
 * 也能在机会式清理时让陈旧 tombstone 自然过期。
 */
export type DeletedSessionBarrierState = {
  ids: Set<string>
  touchedAt: Map<string, number>
}

/**
 * Create one empty deleted-session barrier state.
 * 创建一份空的已删除会话屏障状态。
 *
 * Centralized construction keeps plugin runtime and tests on the same state
 * shape instead of each caller building its own partial variant.
 * 通过统一的构造辅助函数，
 * 可以让插件运行时和测试共用同一份状态结构，
 * 避免调用方各自拼装出不一致的变体。
 */
export function createDeletedSessionBarrierState(): DeletedSessionBarrierState {
  return {
    ids: new Set<string>(),
    touchedAt: new Map<string, number>(),
  }
}

/**
 * Prune stale deleted-session tombstones by idle age.
 * 按闲置时长清理陈旧的已删除会话 tombstone。
 *
 * Host delete events are the source of truth, but the in-memory barrier is
 * only a runtime safety net. Old tombstones should therefore age out rather
 * than preventing scope release forever.
 * 宿主删除事件是真实来源，
 * 但内存里的删除屏障本身只是一层运行时安全网。
 * 因此陈旧 tombstone 应当自然过期，而不应永久阻塞 scope 释放。
 */
function pruneDeletedSessionBarrier(args: {
  state: DeletedSessionBarrierState
  now: number
}) {
  for (const [sessionID, touchedAt] of args.state.touchedAt.entries()) {
    if (args.now - touchedAt > DELETED_SESSION_BARRIER_TTL_MS) {
      args.state.touchedAt.delete(sessionID)
      args.state.ids.delete(sessionID)
    }
  }
}

/**
 * Remember one session as explicitly deleted by the host.
 * 把某个 session 记录为宿主已显式删除。
 *
 * Repeated hits refresh the barrier timer because another late event for the
 * same deleted session still proves the barrier should remain warm.
 * 重复命中会刷新屏障计时，
 * 因为同一个已删除 session 再次出现迟到事件，
 * 也说明这道屏障仍然应该继续保持温热。
 */
export function rememberDeletedSessionBarrier(args: {
  state: DeletedSessionBarrierState
  sessionID: string
  now?: number
}) {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneDeletedSessionBarrier({
    state: args.state,
    now,
  })
  args.state.ids.add(args.sessionID)
  args.state.touchedAt.set(args.sessionID, now)
}

/**
 * Peek whether one session is currently blocked by the deleted-session barrier.
 * 仅读取某个 session 当前是否被删除会话屏障阻断。
 *
 * This check is intentionally side-effect free on hits, because passive guard
 * reads such as logging or saveback suppression should not extend the barrier
 * lifetime by themselves.
 * 这个检查在命中时刻意不产生续期副作用，
 * 因为像日志守卫或写回抑制这样的被动读取，
 * 不应该仅因为被观察就延长屏障寿命。
 */
export function peekDeletedSessionBarrier(args: {
  state: DeletedSessionBarrierState
  sessionID: string
  now?: number
}) {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneDeletedSessionBarrier({
    state: args.state,
    now,
  })
  return args.state.ids.has(args.sessionID)
}

/**
 * Remove one deleted-session barrier entry explicitly.
 * 显式移除某个已删除会话屏障条目。
 *
 * This is mainly used for rare cases such as a new `session.created` event
 * reusing an id in the same process, where the fresh lifecycle should override
 * an older tombstone.
 * 这主要用于极少数需要显式解除屏障的情况，
 * 比如同一进程里出现新的 `session.created` 且复用了旧 id，
 * 此时新的生命周期应当覆盖旧 tombstone。
 */
export function deleteDeletedSessionBarrier(args: {
  state: DeletedSessionBarrierState
  sessionID: string
}) {
  args.state.touchedAt.delete(args.sessionID)
  return args.state.ids.delete(args.sessionID)
}

/**
 * Expose current known deleted-session ids after stale pruning.
 * 在清理陈旧条目后，暴露当前已知的删除会话 id 集合。
 *
 * Runtime-scope idle detection only needs the bounded set size, so this helper
 * keeps the pruning policy inside the barrier module.
 * 运行时作用域的 idle 检测只关心有界集合的大小，
 * 因此这里会把清理策略继续封装在屏障模块内部。
 */
export function getKnownDeletedSessionIDs(args: {
  state: DeletedSessionBarrierState
  now?: number
}): ReadonlySet<string> {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneDeletedSessionBarrier({
    state: args.state,
    now,
  })
  return args.state.ids
}
