/**
 * Regression tests for Vulcan host capability profiles.
 * Vulcan 宿主能力画像的回归测试。
 *
 * This file belongs to the verification layer. It protects adapter-planning
 * assumptions without requiring OpenCode, OpenClaw, Claude Code, Qwen Code,
 * Hermes, or a real MCP host process to run.
 * 这个文件属于验证层。
 * 它在不要求 OpenCode、OpenClaw、Claude Code、Qwen Code、Hermes 或真实 MCP 宿主进程运行的前提下，
 * 保护适配规划假设。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  getVmmHostCapabilityProfile,
  listVmmHostCapabilityGaps,
  normalizeVmmHostKind,
  resolveVmmToolRefreshMode,
  supportsVmmHostCapability,
} from "./vmm-host-capabilities.js"

test("normalizeVmmHostKind resolves common host aliases", () => {
  assert.equal(normalizeVmmHostKind("Claude"), "claude-code")
  assert.equal(normalizeVmmHostKind("hermes_agent"), "hermes-agent")
  assert.equal(normalizeVmmHostKind("open code"), "opencode")
  assert.equal(normalizeVmmHostKind("qwen"), "qwen-code")
  assert.equal(normalizeVmmHostKind("not-a-real-host"), "unknown")
})

test("OpenCode profile keeps native plugin hooks but marks tool refresh as restart-bound", () => {
  const profile = getVmmHostCapabilityProfile("opencode")

  assert.equal(profile.capabilities.nativePlugin.level, "full")
  assert.equal(profile.capabilities.sessionIdAccess.level, "full")
  assert.equal(profile.capabilities.precheck.level, "full")
  assert.equal(profile.capabilities.postaction.level, "full")
  assert.equal(profile.capabilities.toolLifecycleHooks.level, "full")
  assert.equal(profile.capabilities.dynamicToolRefresh.level, "none")
  assert.equal(profile.capabilities.restartRequiredToolRefresh.level, "full")
  assert.equal(resolveVmmToolRefreshMode(profile), "restart-required")
})

test("generic MCP profile exposes only the degraded compatibility surface", () => {
  const profile = getVmmHostCapabilityProfile("generic-mcp")

  assert.equal(profile.capabilities.mcpTools.level, "full")
  assert.equal(profile.capabilities.workmemIdFallback.level, "full")
  assert.equal(profile.capabilities.nativePlugin.level, "none")
  assert.equal(profile.capabilities.precheck.level, "none")
  assert.equal(profile.capabilities.postaction.level, "none")
  assert.equal(supportsVmmHostCapability(profile, "sessionIdAccess"), false)
})

test("Qwen Code and Claude Code profiles preserve source-specific degradation notes", () => {
  const qwen = getVmmHostCapabilityProfile("qwen-code")
  const claude = getVmmHostCapabilityProfile("claude")

  assert.notEqual(qwen.capabilities.precheck.level, "none")
  assert.notEqual(qwen.capabilities.toolLifecycleHooks.level, "none")
  assert.equal(claude.capabilities.mcpTools.evidence, "official-docs")
  assert.equal(claude.capabilities.persistentWorkflowSkills.evidence, "official-docs")
  assert.equal(resolveVmmToolRefreshMode(claude), "restart-required")
})

test("listVmmHostCapabilityGaps reports limited and missing required capabilities", () => {
  const profile = getVmmHostCapabilityProfile("claude-code")
  const gaps = listVmmHostCapabilityGaps(profile, ["mcpTools", "precheck", "sessionIdAccess"])

  assert.deepEqual(
    gaps.map((gap) => gap.capabilityName),
    ["precheck", "sessionIdAccess"],
  )
})
