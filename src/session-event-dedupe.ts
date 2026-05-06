/**
 * Session-scoped event dedupe helpers for long-running plugin processes.
 * 长生命周期插件进程里的按会话事件去重辅助模块。
 *
 * This file belongs to the orchestration support layer. It keeps event-level
 * dedupe state scoped to one OpenCode session so the plugin can suppress
 * repeated `session.status` / `message.updated` noise without leaking cache
 * entries across deleted sessions.
 * 这个文件属于编排支撑层，
 * 用来把事件级去重状态约束在单个 OpenCode session 的生命周期内，
 * 让插件既能抑制重复的 `session.status` / `message.updated` 噪音，
 * 又不会在 session 删除后把缓存条目遗留到后续会话里。
 */

/**
 * In-memory state that powers session-scoped event dedupe.
 * 支撑按会话事件去重的内存状态。
 *
 * `messageStateCache` indexes by one session-scoped message dedupe key, while
 * the two ownership maps let the plugin reclaim exactly the entries that
 * belong to one deleted session.
 * `messageStateCache` 现在按“session 作用域的 message 去重键”做索引，
 * 而两张归属索引则负责在某个 session 删除时，
 * 精确回收只属于该 session 的去重条目。
 */
export type SessionEventDedupeState = {
  sessionStatusCache: Map<string, string>
  messageStateCache: Map<string, string>
  messageKeysBySession: Map<string, Set<string>>
  messageKeyOwners: Map<string, string>
  sessionTouchedAt: Map<string, number>
  orphanMessageTouchedAt: Map<string, number>
}

/**
 * Maximum idle age kept for one session-owned dedupe entry set.
 * 单个 session 归属 dedupe 条目集合允许保留的最大闲置时长。
 *
 * Session-owned dedupe exists only to suppress duplicate lifecycle noise while
 * one session is still plausibly active in the current process. If the host
 * misses `session.deleted`, stale session-owned dedupe must still age out so
 * it cannot block runtime-scope release forever.
 * session 归属 dedupe 的存在目的，只是在当前进程里“该 session 仍可能活跃”时，
 * 压制重复的生命周期噪音。
 * 如果宿主漏发 `session.deleted`，这些陈旧的 session-owned dedupe 也必须自然过期，
 * 否则它会永久阻塞 runtime scope 的释放。
 */
export const SESSION_EVENT_DEDUPE_SESSION_TTL_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Maximum orphan message dedupe entries kept in memory at once.
 * 内存里同时保留的 orphan message 去重条目上限。
 *
 * Orphan entries have no session lifecycle to anchor to, so they must stay
 * bounded even in runtimes that never send the later session-scoped upgrade.
 * orphan 条目没有 session 生命周期可依附，
 * 因此即便宿主永远不补发后续的 session-scoped 事件，这里也必须保持有界。
 */
export const ORPHAN_MESSAGE_DEDUPE_MAX_ENTRIES = 256

/**
 * Maximum age for one orphan message dedupe entry.
 * 单条 orphan message 去重条目的最长保留时长。
 *
 * Orphan dedupe is only meant to smooth over short gaps in sparse host
 * payloads. Long-lived orphan entries are more likely to cause false
 * suppression than to provide useful dedupe value.
 * orphan 去重只用于平滑宿主载荷稀疏时的短暂缺口。
 * 如果 orphan 条目长期滞留，它更可能带来误压制，而不是继续提供有效去重价值。
 */
export const ORPHAN_MESSAGE_DEDUPE_TTL_MS = 10 * 60 * 1000

/**
 * One summary of how much dedupe state was reclaimed for a deleted session.
 * 某个已删除 session 被回收了多少去重状态的汇总结果。
 *
 * The plugin writes this into lifecycle logs so future debugging can confirm
 * whether stale dedupe state was really released when a session ended.
 * 插件会把它写入生命周期日志，
 * 这样后续排查时就能确认 session 结束时是否真的释放了陈旧去重状态。
 */
export type SessionEventDedupeClearResult = {
  clearedStatus: boolean
  clearedMessageCount: number
}

