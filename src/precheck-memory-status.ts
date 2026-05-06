/**
 * PreCheck memory-status presentation helpers.
 * PreCheck 记忆状态展示辅助逻辑。
 *
 * This file belongs to the plugin presentation/orchestration support layer.
 * It keeps the user-facing recall status aligned with the memory lines that
 * were actually injected into the current turn, while still preserving the
 * raw transport reason for warning and failure decisions.
 * 这个文件属于插件展示与编排支撑层，
 * 用来让用户可见的 recall 状态与“本轮实际注入的记忆行”保持一致，
 * 同时保留原始传输原因，供告警和失败分支继续判断。
 */

/**
 * One normalized raw PreCheck result consumed by the presentation adapter.
 * 展示适配层消费的一条标准化原始 PreCheck 结果。
 *
 * The transport layer already collapses backend response shapes into this
 * small object. The presentation layer should not guess backend fields again;
 * it only decides how to describe the final injected outcome to users.
 * 传输层已经把后端响应收敛成这份小对象；
 * 展示层不应再次猜测后端字段，而只负责决定如何把最终注入结果描述给用户。
 */
export type PresentedPreCheckMemoryResult = {
  inject: boolean
  reason: string
  lines: string[]
}

/**
 * Derive the user-facing recall result from the raw retrieval result plus the
 * final memory lines actually injected into the turn.
 * 基于原始检索结果和本轮最终实际注入的记忆行，推导用户可见的回顾结果。
 *
 * Implicit mode can merge carried memory from previous turns with the current
 * retrieval result. When that happens, using only the raw PreCheck verdict can
 * incorrectly report "no memory" even though the current turn still received
 * memory lines. The user, however, only needs to know whether the current
 * PreCheck round actually recalled and injected fresh items. Hidden carry-over
 * memory should stay hidden in the notice layer.
 * 但对用户来说，提示层只需要表达“本轮 PreCheck 是否真正新回顾并注入了条目”。
 * 隐式保温里的 carry-over 记忆应继续保持隐藏，不再进入数量提示。
 *
 * If prompt rewriting/system injection failed, the presentation layer must
 * suppress the success notice even when the transport originally reported a
 * hit. The original reason string still stays intact for warning decisions.
 * 如果 prompt 改写或 system 注入失败，即使传输层原本报告命中，
 * 展示层也必须压住成功提示。原始 reason 仍然保留给告警分支使用。
 */
export function derivePresentedPreCheckMemoryResult(
  rawResult: PresentedPreCheckMemoryResult,
  injectedLines: readonly string[],
): PresentedPreCheckMemoryResult {
  const finalLines = [...new Set(
    injectedLines
      .filter((line): line is string => typeof line === "string")
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  )]

  if (finalLines.length === 0) {
    return {
      inject: false,
      reason: rawResult.reason,
      lines: [],
    }
  }

  /**
   * Only fresh PreCheck hits are allowed to surface as a visible success.
   * 只有本轮 PreCheck 的新命中，才允许进入用户可见成功提示。
   *
   * Hidden carry-over memory can still be injected into the runtime context,
   * but the user explicitly asked not to see those hidden turn counts.
   * 隐式 carry-over 记忆仍可继续注入到运行时上下文里，
   * 但用户已经明确要求不要把这些隐藏轮数展示出来。
   */
  if (!rawResult.inject) {
    return {
      inject: false,
      reason: rawResult.reason,
      lines: [],
    }
  }

  return {
    inject: true,
    reason: rawResult.reason,
    lines: finalLines,
  }
}
