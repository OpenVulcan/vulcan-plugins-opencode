/**
 * Root-session probe helpers for OpenCode host metadata.
 * OpenCode 宿主元数据的根会话探测辅助模块。
 *
 * This file belongs to the orchestration support layer. It is used when the
 * plugin must decide whether one host session should participate in root-only
 * VMM flows such as compact notifications.
 * 这个文件属于编排支撑层，
 * 用在插件必须判断某个宿主 session 是否应参与“仅 root session 可执行”的
 * VMM 链路时，例如 compact 通知。
 */

/**
 * Minimal host client shape needed by the root-session probe.
 * 根会话探测所需的最小宿主 client 形态。
 *
 * The helper intentionally depends only on `session.get`, so it can stay easy
 * to test and does not couple itself to the much larger plugin runtime client.
 * 这里刻意只依赖 `session.get`，
 * 这样辅助逻辑更容易测试，也不会反向耦合整个体量更大的插件运行时 client。
 */
export type RootSessionProbeClient = {
  session?: {
    get?: (options: {
      path: {
        id: string
      }
      query?: {
        directory?: string
      }
    }) => Promise<unknown>
  }
}

/**
 * Explicit event hint that can safely participate in root-session probing.
 * 可安全参与根会话探测的显式事件提示。
 *
 * Only semantically strong host events such as `session.created` should flow
 * into this shape. The helper does not accept generic message hints here,
 * because weak heuristics would re-open the cache-poisoning bugs we just
 * fixed on the compact/precheck path.
 * 只有像 `session.created` 这样语义足够强的宿主事件，才应该进入这条结构。
 * 这里不会接受普通消息级提示，因为那类弱启发式会重新打开我们刚修掉的
 * compact / precheck 链路缓存污染问题。
 */
export type RootSessionEventHint = {
  kind: "session.created"
  id?: string
  parentID?: string
}

/**
 * One normalized root-session probe result.
 * 一条归一化后的根会话探测结果。
 *
 * The probe keeps both the boolean verdict and the source of truth so callers
 * can log whether the decision came from the in-memory root cache or from a
 * fresh host metadata lookup.
 * 这个结果同时保留布尔判定和判定来源，
 * 让调用方可以记录当前结论究竟来自内存 root 缓存，还是一次新的宿主元数据查询。
 */
export type RootSessionProbeResult = {
  isRoot: boolean
  source: "cache" | "session.get" | "event-hint" | "unknown"
  parentID?: string
  observedSessionID?: string
}

/**
 * One normalized root-session cache admission result.
 * 一条归一化后的 root-session 缓存准入结果。
 *
 * The plugin needs a stable shape here because both `chat.message` and other
 * root-only hooks want to know whether the session was admitted, whether that
 * came from cache or from a fresh probe, and what the underlying probe saw.
 * 插件需要一份稳定结果结构，
 * 因为 `chat.message` 和其他仅限 root 的 hook 都希望知道：
 * 当前 session 是否已获准进入 root 缓存、这个结论来自缓存还是新探测、
 * 以及底层探测到底看到了什么。
 */
export type RootSessionAdmissionResult = {
  admitted: boolean
  source: "cache" | "session.get" | "event-hint" | "unknown"
  rootProbe?: RootSessionProbeResult
}

/**
 * Minimal read-only root-session cache contract used by root probes.
 * 根会话探测所需的最小只读缓存契约。
 *
 * The probe only needs membership checks, so callers do not have to expose a
 * full mutable `Set` implementation just to satisfy the helper.
 * 探测逻辑只需要成员判断，
 * 因此调用方无需为了这个辅助函数暴露完整可变 `Set` 实现。
 */
export type RootSessionProbeCache = {
  has: (sessionID: string) => boolean
}

