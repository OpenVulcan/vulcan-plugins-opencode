/**
 * Regression tests for the VMM gRPC transport settings view-model.
 * VMM gRPC 传输设置视图模型的回归测试。
 *
 * This file belongs to the verification layer. It protects the pure page-state
 * compiler behind the keepalive settings screen so inheritance labels, parser
 * rules, and compact row composition stay stable without booting the TSX UI.
 * 这个文件属于验证层。
 * 它用于守护 keepalive 设置页面背后的纯页面状态编译器，
 * 这样就能在不启动 TSX 界面的前提下，稳定覆盖继承标签、解析规则
 * 以及紧凑列表条目的拼装逻辑。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  buildEndpointPlanSummary,
  buildKeepaliveTimePromptModel,
  buildKeepaliveTimeoutPromptModel,
  buildPermitWithoutCallsDialogModel,
  buildVulcanHostTargetPromptModel,
  buildVmmGrpcTransportScopeDialogModel,
  buildVmmGrpcTransportSettingsItems,
  formatEndpointStateValue,
  getVmmGrpcTransportCopy,
  moveGrpcTransportSelection,
  parseScopedPermitWithoutCallsValue,
  parseScopedPositiveIntegerValue,
  resolveGrpcTransportActivatedItem,
  resolveGrpcTransportActivationAction,
  resolveGrpcTransportKeyboardAction,
  resolveScopedKeepaliveReferenceValue,
  resolveGrpcTransportSelectedId,
  shouldCloseGrpcTransportOverlayOnMouseButton,
  validateGrpcTransportEndpointInput,
  validateGrpcTransportPositiveIntegerInput,
  type VmmGrpcTransportSettingsSnapshot,
} from "./vmm-grpc-transport-view-model.js"

/**
 * Build one complete transport snapshot for view-model tests.
 * 为 view-model 测试构建一份完整 transport 快照。
 */
function buildTransportSnapshot(
  overrides: Partial<VmmGrpcTransportSettingsSnapshot> = {},
): VmmGrpcTransportSettingsSnapshot {
  return {
    language: "en",
    workspaceVulcanHostTargetRaw: "",
    workspaceKeepaliveTimeRaw: "",
    workspaceKeepaliveTimeoutRaw: "",
    workspacePermitWithoutCallsRaw: "",
    globalVulcanHostTargetRaw: "",
    globalKeepaliveTimeRaw: "",
    globalKeepaliveTimeoutRaw: "",
    globalPermitWithoutCallsRaw: "",
    ...overrides,
  }
}

/**
 * Find one settings item by stable id during assertions.
 * 在断言中按稳定 id 查找设置项。
 */
function findTransportItem<TItem extends { id: string }>(
  items: ReadonlyArray<TItem>,
  id: string,
) {
  return items.find((item) => item.id === id)
}

test("parseScopedPositiveIntegerValue accepts only trimmed positive integers", () => {
  assert.equal(parseScopedPositiveIntegerValue("300000"), 300000)
  assert.equal(parseScopedPositiveIntegerValue(" 20000 "), 20000)
  assert.equal(parseScopedPositiveIntegerValue("0"), undefined)
  assert.equal(parseScopedPositiveIntegerValue("-1"), undefined)
  assert.equal(parseScopedPositiveIntegerValue("abc"), undefined)
})

test("parseScopedPositiveIntegerValue rejects empty, whitespace, env-vars, and decimals", () => {
  assert.equal(parseScopedPositiveIntegerValue(""), undefined)
  assert.equal(parseScopedPositiveIntegerValue("  "), undefined)
  assert.equal(parseScopedPositiveIntegerValue("${KEEPALIVE_TIME}"), undefined)
  assert.equal(parseScopedPositiveIntegerValue("3.14"), undefined)
  assert.equal(parseScopedPositiveIntegerValue("0123"), undefined)
  assert.equal(parseScopedPositiveIntegerValue("00"), undefined)
})

test("validateGrpcTransportPositiveIntegerInput returns empty-string error", () => {
  assert.equal(
    validateGrpcTransportPositiveIntegerInput("", "invalid"),
    "invalid",
  )
})

test("parseScopedPermitWithoutCallsValue accepts only 0 or 1", () => {
  assert.equal(parseScopedPermitWithoutCallsValue("0"), 0)
  assert.equal(parseScopedPermitWithoutCallsValue(" 1 "), 1)
  assert.equal(parseScopedPermitWithoutCallsValue("2"), undefined)
  assert.equal(parseScopedPermitWithoutCallsValue("true"), undefined)
})