/**
 * One compact summary of the current dedupe-state footprint.
 * 当前 dedupe 状态占用情况的紧凑摘要。
 *
 * Runtime-scope cleanup only needs to know whether dedupe state is still
 * holding live ownership, orphan snapshots, or message/status cache entries.
 * 运行时作用域清理并不需要完整明细，
 * 它只需要知道 dedupe 状态是否还持有活跃的归属信息、orphan 快照、
 * 或 message/status 缓存条目。
 */
export type SessionEventDedupeStateSummary = {
  sessionStatusCount: number
  messageStateCount: number
  sessionOwnershipCount: number
  messageOwnerCount: number
  sessionTouchCount: number
  orphanCount: number
  isEmpty: boolean
}

/**
 * Create a fresh session-scoped dedupe state container.
 * 创建一份新的按会话去重状态容器。
 *
 * Keeping construction behind one helper ensures every caller starts from the
 * same ownership model instead of manually wiring several related maps.
 * 通过统一的辅助函数创建状态，
 * 可以避免调用方手工拼装多张彼此有关联的 Map，降低后续维护风险。
 */
export function createSessionEventDedupeState(): SessionEventDedupeState {
  return {
    sessionStatusCache: new Map<string, string>(),
    messageStateCache: new Map<string, string>(),
    messageKeysBySession: new Map<string, Set<string>>(),
    messageKeyOwners: new Map<string, string>(),
    sessionTouchedAt: new Map<string, number>(),
    orphanMessageTouchedAt: new Map<string, number>(),
  }
}

/**
 * Refresh the last-seen timestamp for one session-owned dedupe footprint.
 * 刷新某个 session-owned dedupe 足迹的最近访问时间。
 *
 * Duplicate status/message events still prove that the session is active, so
 * stale-session pruning must treat those repeated touches as fresh activity.
 * 即便 status/message 事件内容重复，它们依然能证明该 session 仍处于活跃状态，
 * 因此 stale-session 清理也必须把这些重复触达视为新的活跃信号。
 */
function touchSessionOwnedState(args: {
  state: SessionEventDedupeState
  sessionID: string
  now: number
}) {
  args.state.sessionTouchedAt.set(args.sessionID, args.now)
}

/**
 * Build the stable dedupe key for one message snapshot.
 * 为单条 message 快照构建稳定的去重键。
 *
 * Session-scoped keys prevent different sessions from suppressing each other
 * when the host only guarantees message-id uniqueness inside one session.
 * Orphan keys are still supported for sparse host payloads and can later be
 * promoted to a session key when the missing session id becomes available.
 * session 作用域键可以避免“message id 只在 session 内唯一”的宿主实现里，
 * 不同 session 的同名 message 互相压制。
 * 对于宿主载荷稀疏导致拿不到 session id 的场景，仍支持 orphan 键，
 * 后续一旦补齐 session id，还可以再提升为 session 键。
 */
function buildMessageDedupeKey(args: { messageID: string; sessionID?: string }) {
  return args.sessionID
    ? `session:${args.sessionID}:${args.messageID}`
    : `orphan:${args.messageID}`
}

/**
 * Check whether one dedupe key belongs to the orphan pool.
 * 判断某条去重键是否属于 orphan 池。
 *
 * Orphan keys need extra eviction handling because they are not owned by any
 * session lifecycle hook.
 * orphan 键需要额外的淘汰处理，
 * 因为它们并不受任何 session 生命周期 hook 管辖。
 */
function isOrphanMessageKey(messageKey: string) {
  return messageKey.startsWith("orphan:")
}

/**
 * Remove one orphan dedupe key from every related in-memory structure.
 * 从所有相关内存结构里移除一条 orphan 去重键。
 *
 * Orphan entries are stored only in the orphan pool and message-state cache,
 * so centralizing removal here keeps TTL and capacity pruning consistent.
 * orphan 条目只存在于 orphan 池和 message-state cache 中，
 * 因此把删除动作统一收口在这里，可以保证 TTL 与容量淘汰行为一致。
 */
