import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LOG_DIR = path.join(ROOT_DIR, "logs")
const LOG_FILE = path.join(LOG_DIR, "opencode-plugin-debug.jsonl")

let writeQueue = Promise.resolve()

/**
 * Maximum nesting depth for safe JSON serialization.
 * 安全 JSON 序列化的最大嵌套深度。
 *
 * Beyond this limit the replayer substitutes a truncation marker to avoid
 * O(n²) WeakSet scans and potential stack overflow on extremely deep graphs.
 * 超过此限制时替换器会插入截断标记，避免在极深结构上进行 O(n²) WeakSet 扫描。
 */
const MAX_SERIALIZE_DEPTH = 20

function serialize(value: unknown): unknown {
  const seen = new WeakSet<object>()

  // Walk the object tree with explicit depth tracking since JSON.stringify's
  // replacer does not expose the current path.
  // 使用显式深度遍历，因为 JSON.stringify 的 replacer 不暴露当前路径。
  function walk(obj: unknown, depth: number): unknown {
    if (depth > MAX_SERIALIZE_DEPTH) {
      return "[Max depth exceeded]"
    }

    if (typeof obj === "bigint") {
      return `${obj}n`
    }

    if (obj instanceof Error) {
      return { name: obj.name, message: obj.message, stack: obj.stack }
    }

    if (obj instanceof URL) {
      return obj.toString()
    }

    if (typeof obj === "function") {
      return `[Function ${obj.name || "anonymous"}]`
    }

    if (obj && typeof obj === "object") {
      if (seen.has(obj)) {
        return "[Circular]"
      }
      seen.add(obj)

      if (Array.isArray(obj)) {
        return obj.map((item) => walk(item, depth + 1))
      }

      const result: Record<string, unknown> = {}
      for (const key of Object.keys(obj)) {
        result[key] = walk((obj as Record<string, unknown>)[key], depth + 1)
      }
      return result
    }

    return obj
  }

  return walk(value, 0)
}

export function logFilePath() {
  return LOG_FILE
}

export function writeLog(entry: {
  kind: string
  sessionID?: string
  data: Record<string, unknown>
}) {
  const payload = {
    timestamp: new Date().toISOString(),
    kind: entry.kind,
    sessionID: entry.sessionID,
    data: serialize(entry.data),
  }

  writeQueue = writeQueue
    .then(async () => {
      await fs.mkdir(LOG_DIR, { recursive: true })
      await fs.appendFile(LOG_FILE, JSON.stringify(payload) + "\n", "utf8")
    })
    .catch(async (error) => {
      // If the primary write fails, try a fallback error log entry.
      // 如果主写入失败，尝试写入一条 fallback 错误日志。
      const fallback = {
        timestamp: new Date().toISOString(),
        kind: "logger.error",
        data: serialize({
          message: "failed to append plugin log entry",
          error,
          originalKind: entry.kind,
        }),
      }

      try {
        await fs.mkdir(LOG_DIR, { recursive: true })
        await fs.appendFile(LOG_FILE, JSON.stringify(fallback) + "\n", "utf8")
      } catch (fallbackError) {
        // If the fallback also fails (e.g. disk full), log the failure
        // silently to stderr and reset the queue.
        // 如果 fallback 也失败了（如磁盘已满），静默输出到 stderr 并重置队列。
        try {
          process.stderr.write("[logger] WARNING: log write failed (disk may be full)\n")
        } catch {
          // Cannot even write to stderr -- give up entirely.
          // 连 stderr 都写不进去，彻底放弃。
        }
      }
      // Always reset the queue after the catch so the promise chain does not
      // grow unboundedly under sustained partial write failures.
      // 无论 fallback 成功与否都重置队列，避免 promise 链在持续部分失败时无限增长。
      writeQueue = Promise.resolve()
    })

  return writeQueue
}

