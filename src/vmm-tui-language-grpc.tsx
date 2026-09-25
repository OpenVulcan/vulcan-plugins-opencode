/** @jsxImportSource @opentui/solid */
/**
 * VMM TUI gRPC endpoint and keepalive feature module.
 * VMM TUI gRPC endpoint 与 keepalive 设置功能模块。
 *
 * This file belongs to the TUI interaction layer. It exposes one focused
 * screen for endpoint and keepalive transport controls so operators can adjust
 * vulcan-host connectivity and connection-health behavior without editing JSON config files by hand.
 * 这个文件属于 TUI 交互层。
 * 它提供一个聚焦的 endpoint 与 keepalive 传输设置页面，
 * 让操作者可以直接在终端界面里调整 vulcan-host 连接和连接健康相关参数，
 * 而不需要手工编辑 JSON 配置文件。
 */

import { useKeyboard } from "@opentui/solid"
import { createEffect, createSignal } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { getConfigScopeLabel, saveVmmConfig, type VmmConfigScope } from "./vmm-config.js"
import {
  DEFAULT_GRPC_KEEPALIVE_TIME_MS,
  DEFAULT_GRPC_KEEPALIVE_TIMEOUT_MS,
} from "./vmm-config.js"
import type { VmmLanguage } from "./vmm-language.js"
import {
  VMM_TUI_COLOR_BORDER,
  VMM_TUI_COLOR_HINT,
  VMM_TUI_COLOR_MUTED,
  VMM_TUI_PANEL_HEADER_HEIGHT,
  VMM_TUI_PANEL_OUTER_GAP,
  VMM_TUI_PANEL_VERTICAL_PADDING,
  VMM_TUI_OVERLAY_PANEL_HEIGHT,
  VMM_TUI_OVERLAY_PANEL_WIDTH,
  VMM_TUI_COLOR_SURFACE,
  VmmCompactListRow,
  VmmDialogHost,
  VmmScrollColumn,
  buildVmmRowRenderableId,
  createVmmTuiLocaleState,
  isVmmDialogOpen,
  openVmmInfoDialog,
  openVmmSelectDialog,
  openVmmSettingScreen,
  openVmmTextPrompt,
  readScopedVmmConfigValue,
  setVmmDialogLanguage,
  writeVmmTuiLog,
} from "./vmm-tui.js"
import {
  buildKeepaliveTimePromptModel,
  buildKeepaliveTimeoutPromptModel,
  buildPermitWithoutCallsDialogModel,
  buildVulcanHostTargetPromptModel,
  buildVmmGrpcTransportScopeDialogModel,
  buildVmmGrpcTransportSettingsItems,
  getVmmGrpcTransportCopy,
  moveGrpcTransportSelection,
  resolveGrpcTransportActivatedItem,
  resolveGrpcTransportActivationAction,
  resolveGrpcTransportKeyboardAction,
  resolveScopedKeepaliveReferenceValue,
  resolveGrpcTransportSelectedId,
  shouldCloseGrpcTransportOverlayOnMouseButton,
  validateGrpcTransportEndpointInput,
  validateGrpcTransportPositiveIntegerInput,
  type VmmGrpcTransportSettingsItem,
} from "./vmm-grpc-transport-view-model.js"

/**
 * Open one reusable scope picker for gRPC transport settings.
 * 打开一个可复用的 gRPC 传输设置作用域选择框。
 */
function openGrpcTransportScopeDialog(args: {
  api: TuiPluginApi
  language: VmmLanguage
  onSelectScope: (scope: VmmConfigScope) => void
}) {
  const dialogModel = buildVmmGrpcTransportScopeDialogModel(args.language)
  openVmmSelectDialog({
    language: args.language,
    title: dialogModel.title,
    options: dialogModel.options,
    onCancel: () => {},
    onSelect: (value) => {
      if (value !== "local" && value !== "global") return
      args.onSelectScope(value)
    },
  })
}

/**
 * Full-screen overlay shell used by the gRPC transport entry.
 * gRPC 传输入口使用的全屏遮罩层外壳。
 */
