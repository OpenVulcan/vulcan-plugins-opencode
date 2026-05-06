/**
 * Regression tests for keepalive transport language-catalog coverage.
 * keepalive transport 多语言目录覆盖回归测试。
 *
 * This file belongs to the presentation verification layer. It protects the
 * shared TUI language catalog after the transport page copy was merged into
 * `src/vmm-tui-language.ts`, without importing the TSX screen module itself.
 * 这个文件属于展示层验证模块。
 * 它用于保护 transport 页面文案并入 `src/vmm-tui-language.ts`
 * 之后的共享多语言目录覆盖情况，同时避免直接引入 TSX 页面模块。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { getSupportedVmmLanguages } from "./vmm-language.js"
import { tVmmTui } from "./vmm-tui-language.js"

/**
 * Verify that every supported language exposes non-empty transport keys and still interpolates values.
 * 验证每个受支持语言都暴露出非空 transport 文案键，并且仍然支持模板插值。
 *
 * The transport page now reads all user-facing copy from the shared TUI
 * catalog. This test stays at the pure-catalog layer so it remains runnable in
 * plain Node tests and still catches missing keys or broken placeholder
 * substitution.
 * transport 页面现在通过共享 TUI 目录读取全部可见文案。
 * 因此这里把测试放在纯目录层，保证它能在普通 Node 测试里运行，
 * 同时也能捕获缺键和占位符替换失效等问题。
 */
test("tVmmTui exposes non-empty keepalive transport strings for every supported language", () => {
  for (const option of getSupportedVmmLanguages()) {
    assert.ok(
      tVmmTui(option.code, "setting_menu_grpc_transport_title").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "setting_menu_grpc_transport_subtitle").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_section_list").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_keepalive_time_prompt_invalid").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_permit_enabled_subtitle").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_save_failed").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_keepalive_timeout_prompt_invalid").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_keepalive_timeout_exceeds_time").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_keepalive_time_below_timeout").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_scope_dialog_title").trim().length > 0,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_permit_select_title").trim().length > 0,
    )
    assert.match(
      tVmmTui(option.code, "grpc_transport_saved_keepalive_time", {
        scope: "Workspace",
        value: "123",
      }),
      /123/,
    )
    assert.match(
      tVmmTui(option.code, "grpc_transport_saved_keepalive_timeout", {
        scope: "Global",
        value: "456",
      }),
      /456/,
    )
    assert.match(
      tVmmTui(option.code, "grpc_transport_permit_select_title", {
        scope: "Workspace",
      }),
      /Workspace/,
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_saved_permit_on", {
        scope: "Workspace",
      }).includes("Workspace"),
    )
    assert.ok(
      tVmmTui(option.code, "grpc_transport_saved_permit_off", {
        scope: "Global",
      }).includes("Global"),
    )
  }
})
