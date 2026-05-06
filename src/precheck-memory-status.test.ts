/**
 * Tests for PreCheck memory-status presentation helpers.
 * PreCheck 记忆状态展示辅助逻辑测试。
 *
 * This file verifies that user-facing recall status follows the memory lines
 * actually injected into the current turn, instead of only following the raw
 * retrieval verdict returned by PreCheck.
 * 这个文件用于验证：用户可见的回顾状态应跟随本轮实际注入的记忆行，
 * 而不能只跟随 PreCheck 返回的原始检索判定。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { derivePresentedPreCheckMemoryResult } from "./precheck-memory-status.js"

test("derivePresentedPreCheckMemoryResult keeps the raw result when nothing was injected", () => {
  const result = derivePresentedPreCheckMemoryResult(
    {
      inject: false,
      reason: "pre-check-no-inject",
      lines: [],
    },
    [],
  )

  assert.deepEqual(result, {
    inject: false,
    reason: "pre-check-no-inject",
    lines: [],
  })
})

test("derivePresentedPreCheckMemoryResult clears raw injected hits when the current turn ended up with no injected lines", () => {
  const result = derivePresentedPreCheckMemoryResult(
    {
      inject: true,
      reason: "pre-check-context-returned",
      lines: ["Memory A", "Memory B"],
    },
    [],
  )

  assert.deepEqual(result, {
    inject: false,
    reason: "pre-check-context-returned",
    lines: [],
  })
})

test("derivePresentedPreCheckMemoryResult hides carry-over memory from user-visible success counts", () => {
  const result = derivePresentedPreCheckMemoryResult(
    {
      inject: false,
      reason: "pre-check-no-inject",
      lines: [],
    },
    ["Memory A", "Memory B"],
  )

  assert.deepEqual(result, {
    inject: false,
    reason: "pre-check-no-inject",
    lines: [],
  })
})

test("derivePresentedPreCheckMemoryResult de-duplicates and trims final injected lines", () => {
  const result = derivePresentedPreCheckMemoryResult(
    {
      inject: true,
      reason: "pre-check-context-returned",
      lines: ["Current hit"],
    },
    ["  Current hit  ", "Carry hit", "Carry hit"],
  )

  assert.deepEqual(result, {
    inject: true,
    reason: "pre-check-context-returned",
    lines: ["Current hit", "Carry hit"],
  })
})

test("derivePresentedPreCheckMemoryResult only reports fresh precheck hits instead of hidden carry-over lines", () => {
  const result = derivePresentedPreCheckMemoryResult(
    {
      inject: true,
      reason: "pre-check-context-returned",
      lines: ["Fresh A"],
    },
    ["Fresh A"],
  )

  assert.deepEqual(result, {
    inject: true,
    reason: "pre-check-context-returned",
    lines: ["Fresh A"],
  })
})
