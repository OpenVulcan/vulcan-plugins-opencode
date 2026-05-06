/**
 * Regression tests for the HostAdapterService gRPC client guard paths.
 * HostAdapterService gRPC 客户端保护路径的回归测试。
 *
 * This file belongs to the verification layer. It validates client-side guard
 * behavior that does not require a real vulcan-host process.
 * 这个文件属于验证层。
 * 它验证不需要真实 vulcan-host 进程的客户端保护行为。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  callVmmHostAdapterGetVmmStatus,
  callVmmHostAdapterRuntime,
} from "./vmm-host-adapter-grpc.js"

test("callVmmHostAdapterRuntime reports missing target without loading grpc runtime", async () => {
  const result = await callVmmHostAdapterRuntime({
    config: {
      grpcTarget: "",
      grpcHandshakeTimeoutMs: 100,
      grpcReceiveTimeoutMs: 100,
    },
    request: {
      context: {
        client_name: "opencode",
      },
      host_kind: "opencode",
      session_id: "session-a",
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.grpcCodeName, "MISSING_TARGET")
  assert.equal(result.method, "BuildHostAdapterRuntime")
})

test("callVmmHostAdapterGetVmmStatus reports missing target without loading grpc runtime", async () => {
  const result = await callVmmHostAdapterGetVmmStatus({
    config: {
      grpcTarget: "",
      grpcHandshakeTimeoutMs: 100,
      grpcReceiveTimeoutMs: 100,
    },
    request: {
      context: {
        client_name: "opencode",
      },
    },
  })

  assert.equal(result.ok, false)
  assert.equal(result.grpcCodeName, "MISSING_TARGET")
  assert.equal(result.method, "GetVmmStatus")
})