function removeOrphanMessageKey(args: {
  state: SessionEventDedupeState
  messageKey: string
}) {
  args.state.messageStateCache.delete(args.messageKey)
  args.state.orphanMessageTouchedAt.delete(args.messageKey)
}

/**
 * Remove every session-owned dedupe entry for one session.
 * 移除某个 session 拥有的全部 dedupe 条目。
 *
 * This helper is shared by explicit `session.deleted` cleanup and TTL-based
 * stale-session pruning, so both paths reclaim exactly the same ownership
 * footprint instead of drifting apart.
 * 这个辅助函数会同时服务于显式 `session.deleted` 清理与 TTL stale-session 清理，
 * 从而保证两条路径回收的是同一份归属足迹，而不是逐渐各自漂移。
 */
function removeSessionOwnedState(args: {
  state: SessionEventDedupeState
  sessionID: string
}): SessionEventDedupeClearResult {
  const clearedStatus = args.state.sessionStatusCache.delete(args.sessionID)
  const ownedMessages = args.state.messageKeysBySession.get(args.sessionID)
  let clearedMessageCount = 0

  if (ownedMessages) {
    for (const messageKey of ownedMessages) {
      args.state.messageStateCache.delete(messageKey)
      const owner = args.state.messageKeyOwners.get(messageKey)
      if (owner === args.sessionID) {
        args.state.messageKeyOwners.delete(messageKey)
      }
      clearedMessageCount += 1
    }
    args.state.messageKeysBySession.delete(args.sessionID)
  }

  args.state.sessionTouchedAt.delete(args.sessionID)

  return {
    clearedStatus,
    clearedMessageCount,
  }
}

/**
 * Prune stale session-owned dedupe entries by idle age.
 * 按闲置时长清理陈旧的 session-owned dedupe 条目。
 *
 * This is the safety net for runtimes where the host forgets to emit
 * `session.deleted`. Without it, stale session-owned dedupe can survive
 * forever and keep directory runtime scopes from ever becoming idle again.
 * 这是宿主漏发 `session.deleted` 时的安全网。
 * 如果没有它，陈旧的 session-owned dedupe 会永久滞留，
 * 并持续阻塞目录运行时作用域重新回到 idle 状态。
 */
function pruneSessionOwnedSnapshots(args: {
  state: SessionEventDedupeState
  now: number
}) {
  for (const [sessionID, touchedAt] of args.state.sessionTouchedAt.entries()) {
    if (args.now - touchedAt > SESSION_EVENT_DEDUPE_SESSION_TTL_MS) {
      removeSessionOwnedState({
        state: args.state,
        sessionID,
      })
    }
  }
}

/**
 * Prune stale or over-capacity orphan message dedupe entries.
 * 清理过期或超出容量的 orphan message 去重条目。
 *
 * Because orphan entries have no session owner, they need their own bounded
 * retention policy to avoid growing forever or suppressing unrelated future
 * events long after their original context disappeared.
 * 由于 orphan 条目没有 session owner，
 * 它们必须依靠独立的有界保留策略，避免无限增长，
 * 也避免在原始上下文早已消失后继续错误压制未来事件。
 */
function pruneOrphanMessageSnapshots(args: {
  state: SessionEventDedupeState
  now: number
}) {
  for (const [messageKey, touchedAt] of args.state.orphanMessageTouchedAt.entries()) {
    if (args.now - touchedAt > ORPHAN_MESSAGE_DEDUPE_TTL_MS) {
      removeOrphanMessageKey({
        state: args.state,
        messageKey,
      })
    }
  }

  if (args.state.orphanMessageTouchedAt.size <= ORPHAN_MESSAGE_DEDUPE_MAX_ENTRIES) {
    return
  }

  const overflowCount =
    args.state.orphanMessageTouchedAt.size - ORPHAN_MESSAGE_DEDUPE_MAX_ENTRIES
  const oldestKeys = [...args.state.orphanMessageTouchedAt.entries()]
    .sort((left, right) => left[1] - right[1])
    .slice(0, overflowCount)
    .map(([messageKey]) => messageKey)

  for (const messageKey of oldestKeys) {
    removeOrphanMessageKey({
      state: args.state,
      messageKey,
    })
  }
}

