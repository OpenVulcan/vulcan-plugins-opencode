import { tVmmShared, type VmmLanguage } from "./vmm-language.js"

/**
 * PreCheck context-line normalization helpers.
 * PreCheck 上下文条目归一化辅助逻辑。
 *
 * This file belongs to the transport normalization support layer. It turns the
 * backend's `context_items` response payload into the stable line-array shape
 * used by both visible and implicit memory injection flows.
 * 这个文件属于传输归一化支撑层，
 * 负责把后端返回的 `context_items` 载荷收敛成
 * 显式注入与隐式注入共用的稳定行数组结构。
 */

/**
 * One minimal structured context item returned by PreCheck.
 * PreCheck 返回的一条最小结构化上下文项。
 *
 * The helper intentionally depends only on the fields needed for text
 * injection, so the normalization stays reusable across transport and plugin
 * layers without pulling in the whole gRPC type surface.
 * 这里刻意只依赖文本注入真正需要的字段，
 * 这样归一化逻辑就能在传输层和插件层复用，而不必耦合整套 gRPC 类型面。
 */
export type PreCheckContextLineItem = {
  text?: string
  score?: number
  turn_id?: string | number
  has_dialogue?: boolean
  created_datetime?: string
}

/**
 * One minimal PreCheck response shape consumed by the line extractor.
 * 行提取器消费的一份最小 PreCheck 响应结构。
 *
 * The plugin now treats structured `context_items` as the only supported
 * PreCheck recall payload.
 * 插件现在把结构化 `context_items` 视为唯一受支持的
 * PreCheck 召回载荷。
 */
export type PreCheckContextLinePayload = {
  context_items?: PreCheckContextLineItem[]
}

/**
 * Normalize one raw text block into one stable multi-line payload.
 * 把一段原始文本规范化成稳定的多行载荷。
 */
function normalizePreCheckContextText(value: string | undefined) {
  return typeof value === "string" ? value.replace(/\r\n/g, "\n").trim() : ""
}

/**
 * Collapse one recalled text block into a single injected line body.
 * 把一段召回文本折叠成单行注入正文。
 *
 * The backend can return multi-line summaries or detail snippets, but the
 * injected marker format is designed as one bracketed header plus one compact
 * content payload per recalled item.
 * 后端可能返回多行摘要或细节片段，
 * 但当前注入标记格式被设计成“一个方括号头部 + 一段紧凑正文”的单条结构。
 */
function collapsePreCheckContextBody(value: string | undefined) {
  return normalizePreCheckContextText(value)
    .split("\n")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join(" ")
}

/**
 * Format one source score into the compact injected marker segment.
 * 把一次来源分数格式化成紧凑注入标记片段。
 *
 * We keep three decimals so the injected text remains compact and visually
 * stable, while still preserving enough recall-ranking signal for debugging.
 * 这里固定保留三位小数，
 * 既能让注入文本保持紧凑稳定，也能为排障保留足够的召回排序信号。
 */
function formatPreCheckSourceScore(score: number | undefined) {
  return Number.isFinite(score) ? Number(score).toFixed(3) : "0.000"
}

/**
 * Normalize one raw turn id into a stable positive-integer string.
 * 把原始 turn id 规范化为稳定的正整数字符串。
 *
 * The backend emits `uint64`, but transport and tests can still surface either
 * numbers or strings. Centralizing the normalization keeps the later
 * traceability decision consistent across both runtime payloads and fixtures.
 * 后端发的是 `uint64`，但传输层和测试里仍可能出现 number 或 string，
 * 因此这里集中做一次规范化，保证后续“是否可追溯”的判断在运行时与测试夹具里保持一致。
 */
function normalizePreCheckTurnIDValue(turnID: string | number | undefined) {
  if (typeof turnID === "number" && Number.isFinite(turnID) && turnID > 0) {
    return String(Math.trunc(turnID))
  }
  const normalized = typeof turnID === "string" ? turnID.trim() : ""
  return normalized && /^[1-9][0-9]*$/.test(normalized) ? normalized : ""
}

/**
 * Format one turn marker into the injected header segment.
 * 把一条 turn 标记格式化成注入头部片段。
 *
 * `has_dialogue` is the newest backend-owned capability flag. When it is
 * explicitly `false`, the plugin must not expose a `TURN_ID` marker even if a
 * stale numeric value is still present, otherwise the model will be told to
 * query an unusable turn detail path.
 * `has_dialogue` 是后端新增的权威能力标记。
 * 当它被显式标成 `false` 时，即使载荷里还残留数值型 `turn_id`，
 * 插件也不能继续暴露 `TURN_ID`，否则会误导模型去查询不可用的详情路径。
 */