/**
 * Minimal mutable root-session cache contract used by cache admission.
 * 缓存准入所需的最小可变根会话缓存契约。
 *
 * Admission extends the read-only contract with `add`, keeping the helper
 * decoupled from whichever concrete cache structure the plugin prefers.
 * 准入逻辑会在只读契约上增加 `add`，
 * 这样辅助函数就不必耦合插件最终选用的具体缓存结构。
 */
export type RootSessionAdmissionCache = RootSessionProbeCache & {
  add: (sessionID: string) => void
}

/**
 * Extract one session object from SDK-style `{ data }` envelopes.
 * 从 SDK 风格的 `{ data }` 包装中提取会话对象。
 *
 * Different host calls can return either the plain entity or an envelope with
 * `data`, so the probe normalizes the shape before reading `parentID`.
 * 宿主调用既可能直接返回实体，也可能返回带 `data` 的包装，
 * 因此这里会先把形态归一化，再读取 `parentID`。
 */
function extractSessionEnvelopeData(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined
  const record = raw as Record<string, unknown>
  return record["data"] && typeof record["data"] === "object"
    ? (record["data"] as Record<string, unknown>)
    : record
}

/**
 * Probe whether one session should be treated as a root session.
 * 探测某个 session 是否应被视为 root session。
 *
 * The probe prefers the caller-provided root cache for hot-path speed, and
 * falls back to `session.get` only when the cache has no prior knowledge. If
 * the host cannot confirm the session shape, the helper returns `unknown`
 * rather than guessing, because a wrong compact notification is worse than a
 * skipped one.
 * 这个探测会优先读取调用方传入的 root 缓存，以保证热路径开销最小；
 * 只有缓存里没有已知结论时才回退到 `session.get`。
 * 如果宿主也无法确认当前 session 形态，这里会返回 `unknown` 而不是猜测，
 * 因为把 compact 通知误发给错误 session 的代价要高于谨慎跳过一次通知。
 */
