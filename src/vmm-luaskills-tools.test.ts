/**
 * Regression tests for LuaSkills dynamic OpenCode tool mapping.
 * LuaSkills 动态 OpenCode tool 映射的回归测试。
 *
 * This file belongs to the test layer. It verifies the schema conversion and
 * WorkMem session wrapping logic without requiring a live vulcan-host process.
 * 这个文件属于测试层。它在不依赖真实 vulcan-host 进程的情况下，
 * 验证 schema 转换和 WorkMem session 包装逻辑。
 */

import assert from "node:assert/strict"
import test from "node:test"
import { tool } from "@opencode-ai/plugin"

import {
  buildLuaSkillOpenCodeArgsShape,
  buildLuaSkillToolDescription,
} from "./vmm-luaskills-tools.js"
import type { VmmLuaSkillsGrpcToolDescriptor } from "./vmm-luaskills-grpc.js"

/**
 * Build a minimal LuaSkills tool descriptor for mapper tests.
 * 为映射测试构造一份最小 LuaSkills tool 描述。
 */
function descriptor(overrides: Partial<VmmLuaSkillsGrpcToolDescriptor> = {}): VmmLuaSkillsGrpcToolDescriptor {
  return {
    name: "vulcan-workmem-set",
    description: "Write WorkMem nodes.",
    input_schema_json: "{}",
    annotations_json: "{}",
    skill_id: "vulcan-workmem",
    entry_name: "set",
    root_name: "USER",
    skill_dir: "D:/runtime/skills/vulcan-workmem",
    ...overrides,
  }
}

test("buildLuaSkillOpenCodeArgsShape maps object properties into direct args", () => {
  const result = buildLuaSkillOpenCodeArgsShape(
    descriptor({
      input_schema_json: JSON.stringify({
        type: "object",
        required: ["task_name"],
        properties: {
          task_name: {
            type: "string",
            minLength: 1,
            description: "Task name.",
          },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 10,
          },
        },
      }),
    }),
  )

  assert.equal(result.mode, "direct")
  assert.equal(result.shape.task_name.safeParse("ship-it").success, true)
  assert.equal(result.shape.task_name.safeParse("").success, false)
  assert.equal(result.shape.limit.safeParse(3).success, true)
  assert.equal(result.shape.limit.safeParse(11).success, false)
})

test("buildLuaSkillOpenCodeArgsShape preserves property descriptions in JSON schema", () => {
  const result = buildLuaSkillOpenCodeArgsShape(
    descriptor({
      input_schema_json: JSON.stringify({
        type: "object",
        required: ["paths"],
        properties: {
          paths: {
            type: "string",
            description:
              "One or more explicit source-file paths separated by newlines (\\n).",
          },
          comment: {
            type: "boolean",
            description: "Include condensed comment summaries.",
          },
        },
      }),
    }),
  )
  const schema = tool.schema.toJSONSchema(tool.schema.object(result.shape), { io: "input" }) as {
    properties?: Record<string, { description?: string }>
  }

  assert.equal(
    schema.properties?.paths?.description,
    "One or more explicit source-file paths separated by newlines (\\n).",
  )
  assert.equal(schema.properties?.comment?.description, "Include condensed comment summaries.")
})

test("buildLuaSkillToolDescription folds parameter help into top-level description", () => {
  const description = buildLuaSkillToolDescription(
    descriptor({
      name: "vulcan-codekit-ast-detail",
      description: "[FILE AST DETAIL] Inspect exact source files.",
      input_schema_json: JSON.stringify({
        type: "object",
        required: ["paths"],
        properties: {
          paths: {
            type: "string",
            description:
              "One or more explicit source-file paths separated by newlines (\\n).",
          },
          comment: {
            type: "boolean",
            description: "Include condensed comment summaries.",
          },
        },
      }),
    }),
  )

  assert.match(description, /^\[FILE AST DETAIL\]/)
  assert.match(description, /Input parameters:/)
  assert.match(
    description,
    /- paths \(required, string\): One or more explicit source-file paths separated by newlines \(\\n\)\./,
  )
  assert.match(
    description,
    /- comment \(optional, boolean\): Include condensed comment summaries\./,
  )
})

test("buildLuaSkillOpenCodeArgsShape falls back to wrapped arguments for unknown schemas", () => {
  const result = buildLuaSkillOpenCodeArgsShape(descriptor({ input_schema_json: "{}" }))

  assert.equal(result.mode, "wrapped")
  assert.equal(result.shape.arguments.safeParse({ arbitrary: true }).success, true)
})
