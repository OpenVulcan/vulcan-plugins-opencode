/**
 * Tests for the deleted-session barrier helper.
 * 已删除会话屏障辅助模块测试。
 *
 * These tests make sure deleted-session tombstones block late events for a
 * bounded amount of time, then age out so runtime scopes can become idle
 * again.
 * 这些测试用于确保已删除会话 tombstone 会在有界时间内阻断迟到事件，
 * 随后自然过期，让运行时作用域重新回到 idle。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  DELETED_SESSION_BARRIER_TTL_MS,
  createDeletedSessionBarrierState,
  deleteDeletedSessionBarrier,
  getKnownDeletedSessionIDs,
  peekDeletedSessionBarrier,
  rememberDeletedSessionBarrier,
} from "./deleted-session-barrier.js"

test("rememberDeletedSessionBarrier records one deleted session without touching on peek", () => {
  const state = createDeletedSessionBarrierState()

  rememberDeletedSessionBarrier({
    state,
    sessionID: "ses_deleted",
    now: 1,
  })

  assert.equal(
    peekDeletedSessionBarrier({
      state,
      sessionID: "ses_deleted",
      now: 2,
    }),
    true,
  )
  assert.equal(state.touchedAt.get("ses_deleted"), 1)
})

test("getKnownDeletedSessionIDs prunes stale deleted-session tombstones", () => {
  const state = createDeletedSessionBarrierState()

  rememberDeletedSessionBarrier({
    state,
    sessionID: "ses_deleted",
    now: 1,
  })

  const ids = getKnownDeletedSessionIDs({
    state,
    now: 1 + DELETED_SESSION_BARRIER_TTL_MS + 1,
  })

  assert.equal(ids.has("ses_deleted"), false)
  assert.equal(state.touchedAt.has("ses_deleted"), false)
})

test("deleteDeletedSessionBarrier removes the tombstone from both structures", () => {
  const state = createDeletedSessionBarrierState()

  rememberDeletedSessionBarrier({
    state,
    sessionID: "ses_deleted",
    now: 1,
  })

  assert.equal(
    deleteDeletedSessionBarrier({
      state,
      sessionID: "ses_deleted",
    }),
    true,
  )
  assert.equal(state.ids.has("ses_deleted"), false)
  assert.equal(state.touchedAt.has("ses_deleted"), false)
})
