/**
 * Tests for the processed-event dedupe gate.
 * 已处理事件去重闸门测试。
 *
 * These tests verify that dedupe only advances when one event has already
 * cleared higher-level root-session and business-scope eligibility checks.
 * 这些测试用于验证：只有当事件已经通过更高层的 root-session 与
 * business-scope 资格校验后，dedupe 状态才会真正前进一步。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { createSessionEventDedupeState } from "./session-event-dedupe.js"
import { shouldProcessSessionEventSummary } from "./session-event-summary-dedupe.js"

test("shouldProcessSessionEventSummary dedupes processed session.status events", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    shouldProcessSessionEventSummary({
      state,
      summary: {
        type: "session.status",
        sessionID: "ses_root",
        status: {
          type: "running",
        },
      },
    }),
    true,
  )

  assert.equal(
    shouldProcessSessionEventSummary({
      state,
      summary: {
        type: "session.status",
        sessionID: "ses_root",
        status: {
          type: "running",
        },
      },
    }),
    false,
  )
})

test("shouldProcessSessionEventSummary dedupes processed message.updated events", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    shouldProcessSessionEventSummary({
      state,
      summary: {
        type: "message.updated",
        sessionID: "ses_root",
        info: {
          id: "msg_1",
          sessionID: "ses_root",
          role: "assistant",
          finish: "stop",
        },
      },
    }),
    true,
  )

  assert.equal(
    shouldProcessSessionEventSummary({
      state,
      summary: {
        type: "message.updated",
        sessionID: "ses_root",
        info: {
          id: "msg_1",
          sessionID: "ses_root",
          role: "assistant",
          finish: "stop",
        },
      },
    }),
    false,
  )
})

test("shouldProcessSessionEventSummary leaves state untouched until the caller opts in", () => {
  const state = createSessionEventDedupeState()
  const summary = {
    type: "session.status" as const,
    sessionID: "ses_late_enable",
    status: {
      type: "idle",
    },
  }

  assert.equal(state.sessionStatusCache.has("ses_late_enable"), false)

  assert.equal(
    shouldProcessSessionEventSummary({
      state,
      summary,
    }),
    true,
  )
  assert.equal(state.sessionStatusCache.has("ses_late_enable"), true)
})
