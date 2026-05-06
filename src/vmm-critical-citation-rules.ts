import { tVmmShared, type VmmLanguage } from "./vmm-language.js"

/**
 * Fixed VMM citation-rule system prompt helpers.
 * 固定 VMM 引用规则 system prompt 辅助模块。
 *
 * This file belongs to the prompt-orchestration support layer. The main
 * plugin runtime uses it to keep one non-optional citation policy block pinned
 * to the top of every composed hidden system prompt.
 * 这个文件属于 prompt 编排支撑层。
 * 主插件运行时会复用这里的逻辑，把一段不可缺省的引用规则区块固定钉在
 * 每次隐藏 system prompt 组合结果的最顶部。
 */

/**
 * Render one localized fixed system block that teaches the model how to cite VMM memory.
 * 渲染一段本地化的固定 system 区块，用来约束模型如何引用 VMM 记忆。
 *
 * The explanatory text follows the current runtime language, but the required
 * output literals stay fixed by rule: Chinese answers must use the Chinese
 * markers, while every non-Chinese answer must use the English markers.
 * 说明文本会跟随当前运行时语言切换，
 * 但规则要求的输出字面量保持固定：中文回答必须使用中文标记，
 * 非中文回答则统一使用英文标记。
 *
 * A "FINAL CHECK" reminder is appended after the injected memory data block
 * (see buildImplicitPreCheckInjectionBlock in precheck-context-lines.ts),
 * not here. The reminder sits closer to the actual recalled content where
 * it can more effectively prompt the model before composing its response.
 * "最终检查"提醒不在这里输出，而是追加在注入记忆数据块之后
 *（见 precheck-context-lines.ts 中的 buildImplicitPreCheckInjectionBlock），
 * 放在离召回内容最近的位置，能在模型组织回答前起到更有效的提醒作用。
 */
export function renderVmmCriticalCitationRulesSystemBlock(language: VmmLanguage | undefined) {
  return [
    "<VMM_CRITICAL_CITATION_RULES>",
    tVmmShared(language, "critical_citation_rules_prompt"),
    "</VMM_CRITICAL_CITATION_RULES>",
  ].join("\n")
}

/**
 * Escape one string so it can be interpolated into a RegExp safely.
 * 对一段字符串做 RegExp 安全转义。
 */
function escapeForRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * Normalize one system prompt text into the repo's stable newline format.
 * 把一段 system prompt 文本规范化成仓库内部稳定的换行格式。
 *
 * The hidden system prompt is assembled from multiple sources. Normalizing
 * line endings before comparison keeps the idempotency check stable across
 * Windows-authored strings and runtime-generated snippets.
 * 隐藏 system prompt 会由多个来源共同拼装，
 * 因此在比较前统一换行格式，才能让 Windows 写入的文本和运行时生成片段
 * 在幂等判断上保持稳定一致。
 */
function normalizeSystemPromptText(value: string | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim()
}

/**
 * Keep the fixed VMM citation-rule block at the top of one composed system prompt.
 * 保证固定 VMM 引用规则区块始终位于一段组合后 system prompt 的最顶部。
 *
 * The helper is intentionally idempotent: if the block already exists, it is
 * removed from lower positions and reinserted only once at the very top so
 * later append-style composition cannot create duplicates or reorder drift.
 * 这个 helper 会刻意保持幂等：
 * 如果区块已经存在，它会先从较低位置移除，再只在最顶部重新插入一次，
 * 从而避免后续“追加式”组合产生重复块或顺序漂移。
 */
export function ensureVmmCriticalCitationRulesSystemAtTop(
  existingSystem: string | undefined,
  language: VmmLanguage | undefined,
) {
  const fixedBlock = normalizeSystemPromptText(renderVmmCriticalCitationRulesSystemBlock(language))
  const normalizedExisting = normalizeSystemPromptText(existingSystem)
  if (!normalizedExisting) {
    return fixedBlock
  }

  const blockPattern = new RegExp(
    `(?:^|\\n\\n?)${escapeForRegExp(fixedBlock)}(?=\\n\\n?|$)`,
    "g",
  )
  const remainder = normalizedExisting
    .replace(blockPattern, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

  return remainder ? `${fixedBlock}\n\n${remainder}` : fixedBlock
}
