/**
 * Tests for session-scoped logical runtime mutation serialization.
 * 按 session 逻辑运行时修改串行化测试。
 *
 * These tests lock in the layered queue contract used by the plugin:
 * session-owned state transitions stay ordered per session, while unrelated
 * sessions in the same directory can still overlap between short shared-file
 * I/O windows.
 * 这些测试会锁定插件当前使用的分层队列契约：
 * session 自身的状态迁移在单 session 内保持有序，
 * 但同目录下无关 session 仍可在短暂的共享文件 I/O 窗口之外继续并发推进。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  createSessionRuntimeMutationQueueState,
  runSerializedSessionRuntimeMutation,
  summarizeSessionRuntimeMutationQueueState,
} from "./session-runtime-mutation-queue.js"
import {
  createSessionStateFileMutationQueueState,
  runSerializedSessionStateFileMutation,
} from "./session-state-file-mutation-queue.js"

/**
 * Wait for one event-loop turn so queued async work can advance.
 * 等待一个事件循环周期，让排队的异步工作有机会继续推进。
 *
 * The queue helpers are Promise-based, so tests use this tiny helper to
 * observe whether another mutation has started too early.
 * 队列辅助模块基于 Promise，
 * 因此测试会借助这个小工具观察另一条修改是否过早启动。
 */
function waitForAsyncTurn() {
  return new Promise<void>((resolve) => {
    setImmediate(resolve)
  })
}

test("runSerializedSessionRuntimeMutation serializes same-session logical mutations", async () => {
  const state = createSessionRuntimeMutationQueueState()
  const callOrder: string[] = []
  let releaseFirst!: () => void
  const firstBlocker = new Promise<void>((resolve) => {
    releaseFirst = resolve
  })

  const first = runSerializedSessionRuntimeMutation({
    state,
    directory: "D:/projects/runtime-order",
    sessionID: "ses_a",
    async mutate() {
      callOrder.push("first:start")
      await firstBlocker
      callOrder.push("first:end")
      return "first"
    },
  })

  const second = runSerializedSessionRuntimeMutation({
    state,
    directory: "D:/projects/runtime-order",
    sessionID: "ses_a",
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
  assert.deepEqual(summarizeSessionRuntimeMutationQueueState({ state }), {
    pendingSessionCount: 0,
  })
})

test("layered session and directory queues allow different sessions to overlap between file I/O windows", async () => {
  const sessionState = createSessionRuntimeMutationQueueState()
  const fileState = createSessionStateFileMutationQueueState()
  const callOrder: string[] = []
  let releaseFirstNetwork!: () => void
  const firstNetworkBlocker = new Promise<void>((resolve) => {
    releaseFirstNetwork = resolve
  })

  const mutateSession = (sessionID: string, networkBlocker?: Promise<void>) =>
    runSerializedSessionRuntimeMutation({
      state: sessionState,
      directory: "D:/projects/shared-directory",
      sessionID,
      async mutate() {
        callOrder.push(`${sessionID}:session-start`)

        await runSerializedSessionStateFileMutation({
          state: fileState,
          directory: "D:/projects/shared-directory",
          async mutate() {
            callOrder.push(`${sessionID}:file-load`)
          },
        })

        callOrder.push(`${sessionID}:network-start`)
        if (networkBlocker) {
          await networkBlocker
        }
        callOrder.push(`${sessionID}:network-end`)

        await runSerializedSessionStateFileMutation({
          state: fileState,
          directory: "D:/projects/shared-directory",
          async mutate() {
            callOrder.push(`${sessionID}:file-save`)
          },
        })
      },
    })

  const first = mutateSession("ses_first", firstNetworkBlocker)
  await waitForAsyncTurn()

  const second = mutateSession("ses_second")
  await waitForAsyncTurn()

  assert.deepEqual(callOrder, [
    "ses_first:session-start",
    "ses_first:file-load",
    "ses_first:network-start",
    "ses_second:session-start",
    "ses_second:file-load",
    "ses_second:network-start",
    "ses_second:network-end",
    "ses_second:file-save",
  ])

  releaseFirstNetwork()

  await Promise.all([first, second])
  assert.deepEqual(callOrder, [
    "ses_first:session-start",
    "ses_first:file-load",
    "ses_first:network-start",
    "ses_second:session-start",
    "ses_second:file-load",
    "ses_second:network-start",
    "ses_second:network-end",
    "ses_second:file-save",
    "ses_first:network-end",
    "ses_first:file-save",
  ])
  assert.deepEqual(summarizeSessionRuntimeMutationQueueState({ state: sessionState }), {
    pendingSessionCount: 0,
  })
})
