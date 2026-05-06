/**
 * Regression tests for Vulcan host adapter runtime wiring.
 * Vulcan 宿主适配器运行时接线的回归测试。
 *
 * This file belongs to the verification layer. It protects the adapter registry
 * and identity strategy behavior without requiring any real host process.
 * 这个文件属于验证层。
 * 它在不要求任何真实宿主进程运行的前提下，保护适配器注册表和身份策略行为。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  buildGenericMcpHostAdapterRuntime,
  buildOpenCodeHostAdapterRuntime,
  buildVmmHostAdapterRuntime,
  getVmmHostAdapterDescriptor,
  listVmmHostAdapterDescriptors,
} from "./vmm-host-adapter.js"

/**
 * Verify that OpenCode keeps the current native-plugin adapter contract.
 * 验证 OpenCode 保持当前 native-plugin 适配器契约。
 */
test("getVmmHostAdapterDescriptor builds the OpenCode native adapter descriptor", () => {
  const descriptor = getVmmHostAdapterDescriptor("open code")

  assert.equal(descriptor.hostKind, "opencode")
  assert.equal(descriptor.mode, "native-plugin")
  assert.equal(descriptor.identityMode, "native-session")
  assert.equal(descriptor.refreshMode, "restart-required")
  assert.equal(descriptor.supportsSessionBoundMemoryWrite, true)
  assert.equal(descriptor.supportsWorkmemFallback, true)
})

/**
 * Verify that generic MCP remains conservative and WorkMem-oriented.
 * 验证 generic MCP 保持保守且以 WorkMem 为核心的降级策略。
 */
test("getVmmHostAdapterDescriptor builds the generic MCP degraded descriptor", () => {
  const descriptor = getVmmHostAdapterDescriptor("mcp")

  assert.equal(descriptor.hostKind, "generic-mcp")
  assert.equal(descriptor.mode, "mcp-compatible")
  assert.equal(descriptor.identityMode, "workmem-only")
  assert.equal(descriptor.supportsSessionBoundMemoryWrite, false)
  assert.equal(descriptor.supportsWorkmemFallback, true)
})

/**
 * Verify that the registry exposes every built-in host adapter once.
 * 验证注册表会为每个内置宿主各暴露一个适配器。
 */
test("listVmmHostAdapterDescriptors lists every built-in adapter in stable order", () => {
  assert.deepEqual(
    listVmmHostAdapterDescriptors().map((descriptor) => descriptor.hostKind),
    ["opencode", "openclaw", "claude-code", "qwen-code", "hermes-agent", "generic-mcp", "unknown"],
  )
})

/**
 * Verify that OpenCode runtime reports degraded state when a session id is missing.
 * 验证 OpenCode runtime 在缺失 session id 时会报告降级状态。
 */
test("buildOpenCodeHostAdapterRuntime requires native session identity", () => {
  const runtime = buildOpenCodeHostAdapterRuntime({
    workspace: "D:/projects/demo",
  })

  assert.equal(runtime.descriptor.hostKind, "opencode")
  assert.equal(runtime.context.workmemSource, "generated-from-workspace")
  assert.equal(runtime.context.canUseSessionBoundTools, false)
  assert.equal(runtime.identityReady, false)
  assert.match(runtime.degradedReasons.join("\n"), /adapter-requires-native-session/)
})

/**
 * Verify that generic MCP can run with a workspace-derived WorkMem fallback.
 * 验证 generic MCP 可以使用 workspace 派生的 WorkMem fallback 运行。
 */
test("buildGenericMcpHostAdapterRuntime accepts workspace-derived WorkMem fallback", () => {
  const runtime = buildGenericMcpHostAdapterRuntime({
    workspace: "D:/projects/demo",
  })

  assert.equal(runtime.descriptor.hostKind, "generic-mcp")
  assert.equal(runtime.context.canUseSessionBoundTools, false)
  assert.equal(runtime.context.canUseWorkmemBoundTools, true)
  assert.equal(runtime.identityReady, true)
})

/**
 * Verify that explicit adapter host aliases override raw host text.
 * 验证显式适配器宿主别名会覆盖原始宿主文本。
 */
test("buildVmmHostAdapterRuntime lets adapterHostKind override hostKind", () => {
  const runtime = buildVmmHostAdapterRuntime({
    hostKind: "unknown",
    adapterHostKind: "qwen",
    sessionId: "session-a",
  })

  assert.equal(runtime.descriptor.hostKind, "qwen-code")
  assert.equal(runtime.context.hostKind, "qwen-code")
  assert.equal(runtime.identityReady, true)
})
