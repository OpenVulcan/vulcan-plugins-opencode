/**
 * Regression tests for Vulcan tool refresh notices.
 * Vulcan tool 刷新提示的回归测试。
 *
 * This file belongs to the verification layer. It ensures install, uninstall,
 * and update flows can explain registry changes without a real LuaSkills host.
 * 这个文件属于验证层。
 * 它确保 install、uninstall 与 update 流程可以在没有真实 LuaSkills 宿主的前提下解释注册表变化。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { getVmmHostAdapterDescriptor } from "./vmm-host-adapter.js"
import {
  buildVmmToolRefreshNotice,
  buildVmmToolRefreshNoticeFromDiff,
} from "./vmm-tool-refresh-notice.js"
import { diffVmmToolRegistrySnapshots } from "./vmm-tool-registry-snapshot.js"

/**
 * Verify that an unchanged registry produces a silent notice.
 * 验证未变化的注册表会生成静默提示。
 */
test("buildVmmToolRefreshNotice reports unchanged registries as severity none", () => {
  const notice = buildVmmToolRefreshNotice({
    previous: {
      tools: [{ id: "tool-a" }],
    },
    next: {
      tools: [{ id: "tool-a" }],
    },
    adapter: getVmmHostAdapterDescriptor("opencode"),
  })

  assert.equal(notice.changed, false)
  assert.equal(notice.severity, "none")
  assert.equal(notice.restartRequired, false)
  assert.deepEqual(notice.changedToolIds, [])
})

/**
 * Verify that OpenCode tool changes produce restart guidance.
 * 验证 OpenCode tool 变化会生成重启提示。
 */
test("buildVmmToolRefreshNotice marks OpenCode changes as restart required", () => {
  const notice = buildVmmToolRefreshNotice({
    previous: {
      tools: [{ id: "tool-a" }],
    },
    next: {
      tools: [{ id: "tool-a" }, { id: "tool-b" }],
    },
    adapter: getVmmHostAdapterDescriptor("opencode"),
  })

  assert.equal(notice.changed, true)
  assert.equal(notice.severity, "warning")
  assert.equal(notice.refreshMode, "restart-required")
  assert.equal(notice.restartRequired, true)
  assert.deepEqual(notice.addedToolIds, ["tool-b"])
  assert.match(notice.modelMessage, /Restart or reconnect/)
  assert.match(notice.userMessage, /重启或重新连接/)
})

/**
 * Verify that explicit dynamic refresh mode downgrades restart guidance to info.
 * 验证明示 dynamic refresh 模式会把重启提示降为信息提示。
 */
test("buildVmmToolRefreshNotice supports explicit dynamic refresh mode", () => {
  const notice = buildVmmToolRefreshNotice({
    previous: {
      tools: [{ id: "tool-a", version: "1" }],
    },
    next: {
      tools: [{ id: "tool-a", version: "2" }],
    },
    hostDisplayName: "Dynamic Host",
    refreshMode: "dynamic",
  })

  assert.equal(notice.changed, true)
  assert.equal(notice.severity, "info")
  assert.equal(notice.restartRequired, false)
  assert.deepEqual(notice.updatedToolIds, ["tool-a"])
  assert.match(notice.modelMessage, /dynamic refresh is supported/)
})

/**
 * Verify that unsupported refresh mode is surfaced as an error-level notice.
 * 验证不支持刷新模式会暴露为错误级提示。
 */
test("buildVmmToolRefreshNoticeFromDiff reports unsupported refresh as error", () => {
  const diff = diffVmmToolRegistrySnapshots(
    {
      tools: [],
    },
    {
      tools: [{ id: "tool-a" }],
    },
  )
  const notice = buildVmmToolRefreshNoticeFromDiff(diff, {
    hostDisplayName: "Unsupported Host",
    refreshMode: "unsupported",
  })

  assert.equal(notice.changed, true)
  assert.equal(notice.severity, "error")
  assert.equal(notice.restartRequired, false)
  assert.match(notice.modelMessage, /no safe refresh path/)
})
