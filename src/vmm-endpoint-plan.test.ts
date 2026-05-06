/**
 * Regression tests for host-only VMM endpoint planning.
 * 仅走宿主中转的 VMM endpoint plan 回归测试。
 *
 * This file belongs to the verification layer. It protects the config-only
 * endpoint selection contract without requiring a real vulcan-host or VMM
 * process to be running.
 * 这个文件属于验证层。
 * 它在不要求真实 vulcan-host 或 VMM 进程运行的前提下，保护纯配置 endpoint 选择契约。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { buildVmmEndpointPlan, normalizeEndpointTargetText } from "./vmm-endpoint-plan.js"

test("normalizeEndpointTargetText trims optional endpoint text", () => {
  assert.equal(normalizeEndpointTargetText(" 127.0.0.1:17700 "), "127.0.0.1:17700")
  assert.equal(normalizeEndpointTargetText(undefined), "")
})

test("buildVmmEndpointPlan uses vulcan-host as the only effective target", () => {
  const plan = buildVmmEndpointPlan({
    vulcanHostTarget: "127.0.0.1:17700",
  })

  assert.equal(plan.mode, "vulcan-host")
  assert.equal(plan.effectiveTarget, "127.0.0.1:17700")
  assert.equal(plan.hasVulcanHostTarget, true)
  assert.equal(plan.missing, false)
})

test("buildVmmEndpointPlan reports missing when vulcan-host is absent", () => {
  const missingPlan = buildVmmEndpointPlan({})

  assert.equal(missingPlan.mode, "missing")
  assert.equal(missingPlan.effectiveTarget, "")
  assert.equal(missingPlan.hasVulcanHostTarget, false)
  assert.equal(missingPlan.missing, true)
})

test("buildVmmEndpointPlan trims vulcan-host target before planning", () => {
  const plan = buildVmmEndpointPlan({
    vulcanHostTarget: " 127.0.0.1:17700 ",
  })

  assert.equal(plan.mode, "vulcan-host")
  assert.equal(plan.effectiveTarget, "127.0.0.1:17700")
})
