/**
 * Tests for root-session cache adapters.
 * root-session 缓存适配器测试。
 *
 * These tests verify that plugin-side probe/admission adapters preserve the
 * registry's hit-refresh semantics instead of degrading cache hits into plain
 * read-only membership checks.
 * 这些测试用于验证：插件侧的 probe / admission 适配器会保留 registry 的
 * “命中即续期”语义，而不是把缓存命中退化成单纯的只读成员判断。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  createRootSessionAdmissionCache,
  createRootSessionProbeCache,
} from "./root-session-cache-adapters.js"
import {
  ROOT_SESSION_REGISTRY_TTL_MS,
  createRootSessionRegistry,
  rememberRootSession,
} from "./root-session-registry.js"

test("createRootSessionProbeCache keeps active root entries warm on cache hits", () => {
  const state = createRootSessionRegistry()
  let now = 1

  rememberRootSession({
    state,
    sessionID: "ses_probe",
    now,
  })

  const probeCache = createRootSessionProbeCache({
    state,
    now: () => now,
  })

  now = 2
  assert.equal(probeCache.has("ses_probe"), true)
  assert.equal(state.touchedAt.get("ses_probe"), 2)

  now = 2 + ROOT_SESSION_REGISTRY_TTL_MS - 1
  assert.equal(probeCache.has("ses_probe"), true)
  assert.equal(state.touchedAt.get("ses_probe"), now)
})

test("createRootSessionAdmissionCache refreshes hits and records new roots", () => {
  const state = createRootSessionRegistry()
  let now = 10
  const admissionCache = createRootSessionAdmissionCache({
    state,
    now: () => now,
  })

  assert.equal(admissionCache.has("ses_new"), false)

  admissionCache.add("ses_new")
  assert.equal(state.ids.has("ses_new"), true)
  assert.equal(state.touchedAt.get("ses_new"), 10)

  now = 11
  assert.equal(admissionCache.has("ses_new"), true)
  assert.equal(state.touchedAt.get("ses_new"), 11)
})
