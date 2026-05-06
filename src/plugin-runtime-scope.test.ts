/**
 * Tests for directory-scoped plugin runtime scopes.
 * 按目录插件运行时作用域测试。
 *
 * These tests make sure different directories never share volatile runtime
 * state, while repeated initialization of the same directory still reuses one
 * stable scope.
 * 这些测试用于确保不同目录绝不会共享易失运行时状态，
 * 同时同一目录的重复初始化仍会复用同一份稳定作用域。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  DELETED_SESSION_BARRIER_TTL_MS,
  rememberDeletedSessionBarrier,
} from "./deleted-session-barrier.js"
import {
  createPluginRuntimeScopeAccessor,
  getPluginRuntimeScope,
  peekPluginRuntimeScope,
  releasePluginRuntimeScopeIfIdle,
} from "./plugin-runtime-scope.js"
import { rememberRootSession } from "./root-session-registry.js"
import {
  rememberMessageSnapshot,
  SESSION_EVENT_DEDUPE_SESSION_TTL_MS,
} from "./session-event-dedupe.js"
import { ROOT_SESSION_REGISTRY_TTL_MS } from "./root-session-registry.js"

test("getPluginRuntimeScope reuses the same scope for the same directory", () => {
  const first = getPluginRuntimeScope("D:/projects/VmmOpenCodePlugins")
  const second = getPluginRuntimeScope("D:/projects/VmmOpenCodePlugins")

  assert.equal(first.rootSessionRegistry, second.rootSessionRegistry)
  assert.equal(first.sessionEventDedupe, second.sessionEventDedupe)
  assert.equal(first.deletedSessionBarrier, second.deletedSessionBarrier)
  assert.equal(first.rootSessionProbeCache, second.rootSessionProbeCache)
  assert.equal(first.rootSessionAdmissionCache, second.rootSessionAdmissionCache)
  assert.equal(first.finalizeTimers, second.finalizeTimers)
})

test("getPluginRuntimeScope isolates runtime state across directories", () => {
  const left = getPluginRuntimeScope("D:/projects/workspace-a")
  const right = getPluginRuntimeScope("D:/projects/workspace-b")

  assert.notEqual(left, right)
  assert.notEqual(left.rootSessionRegistry, right.rootSessionRegistry)
  assert.notEqual(left.sessionEventDedupe, right.sessionEventDedupe)
  assert.notEqual(left.deletedSessionBarrier, right.deletedSessionBarrier)
  assert.notEqual(left.rootSessionProbeCache, right.rootSessionProbeCache)
  assert.notEqual(left.rootSessionAdmissionCache, right.rootSessionAdmissionCache)
  assert.notEqual(left.finalizeTimers, right.finalizeTimers)
})

test("releasePluginRuntimeScopeIfIdle drops one empty directory scope", () => {
  const directory = "D:/projects/release-idle"
  const first = getPluginRuntimeScope(directory)

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
    }),
    true,
  )

  const second = getPluginRuntimeScope(directory)
  assert.notEqual(first, second)
})

test("createPluginRuntimeScopeAccessor follows the current scope after idle release", () => {
  const directory = "D:/projects/runtime-accessor"
  const accessor = createPluginRuntimeScopeAccessor({
    directory,
  })
  const first = accessor.getScope()

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
    }),
    true,
  )

  const second = accessor.getScope()
  assert.notEqual(first, second)
  assert.equal(second, getPluginRuntimeScope(directory))
})

test("peekPluginRuntimeScope does not recreate one idle scope after release", () => {
  const directory = "D:/projects/runtime-peek"
  const accessor = createPluginRuntimeScopeAccessor({
    directory,
  })

  assert.equal(accessor.peekScope(), undefined)
  accessor.getScope()

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
    }),
    true,
  )

  assert.equal(accessor.peekScope(), undefined)
  assert.equal(peekPluginRuntimeScope(directory), undefined)
})

test("peekPluginRuntimeScope reclaims one scope after ttl-pruned state becomes idle", () => {
  const directory = "D:/projects/runtime-peek-stale"
  const scope = getPluginRuntimeScope(directory)

  rememberRootSession({
    state: scope.rootSessionRegistry,
    sessionID: "ses_peek_stale",
    now: 1,
  })

  const peeked = peekPluginRuntimeScope(directory, 1 + ROOT_SESSION_REGISTRY_TTL_MS + 1)
  assert.equal(peeked, undefined)
  assert.equal(peekPluginRuntimeScope(directory), undefined)
})

test("releasePluginRuntimeScopeIfIdle keeps non-idle scopes alive", () => {
  const directory = "D:/projects/release-active"
  const scope = getPluginRuntimeScope(directory)
  rememberRootSession({
    state: scope.rootSessionRegistry,
    sessionID: "ses_active",
    now: 1,
  })

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
      now: 1,
    }),
    false,
  )
  const retained = getPluginRuntimeScope(directory)
  assert.equal(retained.rootSessionRegistry, scope.rootSessionRegistry)
  assert.equal(retained.sessionEventDedupe, scope.sessionEventDedupe)
  assert.equal(retained.deletedSessionBarrier, scope.deletedSessionBarrier)
  assert.equal(retained.rootSessionProbeCache, scope.rootSessionProbeCache)
  assert.equal(retained.rootSessionAdmissionCache, scope.rootSessionAdmissionCache)
  assert.equal(retained.finalizeTimers, scope.finalizeTimers)
})

test("releasePluginRuntimeScopeIfIdle can release scopes after stale session dedupe ages out", () => {
  const directory = "D:/projects/release-stale-dedupe"
  const scope = getPluginRuntimeScope(directory)

  assert.equal(
    rememberMessageSnapshot({
      state: scope.sessionEventDedupe,
      sessionID: "ses_stale_scope",
      messageID: "msg_stale_scope",
      summaryKey: "{\"role\":\"assistant\"}",
      now: 1,
    }),
    true,
  )

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
      now: 1,
    }),
    false,
  )

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
      now: 1 + SESSION_EVENT_DEDUPE_SESSION_TTL_MS + 1,
    }),
    true,
  )
})

test("releasePluginRuntimeScopeIfIdle keeps one scope alive while deleted-session barriers remain warm", () => {
  const directory = "D:/projects/release-deleted-barrier"
  const scope = getPluginRuntimeScope(directory)

  rememberDeletedSessionBarrier({
    state: scope.deletedSessionBarrier,
    sessionID: "ses_deleted_barrier",
    now: 1,
  })

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
      now: 1,
    }),
    false,
  )

  assert.equal(
    releasePluginRuntimeScopeIfIdle({
      directory,
      now: 1 + DELETED_SESSION_BARRIER_TTL_MS + 1,
    }),
    true,
  )
})
