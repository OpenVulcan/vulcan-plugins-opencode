/**
 * Regression tests for remote VMM feature-status gating.
 * 远端 VMM 功能状态门控的回归测试。
 *
 * This file belongs to the host integration verification layer. It protects
 * the fail-closed startup behavior used before VMM-dependent tools and hooks
 * are exposed by the OpenCode plugin.
 * 这个文件属于宿主集成验证层。它保护 OpenCode 插件暴露 VMM 相关 tools
 * 和 hooks 前使用的失败关闭启动行为。
 */

import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { loadVmmFeatureStatus, type VmmFeatureStatusProbe } from "./vmm-feature-status.js"

/**
 * Write a local OpenCode VMM config for one isolated workspace.
 * 为单个隔离工作区写入本地 OpenCode VMM 配置。
 */
async function writeLocalVmmConfig(workspaceDir: string, config: Record<string, unknown>) {
  const opencodeDir = path.join(workspaceDir, ".opencode")
  await fs.mkdir(opencodeDir, { recursive: true })
  await fs.writeFile(
    path.join(opencodeDir, ".vmm.json"),
    JSON.stringify(config, null, 2) + "\n",
    "utf8",
  )
}

/**
 * Build a probe that returns one fixed HostAdapterService status payload.
 * 构造一个返回固定 HostAdapterService 状态载荷的探测函数。
 */
function fixedStatusProbe(
  response: Awaited<ReturnType<VmmFeatureStatusProbe>>["response"],
): VmmFeatureStatusProbe {
  return async (args) => {
    assert.equal(args.config.grpcTarget, "127.0.0.1:19090")
    assert.equal(args.request.context.client_name, "opencode")

    return {
      ok: true,
      method: "GetVmmStatus",
      target: args.config.grpcTarget,
      response,
    }
  }
}

/**
 * Run one async test body with isolated OpenCode config directories.
 * 使用隔离的 OpenCode 配置目录执行一个异步测试体。
 */
async function withIsolatedOpencodeHome(
  name: string,
  run: (args: { workspaceDir: string; sandboxHome: string }) => Promise<void>,
) {
  await test(name, async () => {
    const previousTestHome = process.env["OPENCODE_TEST_HOME"]
    const sandboxHome = await fs.mkdtemp(path.join(os.tmpdir(), "vmm-feature-home-"))
    const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "vmm-feature-workspace-"))
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
  "loadVmmFeatureStatus disables VMM features when vulcan-host target is missing",
  async ({ workspaceDir }) => {
    const status = await loadVmmFeatureStatus(workspaceDir)

    assert.equal(status.enabled, false)
    assert.equal(status.source, "missing-target")
    assert.match(status.message, /vulcan_host_target/)
  },
)

await withIsolatedOpencodeHome(
  "loadVmmFeatureStatus enables VMM features when remote status is enabled",
  async ({ workspaceDir }) => {
    await writeLocalVmmConfig(workspaceDir, {
      vulcan_host_target: "127.0.0.1:19090",
    })

    const status = await loadVmmFeatureStatus(workspaceDir, {
      getVmmStatus: fixedStatusProbe({
        vmm_enabled: true,
        vmm_status: "VMM backend is enabled.",
        is_error: false,
        message: "",
      }),
    })

    assert.equal(status.enabled, true)
    assert.equal(status.source, "remote")
    assert.equal(status.message, "VMM backend is enabled.")
  },
)

await withIsolatedOpencodeHome(
  "loadVmmFeatureStatus disables VMM features when remote status is disabled",
  async ({ workspaceDir }) => {
    await writeLocalVmmConfig(workspaceDir, {
      vulcan_host_target: "127.0.0.1:19090",
    })

    const status = await loadVmmFeatureStatus(workspaceDir, {
      getVmmStatus: fixedStatusProbe({
        vmm_enabled: false,
        vmm_status: "VMM backend is not configured.",
        is_error: false,
        message: "",
      }),
    })

    assert.equal(status.enabled, false)
    assert.equal(status.source, "remote")
    assert.equal(status.message, "VMM backend is not configured.")
  },
)

await withIsolatedOpencodeHome(
  "loadVmmFeatureStatus disables VMM features when remote status returns an error",
  async ({ workspaceDir }) => {
    await writeLocalVmmConfig(workspaceDir, {
      vulcan_host_target: "127.0.0.1:19090",
    })

    const status = await loadVmmFeatureStatus(workspaceDir, {
      getVmmStatus: fixedStatusProbe({
        vmm_enabled: false,
        vmm_status: "",
        is_error: true,
        message: "status failed",
      }),
    })

    assert.equal(status.enabled, false)
    assert.equal(status.source, "remote-error")
    assert.equal(status.message, "status failed")
  },
)

await withIsolatedOpencodeHome(
  "loadVmmFeatureStatus disables VMM features when remote status is unavailable",
  async ({ workspaceDir }) => {
    await writeLocalVmmConfig(workspaceDir, {
      vulcan_host_target: "127.0.0.1:19090",
    })

    const status = await loadVmmFeatureStatus(workspaceDir, {
      getVmmStatus: async (args) => ({
        ok: false,
        method: "GetVmmStatus",
        target: args.config.grpcTarget ?? "",
        details: "unreachable",
      }),
    })

    assert.equal(status.enabled, false)
    assert.equal(status.source, "remote-unavailable")
    assert.equal(status.message, "unreachable")
  },
)
