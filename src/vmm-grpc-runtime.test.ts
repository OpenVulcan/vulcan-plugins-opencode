/**
 * Regression tests for VMM gRPC runtime recovery and client-pool pruning.
 * VMM gRPC 运行时恢复与客户端池修剪的回归测试。
 *
 * This file belongs to the verification layer. It protects the transport-side
 * self-healing cache and stale-target pruning logic so temporary runtime
 * import failures or target switching do not silently regress later.
 * 这个文件属于验证层，用来守护传输层的自愈缓存与旧 target 修剪逻辑，
 * 避免临时运行时导入失败或 target 切换在后续演进中悄悄回退。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  __acquireVmmGrpcClientForTests,
  __describeVmmGrpcTransportStateForTests,
  __resetVmmGrpcTransportStateForTests,
  __resolveVmmGrpcTransportRuntimeForTests,
  __setVmmGrpcRuntimeModuleLoaderForTests,
  callVmmHealthz,
} from "./vmm-grpc.js"

/**
 * Minimal fake client used to observe pool reuse and close behavior.
 * 用于观测连接池复用与关闭行为的最小伪造 client。
 *
 * Tests only need a stable identity plus a `close()` implementation because
 * the production pool code only relies on those parts when pruning targets.
 * 测试只需要稳定对象身份和 `close()` 行为，
 * 因为生产连接池代码在修剪 target 时也只依赖这两部分。
 */
type FakeTrackedClient = {
  target: string
  waitForReady(deadline: Date, callback: (error?: Error | null) => void): void
  Healthz(
    request: Record<string, never>,
    metadata: unknown,
    options: unknown,
    callback: (error: Error | null, payload?: { status: string; trace_id: string }) => void,
  ): void
  close(): void
}

/**
 * One constructor call snapshot captured by the fake grpc client factory.
 * 由伪造 grpc 客户端工厂捕获的一次构造调用快照。
 *
 * Keepalive verification only needs the target plus the raw constructor
 * options so tests can assert that channel-level health knobs are forwarded.
 * keepalive 校验只需要 target 和原始构造选项，
 * 这样测试就能断言 channel 级健康参数是否真的被透传了。
 */
type FakeClientConstructorCall = {
  target: string
  options: Record<string, unknown> | undefined
}

/**
 * Shared fake transport harness used by gRPC runtime regression tests.
 * gRPC 运行时回归测试共用的伪造传输环境。
 *
 * The harness simulates runtime-module imports, proto loading, constructor
 * creation, and client close side effects so tests can validate cache and pool
 * behavior without opening any real network connections.
 * 这个环境会模拟运行时模块导入、proto 加载、构造器创建以及 client 关闭副作用，
 * 让测试在不建立真实网络连接的前提下，验证缓存与连接池行为。
 */
function createFakeGrpcTransportHarness(args?: {
  failProtoLoaderImports?: number
  failReadyTargets?: string[]
  throwOnCloseTargets?: string[]
}) {
  const importCounts = {
    protoLoader: 0,
    grpc: 0,
  }
  const createdTargets: string[] = []
  const constructorCalls: FakeClientConstructorCall[] = []
  const closedTargets: string[] = []
  let remainingProtoLoaderFailures = args?.failProtoLoaderImports ?? 0
  const failReadyTargets = new Set(args?.failReadyTargets ?? [])
  const throwOnCloseTargets = new Set(args?.throwOnCloseTargets ?? [])
  const fakeStatus = {
    UNAVAILABLE: 14,
    DEADLINE_EXCEEDED: 4,
    14: "UNAVAILABLE",
    4: "DEADLINE_EXCEEDED",
  } as Record<string | number, string | number>

  const fakeConstructor = function FakeVmmServiceClient(
    this: unknown,
    target: string,
    _credentials?: unknown,
    options?: Record<string, unknown>,
  ): FakeTrackedClient {
    createdTargets.push(target)
    constructorCalls.push({
      target,
      options,
    })
    return {
      target,
      waitForReady(_deadline: Date, callback: (error?: Error | null) => void) {
        if (!failReadyTargets.has(target)) {
          callback(null)
          return
        }
        const error = new Error(`failed to connect to ${target}`) as Error & {
          code?: number
          details?: string
        }
        error.code = fakeStatus.UNAVAILABLE as number
        error.details = `failed to connect to ${target}`
        callback(error)
      },
      Healthz(
        _request: Record<string, never>,
        _metadata: unknown,
        _options: unknown,
        callback: (error: Error | null, payload?: { status: string; trace_id: string }) => void,
      ) {
        callback(null, {
          status: "ok",
          trace_id: `trace-${target}`,
        })
      },
      close() {
        closedTargets.push(target)
        if (throwOnCloseTargets.has(target)) {
          throw new Error(`simulated close failure for ${target}`)
        }
      },
    }
  }

  const fakeProtoLoaderRuntime = {
    async load() {
      return {}
    },
  }

  const fakeGrpcRuntime = {
    loadPackageDefinition() {
      return {
        vmm: {
          v1: {
            VMMService: fakeConstructor,
          },
        },
      }
    },
    credentials: {
      createInsecure() {
        return {}
      },
    },
    Metadata: class FakeMetadata {
      set() {
        return undefined
      }
    },
    status: fakeStatus,
  }

  return {
    importCounts,
    createdTargets,
    constructorCalls,
    closedTargets,
    /**
     * Fake runtime-module loader used by tests to drive deterministic paths.
     * 测试用的伪造运行时模块加载器，用来驱动可预测的路径。
     *
     * The loader can fail the proto-loader import a controlled number of times
     * so tests can prove the transport cache really self-heals after rejection.
     * 这里可以按受控次数让 proto-loader 导入失败，
     * 从而验证传输缓存在 reject 之后确实能够自愈。
     */
    async loader<T extends object>(moduleName: string) {
      if (moduleName === "@grpc/proto-loader") {
        importCounts.protoLoader += 1
        if (remainingProtoLoaderFailures > 0) {
          remainingProtoLoaderFailures -= 1
          throw new Error("simulated proto-loader import failure")
        }
        return fakeProtoLoaderRuntime as T
      }

      if (moduleName === "@grpc/grpc-js") {
        importCounts.grpc += 1
        return fakeGrpcRuntime as T
      }

      throw new Error(`unexpected runtime module request: ${moduleName}`)
    },
  }
}

