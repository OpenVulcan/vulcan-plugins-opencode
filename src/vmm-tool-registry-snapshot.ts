/**
 * Tool registry snapshot and diff helpers for Vulcan host adapters.
 * Vulcan 宿主适配器的工具注册快照与差异辅助模块。
 *
 * This file belongs to the adapter contract layer. Plugin adapters use it after
 * LuaSkill install, uninstall, or update operations to decide whether the host
 * can continue dynamically or must ask the user to restart or reconnect.
 * 这个文件属于适配契约层。
 * 插件适配器会在 LuaSkill install、uninstall 或 update 后使用它，
 * 判断宿主能否继续动态刷新，或者必须提示用户重启或重新连接。
 */

import { resolveVmmToolRefreshMode, type VmmHostCapabilityProfile } from "./vmm-host-capabilities.js"

/**
 * Source category for one runtime tool descriptor.
 * 单个运行时 tool 描述符的来源类别。
 */
export type VmmToolDescriptorSource = "luaskill" | "mcp" | "native" | "unknown"

/**
 * Stable descriptor snapshot for one host-visible tool.
 * 单个宿主可见 tool 的稳定描述符快照。
 */
export type VmmToolDescriptorSnapshot = {
  /**
   * Stable tool id used by the model-facing registry.
   * 面向模型的注册表使用的稳定 tool id。
   */
  id: string

  /**
   * Optional display name exposed by the source registry.
   * 来源注册表暴露的可选展示名称。
   */
  name?: string

  /**
   * Optional model-facing description.
   * 面向模型的可选描述。
   */
  description?: string

  /**
   * Optional JSON-schema-like input contract.
   * 可选的类 JSON Schema 输入契约。
   */
  inputSchema?: unknown

  /**
   * Optional version or revision string from the source registry.
   * 来源注册表提供的可选版本或修订字符串。
   */
  version?: string

  /**
   * Source category used for diagnostics and restart guidance.
   * 用于诊断和重启提示的来源类别。
   */
  source?: VmmToolDescriptorSource

  /**
   * Number of workflow prompt entries attached to this tool.
   * 挂接在该 tool 上的工作流提示词条数量。
   */
  workflowCount?: number
}

/**
 * Tool registry snapshot captured before or after one registry mutation.
 * 在一次注册表变更前后捕获的 tool 注册表快照。
 */
export type VmmToolRegistrySnapshot = {
  /**
   * Host-visible tool descriptors.
   * 宿主可见的 tool 描述符。
   */
  tools: readonly VmmToolDescriptorSnapshot[]
}

/**
 * Options used when deciding whether one diff requires host restart.
 * 判断一次差异是否需要宿主重启时使用的选项。
 */
export type VmmToolRegistryDiffOptions = {
  /**
   * Host capability profile used to derive the safest refresh mode.
   * 用于推导最安全刷新模式的宿主能力画像。
   */
  hostProfile?: VmmHostCapabilityProfile

  /**
   * Explicit dynamic refresh flag used by tests or low-level callers without a profile.
   * 没有宿主画像的测试或低层调用方使用的显式动态刷新标记。
   */
  dynamicToolRefreshSupported?: boolean

  /**
   * Explicit restart requirement supplied by an adapter after a lifecycle operation.
   * 适配器在生命周期操作后传入的显式重启要求。
   */
  hostRestartRequired?: boolean
}

/**
 * Diff result between two tool registry snapshots.
 * 两份 tool 注册表快照之间的差异结果。
 */
export type VmmToolRegistryDiff = {
  /**
   * Tools present only in the next snapshot.
   * 仅存在于新快照中的 tools。
   */
  added: VmmToolDescriptorSnapshot[]

  /**
   * Tools present only in the previous snapshot.
   * 仅存在于旧快照中的 tools。
   */
  removed: VmmToolDescriptorSnapshot[]

  /**
   * Tools whose id is stable but descriptor fingerprint changed.
   * id 稳定但描述符指纹发生变化的 tools。
   */
  updated: VmmToolDescriptorSnapshot[]

  /**
   * Tools whose id and descriptor fingerprint are unchanged.
   * id 与描述符指纹均未变化的 tools。
   */
  unchanged: VmmToolDescriptorSnapshot[]

  /**
   * Sorted ids for added, removed, or updated tools.
   * 新增、删除或更新的 tool id 排序列表。
   */
  changedToolIds: string[]

  /**
   * Whether the host should be restarted or reconnected before the model relies on the new surface.
   * 宿主是否应在模型依赖新 tool 表面前重启或重连。
   */
  restartRequired: boolean

  /**
   * Compact human-readable summary of the diff.
   * 差异结果的紧凑人类可读摘要。
   */
  summary: string
}

/**
 * Normalize one optional descriptor text value.
 * 归一化单个可选描述符文本值。
 *
 * @param value Optional text from a source registry.
 * @param value 来源注册表提供的可选文本。
 * @returns Trimmed text, or undefined when empty.
 * @returns 裁剪后的文本；为空时返回 undefined。
 */
function normalizeDescriptorText(value: string | undefined): string | undefined {
  const normalized = (value ?? "").trim()
  return normalized || undefined
}