test("formatEndpointStateValue trims targets and falls back to inherit", () => {
  const copy = getVmmGrpcTransportCopy("en")

  assert.equal(formatEndpointStateValue("en", " 127.0.0.1:17700 "), "127.0.0.1:17700")
  assert.equal(formatEndpointStateValue("en", ""), copy.inheritValue)
})

test("validateGrpcTransportEndpointInput accepts empty inheritance and rejects whitespace targets", () => {
  assert.equal(validateGrpcTransportEndpointInput("", "invalid"), undefined)
  assert.equal(validateGrpcTransportEndpointInput("127.0.0.1:17700", "invalid"), undefined)
  assert.equal(validateGrpcTransportEndpointInput("${VULCAN_HOST_GRPC_TARGET}", "invalid"), undefined)
  assert.equal(validateGrpcTransportEndpointInput("127.0.0.1:17700 extra", "invalid"), "invalid")
})

test("validateGrpcTransportPositiveIntegerInput returns localized errors for invalid input", () => {
  assert.equal(
    validateGrpcTransportPositiveIntegerInput("123", "invalid"),
    undefined,
  )
  assert.equal(
    validateGrpcTransportPositiveIntegerInput(" 0 ", "invalid"),
    "invalid",
  )
  assert.equal(
    validateGrpcTransportPositiveIntegerInput("oops", "invalid"),
    "invalid",
  )
})

test("buildEndpointPlanSummary describes vulcan-host target without probing services", () => {
  const summary = buildEndpointPlanSummary({
    language: "en",
    vulcanHostTargetRaw: "127.0.0.1:17700",
  })

  assert.match(summary, /vulcan-host/)
  assert.match(summary, /127\.0\.0\.1:17700/)
})

test("resolveScopedKeepaliveReferenceValue prefers one explicit scoped positive integer", () => {
  assert.equal(
    resolveScopedKeepaliveReferenceValue({
      scope: "local",
      rawScopedValue: "15000",
      effectiveValue: 0,
      defaultValue: 20000,
    }),
    15000,
  )
})

test("resolveScopedKeepaliveReferenceValue falls back to effective value for both global and local scopes", () => {
  assert.equal(
    resolveScopedKeepaliveReferenceValue({
      scope: "global",
      rawScopedValue: "0",
      effectiveValue: 7000,
      defaultValue: 20000,
    }),
    7000,
  )
  assert.equal(
    resolveScopedKeepaliveReferenceValue({
      scope: "local",
      rawScopedValue: "0",
      effectiveValue: 7000,
      defaultValue: 20000,
    }),
    7000,
  )
  assert.equal(
    resolveScopedKeepaliveReferenceValue({
      scope: "global",
      rawScopedValue: "${KEEPALIVE_TIME}",
      effectiveValue: 300000,
      defaultValue: 20000,
    }),
    300000,
  )
})

test("resolveScopedKeepaliveReferenceValue falls back to defaultValue when both raw and effective are invalid", () => {
  assert.equal(
    resolveScopedKeepaliveReferenceValue({
      scope: "global",
      rawScopedValue: "",
      effectiveValue: 0,
      defaultValue: 300000,
    }),
    300000,
  )
  assert.equal(
    resolveScopedKeepaliveReferenceValue({
      scope: "local",
      rawScopedValue: "bad",
      effectiveValue: -1,
      defaultValue: 20000,
    }),
    20000,
  )
})

test("buildVmmGrpcTransportScopeDialogModel exposes workspace and global options", () => {
  const model = buildVmmGrpcTransportScopeDialogModel("en")

  assert.ok(model.title.length > 0)
  assert.deepEqual(
    model.options.map((option) => option.value),
    ["local", "global"],
  )
  assert.ok(model.options.every((option) => option.title.length > 0))
  assert.ok(model.options.every((option) => option.subtitle.length > 0))
})

test("buildKeepaliveTimePromptModel uses raw scoped value and leaves empty when inheriting", () => {
  const scopedModel = buildKeepaliveTimePromptModel({
    language: "en",
    rawScopedValue: "450000",
  })
  const inheritedModel = buildKeepaliveTimePromptModel({
    language: "en",
    rawScopedValue: "",
  })

  assert.equal(scopedModel.initialValue, "450000")
  assert.equal(inheritedModel.initialValue, "")
  assert.ok(scopedModel.title.length > 0)
  assert.ok(scopedModel.invalidMessage.length > 0)
})

