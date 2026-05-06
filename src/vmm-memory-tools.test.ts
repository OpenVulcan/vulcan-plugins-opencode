/**
 * Regression tests for VMM memory tool metadata consumption.
 * VMM 记忆工具元信息消费链路的回归测试。
 *
 * This file belongs to the test layer. It verifies that OpenCode-visible
 * memory tools only register from usable vulcan-host descriptors.
 * 这个文件属于测试层。它验证 OpenCode 可见的记忆工具会优先使用
 * 可用的 vulcan-host 描述，并且不会在离线时注册假可用工具。
 */

import assert from "node:assert/strict"
import test from "node:test"
import { tool } from "@opencode-ai/plugin"

import { buildVmmMemoryToolsFromDescriptors } from "./vmm-memory-tools.js"
import type { VmmHostAdapterGrpcToolDescriptor } from "./vmm-host-adapter-grpc.js"

/**
 * Build a minimal HostAdapterService tool descriptor for metadata tests.
 * 为元信息测试构造最小 HostAdapterService 工具描述。
 */
function descriptor(
  overrides: Partial<VmmHostAdapterGrpcToolDescriptor> = {},
): VmmHostAdapterGrpcToolDescriptor {
  return {
    name: "vmm_memory_write",
    description: "Central VMM memory metadata.\n\nInput parameters:\n- items[].category: 0 = general.",
    input_schema_json: JSON.stringify({
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["abstract", "details", "category"],
            properties: {
              abstract: {
                type: "string",
                minLength: 1,
              },
              details: {
                type: "string",
                minLength: 1,
              },
              category: {
                type: "integer",
                minimum: 0,
                maximum: 7,
              },
            },
          },
        },
      },
    }),
    annotations_json: "{}",
    source: "vmm.grpc-integration-contract",
    ...overrides,
  }
}

test("buildVmmMemoryToolsFromDescriptors prefers central gRPC descriptions", () => {
  const tools = buildVmmMemoryToolsFromDescriptors([descriptor()])
  const writeTool = tools.vmm_memory_write as { description?: string }

  assert.match(writeTool.description ?? "", /^Central VMM memory metadata/)
  assert.match(writeTool.description ?? "", /items\[\]\.category: 0 = general/)
})

test("buildVmmMemoryToolsFromDescriptors uses central gRPC argument schemas", () => {
  const tools = buildVmmMemoryToolsFromDescriptors([
    descriptor({
      name: "vmm_memory_search",
      description: "Central VMM search metadata.",
      input_schema_json: JSON.stringify({
        type: "object",
        required: ["queries"],
        properties: {
          queries: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: {
              type: "string",
              minLength: 1,
            },
          },
          topK: {
            type: "integer",
            minimum: 1,
            maximum: 9,
          },
        },
      }),
    }),
  ])
  const searchTool = tools.vmm_memory_search as {
    args: Record<string, unknown>
  }
  const schema = tool.schema.toJSONSchema(tool.schema.object(searchTool.args), { io: "input" }) as {
    properties?: Record<string, { maxItems?: number; maximum?: number }>
  }

  assert.equal(schema.properties?.queries?.maxItems, 3)
  assert.equal(schema.properties?.topK?.maximum, 9)
})

test("buildVmmMemoryToolsFromDescriptors does not register tools when metadata is absent", () => {
  const tools = buildVmmMemoryToolsFromDescriptors()

  assert.deepEqual(Object.keys(tools), [])
})

test("buildVmmMemoryToolsFromDescriptors skips malformed central descriptors", () => {
  const tools = buildVmmMemoryToolsFromDescriptors([
    descriptor({
      input_schema_json: "{}",
    }),
  ])

  assert.deepEqual(Object.keys(tools), [])
})