/**
 * Drop one orphan message snapshot when better session-scoped metadata arrives.
 * 当后续拿到更完整的 session 作用域元数据时，清掉旧 orphan message 快照。
 *
 * Orphan entries are intentionally weaker than session-scoped entries because
 * they have no trustworthy owner. When authoritative `sessionID` metadata
 * arrives later, we remove the stale orphan key but let the session-scoped
 * event establish its own dedupe state from scratch.
 * orphan 条目天然弱于 session-scoped 条目，因为它并没有可信的归属信息。
 * 因此当后续拿到权威的 `sessionID` 元数据时，
 * 这里只会移除旧 orphan 键，而不会再让 orphan 结果去压制新的 session-scoped 事件。
 */
function dropOrphanMessageSnapshotForScopedEvent(args: {
  state: SessionEventDedupeState
  messageID: string
  sessionID: string
}) {
  const orphanKey = buildMessageDedupeKey({
    messageID: args.messageID,
  })
  const scopedKey = buildMessageDedupeKey({
    messageID: args.messageID,
    sessionID: args.sessionID,
  })

  if (!args.state.messageStateCache.has(orphanKey)) return scopedKey
  removeOrphanMessageKey({
    state: args.state,
    messageKey: orphanKey,
  })
  return scopedKey
}

/**
 * Remember one session-status snapshot and report whether it is new.
 * 记录一条 session status 快照，并返回它是否属于新变化。
 *
 * Status dedupe is purely session-scoped, so once that session is deleted the
 * cached snapshot can be discarded without affecting any other session.
 * status 去重天然就是按 session 作用域生效的，
 * 因此该 session 一旦结束，对应快照就可以安全删除，不会影响其他 session。
 */
export function rememberSessionStatusSnapshot(args: {
  state: SessionEventDedupeState
  sessionID: string
  statusKey: string
  now?: number
}) {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneSessionOwnedSnapshots({
    state: args.state,
    now,
  })
  touchSessionOwnedState({
    state: args.state,
    sessionID: args.sessionID,
    now,
  })
  const previous = args.state.sessionStatusCache.get(args.sessionID)
  if (previous === args.statusKey) return false
  args.state.sessionStatusCache.set(args.sessionID, args.statusKey)
  return true
}

/**
 * Attach one scoped message dedupe key to its owning session for later cleanup.
 * 把一条带作用域的 message 去重键绑定到所属 session，供后续清理使用。
 *
 * Message dedupe is looked up by one scoped key for speed, but cleanup must be
 * session-based. The reverse ownership index bridges those two requirements.
 * message 去重为了速度按一条作用域键查询，
 * 但释放时又必须按 session 粒度清理。
 * 这条反向归属索引就是为了兼顾这两个要求。
 */
function assignMessageOwnership(args: {
  state: SessionEventDedupeState
  messageKey: string
  sessionID: string
}) {
  const previousOwner = args.state.messageKeyOwners.get(args.messageKey)
  if (previousOwner === args.sessionID) return

  if (previousOwner) {
    const previousSet = args.state.messageKeysBySession.get(previousOwner)
    previousSet?.delete(args.messageKey)
    if (previousSet && previousSet.size === 0) {
      args.state.messageKeysBySession.delete(previousOwner)
    }
  }

  let ownedMessages = args.state.messageKeysBySession.get(args.sessionID)
  if (!ownedMessages) {
    ownedMessages = new Set<string>()
    args.state.messageKeysBySession.set(args.sessionID, ownedMessages)
  }
  ownedMessages.add(args.messageKey)
  args.state.messageKeyOwners.set(args.messageKey, args.sessionID)
}

/**
 * Remember one message snapshot and report whether it is new.
 * 记录一条 message 快照，并返回它是否属于新变化。
 *
 * Even duplicate message snapshots still refresh ownership when a session id
 * is available, because session deletion later depends on that ownership map
 * to reclaim the message-level dedupe entry.
 * 只要拿到了 session id，即便当前 message 快照本身是重复的，
 * 这里也仍会刷新归属关系；
 * 因为后续 session 删除时，message 级去重状态的释放完全依赖这张归属索引。
 */
