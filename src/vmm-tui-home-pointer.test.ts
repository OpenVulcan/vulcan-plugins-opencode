/**
 * Stability tests for the setting-home pointer hit-testing helpers.
 * 设置首页鼠标命中换算辅助函数的稳定性测试。
 *
 * This file belongs to the verification layer. It protects the pure helper
 * that maps terminal pointer coordinates back to launcher rows, so resize
 * regressions can be caught without booting the full TUI runtime.
 * 这个文件属于验证层，用来守护那条“把终端鼠标坐标反推回启动器行”的纯函数，
 * 这样就能在不启动整套 TUI 运行时的前提下捕获 resize 相关回归。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { resolveVmmSettingHomeMouseIndex } from "./vmm-tui-home-pointer.js"

test("resolveVmmSettingHomeMouseIndex stays stable when hover keeps the original scroll anchor", () => {
  const stableAnchorArgs = {
    eventY: 9,
    selectY: 0,
    selectHeight: 10,
    scrollAnchorIndex: 10,
    optionCount: 40,
  }

  assert.equal(resolveVmmSettingHomeMouseIndex(stableAnchorArgs), 12)
  assert.equal(resolveVmmSettingHomeMouseIndex(stableAnchorArgs), 12)

  /**
   * Replaying the same pointer coordinate with the post-hover selected index
   * would push the computed row forward, which is exactly the resize-thrashing
   * bug that the home screen now avoids.
   * 如果把同一个鼠标坐标改用 hover 之后的选中项当锚点重算，
   * 命中的行会继续向前漂移，这正是首页现在要避免的 resize 抖动问题。
   */
  assert.equal(
    resolveVmmSettingHomeMouseIndex({
      ...stableAnchorArgs,
      scrollAnchorIndex: 12,
    }),
    14,
  )
})

test("resolveVmmSettingHomeMouseIndex returns null when the pointer is outside the Select viewport", () => {
  assert.equal(
    resolveVmmSettingHomeMouseIndex({
      eventY: 25,
      selectY: 0,
      selectHeight: 10,
      scrollAnchorIndex: 0,
      optionCount: 5,
    }),
    null,
  )
})
