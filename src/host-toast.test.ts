/**
 * Host toast compatibility tests for shared OpenCode notification delivery.
 * 面向 OpenCode 共享通知投递链路的宿主 toast 兼容性测试。
 *
 * This file belongs to the verification layer. It protects the narrowed
 * runtime policy that only trusts the explicit host toast endpoint.
 * 这个文件属于验证层，用来守护当前收窄后的运行时策略：
 * 只信任显式宿主 toast 端点。
 */

import test from "node:test"
import assert from "node:assert/strict"
import {
  deliverHostToast,
  type HostToastClient,
} from "./host-toast.js"

/**
 * Build one minimal host toast input used by compatibility tests.
 * 构造兼容性测试复用的最小宿主 toast 输入。
 *
 * The helper keeps tests focused on delivery routing instead of repeating the
 * same fixture shape in every case.
 * 这里把固定输入抽出来，是为了让测试聚焦于投递路由，
 * 而不是在每个用例里重复铺设相同夹具。
 */
function createToastInput() {
  return {
    directory: "D:/projects/vulcan-plugins-opencode",
    message: "toast message",
    variant: "warning" as const,
    duration: 3000,
    timeoutMs: 250,
  }
}

test("deliverHostToast prefers showToast when the host exposes it", async () => {
  const calls: unknown[] = []
  const client: HostToastClient = {
    tui: {
      showToast: async (options) => {
        calls.push(options)
        return true
      },
    },
  }

  const result = await deliverHostToast(client, createToastInput())

  assert.equal(result.status, "delivered")
  assert.equal(result.channel, "showToast")
  assert.equal(calls.length, 1)
})

test("deliverHostToast skips legacy publish-only clients after removing publish fallback", async () => {
  const client = {
    tui: {
      publish: async () => true,
    },
  } as unknown as HostToastClient

  const result = await deliverHostToast(client, createToastInput())

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "no-channel")
})

test("deliverHostToast skips quickly when no host toast channel exists", async () => {
  const result = await deliverHostToast({}, createToastInput())

  assert.equal(result.status, "skipped")
  assert.equal(result.reason, "no-channel")
})
