/**
 * Regression tests for keepalive config layering and persistence.
 * keepalive 配置分层与持久化回归测试。
 *
 * This file belongs to the config verification layer. It protects the
 * keepalive defaults, the auto-generated global config bootstrap, and the
 * local-over-global precedence used by the runtime loader.
 * 这个文件属于配置验证层。
 * 它用于保护 keepalive 默认值、自动生成的全局配置引导逻辑，
 * 以及运行时配置加载时 local 覆盖 global 的优先级。
 */

import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { getVmmPaths, loadVmmConfig, normalizeStrictPositiveConfigInteger, saveVmmConfig } from "./vmm-config.js"

/**
 * Run one async test body with an isolated OPENCODE_TEST_HOME sandbox.
 * 使用隔离的 OPENCODE_TEST_HOME 沙箱执行一个异步测试体。
 *
 * The config loader auto-creates a global config under the OpenCode user home.
 * Tests must isolate that home directory so the real developer environment is
 * never touched and so assertions can inspect the generated file directly.
 * 配置加载器会在 OpenCode 用户目录下自动创建全局配置文件。
 * 因此测试必须隔离这个 home 目录，既避免触碰真实开发环境，
 * 也方便直接断言自动生成出来的配置文件内容。
 */
async function withIsolatedOpencodeHome(
  name: string,
  run: (args: { workspaceDir: string; sandboxHome: string }) => Promise<void>,
) {
  await test(name, async () => {
    const previousTestHome = process.env["OPENCODE_TEST_HOME"]
    const sandboxHome = await fs.mkdtemp(path.join(os.tmpdir(), "vmm-keepalive-home-"))
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "vmm-keepalive-workspace-"))
    process.env["OPENCODE_TEST_HOME"] = sandboxHome

    try {
      await run({ workspaceDir, sandboxHome })
    } finally {
      if (previousTestHome === undefined) {
        delete process.env["OPENCODE_TEST_HOME"]
      } else {
        process.env["OPENCODE_TEST_HOME"] = previousTestHome
      }
      await fs.rm(sandboxHome, { recursive: true, force: true })
      await fs.rm(workspaceDir, { recursive: true, force: true })
    }
  })
}

await withIsolatedOpencodeHome(
  "loadVmmConfig bootstraps global keepalive defaults into the generated config file",
  async ({ workspaceDir }) => {
    const runtimeConfig = await loadVmmConfig(workspaceDir)
    const paths = getVmmPaths(workspaceDir)
    const generatedGlobalConfig = JSON.parse(
      await fs.readFile(paths.globalConfigPath, "utf8"),
    ) as Record<string, unknown>

    assert.equal(runtimeConfig.grpcKeepaliveTimeMs, 300000)
    assert.equal(runtimeConfig.grpcKeepaliveTimeoutMs, 20000)
    assert.equal(runtimeConfig.grpcKeepalivePermitWithoutCalls, 0)
    assert.equal(generatedGlobalConfig["grpc_keepalive_time_ms"], 300000)
    assert.equal(generatedGlobalConfig["grpc_keepalive_timeout_ms"], 20000)
    assert.equal(generatedGlobalConfig["grpc_keepalive_permit_without_calls"], 0)
  },
)

await withIsolatedOpencodeHome(
  "loadVmmConfig lets local keepalive overrides win over the generated global defaults",
  async ({ workspaceDir }) => {
    await saveVmmConfig(workspaceDir, "global", "grpc_keepalive_time_ms", 450000)
    await saveVmmConfig(workspaceDir, "global", "grpc_keepalive_timeout_ms", 15000)
    await saveVmmConfig(
      workspaceDir,
      "global",
      "grpc_keepalive_permit_without_calls",
      1,
    )
    await saveVmmConfig(workspaceDir, "local", "grpc_keepalive_time_ms", 90000)
    await saveVmmConfig(workspaceDir, "local", "grpc_keepalive_timeout_ms", 7000)
    await saveVmmConfig(
      workspaceDir,
      "local",
      "grpc_keepalive_permit_without_calls",
      0,
    )

    const runtimeConfig = await loadVmmConfig(workspaceDir)

    assert.equal(runtimeConfig.grpcKeepaliveTimeMs, 90000)
    assert.equal(runtimeConfig.grpcKeepaliveTimeoutMs, 7000)
    assert.equal(runtimeConfig.grpcKeepalivePermitWithoutCalls, 0)
  },
)

await withIsolatedOpencodeHome(
  "loadVmmConfig uses vulcan-host as the only effective gRPC target",
  async ({ workspaceDir }) => {
    await saveVmmConfig(workspaceDir, "local", "vulcan_host_target", "127.0.0.1:17700")

    const runtimeConfig = await loadVmmConfig(workspaceDir)

    assert.equal(runtimeConfig.grpcTarget, "127.0.0.1:17700")
    assert.equal(runtimeConfig.vulcanHostTarget, "127.0.0.1:17700")
  },
)

await test("normalizeStrictPositiveConfigInteger floors and returns valid positive numbers", () => {
  assert.equal(normalizeStrictPositiveConfigInteger(300000, 300000), 300000)
  assert.equal(normalizeStrictPositiveConfigInteger(300000.9, 300000), 300000)
  assert.equal(normalizeStrictPositiveConfigInteger(1, 300000), 1)
})

await test("normalizeStrictPositiveConfigInteger falls back for zero, negative, and non-finite values", () => {
  assert.equal(normalizeStrictPositiveConfigInteger(0, 20000), 20000)
  assert.equal(normalizeStrictPositiveConfigInteger(-1, 20000), 20000)
  assert.equal(normalizeStrictPositiveConfigInteger(-100, 20000), 20000)
  assert.equal(normalizeStrictPositiveConfigInteger(NaN, 20000), 20000)
  assert.equal(normalizeStrictPositiveConfigInteger(Infinity, 20000), 20000)
  assert.equal(normalizeStrictPositiveConfigInteger(-Infinity, 20000), 20000)
})

await test("normalizeStrictPositiveConfigInteger falls back for undefined and non-number inputs", () => {
  assert.equal(normalizeStrictPositiveConfigInteger(undefined, 20000), 20000)
})