/**
 * Normalize one source category into the supported diagnostic enum.
 * 把单个来源类别归一化为受支持的诊断枚举。
 *
 * @param source Optional source category from a registry.
 * @param source 注册表提供的可选来源类别。
 * @returns Normalized source category.
 * @returns 归一化后的来源类别。
 */
function normalizeDescriptorSource(source: VmmToolDescriptorSource | undefined): VmmToolDescriptorSource | undefined {
  if (!source) {
    return undefined
  }

  if (source === "luaskill" || source === "mcp" || source === "native" || source === "unknown") {
    return source
  }

  return "unknown"
}

/**
 * Normalize one workflow count into a non-negative integer.
 * 把工作流数量归一化为非负整数。
 *
 * @param workflowCount Optional workflow count from a registry.
 * @param workflowCount 注册表提供的可选工作流数量。
 * @returns Normalized count, or undefined when absent.
 * @returns 归一化后的数量；缺失时返回 undefined。
 */
function normalizeWorkflowCount(workflowCount: number | undefined): number | undefined {
  if (workflowCount === undefined) {
    return undefined
  }

  if (!Number.isFinite(workflowCount) || workflowCount < 0) {
    return 0
  }

  return Math.floor(workflowCount)
}

/**
 * Normalize one tool descriptor snapshot before diffing or fingerprinting.
 * 在差异比较或指纹计算前归一化单个 tool 描述符快照。
 *
 * @param tool Tool descriptor from a runtime registry.
 * @param tool 来自运行时注册表的 tool 描述符。
 * @returns Normalized descriptor with a non-empty id.
 * @returns 带有非空 id 的归一化描述符。
 */
export function normalizeVmmToolDescriptorSnapshot(
  tool: VmmToolDescriptorSnapshot,
): VmmToolDescriptorSnapshot {
  const id = normalizeDescriptorText(tool.id)

  if (!id) {
    throw new Error("Tool descriptor id is required")
  }

  return {
    id,
    ...(normalizeDescriptorText(tool.name) ? { name: normalizeDescriptorText(tool.name) } : {}),
    ...(normalizeDescriptorText(tool.description)
      ? { description: normalizeDescriptorText(tool.description) }
      : {}),
    ...(tool.inputSchema === undefined ? {} : { inputSchema: tool.inputSchema }),
    ...(normalizeDescriptorText(tool.version) ? { version: normalizeDescriptorText(tool.version) } : {}),
    ...(normalizeDescriptorSource(tool.source) ? { source: normalizeDescriptorSource(tool.source) } : {}),
    ...(normalizeWorkflowCount(tool.workflowCount) === undefined
      ? {}
      : { workflowCount: normalizeWorkflowCount(tool.workflowCount) }),
  }
}

/**
 * Build a deterministic descriptor fingerprint for update detection.
 * 为更新检测构建一条确定性的描述符指纹。
 *
 * @param tool Tool descriptor from a runtime registry.
 * @param tool 来自运行时注册表的 tool 描述符。
 * @returns Stable string fingerprint independent from object key order.
 * @returns 不受对象键顺序影响的稳定字符串指纹。
 */
export function buildVmmToolDescriptorFingerprint(tool: VmmToolDescriptorSnapshot): string {
  const normalized = normalizeVmmToolDescriptorSnapshot(tool)
  return stableStringify({
    description: normalized.description,
    id: normalized.id,
    inputSchema: normalized.inputSchema,
    name: normalized.name,
    source: normalized.source,
    version: normalized.version,
    workflowCount: normalized.workflowCount,
  })
}

/**
 * Diff two tool registry snapshots and derive restart guidance.
 * 对比两份 tool 注册表快照并推导重启提示。
 *
 * @param previous Previous snapshot captured before a registry mutation.
 * @param previous 注册表变更前捕获的旧快照。
 * @param next Next snapshot captured after a registry mutation.
 * @param next 注册表变更后捕获的新快照。
 * @param options Optional host refresh context.
 * @param options 可选的宿主刷新上下文。
 * @returns Diff buckets, changed ids, restart flag, and summary.
 * @returns 差异分组、变更 id、重启标记和摘要。
 */
