/**
 * Tests for finalize scheduling after stable assistant message updates.
 * assistant 消息稳定后 finalize 补调度策略测试。
 *
 * This file belongs to the orchestration support test layer. It protects the
 * race where `session.idle` or a pending finalize was lost before the host
 * finally delivered the `completed` timestamp on the assistant message.
 * 这个文件属于编排支撑测试层，
 * 用来保护这样一种竞态：`session.idle` 或已挂起的 finalize 先丢了，
 * 但宿主稍后才把 assistant 消息的 `completed` 时间戳补回来。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { shouldScheduleFinalizeOnMessageUpdate } from "./finalize-message-update-policy.js"

test("should schedule finalize when message.updated makes the assistant answer stable", () => {
  assert.equal(
    shouldScheduleFinalizeOnMessageUpdate({
      eventType: "message.updated",
      transition: {
        becameStable: true,
      },
    }),
    true,
  )
})

test("should not schedule finalize when message.updated does not promote stability", () => {
  assert.equal(
    shouldScheduleFinalizeOnMessageUpdate({
      eventType: "message.updated",
      transition: {
        becameStable: false,
      },
    }),
    false,
  )
})

test("should ignore non-message events even when the transition says becameStable", () => {
  assert.equal(
    shouldScheduleFinalizeOnMessageUpdate({
      eventType: "session.status",
      transition: {
        becameStable: true,
      },
    }),
    false,
  )
})
