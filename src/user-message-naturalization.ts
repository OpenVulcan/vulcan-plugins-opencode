/**
 * User-message naturalization helpers for text and file parts.
 * 面向文本与文件 part 的用户消息自然语言归一化辅助模块。
 *
 * This file belongs to the transport-normalization support layer. `plugin.ts`
 * uses it before turn extraction, memory precheck, and finalize replay so
 * file attachments can become stable natural-language hints instead of being
 * silently discarded as "empty" user input.
 * 这个文件属于传输归一化支撑层。`plugin.ts` 会在 turn 提取、记忆预检
 * 和 finalize 回放之前复用这里的能力，把文件附件转换成稳定的自然语言
 * 提示，避免它们被静默判定为"空的用户输入"。
 */

/**
 * Attachment-description budget used by message naturalization.
 * 消息自然语言归一化使用的附件描述预算。
 *
 * We intentionally cap how many attachment sentences get appended to one turn
 * so attachment-heavy prompts still keep the VMM recall/query text concise.
 * 这里刻意限制单轮最多追加多少条附件说明，
 * 这样即便一条消息里带了很多附件，VMM 的召回/写回文本也不会被描述性噪音撑爆。
 */
const MAX_VMM_ATTACHMENT_DESCRIPTION_COUNT = 6

/**
 * Stable naturalized view of one user message.
 * 一条用户消息的稳定自然语言视图。
 *
 * `textParts` preserves explicit text input, while `attachmentSummaries`
 * describes non-text parts in natural language so later pipelines can reason
 * about PDFs, images, and other files with one shared combined string.
 * `textParts` 保留用户显式输入的文本；
 * `attachmentSummaries` 则把非文本 part 转成自然语言说明，
 * 让后续链路可以通过一份统一的 combinedText 理解 PDF、图片及其他附件。
 */
export type VmmNaturalizedUserMessage = {
  textParts: string[]
  attachmentSummaries: string[]
  combinedText: string
}

/**
 * Normalize one free-form text fragment before it joins the combined message.
 * 在文本片段进入组合消息之前先做一次标准化。
 *
 * The helper preserves the original wording but removes platform-specific line
 * ending noise and surrounding blanks, which keeps later turn comparison
 * stable without rewriting the user's text itself.
 * 这个辅助函数会尽量保留原始措辞，只去掉平台相关换行噪音和首尾空白，
 * 从而在不改写用户原意的前提下，让后续 turn 对比更稳定。
 */
function normalizePartText(value: string | undefined) {
  return (value ?? "").replace(/\r\n/g, "\n").trim()
}

/**
 * Resolve the most useful display name for one file part.
 * 为单个文件 part 解析最有用的展示名。
 *
 * Newer OpenCode builds may provide `filename`, source paths, MCP resource
 * URIs, or only a URL. The naturalized sentence should prefer the most human
 * readable identifier available so memory logs remain understandable.
 * 较新的 OpenCode 版本可能提供 `filename`、source path、MCP resource URI，
 * 也可能只留下一个 URL。这里会优先挑选最适合人读的标识，
 * 这样记忆链路里的附件说明才不会退化成难懂的匿名对象。
 */
function resolveAttachmentDisplayName(part: Record<string, unknown>) {
  const filename = typeof part["filename"] === "string" ? part["filename"].trim() : ""
  if (filename) return filename

  const source = part["source"]
  if (source && typeof source === "object") {
    const sourceRecord = source as Record<string, unknown>
    if (typeof sourceRecord["path"] === "string" && sourceRecord["path"].trim()) {
      return sourceRecord["path"].trim()
    }
    if (typeof sourceRecord["uri"] === "string" && sourceRecord["uri"].trim()) {
      return sourceRecord["uri"].trim()
    }
  }

  const url = typeof part["url"] === "string" ? part["url"].trim() : ""
  if (!url) return undefined

  if (url.startsWith("file://")) {
    const tail = url.split("/").at(-1)?.trim()
    if (tail) return tail
  }

  if (url.startsWith("data:")) {
    return "embedded file"
  }

  return url
}

/**
 * Convert one MIME type into a stable human-readable attachment kind.
 * 把 MIME 类型转换成稳定的人类可读附件类别。
 *
 * The summary only needs enough specificity for VMM recall and writeback, so
 * we keep a small curated set of categories and fall back to a generic file
 * label when the MIME type does not carry useful semantics.
 * 这里的目标只是给 VMM 召回与写回提供足够的语义区分，
 * 因此只维护一小组高价值类别；如果 MIME 本身没有太多信息，
 * 就回退到通用 file 标签。
 */
function describeAttachmentKind(mime: string | undefined) {
  if (!mime) return "file"
  if (mime === "application/pdf") return "PDF file"
  if (mime === "application/x-directory") return "directory"
  if (mime === "text/plain") return "text file"
  // Match "/json" or "+json" suffixes to avoid false positives like "x-json-patch+yaml".
  // 匹配 "/json" 或 "+json" 后缀，避免误匹配如 "x-json-patch+yaml" 等类型。
  if (mime.includes("/json") || mime.endsWith("+json")) return "JSON file"
  if (mime.startsWith("image/")) return "image file"
  if (mime.startsWith("audio/")) return "audio file"
  if (mime.startsWith("video/")) return "video file"
  return "file"
}

