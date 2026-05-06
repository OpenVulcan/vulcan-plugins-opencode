/**
 * Notification routing policy tests for VMM runtime feedback.
 * VMM 运行态反馈通知路由策略测试。
 *
 * This file belongs to the verification layer. It verifies the shared routing
 * helper so the plugin runtime and transport layer keep one consistent policy
 * for transient toast and message-visible fallback surfaces.
 * 这个文件属于验证层，用来校验共享路由 helper，
 * 防止主插件运行时和传输层在瞬时 toast 与可见消息回退面上出现策略漂移。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  normalizeVmmNotificationSurfaceMode,
  resolveVmmNotificationRoute,
} from "./vmm-notification-routing.js"

test("normalizeVmmNotificationSurfaceMode keeps the legacy web alias in the transcript compatibility bucket", () => {
  assert.equal(normalizeVmmNotificationSurfaceMode("web"), "transcript")
  assert.equal(normalizeVmmNotificationSurfaceMode("cli"), "toast")
  assert.equal(normalizeVmmNotificationSurfaceMode("dual"), "dual")
  assert.equal(normalizeVmmNotificationSurfaceMode("unknown-value"), "auto")
})

test("resolveVmmNotificationRoute keeps auto warnings visible in both host-safe surfaces", () => {
  assert.deepEqual(
    resolveVmmNotificationRoute({
      mode: "auto",
      stage: "warning",
    }),
    {
      toast: true,
      visibleAnswerNotice: true,
    },
  )
})

test("resolveVmmNotificationRoute keeps auto completion toast-only even when a transcript target exists", () => {
  assert.deepEqual(
    resolveVmmNotificationRoute({
      mode: "auto",
      stage: "completion",
    }),
    {
      toast: true,
      visibleAnswerNotice: false,
    },
  )
})

test("resolveVmmNotificationRoute keeps transcript mode fully silent for warning notices", () => {
  assert.deepEqual(
    resolveVmmNotificationRoute({
      mode: "transcript",
      stage: "warning",
    }),
    {
      toast: false,
      visibleAnswerNotice: false,
    },
  )
})

test("resolveVmmNotificationRoute keeps transcript mode fully silent for completion notices", () => {
  assert.deepEqual(
    resolveVmmNotificationRoute({
      mode: "transcript",
      stage: "completion",
    }),
    {
      toast: false,
      visibleAnswerNotice: false,
    },
  )
})
