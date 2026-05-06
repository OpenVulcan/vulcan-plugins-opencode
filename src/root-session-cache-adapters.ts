/**
 * Root-session cache adapters shared by plugin-side probe and admission flows.
 * 插件侧 root-session 探测与准入流程共用的缓存适配器。
 *
 * This file belongs to the orchestration support layer. It bridges the
 * registry's bounded state model into the smaller cache contracts expected by
 * `probeRootSession(...)` and `admitRootSession(...)`, while preserving the
 * registry's "active hit refreshes TTL" semantics on every cache read.
 * 这个文件属于编排支撑层。
 * 它负责把 registry 的有界状态模型桥接成 `probeRootSession(...)` 与
 * `admitRootSession(...)` 所需的更小缓存契约，
 * 同时确保每次缓存读取都能保留 registry 的“活跃命中会续期 TTL”语义。
 */

import type {
  RootSessionAdmissionCache,
  RootSessionProbeCache,
} from "./root-session-probe.js"
import {
  hasRootSession,
  rememberRootSession,
  type RootSessionRegistry,
} from "./root-session-registry.js"

/**
 * Injectable clock used by root-session cache adapters.
 * root-session 缓存适配器使用的可注入时钟。
 *
 * Production code uses `Date.now()`, while tests can inject a deterministic
 * clock to verify TTL refresh behavior without waiting in real time.
 * 生产环境默认使用 `Date.now()`，
 * 测试则可以注入可控时钟，用于验证 TTL 续期行为，而无需真实等待时间流逝。
 */
export type RootSessionRegistryNow = () => number

/**
 * Create the read-only cache view consumed by `probeRootSession(...)`.
 * 创建 `probeRootSession(...)` 使用的只读缓存视图。
 *
 * Even though the probe contract only exposes `has`, that lookup must still
 * refresh the registry's idle timer on a hit. Otherwise active root sessions
 * observed only through probe-only paths such as compact hooks could age out
 * and later regress to `unknown` when host metadata is temporarily unavailable.
 * 虽然 probe 契约表面上只暴露 `has`，
 * 但命中读取时仍必须刷新 registry 的闲置计时。
 * 否则那些只经由 compact hook 等 probe-only 路径被观测到的活跃 root session，
 * 仍可能在宿主元数据暂时不可用时错误老化并退回 `unknown`。
 */
export function createRootSessionProbeCache(args: {
  state: RootSessionRegistry
  now?: RootSessionRegistryNow
}): RootSessionProbeCache {
  return {
    has(sessionID: string) {
      return hasRootSession({
        state: args.state,
        sessionID,
        now: args.now?.(),
      })
    },
  }
}

/**
 * Create the mutable cache view consumed by `admitRootSession(...)`.
 * 创建 `admitRootSession(...)` 使用的可变缓存视图。
 *
 * Admission reuses the same hit-refresh behavior as probe reads, and extends
 * it with `add` so a newly proven root session immediately enters the bounded
 * registry under one consistent clock source.
 * 准入缓存会复用 probe 读取时相同的命中续期语义，
 * 并在此基础上增加 `add`，
 * 让新证明成立的 root session 能在同一时钟语义下立即进入有界 registry。
 */
export function createRootSessionAdmissionCache(args: {
  state: RootSessionRegistry
  now?: RootSessionRegistryNow
}): RootSessionAdmissionCache {
  return {
    has(sessionID: string) {
      return hasRootSession({
        state: args.state,
        sessionID,
        now: args.now?.(),
      })
    },
    add(sessionID: string) {
      rememberRootSession({
        state: args.state,
        sessionID,
        now: args.now?.(),
      })
    },
  }
}
