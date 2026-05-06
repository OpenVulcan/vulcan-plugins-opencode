/**
 * Regression tests for Vulcan host runtime context normalization.
 * Vulcan 宿主运行上下文归一化的回归测试。
 *
 * This file belongs to the verification layer. It ensures native plugin paths
 * and degraded MCP-compatible paths derive session and WorkMem identity in the
 * same way before any transport call is attempted.
 * 这个文件属于验证层。
 * 它确保原生插件路径和降级 MCP 兼容路径在尝试任何传输调用前，
 * 以相同方式推导 session 与 WorkMem 身份。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  buildVmmHostRuntimeContext,
  normalizeVmmHostRuntimeContextText,
} from "./vmm-host-runtime-context.js"

test("normalizeVmmHostRuntimeContextText trims optional runtime text", () => {
  assert.equal(normalizeVmmHostRuntimeContextText(" session-1 "), "session-1")
  assert.equal(normalizeVmmHostRuntimeContextText("   "), undefined)
  assert.equal(normalizeVmmHostRuntimeContextText(undefined), undefined)
})

test("buildVmmHostRuntimeContext derives WorkMem id from native session id", () => {
  const context = buildVmmHostRuntimeContext({
    hostKind: "opencode",
    sessionId: " session-a ",
  })

  assert.equal(context.hostKind, "opencode")
  assert.equal(context.sessionId, "session-a")
  assert.equal(context.workmemId, "session-a")
  assert.equal(context.workmemSource, "session-id")
  assert.equal(context.canUseSessionBoundTools, true)
  assert.equal(context.canUseWorkmemBoundTools, true)
  assert.deepEqual(context.degradedReasons, [])
})

test("buildVmmHostRuntimeContext lets explicit WorkMem id override session-derived identity", () => {
  const context = buildVmmHostRuntimeContext({
    hostKind: "openclaw",
    sessionId: "session-a",
    workmemId: " workmem-b ",
  })

  assert.equal(context.sessionId, "session-a")
  assert.equal(context.workmemId, "workmem-b")
  assert.equal(context.workmemSource, "provided-workmem-id")
  assert.equal(context.canUseSessionBoundTools, true)
})

test("buildVmmHostRuntimeContext generates deterministic workspace fallback without session id", () => {
  const first = buildVmmHostRuntimeContext({
    hostKind: "generic-mcp",
    workspace: "D:/projects/demo",
  })
  const second = buildVmmHostRuntimeContext({
    hostKind: "mcp",
    workspace: "D:/projects/demo",
  })

  assert.equal(first.hostKind, "generic-mcp")
  assert.equal(first.workmemId, second.workmemId)
  assert.equal(first.workmemSource, "generated-from-workspace")
  assert.equal(first.canUseSessionBoundTools, false)
  assert.equal(first.canUseWorkmemBoundTools, true)
  assert.match(first.degradedReasons.join("\n"), /missing-session-id/)
  assert.match(first.degradedReasons.join("\n"), /host-has-no-session-id-access/)
})

test("buildVmmHostRuntimeContext reports missing WorkMem identity when no fallback exists", () => {
  const context = buildVmmHostRuntimeContext({
    hostKind: "unknown",
  })

  assert.equal(context.workmemId, undefined)
  assert.equal(context.workmemSource, "missing")
  assert.equal(context.canUseSessionBoundTools, false)
  assert.equal(context.canUseWorkmemBoundTools, false)
  assert.match(context.degradedReasons.join("\n"), /missing-workmem-id/)
})
