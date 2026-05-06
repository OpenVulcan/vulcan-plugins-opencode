/**
 * Directory-scoped runtime state shared by plugin helpers.
 * 供插件辅助逻辑共享的按目录运行时状态。
 *
 * This file belongs to the orchestration support layer. It keeps volatile
 * runtime-only state isolated per working directory, so independent workspaces
 * do not share root-session or event-dedupe state inside the same process.
 * 这个文件属于编排支撑层。
 * 它把纯运行时的易失状态按工作目录隔离开，
 * 从而避免同一进程里的不同工作区共享 root-session 或事件 dedupe 状态。
 */

import { createRootSessionAdmissionCache, createRootSessionProbeCache } from "./root-session-cache-adapters.js"
import {
  createDeletedSessionBarrierState,
  getKnownDeletedSessionIDs,
  type DeletedSessionBarrierState,
} from "./deleted-session-barrier.js"
import { createRootSessionRegistry, type RootSessionRegistry } from "./root-session-registry.js"
import {
  createSessionEventDedupeState,
  summarizeSessionEventDedupeState,
  type SessionEventDedupeState,
} from "./session-event-dedupe.js"
import { normalizeRuntimeDirectoryKey } from "./runtime-directory-key.js"
import type {
  RootSessionAdmissionCache,
  RootSessionProbeCache,
} from "./root-session-probe.js"
import { getKnownRootSessionIDs } from "./root-session-registry.js"

/**
 * Maximum number of finalize timers allowed per runtime scope.
 * 每个运行时作用域允许的最大 finalize 定时器数量。
 *
 * If a workspace has many concurrent sessions and each schedules a finalize
 * timer, the map could grow unbounded before idle pruning kicks in.
 * 如果工作区有大量并发 session，每个都安排 finalize 定时器，
 * Map 可能在空闲清理前无限增长。
 */
export const MAX_FINALIZE_TIMERS = 200

/**
 * One directory-scoped plugin runtime scope.
 *
 * The scope groups together every in-memory structure whose semantics should
 * stay shared inside one workspace, but isolated from other workspaces.
 * 这个作用域会把"在同一工作区里应该共享、在不同工作区之间必须隔离"的
 * 内存结构统一放在一起管理。
 */
export type PluginRuntimeScope = {
  sessionEventDedupe: SessionEventDedupeState
  deletedSessionBarrier: DeletedSessionBarrierState
  rootSessionRegistry: RootSessionRegistry
  rootSessionProbeCache: RootSessionProbeCache
  rootSessionAdmissionCache: RootSessionAdmissionCache
  finalizeTimers: Map<string, NodeJS.Timeout>
}

/**
 * Lazy directory-bound accessor for the current runtime scope.
 * 绑定到目录、按需读取当前运行时作用域的访问器。
 *
 * Plugin instances should keep this accessor instead of capturing one concrete
 * scope object forever. That way, once an idle scope is released and later
 * recreated, future events still reconnect to the current registry-backed
 * scope rather than continuing to mutate one detached stale object.
 * 插件实例应持有这个访问器，而不是永久捕获一份具体的 scope 对象。
 * 这样在 idle scope 被释放、后续又重新创建之后，
 * 新事件仍会重新连接到注册表里的当前 scope，
 * 而不是继续修改一份已经脱离注册表的旧对象。
 */
export type PluginRuntimeScopeAccessor = {
  getScope: () => PluginRuntimeScope
  peekScope: (now?: number) => PluginRuntimeScope | undefined
}

/**
 * Process-wide registry of directory-scoped runtime scopes.
 * 进程级的按目录运行时作用域注册表。
 *
 * Sharing by directory is intentional: if the same workspace is initialized
 * more than once in one process, all hooks should still observe the same
 * root-session and dedupe state instead of drifting apart.
 * 这里刻意按目录共享。
 * 如果同一工作区在一个进程里被初始化多次，所有 hook 仍应看到同一份
 * root-session 与 dedupe 状态，而不是各自维护一份会逐渐漂移的缓存。
 */
const runtimeScopesByDirectory = new Map<string, PluginRuntimeScope>()

/**
 * Determine whether one directory runtime scope is fully idle and releasable.
 * 判断某个目录运行时作用域是否已经完全空闲、可以被释放。
 *
 * A scope is releasable only when it no longer owns any root-session cache,
 * any dedupe state, or any scheduled finalize timers.
 * 只有当一个作用域不再持有 root-session 缓存、dedupe 状态、
 * 以及 finalize 定时器时，它才可以被安全释放。
 */
function isPluginRuntimeScopeIdle(args: {
  scope: PluginRuntimeScope
  now?: number
}) {
  const rootSessionCount = getKnownRootSessionIDs({
    state: args.scope.rootSessionRegistry,
    now: args.now,
  }).size
  const deletedSessionBarrierCount = getKnownDeletedSessionIDs({
    state: args.scope.deletedSessionBarrier,
    now: args.now,
  }).size
  const dedupeSummary = summarizeSessionEventDedupeState({
    state: args.scope.sessionEventDedupe,
    now: args.now,
  })

  return (
    rootSessionCount === 0 &&
    deletedSessionBarrierCount === 0 &&
    dedupeSummary.isEmpty &&
    args.scope.finalizeTimers.size === 0
  )
}

/**
 * Create one fresh runtime scope for a directory that has not been seen yet.
 * 为首次出现的目录创建一份新的运行时作用域。
 *
 * Construction is centralized here so every caller receives the same wiring of
 * registry, adapters, and dedupe state.
 * 这里统一负责构造，
 * 这样每个调用方拿到的 registry、adapter 与 dedupe 状态接线都保持一致。
 */
