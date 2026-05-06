/**
 * Tests for the root-session registry helper.
 * root-session 注册表辅助模块测试。
 *
 * These tests make sure confirmed root sessions stay warm while active, but
 * still age out when the host misses deletion events.
 * 这些测试用于确保已确认的 root session 在活跃时能保持温热，
 * 但在宿主漏发删除事件时也会自然过期。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  ROOT_SESSION_REGISTRY_TTL_MS,
  createRootSessionRegistry,
  deleteRootSession,
  getKnownRootSessionIDs,
  hasRootSession,
  peekRootSession,
  rememberRootSession,
} from "./root-session-registry.js"

test("rememberRootSession and hasRootSession keep active entries warm", () => {
  const state = createRootSessionRegistry()

  rememberRootSession({
    state,
    sessionID: "ses_root",
    now: 1,
  })

  assert.equal(
    hasRootSession({
      state,
      sessionID: "ses_root",
      now: 2,
    }),
    true,
  )
  assert.equal(state.touchedAt.get("ses_root"), 2)
})

test("peekRootSession does not refresh the root-session idle timer", () => {
  const state = createRootSessionRegistry()

  rememberRootSession({
    state,
    sessionID: "ses_peek",
    now: 1,
  })

  assert.equal(
    peekRootSession({
      state,
      sessionID: "ses_peek",
      now: 2,
    }),
    true,
  )
  assert.equal(state.touchedAt.get("ses_peek"), 1)

  const ids = getKnownRootSessionIDs({
    state,
    now: 1 + ROOT_SESSION_REGISTRY_TTL_MS + 1,
  })
  assert.equal(ids.has("ses_peek"), false)
})

test("getKnownRootSessionIDs prunes stale root entries", () => {
  const state = createRootSessionRegistry()

  rememberRootSession({
    state,
    sessionID: "ses_stale",
    now: 1,
  })

  const ids = getKnownRootSessionIDs({
    state,
    now: 1 + ROOT_SESSION_REGISTRY_TTL_MS + 1,
  })

  assert.equal(ids.has("ses_stale"), false)
  assert.equal(state.touchedAt.has("ses_stale"), false)
})

test("deleteRootSession removes the root entry from both registry structures", () => {
  const state = createRootSessionRegistry()

  rememberRootSession({
    state,
    sessionID: "ses_delete",
    now: 1,
  })

  assert.equal(
    deleteRootSession({
      state,
      sessionID: "ses_delete",
    }),
    true,
  )
  assert.equal(state.ids.has("ses_delete"), false)
  assert.equal(state.touchedAt.has("ses_delete"), false)
})