export function rememberMessageSnapshot(args: {
  state: SessionEventDedupeState
  messageID: string
  summaryKey: string
  sessionID?: string
  now?: number
}) {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneSessionOwnedSnapshots({
    state: args.state,
    now,
  })
  pruneOrphanMessageSnapshots({
    state: args.state,
    now,
  })

  let messageKey = buildMessageDedupeKey({
    messageID: args.messageID,
    sessionID: args.sessionID,
  })

  if (args.sessionID) {
    messageKey = dropOrphanMessageSnapshotForScopedEvent({
      state: args.state,
      messageID: args.messageID,
      sessionID: args.sessionID,
    })
    assignMessageOwnership({
      state: args.state,
      messageKey,
      sessionID: args.sessionID,
    })
    touchSessionOwnedState({
      state: args.state,
      sessionID: args.sessionID,
      now,
    })
  } else if (isOrphanMessageKey(messageKey)) {
    args.state.orphanMessageTouchedAt.set(messageKey, now)
  }

  const previous = args.state.messageStateCache.get(messageKey)
  if (previous === args.summaryKey) return false
  args.state.messageStateCache.set(messageKey, args.summaryKey)
  if (!args.sessionID && isOrphanMessageKey(messageKey)) {
    pruneOrphanMessageSnapshots({
      state: args.state,
      now,
    })
  }
  return true
}

/**
 * Clear all session-owned dedupe state when one session is deleted.
 * 当某个 session 删除时，清理其拥有的全部去重状态。
 *
 * We intentionally clear both status snapshots and message ownership here so
 * a long-running plugin process does not keep stale dedupe keys forever and
 * accidentally suppress future events that should be handled.
 * 这里会同时清理 status 快照与 message 归属，
 * 目的是避免长生命周期插件进程把陈旧去重键无限保留，
 * 最终错误压制本该继续处理的新事件。
 */
export function clearSessionEventDedupeState(args: {
  state: SessionEventDedupeState
  sessionID: string
}): SessionEventDedupeClearResult {
  return removeSessionOwnedState({
    state: args.state,
    sessionID: args.sessionID,
  })
}

/**
 * Summarize one dedupe-state container after pruning stale orphan entries.
 * 在清理陈旧 orphan 条目后，对一份 dedupe 状态容器做摘要统计。
 *
 * Runtime-scope cleanup uses this helper to decide whether one directory scope
 * still owns meaningful dedupe state, without having to know the internal map
 * layout of the dedupe module.
 * 运行时作用域清理会通过这个辅助函数判断目录作用域是否还持有有效的
 * dedupe 状态，而不需要了解 dedupe 模块内部多张 Map 的布局细节。
 */
export function summarizeSessionEventDedupeState(args: {
  state: SessionEventDedupeState
  now?: number
}): SessionEventDedupeStateSummary {
  const now = typeof args.now === "number" ? args.now : Date.now()
  pruneSessionOwnedSnapshots({
    state: args.state,
    now,
  })
  pruneOrphanMessageSnapshots({
    state: args.state,
    now,
  })

  const sessionStatusCount = args.state.sessionStatusCache.size
  const messageStateCount = args.state.messageStateCache.size
  const sessionOwnershipCount = args.state.messageKeysBySession.size
  const messageOwnerCount = args.state.messageKeyOwners.size
  const sessionTouchCount = args.state.sessionTouchedAt.size
  const orphanCount = args.state.orphanMessageTouchedAt.size

  return {
    sessionStatusCount,
    messageStateCount,
    sessionOwnershipCount,
    messageOwnerCount,
    sessionTouchCount,
    orphanCount,
    isEmpty:
      sessionStatusCount === 0 &&
      messageStateCount === 0 &&
      sessionOwnershipCount === 0 &&
      messageOwnerCount === 0 &&
      sessionTouchCount === 0 &&
      orphanCount === 0,
  }
}
