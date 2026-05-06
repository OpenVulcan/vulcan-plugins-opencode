/**
 * Stable directory-key normalization for runtime-only maps.
 * 运行时内存 Map 使用的稳定目录键归一化辅助模块。
 *
 * This file belongs to the orchestration support layer. It is used for
 * in-process state maps such as runtime scopes and mutation queues, where two
 * differently formatted directory strings may still refer to the same actual
 * workspace on Windows.
 * 这个文件属于编排支撑层。
 * 它用于 runtime scope、mutation queue 这类进程内状态 Map，
 * 因为在 Windows 上，不同格式的目录字符串仍可能指向同一个真实工作区。
 */

import path from "node:path"

/**
 * Normalize one directory string into a stable runtime-map key.
 * 把目录字符串归一化成稳定的运行时 Map 键。
 *
 * The returned key is only used for in-memory ownership maps. File-system
 * operations must continue using the original directory value so we do not
 * accidentally rewrite user-facing paths.
 * 返回值只用于内存态所有权 Map。
 * 真实文件系统操作仍应继续使用原始目录值，避免意外改写用户可见路径。
 *
 * On Windows we lower-case the resolved path because the file system is
 * case-insensitive, and we also canonicalize separators so `D:\\repo` and
 * `d:/repo/` map to the same runtime key.
 * 在 Windows 上，这里会把解析后的路径转成小写，
 * 因为文件系统本身大小写不敏感；
 * 同时也会统一路径分隔符，让 `D:\\repo` 和 `d:/repo/`
 * 最终落到同一个运行时键上。
 */
export function normalizeRuntimeDirectoryKey(args: {
  directory: string
  platform?: NodeJS.Platform
}) {
  const resolved = path.resolve(args.directory)
  const normalized = path.normalize(resolved)
  const platform = args.platform ?? process.platform

  if (platform === "win32") {
    return normalized.replace(/\\/g, "/").toLowerCase()
  }

  return normalized
}