function formatPreCheckTurnLabel(item: Pick<PreCheckContextLineItem, "turn_id" | "has_dialogue">) {
  if (item.has_dialogue === false) {
    return "NOTURN"
  }

  const normalizedTurnID = normalizePreCheckTurnIDValue(item.turn_id)
  return normalizedTurnID ? `TURN_ID:${normalizedTurnID}` : "NOTURN"
}

/**
 * Format one backend-owned creation time into an optional injected marker segment.
 * 把后端拥有的创建时间格式化成可选注入标记片段。
 *
 * The backend now emits one display-ready datetime string, so the plugin should
 * pass it through directly instead of rebuilding time from transport integers.
 * 后端现在直接返回可展示的 datetime 字符串，
 * 因此插件只透传该字段，不再从传输层整数重新拼装时间。
 */
function formatPreCheckCreatedTime(createdDatetime: string | undefined) {
  const normalized = typeof createdDatetime === "string" ? createdDatetime.trim() : ""
  return normalized ? `|TIME:${normalized}` : ""
}

/**
 * Format one structured PreCheck item into the injected line format.
 * 把单条结构化 PreCheck 项格式化成注入行格式。
 *
 * The backend-owned `text` field is the supported recalled body. If it is
 * empty, the item is ignored.
 * 后端提供的 `text` 现在是唯一受支持的召回正文。
 * 如果它为空，这里会直接忽略该条。
 */
export function formatPreCheckContextLine(item: PreCheckContextLineItem) {
  const text = collapsePreCheckContextBody(item.text)
  if (!text) return ""

  return `[${
    formatPreCheckTurnLabel(item)
  }|SOURCE:${formatPreCheckSourceScore(item.score)}${formatPreCheckCreatedTime(item.created_datetime)}]${text}`
}

/**
 * Build the exact implicit-injection wrapper required by the current VMM flow.
 * 构建当前 VMM 流程要求的精确隐式注入包裹格式。
 *
 * The wrapper explicitly tells the model that these items come from historical
 * analysis, are advisory rather than guaranteed truth, and should be traced
 * through tools when one `TURN_ID` exists.
 * 这个包裹会明确告知模型：这些内容来自历史分析，
 * 只能作为参考而非绝对事实；若存在 `TURN_ID`，应通过 tools 继续回查。
 *
 * After the injection block, a "FINAL CHECK" reminder is appended to reinforce
 * the citation rules whenever memory data is actually present.
 * 注入块之后会追加"最终检查"提醒，
 * 在存在实际记忆数据时强化引用规则意识。
 */
export function buildImplicitPreCheckInjectionBlock(
  memoryLines: readonly string[],
  language: VmmLanguage | undefined,
) {
  const normalizedLines = memoryLines
    .map((line) => normalizePreCheckContextText(line))
    .filter((line): line is string => line.length > 0)

  const hasData = normalizedLines.length > 0
  const isZhCn = language === "zh-CN"

  const finalCheckText = isZhCn
    ? "## ⚠️ 最终检查：VMM 引用规则适用\n在输出任何使用了上方记忆数据的内容前，必须执行以下检查：\n- 使用了记忆数据？→ 必须套用引用格式\n- 部分使用 → 在引用位置使用 ⏩VMM:{ID}...⏪\n- 完整使用 → 在文末添加 💠VMM🧠...💠\n- 未使用记忆 → 不添加任何引用符号\n这是强制要求。每次回答前务必检查。"
    : "## ⚠️ FINAL CHECK: VMM Citation Rules Apply\nBefore outputting ANY response using the memory data above, you MUST check:\n- Did you use memory data? → Apply citation format\n- Partial use → Use ⏩VMM:{ID}...⏪ at the citation point\n- Full use → Add 💠VMM🧠...💠 at the end\n- No memory used → NO citation symbols\nThis is MANDATORY. Check BEFORE every response."

  const parts = [
    "<VULCAN_MEMORY_MESH_INJECTS>",
    tVmmShared(language, "implicit_memory_inject_notice"),
    ...normalizedLines,
    "</VULCAN_MEMORY_MESH_INJECTS>",
  ]

  if (hasData && finalCheckText) {
    parts.push("", finalCheckText)
  }

  return parts.join("\n")
}

/**
 * Extract stable injected memory lines from one PreCheck response payload.
 * 从一份 PreCheck 响应里提取稳定的可注入记忆行。
 *
 * The plugin no longer accepts merged compatibility text here. Every recalled
 * item must come from `context_items` so the injected result stays aligned
 * with the current VMM structured contract.
 * 这里不再接受合并文本兼容载荷。
 * 每条召回内容都必须来自 `context_items`，这样注入结果才能和当前
 * VMM 的结构化契约保持一致。
 */
export function extractPreCheckContextLines(response: PreCheckContextLinePayload) {
  const items = Array.isArray(response.context_items) ? response.context_items : []
  return items
    .map((item) => formatPreCheckContextLine(item))
    .filter((line): line is string => typeof line === "string" && line.length > 0)
}
