/**
 * Finalize scheduling policy for stable assistant message updates.
 * assistant 消息更新进入稳定态时的 finalize 调度策略。
 *
 * This file belongs to the plugin orchestration support layer. It decides
 * whether one processed `message.updated` event should proactively schedule a
 * finalize timer when the host may not emit another `session.idle`.
 * 这个文件属于插件编排支撑层，
 * 用来决定某次 `message.updated` 事件在把回答推进到稳定态之后，
 * 是否应该主动补挂一次 finalize 定时器，以防宿主后续不再发出 `session.idle`。
 */

/**
 * Minimal assistant-stability transition snapshot used by finalize scheduling.
 * finalize 调度所需的最小回答稳定态迁移快照。
 *
 * The orchestration layer only needs to know whether this specific update
 * changed the turn from unstable to stable, so the helper stays independent
 * from the larger runtime session structure.
 * 编排层这里只需要知道“这一条更新是否把 turn 从未稳定推进为稳定”，
 * 因此该辅助函数刻意独立于更大的运行时 session 结构。
 */
export type FinalizeMessageUpdateTransition = {
  becameStable: boolean
}

/**
 * Decide whether one processed `message.updated` event should schedule finalize.
 * 判断一次已处理的 `message.updated` 事件是否应该补挂 finalize。
 *
 * Some hosts first emit `finish=stop`, then briefly flip session status, and
 * only later send the `completed` timestamp that makes the assistant answer
 * truly stable in plugin state. If finalize had already been cancelled during
 * that gap, this late stabilization must reschedule the timer.
 * 某些宿主会先发出 `finish=stop`，随后短暂抖动一次 session 状态，
 * 最后才补发 `completed` 时间戳，让插件内部把回答正式视为稳定。
 * 如果 finalize 在这段空窗期已经被取消，那么这次“晚到的稳定化”就必须重新挂起定时器。
 */
export function shouldScheduleFinalizeOnMessageUpdate(args: {
  eventType?: string
  transition?: FinalizeMessageUpdateTransition
}) {
  if (args.eventType !== "message.updated") return false
  if (!args.transition) return false
  return args.transition.becameStable
}
