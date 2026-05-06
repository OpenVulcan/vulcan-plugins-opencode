/**
 * Trace-id header safety regression tests for the VMM gRPC transport.
 * VMM gRPC 传输层 trace-id header 安全回归测试。
 *
 * This file belongs to the verification layer. It protects the method-only
 * trace-id helpers shared by grpc-js and manual http2 transports, so every
 * RPC keeps the same header-safe correlation format.
 * 这个文件属于验证层，用来守护 grpc-js 与手工 http2 传输共用的
 * “仅含方法名”的 trace-id 辅助逻辑，确保每条 RPC 都保持同一套 header 安全关联格式。
 */

import assert from "node:assert/strict"
import test from "node:test"

import { buildTraceId, normalizeTraceMethodName } from "./vmm-grpc.js"

test("normalizeTraceMethodName converts RPC method names into kebab-case tokens", () => {
  const normalized = normalizeTraceMethodName("SearchMemoryEvents")

  assert.equal(normalized, "search-memory-events")
})

test("normalizeTraceMethodName strips separator noise into ASCII-safe method tokens", () => {
  const normalized = normalizeTraceMethodName(" GetTurnDetails / v1 ")

  assert.equal(normalized, "get-turn-details-v1")
})

test("buildTraceId emits the shared method-only trace id format", () => {
  const traceId = buildTraceId({
    method: "SearchMemoryEvents",
  })

  assert.match(traceId, /^vmm-plugin-search-memory-events-[0-9a-f-]+$/)
  assert.doesNotMatch(traceId, /SearchMemoryEvents/)
  assert.doesNotMatch(traceId, /manual/)
  assert.doesNotMatch(traceId, /汽车/)
})
