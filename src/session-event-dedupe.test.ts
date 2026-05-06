/**
 * Tests for session-scoped event dedupe helpers.
 * 按会话事件去重辅助模块测试。
 *
 * These tests verify that dedupe state stays scoped to the owning session and
 * is fully reclaimed on `session.deleted`, so a long-running plugin process
 * does not keep suppressing future events with stale cache entries.
 * 这些测试用于验证去重状态始终受所属 session 约束，
 * 并会在 `session.deleted` 后被完整回收，
 * 从而避免长生命周期插件进程继续用陈旧缓存压制后续事件。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  clearSessionEventDedupeState,
  createSessionEventDedupeState,
  ORPHAN_MESSAGE_DEDUPE_MAX_ENTRIES,
  ORPHAN_MESSAGE_DEDUPE_TTL_MS,
  SESSION_EVENT_DEDUPE_SESSION_TTL_MS,
  rememberMessageSnapshot,
  rememberSessionStatusSnapshot,
  summarizeSessionEventDedupeState,
} from "./session-event-dedupe.js"

test("rememberSessionStatusSnapshot dedupes within the same session", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    rememberSessionStatusSnapshot({
      state,
      sessionID: "ses_a",
      statusKey: "{\"phase\":\"idle\"}",
      now: 1,
    }),
    true,
  )
  assert.equal(
    rememberSessionStatusSnapshot({
      state,
      sessionID: "ses_a",
      statusKey: "{\"phase\":\"idle\"}",
      now: 2,
    }),
    false,
  )
  assert.equal(
    rememberSessionStatusSnapshot({
      state,
      sessionID: "ses_b",
      statusKey: "{\"phase\":\"idle\"}",
      now: 3,
    }),
    true,
  )
})

test("clearSessionEventDedupeState removes only the deleted session's message dedupe entries", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_a",
      messageID: "msg_a",
      summaryKey: "{\"finish\":\"done\"}",
    }),
    true,
  )
  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_b",
      messageID: "msg_b",
      summaryKey: "{\"finish\":\"done\"}",
    }),
    true,
  )

  const cleared = clearSessionEventDedupeState({
    state,
    sessionID: "ses_a",
  })

  assert.deepEqual(cleared, {
    clearedStatus: false,
    clearedMessageCount: 1,
  })
  assert.equal(state.messageStateCache.has("session:ses_a:msg_a"), false)
  assert.equal(state.messageStateCache.has("session:ses_b:msg_b"), true)
})

test("clearSessionEventDedupeState allows the same message id to be recorded again after deletion", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_a",
      messageID: "msg_reused",
      summaryKey: "{\"role\":\"assistant\"}",
    }),
    true,
  )
  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_a",
      messageID: "msg_reused",
      summaryKey: "{\"role\":\"assistant\"}",
    }),
    false,
  )

  clearSessionEventDedupeState({
    state,
    sessionID: "ses_a",
  })

  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_c",
      messageID: "msg_reused",
      summaryKey: "{\"role\":\"assistant\"}",
    }),
    true,
  )
})

test("rememberMessageSnapshot does not suppress same message ids across different sessions", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_a",
      messageID: "msg_shared",
      summaryKey: "{\"role\":\"assistant\"}",
    }),
    true,
  )
  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_b",
      messageID: "msg_shared",
      summaryKey: "{\"role\":\"assistant\"}",
    }),
    true,
  )
  assert.equal(state.messageStateCache.has("session:ses_a:msg_shared"), true)
  assert.equal(state.messageStateCache.has("session:ses_b:msg_shared"), true)
})

test("rememberMessageSnapshot promotes orphan entries into session scope", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    rememberMessageSnapshot({
      state,
      messageID: "msg_promote",
      summaryKey: "{\"role\":\"assistant\"}",
    }),
    true,
  )
  assert.equal(state.messageStateCache.has("orphan:msg_promote"), true)

  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_promoted",
      messageID: "msg_promote",
      summaryKey: "{\"role\":\"assistant\"}",
    }),
    true,
  )
  assert.equal(state.messageStateCache.has("orphan:msg_promote"), false)
  assert.equal(state.messageStateCache.has("session:ses_promoted:msg_promote"), true)

  const cleared = clearSessionEventDedupeState({
    state,
    sessionID: "ses_promoted",
  })
  assert.deepEqual(cleared, {
    clearedStatus: false,
    clearedMessageCount: 1,
  })
  assert.equal(state.messageStateCache.has("session:ses_promoted:msg_promote"), false)
})

test("rememberMessageSnapshot does not let orphan entries suppress later session-scoped events", () => {
  const state = createSessionEventDedupeState()
  const summaryKey = "{\"role\":\"assistant\"}"

  assert.equal(
    rememberMessageSnapshot({
      state,
      messageID: "msg_cross_scope",
      summaryKey,
      now: 1,
    }),
    true,
  )

  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_authoritative",
      messageID: "msg_cross_scope",
      summaryKey,
      now: 2,
    }),
    true,
  )
  assert.equal(state.messageStateCache.has("orphan:msg_cross_scope"), false)
  assert.equal(state.messageStateCache.has("session:ses_authoritative:msg_cross_scope"), true)
})

test("rememberMessageSnapshot evicts expired orphan entries before later reuse", () => {
  const state = createSessionEventDedupeState()
  const summaryKey = "{\"role\":\"assistant\"}"

  assert.equal(
    rememberMessageSnapshot({
      state,
      messageID: "msg_ttl",
      summaryKey,
      now: 1,
    }),
    true,
  )
  assert.equal(state.messageStateCache.has("orphan:msg_ttl"), true)

  assert.equal(
    rememberMessageSnapshot({
      state,
      messageID: "msg_other",
      summaryKey,
      now: 1 + ORPHAN_MESSAGE_DEDUPE_TTL_MS + 1,
    }),
    true,
  )
  assert.equal(state.messageStateCache.has("orphan:msg_ttl"), false)

  assert.equal(
    rememberMessageSnapshot({
      state,
      messageID: "msg_ttl",
      summaryKey,
      now: 1 + ORPHAN_MESSAGE_DEDUPE_TTL_MS + 2,
    }),
    true,
  )
})

test("rememberMessageSnapshot evicts oldest orphan entries when the orphan cache exceeds capacity", () => {
  const state = createSessionEventDedupeState()
  const summaryKey = "{\"role\":\"assistant\"}"

  for (let index = 0; index < ORPHAN_MESSAGE_DEDUPE_MAX_ENTRIES + 1; index += 1) {
    assert.equal(
      rememberMessageSnapshot({
        state,
        messageID: `msg_${index}`,
        summaryKey,
        now: index + 1,
      }),
      true,
    )
  }

  assert.equal(state.messageStateCache.has("orphan:msg_0"), false)
  assert.equal(
    state.messageStateCache.has(`orphan:msg_${ORPHAN_MESSAGE_DEDUPE_MAX_ENTRIES}`),
    true,
  )
  assert.equal(state.orphanMessageTouchedAt.size, ORPHAN_MESSAGE_DEDUPE_MAX_ENTRIES)
})

test("summarizeSessionEventDedupeState prunes stale session-owned status and message dedupe", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    rememberSessionStatusSnapshot({
      state,
      sessionID: "ses_stale",
      statusKey: "{\"phase\":\"working\"}",
      now: 1,
    }),
    true,
  )
  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_stale",
      messageID: "msg_stale",
      summaryKey: "{\"role\":\"assistant\"}",
      now: 1,
    }),
    true,
  )

  const summary = summarizeSessionEventDedupeState({
    state,
    now: 1 + SESSION_EVENT_DEDUPE_SESSION_TTL_MS + 1,
  })

  assert.deepEqual(summary, {
    sessionStatusCount: 0,
    messageStateCount: 0,
    sessionOwnershipCount: 0,
    messageOwnerCount: 0,
    sessionTouchCount: 0,
    orphanCount: 0,
    isEmpty: true,
  })
  assert.equal(state.sessionStatusCache.has("ses_stale"), false)
  assert.equal(state.messageStateCache.has("session:ses_stale:msg_stale"), false)
  assert.equal(state.messageKeysBySession.has("ses_stale"), false)
  assert.equal(state.messageKeyOwners.has("session:ses_stale:msg_stale"), false)
  assert.equal(state.sessionTouchedAt.has("ses_stale"), false)
})

test("session-owned dedupe touches stay alive while the session remains active", () => {
  const state = createSessionEventDedupeState()

  assert.equal(
    rememberSessionStatusSnapshot({
      state,
      sessionID: "ses_alive",
      statusKey: "{\"phase\":\"idle\"}",
      now: 1,
    }),
    true,
  )
  assert.equal(
    rememberMessageSnapshot({
      state,
      sessionID: "ses_alive",
      messageID: "msg_alive",
      summaryKey: "{\"role\":\"assistant\"}",
      now: 2,
    }),
    true,
  )
  assert.equal(
    rememberSessionStatusSnapshot({
      state,
      sessionID: "ses_alive",
      statusKey: "{\"phase\":\"idle\"}",
      now: 1 + SESSION_EVENT_DEDUPE_SESSION_TTL_MS,
    }),
    false,
  )

  const summary = summarizeSessionEventDedupeState({
    state,
    now: 1 + SESSION_EVENT_DEDUPE_SESSION_TTL_MS,
  })

  assert.deepEqual(summary, {
    sessionStatusCount: 1,
    messageStateCount: 1,
    sessionOwnershipCount: 1,
    messageOwnerCount: 1,
    sessionTouchCount: 1,
    orphanCount: 0,
    isEmpty: false,
  })
  assert.equal(state.sessionTouchedAt.get("ses_alive"), 1 + SESSION_EVENT_DEDUPE_SESSION_TTL_MS)
})
