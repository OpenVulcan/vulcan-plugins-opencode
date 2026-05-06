/**
 * Tests for user-message naturalization across text and file parts.
 * 面向文本与文件 part 的用户消息自然语言归一化测试。
 *
 * This file belongs to the verification layer. It protects the new attachment
 * awareness used by turn extraction and memory orchestration so file-only
 * prompts no longer collapse into empty user input.
 * 这个文件属于验证层，用来保护新的附件感知能力，
 * 确保 turn 提取和记忆编排在遇到纯文件提示时不再坍缩为空输入。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { naturalizeUserMessageParts } from "./user-message-naturalization.js"

test("naturalizeUserMessageParts keeps explicit text unchanged", () => {
  const result = naturalizeUserMessageParts([
    {
      type: "text",
      text: "Please review the attached spec.",
    },
  ])

  assert.deepEqual(result.textParts, ["Please review the attached spec."])
  assert.deepEqual(result.attachmentSummaries, [])
  assert.equal(result.combinedText, "Please review the attached spec.")
})

test("naturalizeUserMessageParts converts pdf attachments into natural-language sentences", () => {
  const result = naturalizeUserMessageParts([
    {
      type: "file",
      mime: "application/pdf",
      filename: "architecture-spec.pdf",
      source: {
        type: "file",
        path: "docs/architecture-spec.pdf",
      },
    },
  ])

  assert.equal(result.textParts.length, 0)
  assert.equal(result.attachmentSummaries.length, 1)
  assert.match(result.attachmentSummaries[0] ?? "", /PDF file named "architecture-spec\.pdf"/)
  assert.match(result.attachmentSummaries[0] ?? "", /workspace path is "docs\/architecture-spec\.pdf"/)
  assert.match(result.combinedText, /attached a PDF file/)
})

test("naturalizeUserMessageParts preserves file origins and overflow hints", () => {
  const result = naturalizeUserMessageParts([
    {
      type: "file",
      mime: "application/octet-stream",
      source: {
        type: "symbol",
        path: "src/plugin.ts",
        name: "handleAttachment",
      },
    },
    {
      type: "file",
      mime: "image/png",
      filename: "screen.png",
    },
    {
      type: "file",
      mime: "application/json",
      filename: "payload.json",
    },
    {
      type: "file",
      mime: "application/pdf",
      filename: "a.pdf",
    },
    {
      type: "file",
      mime: "application/pdf",
      filename: "b.pdf",
    },
    {
      type: "file",
      mime: "application/pdf",
      filename: "c.pdf",
    },
    {
      type: "file",
      mime: "application/pdf",
      filename: "d.pdf",
    },
  ])

  assert.match(result.attachmentSummaries[0] ?? "", /symbol "handleAttachment" in "src\/plugin\.ts"/)
  assert.match(result.attachmentSummaries[0] ?? "", /media type is "application\/octet-stream"/)
  assert.equal(result.attachmentSummaries.at(-1), "The user attached 1 more file(s).")
})