/**
 * Reset test-only grpc transport state before and after each scenario.
 * 在每个场景前后重置仅测试使用的 grpc 传输状态。
 *
 * This avoids cache bleed between cases so every regression test observes the
 * exact runtime/pool transitions it intends to verify.
 * 这样可以避免缓存跨用例串味，
 * 确保每条回归测试观察到的都是自己要验证的那组运行时与连接池状态变化。
 */
function resetGrpcTransportTestState() {
  __resetVmmGrpcTransportStateForTests()
}

test("transport runtime cache clears rejected initialization and recovers on the next attempt", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness({
      failProtoLoaderImports: 1,
    })
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    await assert.rejects(
      __resolveVmmGrpcTransportRuntimeForTests(),
      /simulated proto-loader import failure/,
    )
    assert.deepEqual(__describeVmmGrpcTransportStateForTests(), {
      hasCachedTransportRuntime: false,
      hasCachedConstructor: false,
      pooledTargets: [],
    })

    const recoveredRuntime = await __resolveVmmGrpcTransportRuntimeForTests()

    assert.ok(recoveredRuntime.protoLoaderRuntime)
    assert.ok(recoveredRuntime.grpcRuntime)
    assert.equal(harness.importCounts.protoLoader, 2)
    assert.equal(harness.importCounts.grpc, 1)
    assert.deepEqual(__describeVmmGrpcTransportStateForTests(), {
      hasCachedTransportRuntime: true,
      hasCachedConstructor: false,
      pooledTargets: [],
    })
  } finally {
    resetGrpcTransportTestState()
  }
})

test("grpc client pool reuses the same client for repeated requests to one target", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness()
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    const first = await __acquireVmmGrpcClientForTests("127.0.0.1:17625")
    const second = await __acquireVmmGrpcClientForTests("127.0.0.1:17625")

    assert.equal(first, second)
    assert.deepEqual(harness.createdTargets, ["127.0.0.1:17625"])
    assert.deepEqual(__describeVmmGrpcTransportStateForTests(), {
      hasCachedTransportRuntime: true,
      hasCachedConstructor: true,
      pooledTargets: ["127.0.0.1:17625"],
    })
  } finally {
    resetGrpcTransportTestState()
  }
})

test("grpc client creation forwards the conservative default keepalive channel options", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness()
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    await __acquireVmmGrpcClientForTests("127.0.0.1:17625")

    assert.deepEqual(harness.constructorCalls, [
      {
        target: "127.0.0.1:17625",
        options: {
          "grpc.keepalive_time_ms": 300000,
          "grpc.keepalive_timeout_ms": 20000,
          "grpc.keepalive_permit_without_calls": 0,
        },
      },
    ])
  } finally {
    resetGrpcTransportTestState()
  }
})