export async function probeRootSession(args: {
  client: RootSessionProbeClient
  directory: string
  sessionID: string
  knownRootSessionIDs: RootSessionProbeCache
  eventHint?: RootSessionEventHint
}): Promise<RootSessionProbeResult> {
  let hasInconclusiveSessionGetObservation = false
  let fallbackParentID: string | undefined
  let fallbackObservedSessionID: string | undefined

  if (args.knownRootSessionIDs.has(args.sessionID)) {
    return {
      isRoot: true,
      source: "cache",
    }
  }

  if (typeof args.client.session?.get === "function") {
    try {
      const raw = await args.client.session.get({
        path: { id: args.sessionID },
        query: { directory: args.directory },
      })
      const session = extractSessionEnvelopeData(raw)
      const observedSessionID =
        typeof session?.["id"] === "string" && session["id"].trim().length > 0
          ? session["id"].trim()
          : undefined
      const parentID = typeof session?.["parentID"] === "string" ? session["parentID"] : undefined
      hasInconclusiveSessionGetObservation = true
      fallbackParentID = parentID
      fallbackObservedSessionID = observedSessionID

      // A present parent id is enough to prove this is not a root session.
      // Returning `session.get` here is safe even if the host omitted `id`,
      // because the parent relationship is already explicit.
      // 只要拿到了 `parentID`，就足以证明这不是 root session。
      // 即使宿主没回 `id`，这里仍可以安全地返回 `session.get` 结果，
      // 因为父子关系已经被明确给出了。
      if (parentID) {
        return {
          isRoot: false,
          source: "session.get",
          parentID,
          observedSessionID,
        }
      }

      // Root classification must be explicit. Missing or mismatched session ids
      // are treated as unknown instead of root, because a wrong compact notify
      // can corrupt the VMM compact anchor for the active conversation thread.
      // root 判定必须有明确证据。
      // 如果 `session.get` 返回缺失或不匹配的 session id，这里会保守返回 unknown，
      // 而不是直接判成 root，因为错误的 compact 通知会污染真实对话线程的 VMM compact 边界。
      if (observedSessionID === args.sessionID) {
        return {
          isRoot: true,
          source: "session.get",
          parentID,
          observedSessionID,
        }
      }

      // A mismatched observed session id is stronger than the event hint and
      // should stop probing immediately. By contrast, a missing id is merely
      // inconclusive, so the controlled `session.created` fallback below may
      // still rescue compatibility for runtimes with sparse host payloads.
      // 观测到“不匹配的 session id”属于强冲突证据，必须立刻停止探测，
      // 不能再被后面的事件提示覆盖。
      // 但如果只是“id 缺失”，这更像是不确定结果，
      // 此时仍允许下面受控的 `session.created` 回退去兼容稀疏宿主载荷。
      if (observedSessionID) {
        return {
          isRoot: false,
          source: "unknown",
          parentID,
          observedSessionID,
        }
      }
    } catch {
      // Fall through to the conservative unknown result below when the host
      // runtime does not expose `session.get` reliably in the current shape.
      // 如果当前宿主运行时里 `session.get` 不可用或不稳定，
      // 这里就回退到下面的保守 unknown 结果，而不是继续猜测。
    }
  }

  // Fall back to the explicit host event hint only after cache and
  // `session.get` both failed to prove the session shape. This keeps
  // compatibility for runtimes where `session.created` is reliable but
  // `session.get` is absent, without letting weaker hints leak into other
  // root-only flows.
  // 只有在缓存和 `session.get` 都无法证明 session 形态后，
  // 才允许回退到显式宿主事件提示。
  // 这样既能兼容“`session.created` 可靠但 `session.get` 缺席”的运行时，
  // 又不会让更弱的提示扩散到其他 root-only 链路里。
  if (args.eventHint?.kind === "session.created") {
    const observedSessionID =
      typeof args.eventHint.id === "string" && args.eventHint.id.trim().length > 0
        ? args.eventHint.id.trim()
        : undefined
    const parentID =
      typeof args.eventHint.parentID === "string" && args.eventHint.parentID.trim().length > 0
        ? args.eventHint.parentID.trim()
        : undefined

    if (observedSessionID === args.sessionID) {
      if (parentID) {
        return {
          isRoot: false,
          source: "event-hint",
          parentID,
          observedSessionID,
        }
      }
      return {
        isRoot: true,
        source: "event-hint",
        parentID,
        observedSessionID,
      }
    }
  }

  return hasInconclusiveSessionGetObservation
    ? {
        isRoot: false,
        source: "unknown",
        parentID: fallbackParentID,
        observedSessionID: fallbackObservedSessionID,
      }
    : {
        isRoot: false,
        source: "unknown",
      }
}

/**
 * Admit one session into the mutable root-session cache only after a proven
 * root-session verdict.
 * 只有在拿到已证明的 root-session 结论后，才允许把某个 session 收入可变的 root 缓存。
 *
 * This helper centralizes the cache-mutation contract so callers do not each
 * reimplement "probe first, then add to cache when safe" in slightly different
 * ways. That keeps the root-session boundary stable across multiple hooks.
 * 这个辅助函数统一了“先探测，再在安全时写入缓存”的契约，
 * 避免调用方各自重复实现一遍，最终写出语义略有差异的版本。
 * 这样可以让多条 hook 共用同一条稳定的 root-session 边界。
 */
export async function admitRootSession(args: {
  client: RootSessionProbeClient
  directory: string
  sessionID: string
  knownRootSessionIDs: RootSessionAdmissionCache
  eventHint?: RootSessionEventHint
}): Promise<RootSessionAdmissionResult> {
  if (args.knownRootSessionIDs.has(args.sessionID)) {
    return {
      admitted: true,
      source: "cache",
    }
  }

  const rootProbe = await probeRootSession(args)
  if (rootProbe.isRoot) {
    args.knownRootSessionIDs.add(args.sessionID)
  }

  return {
    admitted: rootProbe.isRoot,
    source: rootProbe.source,
    rootProbe,
  }
}
