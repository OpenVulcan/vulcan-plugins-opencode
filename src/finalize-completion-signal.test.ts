/**
 * Tests for finalize completion-signal adaptation.
 * finalize 完成信号适配测试。
 *
 * This file belongs to the orchestration support test layer. It protects the
 * current turn-splitting behavior by verifying that newer assistant-completed
 * signals only improve finalize scheduling, without changing how turns merge,
 * split, or become submittable.
 * 这个文件属于编排支撑测试层，
 * 用来保护当前 turn 切分行为：较新的 assistant 完成信号只能增强 finalize
 * 调度，不能改变 turn 何时 merge、split 或最终可提交。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { resolveFinalizeCompletionSignal } from "./finalize-completion-signal.js"
import { shouldCancelFinalizeOnSessionStatus } from "./finalize-session-status-policy.js"

test("should keep the historical session.idle completion signal", () => {
  assert.equal(
    resolveFinalizeCompletionSignal({
      eventType: "session.idle",
    }),
    "session-idle",
  )
})

test("should expose assistant-stable-message when message.updated promotes stability", () => {
  assert.equal(
    resolveFinalizeCompletionSignal({
      eventType: "message.updated",
      messageUpdateTransition: {
        becameStable: true,
      },
    }),
    "assistant-stable-message",
  )
})

test("should ignore message.updated events that do not promote stability", () => {
  assert.equal(
    resolveFinalizeCompletionSignal({
      eventType: "message.updated",
      messageUpdateTransition: {
        becameStable: false,
      },
    }),
    undefined,
  )
})

test("should restore finalize after busy cancels an early idle schedule before the late completion update", () => {
  const firstSignal = resolveFinalizeCompletionSignal({
    eventType: "session.idle",
  })
  assert.equal(firstSignal, "session-idle")

  const cancelled = shouldCancelFinalizeOnSessionStatus({
    statusType: "busy",
    activeTurn: {
      hasStableAssistant: false,
    },
  })
  assert.equal(cancelled, true)

  const recoverySignal = resolveFinalizeCompletionSignal({
    eventType: "message.updated",
    messageUpdateTransition: {
      becameStable: true,
    },
  })
  assert.equal(recoverySignal, "assistant-stable-message")
})
