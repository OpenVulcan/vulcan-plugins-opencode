/**
 * Tests for directory-scoped session-state file mutation serialization.
 * 按目录串行化 session 状态文件修改的测试。
 *
 * These tests protect the contract that one workspace owns one persisted
 * session-state file, so mutations from different sessions inside the same
 * directory must never run their load/save cycles in parallel.
 * 这些测试用于保护这样一条契约：
 * 一个工作区只拥有一份共享的持久化 session 状态文件，
 * 因此同目录下不同 session 的修改绝不能并行执行读写周期。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  createSessionStateFileMutationQueueState,
  runSerializedSessionStateFileMutation,
  summarizeSessionStateFileMutationQueueState,
} from "./session-state-file-mutation-queue.js"

/**
 * Wait for one event-loop turn so queued async callbacks have a chance to start.
 * 等待一个事件循环周期，让已经排队的异步回调有机会真正开始执行。
 *
 * The queue helper itself is Promise-based, so tests use this to observe
 * whether a later mutation has started too early.
 * 队列辅助模块本身基于 Promise，
 * 因此测试会用它来观察后续修改是否过早开始执行。
 */
function waitForAsyncTurn() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

test("runSerializedSessionStateFileMutation serializes same-directory mutations across sessions", async () => {
  const state = createSessionStateFileMutationQueueState()
  const callOrder: string[] = []
  let releaseFirst!: () => void
  const firstBlocker = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = runSerializedSessionStateFileMutation({
    state,
    directory: "D:/projects/shared-workspace",
    async mutate() {
      callOrder.push("first:start")
      await firstBlocker
      callOrder.push("first:end")
      return "first"
    },
  })

  const second = runSerializedSessionStateFileMutation({
    state,
    directory: "D:/projects/shared-workspace",
    async mutate() {
      callOrder.push("second:start")
      callOrder.push("second:end")
      return "second"
    },
  })

  await waitForAsyncTurn()
  assert.deepEqual(callOrder, ["first:start"])

  releaseFirst()

  assert.deepEqual(await Promise.all([first, second]), ["first", "second"])
  assert.deepEqual(callOrder, ["first:start", "first:end", "second:start", "second:end"])
  assert.deepEqual(summarizeSessionStateFileMutationQueueState({ state }), {
    pendingDirectoryCount: 0,
  })
})

test("runSerializedSessionStateFileMutation keeps different directories independent", async () => {
  const state = createSessionStateFileMutationQueueState()
  const callOrder: string[] = []
  let releaseLeft!: () => void
  const leftBlocker = new Promise<void>((resolve) => {
    releaseLeft = resolve
  })

  const left = runSerializedSessionStateFileMutation({
    state,
    directory: "D:/projects/workspace-left",
    async mutate() {
      callOrder.push("left:start")
      await leftBlocker
      callOrder.push("left:end")
      return "left"
    },
  })

  const right = runSerializedSessionStateFileMutation({
    state,
    directory: "D:/projects/workspace-right",
    async mutate() {
      callOrder.push("right:start")
      callOrder.push("right:end")
      return "right"
    },
  })

  await waitForAsyncTurn()
  assert.deepEqual(callOrder, ["left:start", "right:start", "right:end"])

  releaseLeft()

  assert.deepEqual(await Promise.all([left, right]), ["left", "right"])
  assert.deepEqual(callOrder, ["left:start", "right:start", "right:end", "left:end"])
  assert.deepEqual(summarizeSessionStateFileMutationQueueState({ state }), {
    pendingDirectoryCount: 0,
  })
})