test("grpc client creation normalizes non-positive keepalive options back to defaults", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness()
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    await __acquireVmmGrpcClientForTests("127.0.0.1:17625", {
      grpcKeepaliveTimeMs: 0,
      grpcKeepaliveTimeoutMs: -1,
      grpcKeepalivePermitWithoutCalls: -5,
    })

    assert.deepEqual(harness.constructorCalls, [
      {
        target: "127.0.0.1:17625",
        options: {
          "grpc.keepalive_time_ms": 300000,
          "grpc.keepalive_timeout_ms": 20000,
          "grpc.keepalive_permit_without_calls": 0,
        },
      },
    ])
  } finally {
    resetGrpcTransportTestState()
  }
})

test("grpc client pool recreates the same target when keepalive channel options change", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness()
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    const first = await __acquireVmmGrpcClientForTests("127.0.0.1:17625", {
      grpcKeepaliveTimeMs: 300000,
      grpcKeepaliveTimeoutMs: 20000,
      grpcKeepalivePermitWithoutCalls: 0,
    })
    const second = await __acquireVmmGrpcClientForTests("127.0.0.1:17625", {
      grpcKeepaliveTimeMs: 600000,
      grpcKeepaliveTimeoutMs: 20000,
      grpcKeepalivePermitWithoutCalls: 0,
    })

    assert.notEqual(first, second)
    assert.deepEqual(harness.createdTargets, ["127.0.0.1:17625", "127.0.0.1:17625"])
    assert.deepEqual(harness.closedTargets, ["127.0.0.1:17625"])
    assert.deepEqual(harness.constructorCalls, [
      {
        target: "127.0.0.1:17625",
        options: {
          "grpc.keepalive_time_ms": 300000,
          "grpc.keepalive_timeout_ms": 20000,
          "grpc.keepalive_permit_without_calls": 0,
        },
      },
      {
        target: "127.0.0.1:17625",
        options: {
          "grpc.keepalive_time_ms": 600000,
          "grpc.keepalive_timeout_ms": 20000,
          "grpc.keepalive_permit_without_calls": 0,
        },
      },
    ])
  } finally {
    resetGrpcTransportTestState()
  }
})

test("grpc client pool prunes the stale target when the active target changes", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness()
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    const first = await __acquireVmmGrpcClientForTests("127.0.0.1:17625")
    const second = await __acquireVmmGrpcClientForTests("127.0.0.1:17626")

    assert.notEqual(first, second)
    assert.deepEqual(harness.createdTargets, ["127.0.0.1:17625", "127.0.0.1:17626"])
    assert.deepEqual(harness.closedTargets, ["127.0.0.1:17625"])
    assert.deepEqual(__describeVmmGrpcTransportStateForTests(), {
      hasCachedTransportRuntime: true,
      hasCachedConstructor: true,
      pooledTargets: ["127.0.0.1:17626"],
    })
  } finally {
    resetGrpcTransportTestState()
  }
})

test("unary calls surface host endpoint failure without direct VMM retry", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness({
      failReadyTargets: ["127.0.0.1:17700"],
    })
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    const result = await callVmmHealthz({
      config: {
        grpcTarget: "127.0.0.1:17700",
      },
    })

    assert.equal(result.ok, false)
    assert.equal(result.target, "127.0.0.1:17700")
    assert.equal(result.grpcCodeName, "UNAVAILABLE")
    assert.deepEqual(harness.createdTargets, ["127.0.0.1:17700"])
  } finally {
    resetGrpcTransportTestState()
  }
})

test("stale-client close failures do not block creation of the new active target", {
  concurrency: false,
}, async () => {
  resetGrpcTransportTestState()
  try {
    const harness = createFakeGrpcTransportHarness({
      throwOnCloseTargets: ["127.0.0.1:17625"],
    })
    __setVmmGrpcRuntimeModuleLoaderForTests(harness.loader)

    await __acquireVmmGrpcClientForTests("127.0.0.1:17625")
    const nextClient = await __acquireVmmGrpcClientForTests("127.0.0.1:17626")

    assert.equal((nextClient as unknown as FakeTrackedClient).target, "127.0.0.1:17626")
    assert.deepEqual(harness.createdTargets, ["127.0.0.1:17625", "127.0.0.1:17626"])
    assert.deepEqual(harness.closedTargets, ["127.0.0.1:17625"])
    assert.deepEqual(__describeVmmGrpcTransportStateForTests(), {
      hasCachedTransportRuntime: true,
      hasCachedConstructor: true,
      pooledTargets: ["127.0.0.1:17626"],
    })
  } finally {
    resetGrpcTransportTestState()
  }
})