function createPluginRuntimeScope(): PluginRuntimeScope {
  const rootSessionRegistry = createRootSessionRegistry()
  return {
    sessionEventDedupe: createSessionEventDedupeState(),
    deletedSessionBarrier: createDeletedSessionBarrierState(),
    rootSessionRegistry,
    rootSessionProbeCache: createRootSessionProbeCache({
      state: rootSessionRegistry,
    }),
    rootSessionAdmissionCache: createRootSessionAdmissionCache({
      state: rootSessionRegistry,
    }),
    finalizeTimers: new Map<string, NodeJS.Timeout>(),
  }
}

/**
 * Get the runtime scope associated with one working directory.
 * 读取某个工作目录对应的运行时作用域。
 *
 * The helper lazily creates the scope on first use, then reuses it for all
 * later calls from the same directory.
 * 这个辅助函数会在首次使用时延迟创建作用域，
 * 之后同一目录下的后续调用都会复用同一份状态。
 */
export function getPluginRuntimeScope(directory: string): PluginRuntimeScope {
  const directoryKey = normalizeRuntimeDirectoryKey({
    directory,
  })
  const existing = runtimeScopesByDirectory.get(directoryKey)
  if (existing) return existing

  const created = createPluginRuntimeScope()
  runtimeScopesByDirectory.set(directoryKey, created)
  return created
}

/**
 * Peek the current runtime scope for one directory without creating a new one.
 * 仅读取某个目录当前已有的运行时作用域，而不主动创建新作用域。
 *
 * Some call sites only need to inspect whether scoped state already exists,
 * such as root-guard checks for logging. Those reads must stay side-effect
 * free in the "do not recreate" sense, otherwise a just-released idle scope
 * would be recreated immediately by a harmless membership check. At the same
 * time, peeking is still allowed to reclaim an already-idle scope, because
 * that cleanup only removes dead state instead of creating new state.
 * 某些调用点只想判断"当前是否已经存在某份作用域状态"，
 * 例如日志用的 root-guard 检查。
 * 这类读取必须在"不重建 scope"这个意义上保持无副作用，
 * 否则一个刚刚释放掉的 idle scope 会被一次无害的成员查询立刻重新创建出来。
 * 但 peek 仍允许顺手回收已经变成 idle 的 scope，
 * 因为这种清理只是在删除死状态，而不是引入新状态。
 */
export function peekPluginRuntimeScope(
  directory: string,
  now?: number,
): PluginRuntimeScope | undefined {
  const directoryKey = normalizeRuntimeDirectoryKey({
    directory,
  })
  const scope = runtimeScopesByDirectory.get(directoryKey)
  if (!scope) return undefined

  if (
    isPluginRuntimeScopeIdle({
      scope,
      now,
    })
  ) {
    runtimeScopesByDirectory.delete(directoryKey)
    return undefined
  }

  return scope
}

/**
 * Create one directory-bound accessor that always resolves the latest scope.
 * 创建一个按目录绑定、始终解析最新 scope 的访问器。
 *
 * The accessor is intentionally tiny: callers only keep the directory binding,
 * while every real read still flows through `getPluginRuntimeScope(...)`.
 * That preserves scope release/recreate semantics without asking every caller
 * to duplicate directory normalization and registry lookup logic.
 * 这个访问器刻意保持极小：调用方只需要保留目录绑定，
 * 每次真正读取时仍旧会走 `getPluginRuntimeScope(...)`。
 * 这样既能保留 scope 的释放/重建语义，
 * 也不用让每个调用方重复目录归一化与注册表查找逻辑。
 */
export function createPluginRuntimeScopeAccessor(args: {
  directory: string
}): PluginRuntimeScopeAccessor {
  return {
    getScope() {
      return getPluginRuntimeScope(args.directory)
    },
    peekScope(now?: number) {
      return peekPluginRuntimeScope(args.directory, now)
    },
  }
}

/**
 * Release one directory runtime scope when it has become fully idle.
 * 当某个目录运行时作用域已经完全空闲时，释放它。
 *
 * Session deletion is the main fast path that can make one scope empty, so the
 * plugin can call this helper after cleanup to avoid keeping an empty scope in
 * memory after the owning workspace has fully gone idle.
 * session 删除是最常见的"让一个作用域彻底变空"的快速路径，
 * 因此插件可以在清理结束后调用这个辅助函数，
 * 避免工作区已经彻底空闲后仍把空 scope 留在内存里。
 */
export function releasePluginRuntimeScopeIfIdle(args: {
  directory: string
  now?: number
}) {
  const directoryKey = normalizeRuntimeDirectoryKey({
    directory: args.directory,
  })
  const scope = runtimeScopesByDirectory.get(directoryKey)
  if (!scope) return false

  if (
    !isPluginRuntimeScopeIdle({
      scope,
      now: args.now,
    })
  ) {
    return false
  }

  runtimeScopesByDirectory.delete(directoryKey)
  return true
}

/**
 * Reset the entire directory runtime scope registry.
 * 重置整个目录运行时作用域注册表。
 *
 * INTENTIONALLY NOT PART OF THE PUBLIC API. This is exported solely for
 * test isolation and must never be used in production code.
 * 这不属于公共 API。仅供测试隔离使用，绝不应在生产代码中调用。
 */
export function __resetPluginRuntimeScopeForTests() {
  runtimeScopesByDirectory.clear()
}
