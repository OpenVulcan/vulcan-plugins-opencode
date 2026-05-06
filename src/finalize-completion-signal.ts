/**
 * Finalize completion-signal adapter for session orchestration.
 * session 编排层的 finalize 完成信号适配器。
 *
 * This file belongs to the plugin orchestration support layer. It normalizes
 * multiple host-side completion hints into one finalize scheduling reason so
 * the turn-splitting state machine can stay unchanged while the finalize
 * trigger path adapts to newer OpenCode event timing.
 * 这个文件属于插件编排支撑层，
 * 用于把多种宿主侧“完成提示”统一适配成一条 finalize 调度原因，
 * 让 turn 切分状态机保持不变，同时让 finalize 触发路径适配较新的
 * OpenCode 事件时序。
 */

import {
  shouldScheduleFinalizeOnMessageUpdate,
  type FinalizeMessageUpdateTransition,
} from "./finalize-message-update-policy.js"

/**
 * Finalize scheduling reason exposed by the completion-signal adapter.
 * 完成信号适配层暴露的 finalize 调度原因。
 *
 * `session-idle` keeps compatibility with the historical event contract, while
 * `assistant-stable-message` represents the newer path where a late assistant
 * completion update becomes the authoritative signal.
 * `session-idle` 用于兼容历史事件契约，
 * `assistant-stable-message` 则代表较新的路径：由晚到的 assistant
 * 完成更新成为更权威的收口信号。
 */
export type FinalizeCompletionSignalReason = "session-idle" | "assistant-stable-message"

/**
 * Resolve one finalize scheduling reason from the processed event snapshot.
 * 根据已处理事件快照解析一条 finalize 调度原因。
 *
 * The adapter intentionally does not decide whether the turn is submittable.
 * It only answers whether this event should re-arm or start finalize timing.
 * Real submission guards still live in `finalizeSessionTurn` and
 * `shouldSubmitTurn`, so turn semantics remain unchanged.
 * 这个适配器不会判断当前 turn 最终是否可提交，
 * 它只负责回答“这次事件是否应该启动或重新挂起 finalize 定时器”。
 * 真正的提交守卫仍然保留在 `finalizeSessionTurn` 与
 * `shouldSubmitTurn` 中，因此 turn 语义本身不会改变。
 */
export function resolveFinalizeCompletionSignal(args: {
  eventType?: string
  messageUpdateTransition?: FinalizeMessageUpdateTransition
}) {
  if (args.eventType === "session.idle") {
    return "session-idle" satisfies FinalizeCompletionSignalReason
  }

  if (
    shouldScheduleFinalizeOnMessageUpdate({
      eventType: args.eventType,
      transition: args.messageUpdateTransition,
    })
  ) {
    return "assistant-stable-message" satisfies FinalizeCompletionSignalReason
  }

  return undefined
}
