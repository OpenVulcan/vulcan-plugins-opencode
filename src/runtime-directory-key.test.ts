/**
 * Tests for runtime directory-key normalization.
 * 运行时目录键归一化测试。
 *
 * These tests verify that directory-scoped runtime maps stay stable for one
 * real workspace even when the host spells that path differently.
 * 这些测试用于验证：即便宿主对同一真实工作区使用了不同写法，
 * 按目录隔离的运行时 Map 仍能落到稳定一致的键上。
 */

import assert from "node:assert/strict"
import path from "node:path"
import test from "node:test"

import { normalizeRuntimeDirectoryKey } from "./runtime-directory-key.js"

test("normalizeRuntimeDirectoryKey canonicalizes equivalent Windows-style paths", () => {
  const left = normalizeRuntimeDirectoryKey({
    directory: "D:\\Projects\\VmmOpenCodePlugins\\",
    platform: "win32",
  })
  const right = normalizeRuntimeDirectoryKey({
    directory: "d:/projects/VmmOpenCodePlugins",
    platform: "win32",
  })

  assert.equal(left, right)
  assert.equal(left, "d:/projects/vmmopencodeplugins")
})

test("normalizeRuntimeDirectoryKey preserves case-sensitive POSIX identity", () => {
  const left = normalizeRuntimeDirectoryKey({
    directory: "/tmp/Repo",
    platform: "linux",
  })
  const right = normalizeRuntimeDirectoryKey({
    directory: "/tmp/repo",
    platform: "linux",
  })

  assert.notEqual(left, right)
  assert.equal(
    normalizeRuntimeDirectoryKey({
      directory: "/tmp/repo/../repo/",
      platform: "linux",
    }),
    path.normalize(path.resolve("/tmp/repo")),
  )
})
