/**
 * Event-summary dedupe gate for processed session events.
 * 已处理 session 事件的摘要去重闸门。
 *
 * This file belongs to the orchestration support layer. It is used after the
 * plugin has already decided one event is eligible for real processing, so
 * dedupe state only tracks events that can actually affect runtime behavior.
 * 这个文件属于编排支撑层。
 * 它只会在插件已经判定“该事件确实要进入真实处理链”之后才被调用，
 * 从而确保 dedupe 状态只记录真正会影响运行时行为的事件。
 */

import {
  rememberMessageSnapshot,
  rememberSessionStatusSnapshot,
  type SessionEventDedupeState,
} from "./session-event-dedupe.js"

/**
 * Minimal summary for one processed `session.status` event.
 * 单条已进入处理链的 `session.status` 事件最小摘要。
 *
 * The plugin only needs the owning session and the normalized status payload
 * to decide whether this status change is new enough to process.
 * 插件只需要所属 session 和归一化后的 status 载荷，
 * 就能判断这次状态变化是否足够新，值得继续处理。
 */
export type ProcessedSessionStatusSummary = {
  type: "session.status"
  sessionID?: string
  status?: Record<string, unknown>
}

/**
 * Minimal summary for one processed `message.updated` event.
 * 单条已进入处理链的 `message.updated` 事件最小摘要。
 *
 * The summary carries both the raw message id and the normalized message
 * snapshot so dedupe can stay scoped to the authoritative session owner.
 * 这份摘要同时携带原始 message id 与归一化后的消息快照，
 * 这样 dedupe 就能继续锚定在权威的 session owner 上。
 */
export type ProcessedMessageUpdatedSummary = {
  type: "message.updated"
  sessionID?: string
  info: {
    id?: string
    sessionID?: string
    [key: string]: unknown
  }
}

/**
 * Minimal event summary contract accepted by the processed-event dedupe gate.
 * 已处理事件去重闸门接受的最小事件摘要契约。
 *
 * Only `session.status` and `message.updated` are deduped here. Other event
 * types pass through unchanged because they either have different semantics or
 * should always be observed when they reach the real processing path.
 * 这里只有 `session.status` 与 `message.updated` 会触发去重。
 * 其他事件类型会直接放行，因为它们要么语义不同，
 * 要么只要进入真实处理路径就应该始终被观察到。
 */
export type ProcessedEventSummary =
  | ProcessedSessionStatusSummary
  | ProcessedMessageUpdatedSummary
  | {
      type: string
      [key: string]: unknown
    }

/**
 * Check whether one generic event summary is a processed `session.status`.
 * 判断一条通用事件摘要是否属于已处理的 `session.status`。
 *
 * The fallback union arm keeps the helper easy to call from the plugin, so a
 * dedicated type guard is used here to recover the stronger typed shape.
 * 这里保留了宽泛的兜底联合类型，方便插件直接传入摘要，
 * 因此需要显式类型守卫把更强的 `session.status` 形态再收回来。
 */
function isProcessedSessionStatusSummary(
  summary: ProcessedEventSummary,
): summary is ProcessedSessionStatusSummary {
  return summary.type === "session.status"
}

/**
 * Check whether one generic event summary is a processed `message.updated`.
 * 判断一条通用事件摘要是否属于已处理的 `message.updated`。
 *
 * Message-update summaries must carry one normalized `info` object, so the
 * guard checks both the event type and the minimum object shape.
 * `message.updated` 摘要必须携带一份归一化后的 `info` 对象，
 * 因此这个守卫会同时检查事件类型和最小对象形态。
 */
function isProcessedMessageUpdatedSummary(
  summary: ProcessedEventSummary,
): summary is ProcessedMessageUpdatedSummary {
  return summary.type === "message.updated" && Boolean(summary["info"]) && typeof summary["info"] === "object"
}

/**
 * Decide whether one already-eligible event summary should continue processing.
 * 判断一条“已经具备处理资格”的事件摘要是否还应继续处理。
 *
 * This gate intentionally runs after root-session and business-scope checks.
 * That keeps skipped events from polluting dedupe state, which would otherwise
 * suppress the first later event that becomes truly processable.
 * 这个闸门刻意放在 root-session 与 business-scope 校验之后执行。
 * 这样就能避免“本来会被跳过的事件”先污染 dedupe 状态，
 * 否则它们会把后面第一条真正可处理的事件也一起压掉。
 */
export function shouldProcessSessionEventSummary(args: {
  state: SessionEventDedupeState
  summary: ProcessedEventSummary
}) {
  if (isProcessedSessionStatusSummary(args.summary)) {
    if (!args.summary.sessionID) return true
    return rememberSessionStatusSnapshot({
      state: args.state,
      sessionID: args.summary.sessionID,
      statusKey: JSON.stringify(args.summary.status ?? {}),
    // NOTE: JSON.stringify is used as a dedupe key for simplicity. Property
    // insertion order is not guaranteed across engines, so semantically
    // identical objects with different key ordering may produce different keys.
    // This is acceptable for the current use case but should be replaced with
    // a canonical serializer if strict deduplication is ever required.
    // 注意：这里简单使用 JSON.stringify 作为去重 key。不同引擎的
    // 属性插入顺序不保证一致，所以语义相同但 key 顺序不同的对象
    // 可能产生不同的 key。当前用例可接受，但如需严格去重应改用
    // 规范化序列化器。
    })
  }

  if (isProcessedMessageUpdatedSummary(args.summary)) {
    if (typeof args.summary.info?.id !== "string" || args.summary.info.id.trim().length === 0) {
      return true
    }
    return rememberMessageSnapshot({
      state: args.state,
      messageID: args.summary.info.id,
      summaryKey: JSON.stringify(args.summary.info),
      sessionID: args.summary.sessionID ?? args.summary.info.sessionID,
    })
  }

  return true
}
