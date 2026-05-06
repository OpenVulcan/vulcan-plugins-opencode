/**
 * Tests for session runtime disposal helpers.
 * session 运行时销毁辅助模块测试。
 *
 * These tests make sure deleted-session cleanup always releases in-memory
 * ownership state, even when finalize cancellation or persisted-state cleanup
 * fails on the way.
 * 这些测试用于确保已删除 session 的清理链路始终会释放内存归属状态，
 * 即便 finalize 取消或持久化状态清理在过程中失败也不能例外。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { disposeSessionRuntime } from "./session-runtime-disposal.js"

test("disposeSessionRuntime clears every stage on the happy path", async () => {
  const events: string[] = []

  const result = await disposeSessionRuntime({
    sessionID: "ses_root",
    cancelFinalizeState: async () => {
      events.push("cancel")
    },
    clearPersistedState: async () => {
      events.push("persist")
    },
    clearRootSession: (sessionID) => {
      events.push(`root:${sessionID}`)
      return true
    },
    clearDedupeState: (sessionID) => {
      events.push(`dedupe:${sessionID}`)
      return {
        clearedStatus: true,
        clearedMessageCount: 2,
      }
    },
  })

  assert.deepEqual(events, ["cancel", "persist", "dedupe:ses_root", "root:ses_root"])
  assert.deepEqual(result, {
    sessionID: "ses_root",
    finalizeStateCleared: true,
    persistedStateCleared: true,
    rootSessionRemoved: true,
    clearedDedupeState: {
      clearedStatus: true,
      clearedMessageCount: 2,
    },
    cleanupErrors: [],
    completedWithoutErrors: true,
    inMemoryOwnershipCleared: true,
  })
})

test("disposeSessionRuntime still clears in-memory state when finalize cancellation fails", async () => {
  const events: string[] = []

  const result = await disposeSessionRuntime({
    sessionID: "ses_root",
    cancelFinalizeState: async () => {
      events.push("cancel")
      throw new Error("cancel failed")
    },
    clearPersistedState: async () => {
      events.push("persist")
    },
    clearRootSession: (sessionID) => {
      events.push(`root:${sessionID}`)
      return true
    },
    clearDedupeState: (sessionID) => {
      events.push(`dedupe:${sessionID}`)
      return {
        clearedStatus: false,
        clearedMessageCount: 1,
      }
    },
  })

  assert.deepEqual(events, ["cancel", "persist", "dedupe:ses_root", "root:ses_root"])
  assert.deepEqual(result, {
    sessionID: "ses_root",
    finalizeStateCleared: false,
    persistedStateCleared: true,
    rootSessionRemoved: true,
    clearedDedupeState: {
      clearedStatus: false,
      clearedMessageCount: 1,
    },
    cleanupErrors: [
      {
        stage: "finalize",
        name: "Error",
        message: "cancel failed",
      },
    ],
    completedWithoutErrors: false,
    inMemoryOwnershipCleared: true,
  })
})

test("disposeSessionRuntime still clears in-memory state when persisted cleanup fails", async () => {
  const events: string[] = []

  const result = await disposeSessionRuntime({
    sessionID: "ses_root",
    cancelFinalizeState: async () => {
      events.push("cancel")
    },
    clearPersistedState: async () => {
      events.push("persist")
      throw new Error("persist failed")
    },
    clearRootSession: (sessionID) => {
      events.push(`root:${sessionID}`)
      return false
    },
    clearDedupeState: (sessionID) => {
      events.push(`dedupe:${sessionID}`)
      return {
        clearedStatus: true,
        clearedMessageCount: 0,
      }
    },
  })

  assert.deepEqual(events, ["cancel", "persist", "dedupe:ses_root", "root:ses_root"])
  assert.deepEqual(result, {
    sessionID: "ses_root",
    finalizeStateCleared: true,
    persistedStateCleared: false,
    rootSessionRemoved: false,
    clearedDedupeState: {
      clearedStatus: true,
      clearedMessageCount: 0,
    },
    cleanupErrors: [
      {
        stage: "persisted-state",
        name: "Error",
        message: "persist failed",
      },
    ],
    completedWithoutErrors: false,
    inMemoryOwnershipCleared: true,
  })
})

test("disposeSessionRuntime records both cleanup errors when both stages fail", async () => {
  const events: string[] = []

  const result = await disposeSessionRuntime({
    sessionID: "ses_root",
    cancelFinalizeState: async () => {
      events.push("cancel")
      throw new Error("cancel failed")
    },
    clearPersistedState: async () => {
      events.push("persist")
      throw new Error("persist failed")
    },
    clearRootSession: (sessionID) => {
      events.push(`root:${sessionID}`)
      return true
    },
    clearDedupeState: (sessionID) => {
      events.push(`dedupe:${sessionID}`)
      return {
        clearedStatus: true,
        clearedMessageCount: 3,
      }
    },
  })

  assert.deepEqual(events, ["cancel", "persist", "dedupe:ses_root", "root:ses_root"])
  assert.deepEqual(result, {
    sessionID: "ses_root",
    finalizeStateCleared: false,
    persistedStateCleared: false,
    rootSessionRemoved: true,
    clearedDedupeState: {
      clearedStatus: true,
      clearedMessageCount: 3,
    },
    cleanupErrors: [
      {
        stage: "finalize",
        name: "Error",
        message: "cancel failed",
      },
      {
        stage: "persisted-state",
        name: "Error",
        message: "persist failed",
      },
    ],
    completedWithoutErrors: false,
    inMemoryOwnershipCleared: true,
  })
})

test("disposeSessionRuntime still attempts root cleanup when dedupe cleanup throws", async () => {
  const events: string[] = []

  const result = await disposeSessionRuntime({
    sessionID: "ses_root",
    cancelFinalizeState: async () => {
      events.push("cancel")
    },
    clearPersistedState: async () => {
      events.push("persist")
    },
    clearRootSession: (sessionID) => {
      events.push(`root:${sessionID}`)
      return true
    },
    clearDedupeState: (sessionID) => {
      events.push(`dedupe:${sessionID}`)
      throw new Error("dedupe failed")
    },
  })

  assert.deepEqual(events, ["cancel", "persist", "dedupe:ses_root", "root:ses_root"])
  assert.deepEqual(result, {
    sessionID: "ses_root",
    finalizeStateCleared: true,
    persistedStateCleared: true,
    rootSessionRemoved: true,
    clearedDedupeState: {
      clearedStatus: false,
      clearedMessageCount: 0,
    },
    cleanupErrors: [
      {
        stage: "dedupe-state",
        name: "Error",
        message: "dedupe failed",
      },
    ],
    completedWithoutErrors: false,
    inMemoryOwnershipCleared: false,
  })
})

test("disposeSessionRuntime still reports dedupe cleanup when root cleanup throws", async () => {
  const events: string[] = []

  const result = await disposeSessionRuntime({
    sessionID: "ses_root",
    cancelFinalizeState: async () => {
      events.push("cancel")
    },
    clearPersistedState: async () => {
      events.push("persist")
    },
    clearRootSession: (sessionID) => {
      events.push(`root:${sessionID}`)
      throw new Error("root failed")
    },
    clearDedupeState: (sessionID) => {
      events.push(`dedupe:${sessionID}`)
      return {
        clearedStatus: true,
        clearedMessageCount: 4,
      }
    },
  })

  assert.deepEqual(events, ["cancel", "persist", "dedupe:ses_root", "root:ses_root"])
  assert.deepEqual(result, {
    sessionID: "ses_root",
    finalizeStateCleared: true,
    persistedStateCleared: true,
    rootSessionRemoved: false,
    clearedDedupeState: {
      clearedStatus: true,
      clearedMessageCount: 4,
    },
    cleanupErrors: [
      {
        stage: "root-session",
        name: "Error",
        message: "root failed",
      },
    ],
    completedWithoutErrors: false,
    inMemoryOwnershipCleared: false,
  })
})

test("disposeSessionRuntime respects precleared stages without running them twice", async () => {
  const events: string[] = []

  const result = await disposeSessionRuntime({
    sessionID: "ses_root",
    precleared: {
      finalize: {
        handled: true,
        cleared: true,
      },
      rootSession: {
        handled: true,
        removed: false,
      },
      dedupeState: {
        handled: true,
        result: {
          clearedStatus: true,
          clearedMessageCount: 5,
        },
      },
    },
    cancelFinalizeState: async () => {
      events.push("cancel")
    },
    clearPersistedState: async () => {
      events.push("persist")
    },
    clearRootSession: (sessionID) => {
      events.push(`root:${sessionID}`)
      return true
    },
    clearDedupeState: (sessionID) => {
      events.push(`dedupe:${sessionID}`)
      return {
        clearedStatus: false,
        clearedMessageCount: 0,
      }
    },
  })

  assert.deepEqual(events, ["persist"])
  assert.deepEqual(result, {
    sessionID: "ses_root",
    finalizeStateCleared: true,
    persistedStateCleared: true,
    rootSessionRemoved: false,
    clearedDedupeState: {
      clearedStatus: true,
      clearedMessageCount: 5,
    },
    cleanupErrors: [],
    completedWithoutErrors: true,
    inMemoryOwnershipCleared: true,
  })
})
