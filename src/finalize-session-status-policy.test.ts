/**
 * Tests for finalize cancellation under session-status churn.
 * session.status 抖动下 finalize 取消策略测试。
 *
 * This file belongs to the orchestration support test layer. It protects the
 * real-world race where a stable assistant answer is followed by a transient
 * `busy` event that must not swallow the PostAction finalize timer.
 * 这个文件属于编排支撑测试层，
 * 用来保护一个真实竞态：assistant 回答已经稳定后，
 * 又跟着出现一次瞬时 `busy`，此时不能把 PostAction finalize 定时器吞掉。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { shouldCancelFinalizeOnSessionStatus } from "./finalize-session-status-policy.js"

test("should cancel finalize when the session turns busy before a stable answer exists", () => {
  assert.equal(
    shouldCancelFinalizeOnSessionStatus({
      statusType: "busy",
      activeTurn: {
        hasStableAssistant: false,
      },
    }),
    true,
  )
})

test("should keep finalize when the session turns busy after a stable answer exists", () => {
  assert.equal(
    shouldCancelFinalizeOnSessionStatus({
      statusType: "busy",
      activeTurn: {
        hasStableAssistant: true,
      },
    }),
    false,
  )
})

test("should never cancel finalize for idle or missing status", () => {
  assert.equal(
    shouldCancelFinalizeOnSessionStatus({
      statusType: "idle",
      activeTurn: {
        hasStableAssistant: false,
      },
    }),
    false,
  )

  assert.equal(
    shouldCancelFinalizeOnSessionStatus({
      statusType: undefined,
      activeTurn: {
        hasStableAssistant: false,
      },
    }),
    false,
  )
})
