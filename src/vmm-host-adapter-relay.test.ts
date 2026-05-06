/**
 * Regression tests for remote-first host adapter relay fallback.
 * 远程优先宿主适配器中转 fallback 的回归测试。
 *
 * This file belongs to the verification layer. It proves the OpenCode plugin
 * can prefer vulcan-host HostAdapterService while still falling back to the
 * local TypeScript contract when the service is missing or unusable.
 * 这个文件属于验证层。
 * 它证明 OpenCode 插件可以优先使用 vulcan-host HostAdapterService，
 * 同时在服务缺失或不可用时回退到本地 TypeScript 契约。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { buildVmmHostAdapterRuntime } from "./vmm-host-adapter.js"
import {
  buildVmmHostAdapterRuntimeWithRelay,
  buildVmmToolRefreshNoticeWithRelay,
} from "./vmm-host-adapter-relay.js"
import { type VmmRuntimeConfig } from "./vmm-config.js"

/**
 * Build a complete runtime config for relay tests.
 * 为 relay 测试构建一份完整运行时配置。
 */
function runtimeConfig(overrides: Partial<VmmRuntimeConfig> = {}): VmmRuntimeConfig {
  return {
    projectId: "1",
    userId: "1",
    language: "en",
    languageRaw: "en",
    languageFallbackApplied: false,
    notificationSurfaceMode: "auto",
    grpcTarget: "127.0.0.1:17700",
    vulcanHostTarget: "127.0.0.1:17700",
    grpcApiKey: "",
    grpcHandshakeTimeoutMs: 100,
    grpcReceiveTimeoutMs: 100,
    grpcKeepaliveTimeMs: 300000,
    grpcKeepaliveTimeoutMs: 20000,
    grpcKeepalivePermitWithoutCalls: 0,
    visibleMemoryInjection: true,
    implicitMemoryTurns: 8,
    profileRefreshTurns: 10,
    sessionCompactRecall: true,
    ...overrides,
  }
}

test("buildVmmHostAdapterRuntimeWithRelay uses remote runtime when available", async () => {
  const remoteRuntime = buildVmmHostAdapterRuntime({
    hostKind: "opencode",
    sessionId: "remote-session",
  })
  const result = await buildVmmHostAdapterRuntimeWithRelay({
    runtimeConfig: runtimeConfig(),
    input: {
      hostKind: "opencode",
      sessionId: "local-session",
    },
    remoteClient: async () => remoteRuntime,
  })

  assert.equal(result.source, "remote")
  assert.equal(result.runtime.context.sessionId, "remote-session")
})

test("buildVmmHostAdapterRuntimeWithRelay falls back when remote runtime is unusable", async () => {
  const result = await buildVmmHostAdapterRuntimeWithRelay({
    runtimeConfig: runtimeConfig(),
    input: {
      hostKind: "opencode",
      sessionId: "local-session",
    },
    remoteClient: async () => undefined,
  })

  assert.equal(result.source, "local-fallback")
  assert.equal(result.runtime.context.sessionId, "local-session")
  assert.match(result.fallbackReason ?? "", /returned no usable runtime/)
})

test("buildVmmHostAdapterRuntimeWithRelay skips remote when vulcan-host target is missing", async () => {
  const result = await buildVmmHostAdapterRuntimeWithRelay({
    runtimeConfig: runtimeConfig({
      vulcanHostTarget: "",
    }),
    input: {
      hostKind: "generic-mcp",
      workspace: "D:/projects/demo",
    },
    remoteClient: async () => {
      throw new Error("remote should not be called")
    },
  })

  assert.equal(result.source, "local-fallback")
  assert.equal(result.runtime.descriptor.hostKind, "generic-mcp")
  assert.equal(result.runtime.context.canUseWorkmemBoundTools, true)
})

test("buildVmmToolRefreshNoticeWithRelay keeps local OpenCode restart fallback", async () => {
  const result = await buildVmmToolRefreshNoticeWithRelay({
    runtimeConfig: runtimeConfig(),
    hostKind: "opencode",
    previous: {
      tools: [{ id: "tool-a" }],
    },
    next: {
      tools: [{ id: "tool-a" }, { id: "tool-b" }],
    },
    remoteClient: async () => undefined,
  })

  assert.equal(result.source, "local-fallback")
  assert.equal(result.notice.restartRequired, true)
  assert.deepEqual(result.notice.addedToolIds, ["tool-b"])
})
