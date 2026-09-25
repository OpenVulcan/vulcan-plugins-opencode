/**
 * Tests for the root-session probe helper.
 * 根会话探测辅助模块测试。
 *
 * These tests cover the compact-hook safety contract: compact notifications
 * must only be sent for confirmed root sessions, and cache hits should avoid a
 * redundant host metadata lookup on the hot path.
 * 这些测试覆盖 compact hook 的安全契约：
 * compact 通知只能发给已确认的 root session，
 * 而缓存命中时也不应在热路径上重复查询宿主元数据。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { admitRootSession, probeRootSession } from "./root-session-probe.js"

test("probeRootSession prefers the known-root cache before calling session.get", async () => {
  let getCalls = 0
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => {
          getCalls += 1
          return {
            data: {
              parentID: "child-session",
            },
          }
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs: new Set(["ses_root"]),
  })

  assert.deepEqual(result, {
    isRoot: true,
    source: "cache",
  })
  assert.equal(getCalls, 0)
})

test("probeRootSession uses session.get to confirm a root session on cache miss", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => ({
          data: {
            id: "ses_root",
            parentID: undefined,
          },
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs: new Set<string>(),
  })

  assert.deepEqual(result, {
    isRoot: true,
    source: "session.get",
    parentID: undefined,
    observedSessionID: "ses_root",
  })
})

test("probeRootSession marks sessions with parentID as non-root", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => ({
          data: {
            id: "ses_child",
            parentID: "ses_parent",
          },
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_child",
    knownRootSessionIDs: new Set<string>(),
  })

  assert.deepEqual(result, {
    isRoot: false,
    source: "session.get",
    parentID: "ses_parent",
    observedSessionID: "ses_child",
  })
})

test("probeRootSession falls back to unknown when neither cache nor session.get can confirm", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => {
          throw new Error("host session api unavailable")
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_unknown",
    knownRootSessionIDs: new Set<string>(),
  })

  assert.deepEqual(result, {
    isRoot: false,
    source: "unknown",
  })
})

test("probeRootSession accepts a matching session.created event hint when session.get is unavailable", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => {
          throw new Error("host session api unavailable")
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs: new Set<string>(),
    eventHint: {
      kind: "session.created",
      id: "ses_root",
    },
  })

  assert.deepEqual(result, {
    isRoot: true,
    source: "event-hint",
    parentID: undefined,
    observedSessionID: "ses_root",
  })
})

test("probeRootSession accepts a matching session.created event hint when session.get is inconclusive", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => ({
          data: {},
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs: new Set<string>(),
    eventHint: {
      kind: "session.created",
      id: "ses_root",
    },
  })

  assert.deepEqual(result, {
    isRoot: true,
    source: "event-hint",
    parentID: undefined,
    observedSessionID: "ses_root",
  })
})

test("probeRootSession treats session.created hints with parentID as non-root", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => {
          throw new Error("host session api unavailable")
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_child",
    knownRootSessionIDs: new Set<string>(),
    eventHint: {
      kind: "session.created",
      id: "ses_child",
      parentID: "ses_parent",
    },
  })

  assert.deepEqual(result, {
    isRoot: false,
    source: "event-hint",
    parentID: "ses_parent",
    observedSessionID: "ses_child",
  })
})

test("probeRootSession keeps malformed session.get payloads in unknown state", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => ({
          data: {},
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_unknown",
    knownRootSessionIDs: new Set<string>(),
  })

  assert.deepEqual(result, {
    isRoot: false,
    source: "unknown",
    parentID: undefined,
    observedSessionID: undefined,
  })
})

test("probeRootSession keeps mismatched session.get payloads in unknown state", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => ({
          data: {
            id: "ses_other",
          },
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_expected",
    knownRootSessionIDs: new Set<string>(),
  })

  assert.deepEqual(result, {
    isRoot: false,
    source: "unknown",
    parentID: undefined,
    observedSessionID: "ses_other",
  })
})

test("probeRootSession keeps conflicting session.get ids above session.created event hints", async () => {
  const result = await probeRootSession({
    client: {
      session: {
        get: async () => ({
          data: {
            id: "ses_other",
          },
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_expected",
    knownRootSessionIDs: new Set<string>(),
    eventHint: {
      kind: "session.created",
      id: "ses_expected",
    },
  })

  assert.deepEqual(result, {
    isRoot: false,
    source: "unknown",
    parentID: undefined,
    observedSessionID: "ses_other",
  })
})

test("admitRootSession caches a confirmed root session after one successful probe", async () => {
  let getCalls = 0
  const knownRootSessionIDs = new Set<string>()

  const first = await admitRootSession({
    client: {
      session: {
        get: async () => {
          getCalls += 1
          return {
            data: {
              id: "ses_root",
            },
          }
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs,
  })

  const second = await admitRootSession({
    client: {
      session: {
        get: async () => {
          getCalls += 1
          return {
            data: {
              id: "ses_root",
              parentID: "should-not-be-read-after-cache",
            },
          }
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs,
  })

  assert.deepEqual(first, {
    admitted: true,
    source: "session.get",
    rootProbe: {
      isRoot: true,
      source: "session.get",
      parentID: undefined,
      observedSessionID: "ses_root",
    },
  })
  assert.deepEqual(second, {
    admitted: true,
    source: "cache",
  })
  assert.equal(getCalls, 1)
  assert.equal(knownRootSessionIDs.has("ses_root"), true)
})

test("admitRootSession caches a root session proven by session.created event hint", async () => {
  const knownRootSessionIDs = new Set<string>()

  const first = await admitRootSession({
    client: {
      session: {
        get: async () => {
          throw new Error("host session api unavailable")
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs,
    eventHint: {
      kind: "session.created",
      id: "ses_root",
    },
  })

  const second = await admitRootSession({
    client: {
      session: {
        get: async () => {
          throw new Error("host session api unavailable")
        },
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs,
  })

  assert.deepEqual(first, {
    admitted: true,
    source: "event-hint",
    rootProbe: {
      isRoot: true,
      source: "event-hint",
      parentID: undefined,
      observedSessionID: "ses_root",
    },
  })
  assert.deepEqual(second, {
    admitted: true,
    source: "cache",
  })
  assert.equal(knownRootSessionIDs.has("ses_root"), true)
})

test("admitRootSession caches a root session when session.get is inconclusive but session.created is explicit", async () => {
  const knownRootSessionIDs = new Set<string>()

  const result = await admitRootSession({
    client: {
      session: {
        get: async () => ({
          data: {},
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_root",
    knownRootSessionIDs,
    eventHint: {
      kind: "session.created",
      id: "ses_root",
    },
  })

  assert.deepEqual(result, {
    admitted: true,
    source: "event-hint",
    rootProbe: {
      isRoot: true,
      source: "event-hint",
      parentID: undefined,
      observedSessionID: "ses_root",
    },
  })
  assert.equal(knownRootSessionIDs.has("ses_root"), true)
})

test("admitRootSession refuses to cache unknown sessions", async () => {
  const knownRootSessionIDs = new Set<string>()

  const result = await admitRootSession({
    client: {
      session: {
        get: async () => ({
          data: {},
        }),
      },
    },
    directory: "D:/projects/vulcan-plugins-opencode",
    sessionID: "ses_unknown",
    knownRootSessionIDs,
  })

  assert.deepEqual(result, {
    admitted: false,
    source: "unknown",
    rootProbe: {
      isRoot: false,
      source: "unknown",
      parentID: undefined,
      observedSessionID: undefined,
    },
  })
  assert.equal(knownRootSessionIDs.has("ses_unknown"), false)
})
