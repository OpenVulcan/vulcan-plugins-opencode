/**
 * Tests for PreCheck context-line normalization helpers.
 * PreCheck 上下文条目归一化辅助逻辑测试。
 *
 * These tests focus on the current structured-only PreCheck contract:
 * the plugin must consume `context_items` directly.
 * 这些测试聚焦于当前“仅结构化”的 PreCheck 契约：
 * 插件必须直接消费 `context_items`。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  buildImplicitPreCheckInjectionBlock,
  extractPreCheckContextLines,
  formatPreCheckContextLine,
} from "./precheck-context-lines.js"

test("extractPreCheckContextLines formats one structured line per context item", () => {
  const result = extractPreCheckContextLines({
    context_items: [
      {
        text: "First recalled memory",
        score: 0.9983666748075238,
        turn_id: "123",
        created_datetime: "2026-05-02 14:20:00",
      },
      {
        text: "Second recalled memory",
        score: 0.7983182577889307,
        turn_id: "456",
      },
    ],
  })

  assert.deepEqual(result, [
    "[TURN_ID:123|SOURCE:0.998|TIME:2026-05-02 14:20:00]First recalled memory",
    "[TURN_ID:456|SOURCE:0.798]Second recalled memory",
  ])
})

test("extractPreCheckContextLines returns an empty list when no structured items exist", () => {
  const result = extractPreCheckContextLines({
    context_items: [],
  })

  assert.deepEqual(result, [])
})

test("extractPreCheckContextLines drops items whose structured text is missing", () => {
  const result = extractPreCheckContextLines({
    context_items: [
      {
        score: 0.5,
        turn_id: 0,
      },
    ],
  })

  assert.deepEqual(result, [])
})

test("formatPreCheckContextLine uses NOTURN when turn_id is absent or invalid", () => {
  assert.equal(
    formatPreCheckContextLine({
      text: "Detached memory",
      score: 0.25,
      turn_id: "0",
    }),
    "[NOTURN|SOURCE:0.250]Detached memory",
  )
})

test("formatPreCheckContextLine respects has_dialogue=false even when a turn id exists", () => {
  assert.equal(
    formatPreCheckContextLine({
      text: "Detached memory with stale turn id",
      score: 0.25,
      turn_id: "123",
      has_dialogue: false,
    }),
    "[NOTURN|SOURCE:0.250]Detached memory with stale turn id",
  )
})

test("buildImplicitPreCheckInjectionBlock renders the wrapper plus Chinese final check", () => {
  const result = buildImplicitPreCheckInjectionBlock([
    "[TURN_ID:123|SOURCE:0.998]First recalled memory",
    "[NOTURN|SOURCE:0.500]Detached memory",
  ], "zh-CN")

  assert.equal(
    result,
    [
      "<VULCAN_MEMORY_MESH_INJECTS>",
      "##提示：以下内容来自历史数据分析，仅供参考，不保证完全准确。如需查看原始对话，请使用 TOOLS 查询对应的 TURN_ID。",
      "[TURN_ID:123|SOURCE:0.998]First recalled memory",
      "[NOTURN|SOURCE:0.500]Detached memory",
      "</VULCAN_MEMORY_MESH_INJECTS>",
      "",
      "## ⚠️ 最终检查：VMM 引用规则适用",
      "在输出任何使用了上方记忆数据的内容前，必须执行以下检查：",
      "- 使用了记忆数据？→ 必须套用引用格式",
      "- 部分使用 → 在引用位置使用 ⏩VMM:{ID}...⏪",
      "- 完整使用 → 在文末添加 💠VMM🧠...💠",
      "- 未使用记忆 → 不添加任何引用符号",
      "这是强制要求。每次回答前务必检查。",
    ].join("\n"),
  )
})

test("buildImplicitPreCheckInjectionBlock localizes the notice and final check", () => {
  const result = buildImplicitPreCheckInjectionBlock(
    ["[TURN_ID:123|SOURCE:0.998]First recalled memory"],
    "en",
  )

  assert.equal(
    result,
    [
      "<VULCAN_MEMORY_MESH_INJECTS>",
      "##Notice: The following items were inferred from historical data analysis. Treat them as reference only, not guaranteed facts. When a TURN_ID is present, use the tools to inspect the original dialogue.",
      "[TURN_ID:123|SOURCE:0.998]First recalled memory",
      "</VULCAN_MEMORY_MESH_INJECTS>",
      "",
      "## ⚠️ FINAL CHECK: VMM Citation Rules Apply",
      "Before outputting ANY response using the memory data above, you MUST check:",
      "- Did you use memory data? → Apply citation format",
      "- Partial use → Use ⏩VMM:{ID}...⏪ at the citation point",
      "- Full use → Add 💠VMM🧠...💠 at the end",
      "- No memory used → NO citation symbols",
      "This is MANDATORY. Check BEFORE every response.",
    ].join("\n"),
  )
})
