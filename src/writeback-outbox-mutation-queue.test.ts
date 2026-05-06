/**
 * Tests for directory-scoped writeback outbox mutation serialization.
 * 按目录写回 outbox 修改串行化测试。
 *
 * These tests protect the ordering boundary around the shared persisted outbox
 * file so concurrent finalize paths in one workspace cannot overwrite each
 * other's queued writeback snapshots.
 * 这些测试用于守护共享持久化 outbox 文件的顺序边界，
 * 避免同一工作区内的并发 finalize 路径互相覆盖对方的排队写回快照。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  createWritebackOutboxMutationQueueState,
  runSerializedWritebackOutboxMutation,
  summarizeWritebackOutboxMutationQueueState,
} from "./writeback-outbox-mutation-queue.js"

/**
 * Wait for one event-loop turn so queued async work can advance.
 * 等待一个事件循环周期，让排队的异步工作有机会推进。
 */
function waitForAsyncTurn() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

test("runSerializedWritebackOutboxMutation serializes same-directory outbox mutations", async () => {
  const state = createWritebackOutboxMutationQueueState()
  const callOrder: string[] = []
  let releaseFirst!: () => void
  const firstBlocker = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = runSerializedWritebackOutboxMutation({
    state,
    directory: "D:/projects/shared-outbox",
    async mutate() {
      callOrder.push("first:start")
      await firstBlocker
      callOrder.push("first:end")
      return "first"
    },
  })

  const second = runSerializedWritebackOutboxMutation({
    state,
    directory: "d:/projects/shared-outbox/",
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
  assert.deepEqual(summarizeWritebackOutboxMutationQueueState({ state }), {
    pendingDirectoryCount: 0,
  })
})

test("runSerializedWritebackOutboxMutation allows different directories to progress independently", async () => {
  const state = createWritebackOutboxMutationQueueState()
  const callOrder: string[] = []
  let releaseFirst!: () => void
  const firstBlocker = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = runSerializedWritebackOutboxMutation({
    state,
    directory: "/tmp/workspace-a",
    async mutate() {
      callOrder.push("a:start")
      await firstBlocker
      callOrder.push("a:end")
      return "a"
    },
  })

  const second = runSerializedWritebackOutboxMutation({
    state,
    directory: "/tmp/workspace-b",
    async mutate() {
      callOrder.push("b:start")
      callOrder.push("b:end")
      return "b"
    },
  })

  await waitForAsyncTurn()
  assert.deepEqual(callOrder, ["a:start", "b:start", "b:end"])

  releaseFirst()

  assert.deepEqual(await Promise.all([first, second]), ["a", "b"])
  assert.deepEqual(callOrder, ["a:start", "b:start", "b:end", "a:end"])
  assert.deepEqual(summarizeWritebackOutboxMutationQueueState({ state }), {
    pendingDirectoryCount: 0,
  })
})