test("buildKeepaliveTimeoutPromptModel uses raw scoped value and leaves empty when inheriting", () => {
  const scopedModel = buildKeepaliveTimeoutPromptModel({
    language: "en",
    rawScopedValue: "9000",
  })
  const inheritedModel = buildKeepaliveTimeoutPromptModel({
    language: "en",
    rawScopedValue: "",
  })

  assert.equal(scopedModel.initialValue, "9000")
  assert.equal(inheritedModel.initialValue, "")
  assert.ok(scopedModel.placeholder.length > 0)
  assert.ok(scopedModel.description.length > 0)
})

test("buildPermitWithoutCallsDialogModel carries localized scope-specific title and binary options", () => {
  const model = buildPermitWithoutCallsDialogModel({
    language: "en",
    scopeLabel: "Workspace",
  })

  assert.ok(model.title.includes("Workspace"))
  assert.deepEqual(
    model.options.map((option) => option.value),
    ["0", "1"],
  )
  assert.ok(model.options.every((option) => option.title.length > 0))
})

test("endpoint prompt models allow empty values for scoped inheritance", () => {
  const relayModel = buildVulcanHostTargetPromptModel({
    language: "en",
    rawScopedValue: "127.0.0.1:17700",
  })

  assert.equal(relayModel.initialValue, "127.0.0.1:17700")
  assert.equal(relayModel.allowEmpty, true)
  assert.ok(relayModel.invalidMessage.length > 0)
})

test("buildVmmGrpcTransportSettingsItems preserves inherit and explicit state labels", () => {
  const copy = getVmmGrpcTransportCopy("en")
  const items = buildVmmGrpcTransportSettingsItems({
    language: "en",
    workspaceKeepaliveTimeRaw: " ",
    workspaceKeepaliveTimeoutRaw: "15000",
    workspacePermitWithoutCallsRaw: "1",
    globalKeepaliveTimeRaw: "300000",
    globalKeepaliveTimeoutRaw: "bad-value",
    globalPermitWithoutCallsRaw: "2",
  })

  assert.deepEqual(
    items.map((item) => item.id),
    [
      "action:vulcan-host-target",
      "action:keepalive-time",
      "action:keepalive-timeout",
      "action:permit-without-calls",
    ],
  )

  const relayItem = findTransportItem(items, "action:vulcan-host-target")
  const keepaliveTimeItem = findTransportItem(items, "action:keepalive-time")
  const keepaliveTimeoutItem = findTransportItem(items, "action:keepalive-timeout")
  const permitItem = findTransportItem(items, "action:permit-without-calls")

  assert.ok(relayItem?.title.includes(copy.vulcanHostTargetTitle))
  assert.ok(relayItem?.title.includes(copy.inheritValue))

  assert.ok(keepaliveTimeItem?.title.includes(copy.keepaliveTimeTitle))
  assert.ok(keepaliveTimeItem?.title.includes(copy.inheritValue))
  assert.ok(keepaliveTimeItem?.title.includes("300000"))
  assert.equal(keepaliveTimeItem?.subtitle, copy.keepaliveTimeSubtitle)

  assert.ok(keepaliveTimeoutItem?.title.includes(copy.keepaliveTimeoutTitle))
  assert.ok(keepaliveTimeoutItem?.title.includes("15000"))
  assert.ok(keepaliveTimeoutItem?.title.includes(copy.inheritValue))
  assert.equal(keepaliveTimeoutItem?.subtitle, copy.keepaliveTimeoutSubtitle)

  assert.ok(permitItem?.title.includes(copy.permitTitle))
  assert.ok(permitItem?.title.includes(copy.enabledValue))
  assert.ok(permitItem?.title.includes(copy.inheritValue))
  assert.equal(permitItem?.subtitle, copy.permitSubtitle)
})

