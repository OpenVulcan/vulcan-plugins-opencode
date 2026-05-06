/**
 * Regression tests for Vulcan tool registry snapshot diffing.
 * Vulcan tool 注册表快照差异的回归测试。
 *
 * This file belongs to the verification layer. It protects install, uninstall,
 * and update planning without requiring a live LuaSkills registry or host UI.
 * 这个文件属于验证层。
 * 它在不要求真实 LuaSkills 注册表或宿主 UI 的前提下，保护 install、uninstall 与 update 规划。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { getVmmHostCapabilityProfile } from "./vmm-host-capabilities.js"
import {
  buildVmmToolDescriptorFingerprint,
  diffVmmToolRegistrySnapshots,
  normalizeVmmToolDescriptorSnapshot,
} from "./vmm-tool-registry-snapshot.js"

test("normalizeVmmToolDescriptorSnapshot trims text and validates id", () => {
  assert.deepEqual(normalizeVmmToolDescriptorSnapshot({ id: " tool-a ", workflowCount: 1.8 }), {
    id: "tool-a",
    workflowCount: 1,
  })
  assert.throws(() => normalizeVmmToolDescriptorSnapshot({ id: " " }), /Tool descriptor id is required/)
})

test("buildVmmToolDescriptorFingerprint is independent from schema object key order", () => {
  const left = buildVmmToolDescriptorFingerprint({
    id: "tool-a",
    inputSchema: {
      type: "object",
      properties: {
        b: { type: "number" },
        a: { type: "string" },
      },
    },
  })
  const right = buildVmmToolDescriptorFingerprint({
    id: "tool-a",
    inputSchema: {
      properties: {
        a: { type: "string" },
        b: { type: "number" },
      },
      type: "object",
    },
  })

  assert.equal(left, right)
})

test("diffVmmToolRegistrySnapshots treats reordered identical tools as unchanged", () => {
  const diff = diffVmmToolRegistrySnapshots(
    {
      tools: [{ id: "tool-b" }, { id: "tool-a" }],
    },
    {
      tools: [{ id: "tool-a" }, { id: "tool-b" }],
    },
    {
      dynamicToolRefreshSupported: true,
    },
  )

  assert.deepEqual(diff.changedToolIds, [])
  assert.equal(diff.unchanged.length, 2)
  assert.equal(diff.restartRequired, false)
})

test("diffVmmToolRegistrySnapshots groups added removed and updated tools", () => {
  const diff = diffVmmToolRegistrySnapshots(
    {
      tools: [
        { id: "removed-tool", description: "old" },
        { id: "updated-tool", description: "old" },
        { id: "same-tool", description: "same" },
      ],
    },
    {
      tools: [
        { id: "added-tool", description: "new" },
        { id: "updated-tool", description: "new" },
        { id: "same-tool", description: "same" },
      ],
    },
    {
      hostProfile: getVmmHostCapabilityProfile("opencode"),
    },
  )

  assert.deepEqual(
    diff.added.map((tool) => tool.id),
    ["added-tool"],
  )
  assert.deepEqual(
    diff.removed.map((tool) => tool.id),
    ["removed-tool"],
  )
  assert.deepEqual(
    diff.updated.map((tool) => tool.id),
    ["updated-tool"],
  )
  assert.deepEqual(diff.changedToolIds, ["added-tool", "removed-tool", "updated-tool"])
  assert.equal(diff.restartRequired, true)
  assert.match(diff.summary, /3 changed tool/)
})

test("diffVmmToolRegistrySnapshots respects explicit dynamic refresh support", () => {
  const diff = diffVmmToolRegistrySnapshots(
    {
      tools: [{ id: "tool-a", version: "1" }],
    },
    {
      tools: [{ id: "tool-a", version: "2" }],
    },
    {
      dynamicToolRefreshSupported: true,
    },
  )

  assert.equal(diff.updated.length, 1)
  assert.equal(diff.restartRequired, false)
})

test("diffVmmToolRegistrySnapshots rejects duplicate tool ids", () => {
  assert.throws(
    () =>
      diffVmmToolRegistrySnapshots(
        {
          tools: [{ id: "tool-a" }, { id: "tool-a" }],
        },
        {
          tools: [],
        },
      ),
    /Duplicate tool descriptor id: tool-a/,
  )
})
