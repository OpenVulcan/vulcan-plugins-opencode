/**
 * Root-session registry helpers for long-running plugin processes.
 * 长生命周期插件进程使用的 root-session 注册表辅助模块。
 *
 * This file belongs to the orchestration support layer. It tracks which
 * sessions have been positively classified as root sessions, while also
 * keeping the registry bounded when the host forgets to emit `session.deleted`.
 * 这个文件属于编排支撑层，
 * 负责跟踪哪些 session 已被明确判定为 root session，
 * 同时在宿主漏发 `session.deleted` 时保持注册表有界。
 */

/**
 * Maximum idle age kept for one root-session cache entry.
 * 单条 root-session 缓存条目的最大闲置时长。
 *
 * The registry is an optimization for repeated root-only checks, not the
 * source of truth. If the host never sends deletion events, stale root entries
 * should age out instead of living forever.
 * 这个注册表只是 repeated root-only 检查的优化层，并不是权威事实源。
 * 如果宿主一直不发删除事件，陈旧的 root 条目也应该自然过期，
 * 而不是永久滞留在内存里。
 */
export const ROOT_SESSION_REGISTRY_TTL_MS = 3 * 24 * 60 * 60 * 1000

/**
 * In-memory root-session registry state.
 * root-session 注册表的内存状态。
 *
 * The set is still used for O(1) membership checks, while `touchedAt` keeps
 * enough timing information to opportunistically prune stale entries.
 * `Set` 仍然负责 O(1) 成员查询，
 * 而 `touchedAt` 则提供足够的时间信息，便于机会式清理陈旧条目。
 */
export type RootSessionRegistry = {
  ids: Set<string>
  touchedAt: Map<string, number>
}

/**
 * Create one empty root-session registry.
 * 创建一份空的 root-session 注册表。
 *
 * Centralizing construction keeps the state shape consistent across the plugin
 * and the test suite.
 * 通过统一的构造辅助函数，可以让插件运行时和测试套件共用同一份状态形态。
 */
export function createRootSessionRegistry(): RootSessionRegistry {
  return {
    ids: new Set<string>(),
    touchedAt: new Map<string, number>(),
  }
}

/**
 * Prune stale root-session registry entries by idle age.
 * 按闲置时长清理陈旧的 root-session 注册表条目。
 *
 * This keeps the registry bounded even if the host misses lifecycle events and
 * never explicitly tells the plugin that some old session ended.
 * 即便宿主遗漏生命周期事件、从未明确告诉插件某些旧 session 已结束，
 * 这里也能让注册表保持有界。
 */
function pruneRootSessionRegistry(args: {
  state: RootSessionRegistry
  now: number
}) {
  for (const [sessionID, touchedAt] of args.state.touchedAt.entries()) {
    if (args.now - touchedAt > ROOT_SESSION_REGISTRY_TTL_MS) {
      args.state.touchedAt.delete(sessionID)
      args.state.ids.delete(sessionID)
    }
  }
}

/**
 * Mark one session as a confirmed root session.
 * 将某个 session 标记为已确认的 root session。
 *
 * Every successful touch refreshes the idle timer so active root sessions stay
 * warm in the registry while stale sessions still age out.
 * 每次成功 touch 都会刷新闲置计时，
 * 让活跃的 root session 保持温热，而陈旧 session 仍然会自然过期。
 */
export function rememberRootSession(args: {
  state: RootSessionRegistry
  sessionID: string
  now?: number
}) {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneRootSessionRegistry({
    state: args.state,
    now,
  })
  args.state.ids.add(args.sessionID)
  args.state.touchedAt.set(args.sessionID, now)
}

/**
 * Peek whether one session is still known as a cached root session.
 * 仅读取某个 session 当前是否仍被视为缓存中的 root session。
 *
 * Unlike `hasRootSession(...)`, this helper is intentionally side-effect free
 * on a hit. It is meant for guards such as logging decisions, where merely
 * observing cached membership must not prolong the registry lifetime.
 * 与 `hasRootSession(...)` 不同，这个辅助函数在命中时刻意不产生续期副作用。
 * 它用于日志守卫等纯读取场景，因为仅仅为了观察缓存成员关系，
 * 不应该反过来延长注册表的生命周期。
 */
export function peekRootSession(args: {
  state: RootSessionRegistry
  sessionID: string
  now?: number
}) {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneRootSessionRegistry({
    state: args.state,
    now,
  })
  return args.state.ids.has(args.sessionID)
}

/**
 * Check whether one session is still considered a cached root session.
 * 检查某个 session 当前是否仍被视为缓存中的 root session。
 *
 * Successful hits also refresh the idle timer because the session is obviously
 * still active in the current process.
 * 命中成功时也会刷新闲置计时，
 * 因为这说明该 session 在当前进程里显然仍然活跃。
 */
export function hasRootSession(args: {
  state: RootSessionRegistry
  sessionID: string
  now?: number
}) {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneRootSessionRegistry({
    state: args.state,
    now,
  })
  if (!args.state.ids.has(args.sessionID)) {
    return false
  }
  args.state.touchedAt.set(args.sessionID, now)
  return true
}

/**
 * Delete one session from the root-session registry.
 * 从 root-session 注册表中删除某个 session。
 *
 * This is the normal fast path used by `session.deleted`, while TTL-based
 * pruning only acts as a safety net when the host fails to send that event.
 * 这是 `session.deleted` 的正常快速释放路径，
 * TTL 清理只在宿主漏发该事件时充当安全网。
 */
export function deleteRootSession(args: {
  state: RootSessionRegistry
  sessionID: string
}) {
  args.state.touchedAt.delete(args.sessionID)
  return args.state.ids.delete(args.sessionID)
}

/**
 * Expose the current set of known root sessions after pruning stale entries.
 * 在清理陈旧条目后，暴露当前已知 root session 集合。
 *
 * The probe helper only needs set membership, so this accessor lets the plugin
 * reuse the existing probe API without copying the registry on every call.
 * 探测辅助函数只需要集合成员判断，
 * 因此这个 accessor 可以让插件继续复用现有探测 API，
 * 而不必在每次调用时复制一份注册表。
 */
export function getKnownRootSessionIDs(args: {
  state: RootSessionRegistry
  now?: number
}): ReadonlySet<string> {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneRootSessionRegistry({
    state: args.state,
    now,
  })
  // Return a defensive copy so callers cannot mutate the internal registry.
  // 返回防御性副本，防止调用者篡改内部注册表。
  return new Set(args.state.ids)
}