export const VmmGrpcTransportSettingsOverlay = (props: {
  api: TuiPluginApi
  language: () => VmmLanguage
  onClose: () => void
}) => {
  const locale = createVmmTuiLocaleState(props.api)
  const [items, setItems] = createSignal<ReadonlyArray<VmmGrpcTransportSettingsItem>>([])
  const [selectedId, setSelectedId] = createSignal("")

  /**
   * Rebuild the transport overlay rows from the latest config snapshot.
   * 根据最新配置快照重建传输设置覆盖层条目。
   */
  const reloadTransportSettingsOverlay = async (reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language

    /**
     * Read endpoint and keepalive scoped config values in parallel to minimize I/O latency.
     * 并行读取 endpoint 与 keepalive 的作用域配置值，以最小化 I/O 延迟。
     */
    const [
      workspaceVulcanHostTargetRaw,
      workspaceKeepaliveTimeRaw,
      workspaceKeepaliveTimeoutRaw,
      workspacePermitWithoutCallsRaw,
      globalVulcanHostTargetRaw,
      globalKeepaliveTimeRaw,
      globalKeepaliveTimeoutRaw,
      globalPermitWithoutCallsRaw,
    ] = await Promise.all([
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "local",
        "vulcan_host_target",
      ),
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "local",
        "grpc_keepalive_time_ms",
      ),
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "local",
        "grpc_keepalive_timeout_ms",
      ),
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "local",
        "grpc_keepalive_permit_without_calls",
      ),
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "global",
        "vulcan_host_target",
      ),
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "global",
        "grpc_keepalive_time_ms",
      ),
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "global",
        "grpc_keepalive_timeout_ms",
      ),
      readScopedVmmConfigValue(
        props.api.state.path.directory,
        "global",
        "grpc_keepalive_permit_without_calls",
      ),
    ])

    const builtItems = buildVmmGrpcTransportSettingsItems({
      language: currentLanguage,
      workspaceVulcanHostTargetRaw,
      workspaceKeepaliveTimeRaw,
      workspaceKeepaliveTimeoutRaw,
      workspacePermitWithoutCallsRaw,
      globalVulcanHostTargetRaw,
      globalKeepaliveTimeRaw,
      globalKeepaliveTimeoutRaw,
      globalPermitWithoutCallsRaw,
    })
    setItems(builtItems)

    writeVmmTuiLog("vmm.tui.grpc_transport.reload", {
      reason,
      workspaceVulcanHostTargetRaw,
      workspaceKeepaliveTimeRaw,
      workspaceKeepaliveTimeoutRaw,
      workspacePermitWithoutCallsRaw,
      globalVulcanHostTargetRaw,
      globalKeepaliveTimeRaw,
      globalKeepaliveTimeoutRaw,
      globalPermitWithoutCallsRaw,
      effectiveGrpcTarget: config.grpcTarget,
      effectiveVulcanHostTarget: config.vulcanHostTarget,
      effectiveKeepaliveTimeMs: config.grpcKeepaliveTimeMs,
      effectiveKeepaliveTimeoutMs: config.grpcKeepaliveTimeoutMs,
      effectiveKeepalivePermitWithoutCalls: config.grpcKeepalivePermitWithoutCalls,
      renderedItemCount: builtItems.length,
    })
  }

  /**
   * Persist one endpoint target value into the chosen scope.
   * 把一条 endpoint target 值保存到选中的作用域。
   *
   * Empty values intentionally clear the scoped override, allowing the runtime
   * to inherit vulcan-host settings from the next layer.
   * 空值会刻意清空当前作用域覆盖，让运行时从下一层继承 vulcan-host 设置。
   */
  const saveEndpointTarget = async (
    scope: VmmConfigScope,
    key: "vulcan_host_target",
    rawValue: string,
  ) => {
    const trimmed = rawValue.trim()
    const copy = getVmmGrpcTransportCopy(locale.language())
    const validationMessage = validateGrpcTransportEndpointInput(
      trimmed,
      copy.endpointPromptInvalid,
    )
    if (validationMessage) {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: validationMessage,
      })
      return
    }

    try {
      await saveVmmConfig(props.api.state.path.directory, scope, key, trimmed)
    } catch {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.saveFailed,
      })
      return
    }

    const currentLanguage = (await locale.refreshConfig()).language
    const currentCopy = getVmmGrpcTransportCopy(currentLanguage)
    const renderedValue = trimmed || currentCopy.inheritValue
    await reloadTransportSettingsOverlay(`save-${key}`)
    openVmmInfoDialog({
      api: props.api,
      title: currentCopy.toastTitle,
      message: currentCopy.savedVulcanHostTarget({
        scope: getConfigScopeLabel(scope, currentLanguage),
        value: renderedValue,
      }),
    })
  }

  /**
   * Persist one positive keepalive time value into the chosen scope.
   * 把一条正整数 keepalive 时间值保存到选中的作用域。
   */
  const saveKeepaliveTime = async (scope: VmmConfigScope, rawValue: string) => {
    const trimmed = rawValue.trim()
    const copy = getVmmGrpcTransportCopy(locale.language())
    if (validateGrpcTransportPositiveIntegerInput(trimmed, copy.keepaliveTimePromptInvalid)) {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.keepaliveTimePromptInvalid,
      })
      return
    }

    /**
     * Validate that the new time is not less than the current timeout in the
     * same scope, so we do not create an invalid time < timeout combination.
     * 校验新的 time 值不小于当前作用域的 timeout，
     * 避免产生 time < timeout 的无效组合。
     *
     * When the target scope has no explicit timeout, the fallback depends on
     * which scope is being edited:
     * - global scope: fall back to the code-level default (no higher layer).
     * - local scope: fall back to the layered effective value, because local
     *   inherits global overrides. This prevents a global timeout from being
     *   silently ignored when editing local time.
     * 当目标作用域没有显式 timeout 时，回退策略取决于编辑的作用域：
     * - global 作用域：回退到代码级默认值（没有更高层）。
     * - local 作用域：回退到分层生效值，因为 local 会继承 global 的覆盖值。
     *   这样可以防止编辑 local time 时忽略 global timeout。
     */
    const currentScopedTimeout = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      scope,
      "grpc_keepalive_timeout_ms",
    )
    const effectiveConfig = await locale.refreshConfig()
    const referenceTimeout = resolveScopedKeepaliveReferenceValue({
      scope,
      rawScopedValue: currentScopedTimeout,
      effectiveValue: effectiveConfig.grpcKeepaliveTimeoutMs,
      defaultValue: DEFAULT_GRPC_KEEPALIVE_TIMEOUT_MS,
    })
    const newTimeValue = Number.parseInt(trimmed, 10)
    if (newTimeValue < referenceTimeout) {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.keepaliveTimeBelowTimeout,
      })
      return
    }

    try {
      await saveVmmConfig(
        props.api.state.path.directory,
        scope,
        "grpc_keepalive_time_ms",
        Number.parseInt(trimmed, 10),
      )
    } catch {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.saveFailed,
      })
      return
    }
    const currentLanguage = (await locale.refreshConfig()).language
    const currentCopy = getVmmGrpcTransportCopy(currentLanguage)
    await reloadTransportSettingsOverlay("save-keepalive-time")
    openVmmInfoDialog({
      api: props.api,
      title: currentCopy.toastTitle,
      message: currentCopy.savedKeepaliveTime({
        scope: getConfigScopeLabel(scope, currentLanguage),
        value: trimmed,
      }),
    })
  }

  /**
   * Persist one positive keepalive timeout value into the chosen scope.
   * 把一条正整数 keepalive 超时值保存到选中的作用域。
   */
  const saveKeepaliveTimeout = async (scope: VmmConfigScope, rawValue: string) => {
    const trimmed = rawValue.trim()
    const copy = getVmmGrpcTransportCopy(locale.language())
    if (
      validateGrpcTransportPositiveIntegerInput(trimmed, copy.keepaliveTimeoutPromptInvalid)
    ) {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.keepaliveTimeoutPromptInvalid,
      })
      return
    }

    /**
     * Validate that timeout is strictly less than keepalive time within the
     * same scope. We read the scoped time value directly; when the scope has
     * no explicit time override, the fallback depends on which scope is being
     * edited:
     * - global scope: fall back to the code-level default (no higher layer).
     * - local scope: fall back to the layered effective value, because local
     *   inherits global time overrides. This prevents a global time override
     *   from being silently ignored when editing local timeout.
     * 校验 timeout 必须严格小于同作用域的 keepalive time。
     * 我们直接读取当前作用域的 time 值；
     * 当该作用域没有显式 time 时，回退策略取决于编辑的作用域：
     * - global 作用域：回退到代码级默认值（没有更高层）。
     * - local 作用域：回退到分层生效值，因为 local 会继承 global 的 time 覆盖值。
     *   这样可以防止编辑 local timeout 时忽略 global time 覆盖。
     */
    const currentScopedTime = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      scope,
      "grpc_keepalive_time_ms",
    )
    const effectiveConfig = await locale.refreshConfig()
    const referenceTimeMs = resolveScopedKeepaliveReferenceValue({
      scope,
      rawScopedValue: currentScopedTime,
      effectiveValue: effectiveConfig.grpcKeepaliveTimeMs,
      defaultValue: DEFAULT_GRPC_KEEPALIVE_TIME_MS,
    })
    const timeoutValue = Number.parseInt(trimmed, 10)
    if (timeoutValue >= referenceTimeMs) {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.keepaliveTimeoutExceedsTime,
      })
      return
    }

    try {
      await saveVmmConfig(
        props.api.state.path.directory,
        scope,
        "grpc_keepalive_timeout_ms",
        Number.parseInt(trimmed, 10),
      )
    } catch {
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.saveFailed,
      })
      return
    }
    const currentLanguage = (await locale.refreshConfig()).language
    const currentCopy = getVmmGrpcTransportCopy(currentLanguage)
    await reloadTransportSettingsOverlay("save-keepalive-timeout")
    openVmmInfoDialog({
      api: props.api,
      title: currentCopy.toastTitle,
      message: currentCopy.savedKeepaliveTimeout({
        scope: getConfigScopeLabel(scope, currentLanguage),
        value: trimmed,
      }),
    })
  }

  /**
   * Persist one permit-without-calls switch into the chosen scope.
   * 把一条 permit-without-calls 开关保存到选中的作用域。
   */
  const savePermitWithoutCalls = async (
    scope: VmmConfigScope,
    permitWithoutCalls: 0 | 1,
  ) => {
    try {
      await saveVmmConfig(
        props.api.state.path.directory,
        scope,
        "grpc_keepalive_permit_without_calls",
        permitWithoutCalls,
      )
    } catch {
      const copy = getVmmGrpcTransportCopy(locale.language())
      openVmmInfoDialog({
        api: props.api,
        title: copy.toastTitle,
        message: copy.saveFailed,
      })
      return
    }
    const currentLanguage = (await locale.refreshConfig()).language
    const copy = getVmmGrpcTransportCopy(currentLanguage)
    await reloadTransportSettingsOverlay("save-permit-without-calls")
    openVmmInfoDialog({
      api: props.api,
      title: copy.toastTitle,
      message: copy.savedPermit({
        scope: getConfigScopeLabel(scope, currentLanguage),
        enabled: permitWithoutCalls === 1,
      }),
    })
  }

  /**
   * Open the vulcan-host target prompt after the operator picks one scope.
   * 在操作者选定作用域后，打开 vulcan-host target 输入框。
   */
  const openVulcanHostTargetPrompt = async (scope: VmmConfigScope) => {
    const currentLanguage = (await locale.refreshConfig()).language
    const rawScopedValue = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      scope,
      "vulcan_host_target",
    )
    const promptModel = buildVulcanHostTargetPromptModel({
      language: currentLanguage,
      rawScopedValue,
    })
    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: promptModel.title,
      placeholder: promptModel.placeholder,
      description: promptModel.description,
      emptyMessage: promptModel.emptyMessage,
      initialValue: promptModel.initialValue,
      allowEmpty: promptModel.allowEmpty,
      toastTitle: promptModel.toastTitle,
      validateValue: (value) =>
        validateGrpcTransportEndpointInput(value, promptModel.invalidMessage),
      onConfirmValue: (value) => {
        void saveEndpointTarget(scope, "vulcan_host_target", value)
      },
    })
  }

  /**
   * Open the keepalive-time prompt after the operator picks one scope.
   * 在操作者选定作用域后，打开 keepalive 时间输入框。
   */
  const openKeepaliveTimePrompt = async (scope: VmmConfigScope) => {
    const currentLanguage = (await locale.refreshConfig()).language
    const rawScopedValue = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      scope,
      "grpc_keepalive_time_ms",
    )
    const promptModel = buildKeepaliveTimePromptModel({
      language: currentLanguage,
      rawScopedValue,
    })
    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: promptModel.title,
      placeholder: promptModel.placeholder,
      description: promptModel.description,
      emptyMessage: promptModel.emptyMessage,
      initialValue: promptModel.initialValue,
      toastTitle: promptModel.toastTitle,
      validateValue: (value) =>
        validateGrpcTransportPositiveIntegerInput(value, promptModel.invalidMessage),
      onConfirmValue: (value) => {
        void saveKeepaliveTime(scope, value)
      },
    })
  }

  /**
   * Open the keepalive-timeout prompt after the operator picks one scope.
   * 在操作者选定作用域后，打开 keepalive 超时输入框。
   */
  const openKeepaliveTimeoutPrompt = async (scope: VmmConfigScope) => {
    const currentLanguage = (await locale.refreshConfig()).language
    const rawScopedValue = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      scope,
      "grpc_keepalive_timeout_ms",
    )
    const promptModel = buildKeepaliveTimeoutPromptModel({
      language: currentLanguage,
      rawScopedValue,
    })
    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: promptModel.title,
      placeholder: promptModel.placeholder,
      description: promptModel.description,
      emptyMessage: promptModel.emptyMessage,
      initialValue: promptModel.initialValue,
      toastTitle: promptModel.toastTitle,
      validateValue: (value) =>
        validateGrpcTransportPositiveIntegerInput(value, promptModel.invalidMessage),
      onConfirmValue: (value) => {
        void saveKeepaliveTimeout(scope, value)
      },
    })
  }

  /**
   * Open the permit-without-calls selector after the operator picks one scope.
   * 在操作者选定作用域后，打开 permit-without-calls 选择框。
   */
  const openPermitWithoutCallsDialog = async (scope: VmmConfigScope) => {
    const currentLanguage = (await locale.refreshConfig()).language
    const dialogModel = buildPermitWithoutCallsDialogModel({
      language: currentLanguage,
      scopeLabel: getConfigScopeLabel(scope, currentLanguage),
    })
    openVmmSelectDialog({
      language: currentLanguage,
      title: dialogModel.title,
      options: dialogModel.options,
      onCancel: () => {},
      onSelect: (value) => {
        if (value !== "0" && value !== "1") return
        void savePermitWithoutCalls(scope, value === "1" ? 1 : 0)
      },
    })
  }

  /**
   * Execute the currently selected transport action, then ask for write scope.
   * 执行当前选中的传输设置动作，然后再询问写入范围。
   */
  const activateSelectedItem = (item?: VmmGrpcTransportSettingsItem) => {
    const nextItem = resolveGrpcTransportActivatedItem({
      items: items(),
      selectedId: selectedId(),
      explicitItem: item,
    })
    if (!nextItem) return
    void (async () => {
      const currentLanguage = (await locale.refreshConfig()).language
      openGrpcTransportScopeDialog({
        api: props.api,
        language: currentLanguage,
        onSelectScope: (scope) => {
          const nextAction = resolveGrpcTransportActivationAction(nextItem)
          if (nextAction === "open-vulcan-host-target") {
            void openVulcanHostTargetPrompt(scope)
            return
          }
          if (nextAction === "open-keepalive-time") {
            void openKeepaliveTimePrompt(scope)
            return
          }
          if (nextAction === "open-keepalive-timeout") {
            void openKeepaliveTimeoutPrompt(scope)
            return
          }
          void openPermitWithoutCallsDialog(scope)
        },
      })
    })()
  }

  /**
   * Move the current selection through the compact transport rows.
   * 在紧凑的传输设置条目之间移动当前选中项。
   */
  const moveSelection = (direction: -1 | 1) => {
    setSelectedId(
      moveGrpcTransportSelection({
        items: items(),
        currentSelectedId: selectedId(),
        direction,
      }),
    )
  }

  /**
   * Close the overlay from Esc or full-page right click.
   * 通过 Esc 或整页鼠标右键关闭覆盖层。
   */
  const closeOverlay = () => {
    props.onClose()
  }

  createEffect(() => {
    void reloadTransportSettingsOverlay("overlay-open")
  })

  createEffect(() => {
    setSelectedId(
      resolveGrpcTransportSelectedId({
        items: items(),
        currentSelectedId: selectedId(),
      }),
    )
  })

  /**
   * Keep custom dialogs aligned with the current overlay language.
   * 让自定义对话框持续跟随当前覆盖层语言。
   */
  createEffect(() => {
    setVmmDialogLanguage(locale.language())
  })

  useKeyboard((event) => {
    const keyboardAction = resolveGrpcTransportKeyboardAction({
      eventName: event.name,
      hasItems: items().length > 0,
      dialogOpen: isVmmDialogOpen(),
    })
    if (!keyboardAction) return

    event.preventDefault()
    event.stopPropagation()

    /**
     * Keep the overlay on the same compact keyboard model used by newer managers.
     * 继续沿用新版管理页同一套紧凑键盘模型，保持交互手感一致。
     */
    if (keyboardAction === "move-up") {
      moveSelection(-1)
      return
    }
    if (keyboardAction === "move-down") {
      moveSelection(1)
      return
    }
    if (keyboardAction === "close") {
      closeOverlay()
      return
    }
    activateSelectedItem()
  })

  return (
    <>
      <box
        width="100%"
        height="100%"
        position="absolute"
        left={0}
        top={0}
        backgroundColor="#000000"
        opacity={0.8}
      />
      <box
        width="100%"
        height="100%"
        position="absolute"
        left={0}
        top={0}
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        onMouseUp={(event) => {
          event.stopPropagation()
          event.preventDefault()
          if (!shouldCloseGrpcTransportOverlayOnMouseButton(event.button)) return
          closeOverlay()
        }}
      >
        <box
          width={VMM_TUI_OVERLAY_PANEL_WIDTH}
          height={VMM_TUI_OVERLAY_PANEL_HEIGHT}
          backgroundColor={VMM_TUI_COLOR_SURFACE}
          border
          borderColor={VMM_TUI_COLOR_BORDER}
          flexDirection="column"
          paddingTop={VMM_TUI_PANEL_VERTICAL_PADDING}
          paddingBottom={VMM_TUI_PANEL_VERTICAL_PADDING}
          paddingLeft={1}
          paddingRight={1}
          gap={VMM_TUI_PANEL_OUTER_GAP}
        >
          <box
            width="100%"
            height={VMM_TUI_PANEL_HEADER_HEIGHT}
            backgroundColor="transparent"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
          >
            <ascii_font
              text={getVmmGrpcTransportCopy(locale.language()).overlayTitle}
              font="tiny"
              color="#ffffff"
              backgroundColor="transparent"
            />
          </box>
          <box
            width="100%"
            minHeight={0}
            flexGrow={1}
            border
            borderColor={VMM_TUI_COLOR_BORDER}
            title={getVmmGrpcTransportCopy(locale.language()).sectionListTitle}
            titleAlignment="center"
            backgroundColor="transparent"
            flexDirection="column"
            padding={1}
            gap={VMM_TUI_PANEL_OUTER_GAP}
          >
            <VmmScrollColumn
              selectedChildId={buildVmmRowRenderableId("grpc-transport-settings", selectedId())}
              gap={0}
            >
              {items().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("grpc-transport-settings", item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={item.id === selectedId()}
                  onHover={() => setSelectedId(item.id)}
                  onPress={() => activateSelectedItem(item)}
                />
              ))}
            </VmmScrollColumn>
            {items().length === 0 ? (
              <text fg={VMM_TUI_COLOR_MUTED}>
                {getVmmGrpcTransportCopy(locale.language()).loading}
              </text>
            ) : null}
          </box>
          <box
            width="100%"
            height={1}
            backgroundColor="transparent"
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
          >
            <text fg={VMM_TUI_COLOR_HINT}>
              {getVmmGrpcTransportCopy(locale.language()).keysHint}
            </text>
          </box>
        </box>
      </box>
    </>
  )
}

/**
 * Compatibility wrapper for callers navigating to the transport route.
 * 兼容层：如果有调用命中 transport 路由，就转发到新的传输设置覆盖层。
 */
export const VmmGrpcTransportSettingsScreen = (props: { api: TuiPluginApi }) => {
  const locale = createVmmTuiLocaleState(props.api)
  return (
    <>
      <VmmGrpcTransportSettingsOverlay
        api={props.api}
        language={locale.language}
        onClose={() => openVmmSettingScreen(props.api)}
      />
      <VmmDialogHost />
    </>
  )
}