export function diffVmmToolRegistrySnapshots(
  previous: VmmToolRegistrySnapshot,
  next: VmmToolRegistrySnapshot,
  options: VmmToolRegistryDiffOptions = {},
): VmmToolRegistryDiff {
  const previousIndex = indexToolSnapshots(previous.tools)
  const nextIndex = indexToolSnapshots(next.tools)
  const added: VmmToolDescriptorSnapshot[] = []
  const removed: VmmToolDescriptorSnapshot[] = []
  const updated: VmmToolDescriptorSnapshot[] = []
  const unchanged: VmmToolDescriptorSnapshot[] = []

  /**
   * Compare new descriptors first so the updated bucket always carries the
   * descriptor the host should expose after the mutation completes.
   * 先比较新描述符，这样 updated 分组始终携带变更完成后宿主应该暴露的描述符。
   */
  for (const [id, nextTool] of nextIndex) {
    const previousTool = previousIndex.get(id)

    if (!previousTool) {
      added.push(nextTool)
      continue
    }

    if (buildVmmToolDescriptorFingerprint(previousTool) !== buildVmmToolDescriptorFingerprint(nextTool)) {
      updated.push(nextTool)
    } else {
      unchanged.push(nextTool)
    }
  }

  for (const [id, previousTool] of previousIndex) {
    if (!nextIndex.has(id)) {
      removed.push(previousTool)
    }
  }

  sortToolsByID(added)
  sortToolsByID(removed)
  sortToolsByID(updated)
  sortToolsByID(unchanged)

  const changedToolIds = [...added, ...removed, ...updated].map((tool) => tool.id).sort()
  const restartRequired = changedToolIds.length > 0 && shouldRequireRestart(options)

  return {
    added,
    removed,
    updated,
    unchanged,
    changedToolIds,
    restartRequired,
    summary: buildToolRegistryDiffSummary(added.length, removed.length, updated.length, restartRequired),
  }
}

/**
 * Build an id-indexed map and reject duplicate ids early.
 * 构建以 id 为键的映射，并尽早拒绝重复 id。
 *
 * @param tools Tool descriptors to index.
 * @param tools 需要索引的 tool 描述符。
 * @returns Map keyed by normalized tool id.
 * @returns 以归一化 tool id 为键的映射。
 */
function indexToolSnapshots(tools: readonly VmmToolDescriptorSnapshot[]): Map<string, VmmToolDescriptorSnapshot> {
  const index = new Map<string, VmmToolDescriptorSnapshot>()

  for (const tool of tools) {
    const normalized = normalizeVmmToolDescriptorSnapshot(tool)

    if (index.has(normalized.id)) {
      throw new Error(`Duplicate tool descriptor id: ${normalized.id}`)
    }

    index.set(normalized.id, normalized)
  }

  return index
}

/**
 * Sort tool descriptors by stable id in-place.
 * 按稳定 id 对 tool 描述符进行原地排序。
 *
 * @param tools Tool descriptor array to sort.
 * @param tools 需要排序的 tool 描述符数组。
 * @returns The same array after sorting.
 * @returns 排序后的同一个数组。
 */
function sortToolsByID<TTool extends VmmToolDescriptorSnapshot>(tools: TTool[]): TTool[] {
  return tools.sort((left, right) => left.id.localeCompare(right.id))
}

/**
 * Decide whether a changed registry requires host restart.
 * 判断发生变化的注册表是否需要宿主重启。
 *
 * @param options Optional host refresh context.
 * @param options 可选的宿主刷新上下文。
 * @returns True when the host cannot safely refresh dynamically.
 * @returns 当宿主无法安全动态刷新时返回 true。
 */
function shouldRequireRestart(options: VmmToolRegistryDiffOptions): boolean {
  if (options.hostRestartRequired === true) {
    return true
  }

  if (options.hostProfile) {
    return resolveVmmToolRefreshMode(options.hostProfile) !== "dynamic"
  }

  return options.dynamicToolRefreshSupported !== true
}

/**
 * Build a compact diff summary suitable for logs and model-visible diagnostics.
 * 构建适合日志与模型可见诊断的紧凑差异摘要。
 *
 * @param addedCount Number of added tools.
 * @param addedCount 新增 tool 数量。
 * @param removedCount Number of removed tools.
 * @param removedCount 删除 tool 数量。
 * @param updatedCount Number of updated tools.
 * @param updatedCount 更新 tool 数量。
 * @param restartRequired Whether restart or reconnect is required.
 * @param restartRequired 是否需要重启或重连。
 * @returns Human-readable diff summary.
 * @returns 人类可读的差异摘要。
 */
function buildToolRegistryDiffSummary(
  addedCount: number,
  removedCount: number,
  updatedCount: number,
  restartRequired: boolean,
): string {
  const changedCount = addedCount + removedCount + updatedCount
  const restartText = restartRequired ? "restart required" : "restart not required"
  return `${changedCount} changed tool(s): ${addedCount} added, ${removedCount} removed, ${updatedCount} updated; ${restartText}.`
}

/**
 * Build a JSON string with stable object key order.
 * 构建一条对象键顺序稳定的 JSON 字符串。
 *
 * @param value Unknown value to normalize and stringify.
 * @param value 需要归一化并序列化的未知值。
 * @returns Stable JSON string representation.
 * @returns 稳定的 JSON 字符串表示。
 */
function stableStringify(value: unknown): string {
  return JSON.stringify(stableNormalize(value))
}

/**
 * Normalize arbitrary JSON-like values into stable-key-order structures.
 * 把任意类 JSON 值归一化为键顺序稳定的结构。
 *
 * @param value Unknown value from a descriptor.
 * @param value 描述符中的未知值。
 * @returns Normalized value safe for stable JSON stringification.
 * @returns 可安全进行稳定 JSON 序列化的归一化值。
 */
function stableNormalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => stableNormalize(entry))
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entryValue]) => entryValue !== undefined)
        .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
        .map(([entryKey, entryValue]) => [entryKey, stableNormalize(entryValue)]),
    )
  }

  return value ?? null
}