/**
 * Describe the source metadata carried by one file part.
 * 描述单个文件 part 携带的 source 元数据。
 *
 * Source metadata is often the only place where the workspace path, symbol
 * name, or MCP resource origin survives. Turning it into short sentences keeps
 * the later VMM reasoning chain aware of where the attachment came from.
 * source 元数据里往往才有工作区路径、符号名或 MCP 资源来源。
 * 把这些信息转成短句后，后续 VMM 推理链才能知道附件究竟来自哪里。
 */
function describeAttachmentSource(part: Record<string, unknown>) {
  const source = part["source"]
  if (!source || typeof source !== "object") return undefined

  const sourceRecord = source as Record<string, unknown>
  if (sourceRecord["type"] === "file" && typeof sourceRecord["path"] === "string" && sourceRecord["path"].trim()) {
    return `Its workspace path is "${sourceRecord["path"].trim()}".`
  }

  if (sourceRecord["type"] === "symbol") {
    const symbolName = typeof sourceRecord["name"] === "string" ? sourceRecord["name"].trim() : ""
    const symbolPath = typeof sourceRecord["path"] === "string" ? sourceRecord["path"].trim() : ""
    if (symbolName && symbolPath) {
      return `The attachment points to symbol "${symbolName}" in "${symbolPath}".`
    }
    if (symbolPath) {
      return `The attachment points to "${symbolPath}".`
    }
  }

  if (sourceRecord["type"] === "resource") {
    const clientName = typeof sourceRecord["clientName"] === "string" ? sourceRecord["clientName"].trim() : ""
    const uri = typeof sourceRecord["uri"] === "string" ? sourceRecord["uri"].trim() : ""
    if (clientName && uri) {
      return `The attachment comes from MCP resource "${uri}" on client "${clientName}".`
    }
    if (uri) {
      return `The attachment comes from MCP resource "${uri}".`
    }
  }

  return undefined
}

/**
 * Build one natural-language attachment sentence for a file part.
 * 为文件 part 构造一条自然语言附件说明。
 *
 * The sentence favors readable, retrieval-friendly wording over raw JSON-like
 * dumps so the rest of the plugin can treat file-only messages as meaningful
 * user intent instead of opaque attachment metadata.
 * 这里优先生成便于检索和阅读的自然语言句子，而不是原样倾倒 JSON 元数据，
 * 这样插件其余链路才能把"只有附件的消息"视为有意义的用户输入，而不是
 * 一团不透明的附件元数据。
 */
function describeAttachmentPart(part: Record<string, unknown>) {
  const mime = typeof part["mime"] === "string" ? part["mime"].trim() : undefined
  const kind = describeAttachmentKind(mime)
  const name = resolveAttachmentDisplayName(part)
  const primary = name
    ? `The user attached a ${kind} named "${name}".`
    : `The user attached a ${kind}.`
  const source = describeAttachmentSource(part)
  const includeMime = mime && kind === "file" ? `Its media type is "${mime}".` : undefined
  return [primary, source, includeMime].filter((item): item is string => Boolean(item)).join(" ")
}

/**
 * Naturalize one raw OpenCode part array into combined user-facing text.
 * 把一组原始 OpenCode part 归一化成可复用的组合文本。
 *
 * Text parts stay in their original order. File parts are converted into
 * natural-language summaries and appended after the text so turn extraction,
 * precheck recall, and finalize replay can all reuse the same stable string.
 * 文本 part 会保留原始顺序；文件 part 则会被转换成自然语言摘要并追加在后面。
 * 这样 turn 提取、预检召回以及 finalize 回放都能复用同一份稳定字符串。
 */
export function naturalizeUserMessageParts(parts: unknown): VmmNaturalizedUserMessage {
  if (!Array.isArray(parts)) {
    return {
      textParts: [],
      attachmentSummaries: [],
      combinedText: "",
    }
  }

  const textParts: string[] = []
  const attachmentSummaries: string[] = []
  let filePartCount = 0

  /**
   * Text parts and file parts serve different downstream needs, so we collect
   * them separately first and join them only at the end.
   * 文本 part 和文件 part 在后续链路里承担的职责不同，
   * 因此这里先分别收集，最后再统一拼接。
   */
  for (const part of parts) {
    if (!part || typeof part !== "object") continue
    const record = part as Record<string, unknown>
    if (record["type"] === "text") {
      const text = normalizePartText(typeof record["text"] === "string" ? record["text"] : undefined)
      if (text) textParts.push(text)
      continue
    }

    if (record["type"] === "file") {
      filePartCount++
      if (attachmentSummaries.length < MAX_VMM_ATTACHMENT_DESCRIPTION_COUNT) {
        attachmentSummaries.push(describeAttachmentPart(record))
      }
      continue
    }
  }

  /**
   * When one prompt carries more attachments than our summary budget, we keep
   * the tail loss explicit so recall/writeback still knows the prompt included
   * additional files without expanding into one sentence per attachment.
   * 当单条提示附带的附件超过预算时，这里会显式补上一条"还有更多文件"，
   * 让召回/写回知道这轮确实还有额外附件，但又不会为每个附件都扩成一句话。
   */
  const attachmentOverflow = filePartCount - attachmentSummaries.length

  if (attachmentOverflow > 0) {
    attachmentSummaries.push(`The user attached ${attachmentOverflow} more file(s).`)
  }

  const combinedText = [...textParts, ...attachmentSummaries].join("\n").trim()
  return {
    textParts,
    attachmentSummaries,
    combinedText,
  }
}