test("resolveGrpcTransportSelectedId keeps valid selection and otherwise falls back to the first row", () => {
  const items = buildVmmGrpcTransportSettingsItems({
    language: "en",
    workspaceKeepaliveTimeRaw: "",
    workspaceKeepaliveTimeoutRaw: "",
    workspacePermitWithoutCallsRaw: "",
    globalKeepaliveTimeRaw: "",
    globalKeepaliveTimeoutRaw: "",
    globalPermitWithoutCallsRaw: "",
  })

  assert.equal(
    resolveGrpcTransportSelectedId({
      items,
      currentSelectedId: "action:keepalive-timeout",
    }),
    "action:keepalive-timeout",
  )
  assert.equal(
    resolveGrpcTransportSelectedId({
      items,
      currentSelectedId: "missing",
    }),
    "action:vulcan-host-target",
  )
  assert.equal(
    resolveGrpcTransportSelectedId({
      items: [],
      currentSelectedId: "missing",
    }),
    "",
  )
})

test("moveGrpcTransportSelection wraps around the compact list", () => {
  const items = buildVmmGrpcTransportSettingsItems({
    language: "en",
    workspaceKeepaliveTimeRaw: "",
    workspaceKeepaliveTimeoutRaw: "",
    workspacePermitWithoutCallsRaw: "",
    globalKeepaliveTimeRaw: "",
    globalKeepaliveTimeoutRaw: "",
    globalPermitWithoutCallsRaw: "",
  })

  assert.equal(
    moveGrpcTransportSelection({
      items,
      currentSelectedId: "action:vulcan-host-target",
      direction: -1,
    }),
    "action:permit-without-calls",
  )
  assert.equal(
    moveGrpcTransportSelection({
      items,
      currentSelectedId: "action:permit-without-calls",
      direction: 1,
    }),
    "action:vulcan-host-target",
  )
  assert.equal(
    moveGrpcTransportSelection({
      items,
      currentSelectedId: "missing",
      direction: 1,
    }),
    "action:keepalive-time",
  )
  assert.equal(
    moveGrpcTransportSelection({
      items: [],
      currentSelectedId: "action:vulcan-host-target",
      direction: 1,
    }),
    "",
  )
})

test("resolveGrpcTransportActivatedItem prefers explicit rows and falls back to keyboard selection", () => {
  const items = buildVmmGrpcTransportSettingsItems({
    language: "en",
    workspaceKeepaliveTimeRaw: "",
    workspaceKeepaliveTimeoutRaw: "",
    workspacePermitWithoutCallsRaw: "",
    globalKeepaliveTimeRaw: "",
    globalKeepaliveTimeoutRaw: "",
    globalPermitWithoutCallsRaw: "",
  })

  assert.equal(
    resolveGrpcTransportActivatedItem({
      items,
      selectedId: "action:keepalive-timeout",
    })?.id,
    "action:keepalive-timeout",
  )
  assert.equal(
    resolveGrpcTransportActivatedItem({
      items,
      selectedId: "missing",
      explicitItem: items[3],
    })?.id,
    "action:permit-without-calls",
  )
  assert.equal(
    resolveGrpcTransportActivatedItem({
      items: [],
      selectedId: "missing",
    }),
    undefined,
  )
})

test("resolveGrpcTransportActivationAction maps every row kind to a stable editor action", () => {
  const items = buildVmmGrpcTransportSettingsItems({
    language: "en",
    workspaceKeepaliveTimeRaw: "",
    workspaceKeepaliveTimeoutRaw: "",
    workspacePermitWithoutCallsRaw: "",
    globalKeepaliveTimeRaw: "",
    globalKeepaliveTimeoutRaw: "",
    globalPermitWithoutCallsRaw: "",
  })

  assert.equal(
    resolveGrpcTransportActivationAction(items[0]),
    "open-vulcan-host-target",
  )
  assert.equal(
    resolveGrpcTransportActivationAction(items[1]),
    "open-keepalive-time",
  )
  assert.equal(
    resolveGrpcTransportActivationAction(items[2]),
    "open-keepalive-timeout",
  )
  assert.equal(
    resolveGrpcTransportActivationAction(items[3]),
    "open-permit-without-calls",
  )
  assert.equal(resolveGrpcTransportActivationAction(undefined), undefined)
})

test("resolveGrpcTransportKeyboardAction respects dialog-open and empty-list guards", () => {
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "up",
      hasItems: true,
      dialogOpen: true,
    }),
    undefined,
  )
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "enter",
      hasItems: false,
      dialogOpen: false,
    }),
    undefined,
  )
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "escape",
      hasItems: false,
      dialogOpen: false,
    }),
    "close",
  )
})

