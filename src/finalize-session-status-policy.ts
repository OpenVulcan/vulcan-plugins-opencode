/**
 * Finalize-cancellation policy for session-status churn.
 * session.status 抖动下的 finalize 取消策略。
 *
 * This file belongs to the plugin orchestration support layer. It decides
 * whether one transient runtime status should still be allowed to cancel a
 * pending PostAction finalize timer for the current turn.
 * 这个文件属于插件编排支撑层，
 * 用来决定某次瞬时运行时状态变化是否仍然允许取消当前 turn
 * 已经挂起的 PostAction finalize 定时器。
 */

/**
 * Minimal active-turn snapshot required by the cancellation policy.
 * 取消策略所需的最小 active turn 快照。
 *
 * The event path should only expose the stable-answer signal here, so the
 * policy stays decoupled from the large runtime turn structure in plugin.ts.
 * 这里刻意只暴露“是否已有稳定回答”这一个信号，
 * 让策略层不需要耦合 plugin.ts 中庞大的运行时 turn 结构。
 */
export type FinalizeCancellationTurnSnapshot = {
  hasStableAssistant: boolean
}

/**
 * Decide whether one non-idle session status may cancel a pending finalize.
 * 判断某次非 idle 的 session 状态是否允许取消挂起的 finalize。
 *
 * Once the assistant answer has already stabilized, later `busy` flips can be
 * caused by title generation, transcript writeback, or other host-side noise.
 * Cancelling finalize in that moment can permanently swallow PostAction if the
 * host never emits another `session.idle` event for the same turn.
 * 一旦 assistant 回答已经稳定，后续出现的 `busy` 抖动
 * 很可能只是标题生成、转录写回或宿主侧其它噪音。
 * 如果此时继续取消 finalize，而宿主又没有为同一 turn 再发一条
 * `session.idle`，就会把本应发送的 PostAction 永久吞掉。
 *
 * We therefore only allow cancellation while the current turn still lacks a
 * stable assistant answer. New real user input still has its own dedicated
 * cancellation path, so preserving the finalize timer here is safe.
 * 因此这里改为：只有当前 turn 还没有稳定 assistant 回答时，
 * 才允许状态抖动取消 finalize。
 * 真正的新用户输入仍然走独立的取消链路，所以保留该定时器是安全的。
 */
export function shouldCancelFinalizeOnSessionStatus(args: {
  statusType?: string
  activeTurn?: FinalizeCancellationTurnSnapshot
}) {
  if (!args.statusType || args.statusType === "idle") return false
  if (!args.activeTurn) return false
  return !args.activeTurn.hasStableAssistant
}