test("resolveGrpcTransportKeyboardAction maps the compact navigation keys to semantic actions", () => {
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "up",
      hasItems: true,
      dialogOpen: false,
    }),
    "move-up",
  )
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "k",
      hasItems: true,
      dialogOpen: false,
    }),
    "move-up",
  )
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "down",
      hasItems: true,
      dialogOpen: false,
    }),
    "move-down",
  )
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "j",
      hasItems: true,
      dialogOpen: false,
    }),
    "move-down",
  )
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "return",
      hasItems: true,
      dialogOpen: false,
    }),
    "activate",
  )
  assert.equal(
    resolveGrpcTransportKeyboardAction({
      eventName: "unknown",
      hasItems: true,
      dialogOpen: false,
    }),
    undefined,
  )
})

test("shouldCloseGrpcTransportOverlayOnMouseButton only closes on right click", () => {
  assert.equal(shouldCloseGrpcTransportOverlayOnMouseButton(0), false)
  assert.equal(shouldCloseGrpcTransportOverlayOnMouseButton(1), false)
  assert.equal(shouldCloseGrpcTransportOverlayOnMouseButton(2), true)
})

test("buildVmmGrpcTransportSettingsItems shows explicit state for all-explicit snapshot", () => {
  const copy = getVmmGrpcTransportCopy("en")
  const items = buildVmmGrpcTransportSettingsItems({
    language: "en",
    workspaceVulcanHostTargetRaw: "127.0.0.1:17700",
    workspaceKeepaliveTimeRaw: "120000",
    workspaceKeepaliveTimeoutRaw: "10000",
    workspacePermitWithoutCallsRaw: "1",
    globalVulcanHostTargetRaw: "${VULCAN_HOST_GRPC_TARGET}",
    globalKeepaliveTimeRaw: "300000",
    globalKeepaliveTimeoutRaw: "20000",
    globalPermitWithoutCallsRaw: "0",
  })

  assert.equal(items.length, 4)
  assert.ok(items[0]?.title.includes("127.0.0.1:17700"))
  assert.ok(items[0]?.title.includes("${VULCAN_HOST_GRPC_TARGET}"))
  // workspace time should show the explicit value, not inherit.
  assert.ok(items[1]?.title.includes("120000"))
  assert.ok(items[1]?.title.includes("300000"))
  assert.ok(items[2]?.title.includes("10000"))
  assert.ok(items[2]?.title.includes("20000"))
  // permit values: workspace=enabled, global=disabled.
  assert.ok(items[3]?.title.includes(copy.enabledValue))
  assert.ok(items[3]?.title.includes(copy.disabledValue))
})

test("buildVmmGrpcTransportSettingsItems shows inherit for all-empty snapshot", () => {
  const copy = getVmmGrpcTransportCopy("en")
  const items = buildVmmGrpcTransportSettingsItems({
    language: "en",
    workspaceKeepaliveTimeRaw: "",
    workspaceKeepaliveTimeoutRaw: "",
    workspacePermitWithoutCallsRaw: "",
    globalKeepaliveTimeRaw: "",
    globalKeepaliveTimeoutRaw: "",
    globalPermitWithoutCallsRaw: "",
  })

  assert.equal(items.length, 4)
  // All rows should show inherit for both project and global.
  for (const item of items) {
    assert.ok(item.title.includes(copy.inheritValue))
  }
})

test("parseScopedPositiveIntegerValue rejects leading-zero and non-numeric strings", () => {
  assert.equal(parseScopedPositiveIntegerValue("0123"), undefined)
  assert.equal(parseScopedPositiveIntegerValue("00"), undefined)
  assert.equal(parseScopedPositiveIntegerValue("  "), undefined)
  assert.equal(parseScopedPositiveIntegerValue("3.14"), undefined)
})

test("validateGrpcTransportPositiveIntegerInput rejects values exceeding MAX_KEEPALIVE", () => {
  assert.equal(
    validateGrpcTransportPositiveIntegerInput("3600001", "invalid"),
    "invalid",
  )
  assert.equal(
    validateGrpcTransportPositiveIntegerInput("99999999", "invalid"),
    "invalid",
  )
  assert.equal(
    validateGrpcTransportPositiveIntegerInput("3600000", "invalid"),
    undefined,
  )
})
