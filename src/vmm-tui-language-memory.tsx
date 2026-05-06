/** @jsxImportSource @opentui/solid */
/**
 * VMM TUI language/memory feature module.
 * VMM TUI 语言与记忆设置功能模块。
 *
 * This file belongs to the TUI interaction layer. It groups the overlay-based
 * language control and memory settings flows because both now follow the same
 * pattern: pick one function, then choose the target scope.
 * 这个文件属于 TUI 交互层。
 * 它把语言控制和记忆设置两条覆盖层流程放在一起，
 * 因为它们现在都遵循同一种交互：先选功能，再选目标作用域。
 */

import { useKeyboard } from "@opentui/solid"
import { createEffect, createMemo, createSignal } from "solid-js"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { getConfigScopeLabel, saveVmmConfig, type VmmConfigScope } from "./vmm-config.js"
import {
  formatVmmLanguageLabel,
  getSupportedVmmLanguages,
  resolveVmmLanguage,
  type VmmLanguage,
} from "./vmm-language.js"
import { tVmmTui } from "./vmm-tui-language.js"
import {
  VMM_TUI_COLOR_BORDER,
  VMM_TUI_COLOR_HINT,
  VMM_TUI_COLOR_MUTED,
  VMM_TUI_COLOR_SURFACE,
  VmmDialogHost,
  VmmCompactListRow,
  VmmScrollColumn,
  buildVmmRowRenderableId,
  createVmmTuiLocaleState,
  isVmmDialogOpen,
  openLanguageControlScopeDialog,
  openMemorySettingsScopeDialog,
  openVmmInfoDialog,
  openVmmSettingScreen,
  openVmmSelectDialog,
  openVmmTextPrompt,
  parseScopedImplicitTurnsValue,
  parseScopedProfileRefreshTurnsValue,
  parseScopedMemoryModeValue,
  parseScopedSessionCompactRecallValue,
  readScopedVmmConfigValue,
  setVmmDialogLanguage,
  writeVmmTuiLog,
  type VmmLanguageControlItem,
  type VmmMemorySettingsItem,
} from "./vmm-tui.js"
/**
 * Full-screen overlay shell used by the rebuilt Language Control entry.
 * 重建后的 Language Control 入口使用的全屏遮罩层外壳。
 *
 * The new flow mirrors User Manager and Project Manager: keep the home screen
 * dimmed underneath, expose one compact grouped list in the center, then ask
 * for the write scope only after the user picks one language.
 * 新流程会镜像 User Manager 和 Project Manager：
 * 首页继续压暗留在下方，中间只保留一个紧凑的分组列表；
 * 用户先选语言，再在下一步选择写入范围。
 */
export const VmmLanguageControlOverlay = (props: {
  api: TuiPluginApi
  language: () => VmmLanguage
  onClose: () => void
}) => {
  const locale = createVmmTuiLocaleState(props.api)
  const [items, setItems] = createSignal<ReadonlyArray<VmmLanguageControlItem>>([])
  const [selectedId, setSelectedId] = createSignal("")
  const [statusMessage, setStatusMessage] = createSignal("")
  const [workspaceLanguageLabel, setWorkspaceLanguageLabel] = createSignal("")
  const [globalLanguageLabel, setGlobalLanguageLabel] = createSignal("")
  const [effectiveLanguageLabel, setEffectiveLanguageLabel] = createSignal("")

  /**
   * Render one raw scoped language value into a compact footer label.
   * 把一条原始作用域语言值渲染成紧凑的底部摘要标签。
   *
   * The footer must explain inheritance rather than only the effective merged
   * language, so local empty values show "inherit global" while global empty
   * values still fall back to the default English label.
   * 底部摘要需要解释继承关系，而不是只显示最终合并后的语言；
   * 因此本地层为空时会显示“继承全局”，而全局层为空时则回退到默认英语标签。
   */
  const formatScopedLanguageSummary = (
    currentLanguage: VmmLanguage,
    scope: VmmConfigScope,
    rawValue: string,
  ) => {
    if (!rawValue) {
      if (scope === "local") {
        return tVmmTui(currentLanguage, "language_control_inherit_global_value")
      }
      return formatVmmLanguageLabel("en")
    }
    return formatVmmLanguageLabel(resolveVmmLanguage(rawValue).code)
  }

  /**
   * Rebuild the overlay list and footer summaries from the latest config snapshot.
   * 根据最新配置快照重建语言弹层列表和底部摘要。
   */
  const reloadLanguageControlOverlay = async (reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const workspaceLanguage = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "local",
      "language",
    )
    const globalLanguage = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "global",
      "language",
    )

    setItems([
      {
        id: "action:inherit-global",
        kind: "inherit-global",
        title: tVmmTui(currentLanguage, "language_control_clear_title"),
        subtitle: tVmmTui(currentLanguage, "language_control_clear_subtitle"),
      },
      ...getSupportedVmmLanguages().map<VmmLanguageControlItem>((option) => ({
        id: `language:${option.code}`,
        kind: "language",
        title: option.code,
        subtitle: `${option.englishName} / ${option.nativeName}`,
        languageCode: option.code,
      })),
    ])
    setWorkspaceLanguageLabel(
      formatScopedLanguageSummary(currentLanguage, "local", workspaceLanguage),
    )
    setGlobalLanguageLabel(
      formatScopedLanguageSummary(currentLanguage, "global", globalLanguage),
    )
    setEffectiveLanguageLabel(formatVmmLanguageLabel(config.language))
    setStatusMessage(
      tVmmTui(currentLanguage, "language_control_status_loaded", {
        count: getSupportedVmmLanguages().length,
      }),
    )

    writeVmmTuiLog("vmm.tui.language_control.reload", {
      reason,
      currentLanguage,
      workspaceLanguage,
      globalLanguage,
    })
  }

  /**
   * Persist one language override into the chosen scope, then return to home.
   * 把一条语言覆盖值写入选中的作用域，然后返回主界面。
   *
   * Success feedback uses one modal dialog instead of a toast so the result is
   * visible inside the TUI. Closing that dialog immediately exits the overlay
   * and returns focus to the main launcher.
   * 成功反馈统一走弹窗而不是 toast，这样结果在 TUI 里一定可见；
   * 关闭提示框后会立刻退出当前弹层，把焦点还给主启动页。
   */
  const saveLanguageOverride = async (scope: VmmConfigScope, value: string) => {
    const beforeConfig = await locale.refreshConfig()
    const beforeLanguage = beforeConfig.language
    const beforeScopeLabel = getConfigScopeLabel(scope, beforeLanguage)
    await saveVmmConfig(props.api.state.path.directory, scope, "language", value)
    const afterConfig = await locale.refreshConfig()
    const currentLanguage = afterConfig.language
    const scopeLabel = getConfigScopeLabel(scope, currentLanguage)
    const message =
      value
        ? tVmmTui(currentLanguage, "language_control_saved", {
            scope: scopeLabel,
            value: formatVmmLanguageLabel(value as VmmLanguage),
          })
        : tVmmTui(currentLanguage, "language_control_cleared", {
            scope:
              currentLanguage === beforeLanguage
                ? beforeScopeLabel
                : getConfigScopeLabel(scope, currentLanguage),
          })
    setStatusMessage(message)
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "language_control_toast_title"),
      message,
      onClose: () => {
        props.onClose()
      },
    })
  }

  /**
   * Execute the currently selected language overlay row.
   * 执行当前选中的语言弹层行动作。
   */
  const activateSelectedItem = (item?: VmmLanguageControlItem) => {
    const nextItem = item ?? items().find((entry) => entry.id === selectedId()) ?? items()[0]
    if (!nextItem) return
    if (nextItem.kind === "language" && nextItem.languageCode) {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openLanguageControlScopeDialog({
          api: props.api,
          language: currentLanguage,
          onSelectScope: (scope) => {
            void saveLanguageOverride(scope, nextItem.languageCode ?? "")
          },
        })
      })()
      return
    }
    void saveLanguageOverride("local", "")
  }

  /**
   * Move the current selection through the compact language rows.
   * 在紧凑的语言条目之间移动当前选中项。
   */
  const moveSelection = (direction: -1 | 1) => {
    const currentItems = items()
    if (currentItems.length === 0) return
    const currentIndex = currentItems.findIndex((item) => item.id === selectedId())
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + currentItems.length) % currentItems.length
    setSelectedId(currentItems[nextIndex]?.id ?? currentItems[0].id)
  }

  /**
   * Close the overlay from Esc or full-page right click.
   * 通过 Esc 或整页鼠标右键关闭弹层。
   */
  const closeOverlay = () => {
    props.onClose()
  }

  createEffect(() => {
    void reloadLanguageControlOverlay("overlay-open")
  })

  createEffect(() => {
    const current = selectedId()
    const nextItems = items()
    if (nextItems.some((item) => item.id === current)) return
    setSelectedId(nextItems[0]?.id ?? "")
  })

  /**
   * Keep custom dialogs aligned with the current overlay language.
   * 让自定义对话框持续跟随当前覆盖层语言。
   */
  createEffect(() => {
    setVmmDialogLanguage(props.language())
  })

  useKeyboard((event) => {
    if (isVmmDialogOpen()) return

    /**
     * Keep the overlay on the same compact launcher-like keyboard model.
     * 继续沿用紧凑启动器式键盘模型，让语言弹层和其他管理弹层保持一致手感。
     */
    if (["up", "down", "j", "k"].includes(event.name)) {
      if (items().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      moveSelection(event.name === "up" || event.name === "k" ? -1 : 1)
      return
    }

    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      closeOverlay()
      return
    }

    if (["return", "enter", "linefeed"].includes(event.name)) {
      if (items().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      activateSelectedItem()
    }
  })

  /**
   * Split the overlay rows into one action group and one language group.
   * 把弹层条目拆成“功能列表”和“语言列表”两组。
   */
  const actionItems = createMemo(() =>
    items().filter((item) => item.kind === "inherit-global"),
  )
  const languageItems = createMemo(() =>
    items().filter((item) => item.kind === "language"),
  )

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
          if (event.button !== 2) return
          closeOverlay()
        }}
      >
        <box
          width="78%"
          height="78%"
          backgroundColor={VMM_TUI_COLOR_SURFACE}
          border
          borderColor={VMM_TUI_COLOR_BORDER}
          flexDirection="column"
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={1}
          paddingRight={1}
          gap={1}
        >
          {/**
           * Keep the overlay header aligned with the launcher family style.
           * 继续把头部对齐到启动器家族的视觉风格，保持整个设置中心统一。
           */}
          <box
            width="100%"
            height={5}
            backgroundColor="transparent"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
          >
            <ascii_font
              text="LANGUAGE CONTROL"
              font="tiny"
              color="#ffffff"
              backgroundColor="transparent"
            />
          </box>
          {/**
           * Keep one grouped compact list without the old secondary detail pane.
           * 这里保留一整块紧凑分组列表，不再沿用旧的右侧说明面板。
           */}
          <box
            width="100%"
            minHeight={0}
            flexGrow={1}
            border
            borderColor={VMM_TUI_COLOR_BORDER}
            title={tVmmTui(props.language(), "language_control_list_title")}
            titleAlignment="center"
            backgroundColor="transparent"
            flexDirection="column"
            padding={1}
            gap={1}
          >
            <VmmScrollColumn
              selectedChildId={buildVmmRowRenderableId("language-control", selectedId())}
              gap={0}
            >
              {actionItems().length > 0 ? (
                <box
                  width="100%"
                  paddingLeft={1}
                  paddingTop={0}
                  paddingBottom={0}
                  flexDirection="row"
                  justifyContent="center"
                >
                  <text fg="#b89cff">
                    <b>{tVmmTui(props.language(), "language_control_group_actions")}</b>
                  </text>
                </box>
              ) : null}
              {actionItems().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("language-control", item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={item.id === selectedId()}
                  onHover={() => setSelectedId(item.id)}
                  onPress={() => activateSelectedItem(item)}
                />
              ))}
              {actionItems().length > 0 && languageItems().length > 0 ? (
                <box width="100%" height={1} />
              ) : null}
              {languageItems().length > 0 ? (
                <box
                  width="100%"
                  paddingLeft={1}
                  paddingTop={0}
                  paddingBottom={0}
                  flexDirection="row"
                  justifyContent="center"
                >
                  <text fg="#b89cff">
                    <b>{tVmmTui(props.language(), "language_control_group_languages")}</b>
                  </text>
                </box>
              ) : null}
              {languageItems().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("language-control", item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={item.id === selectedId()}
                  onHover={() => setSelectedId(item.id)}
                  onPress={() => activateSelectedItem(item)}
                />
              ))}
            </VmmScrollColumn>
            {items().length === 0 ? (
              <text fg={VMM_TUI_COLOR_MUTED}>{tVmmTui(props.language(), "language_control_loading")}</text>
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
            <text fg={VMM_TUI_COLOR_HINT}>{tVmmTui(props.language(), "language_control_keys_hint")}</text>
          </box>
          <box
            width="100%"
            height={1}
            backgroundColor="transparent"
            flexDirection="row"
            alignItems="center"
            justifyContent="center"
          >
            <text fg={VMM_TUI_COLOR_MUTED}>
              {[
                statusMessage(),
                tVmmTui(props.language(), "language_control_workspace_summary", {
                  value: workspaceLanguageLabel(),
                }),
                tVmmTui(props.language(), "language_control_global_summary", {
                  value: globalLanguageLabel(),
                }),
                tVmmTui(props.language(), "language_control_effective_summary", {
                  value: effectiveLanguageLabel(),
                }),
              ]
                .filter((part) => part.trim().length > 0)
                .join("  |  ")}
            </text>
          </box>
        </box>
      </box>
    </>
  )
}

/**
 * Compatibility wrapper for callers that still navigate to the legacy language route.
 * 兼容层：如果仍有旧调用命中旧的语言控制路由，就转发到新的语言弹层。
 */
export const VmmLanguageControlScreen = (props: { api: TuiPluginApi }) => {
  const locale = createVmmTuiLocaleState(props.api)
  return (
    <>
      <VmmLanguageControlOverlay
        api={props.api}
        language={locale.language}
        onClose={() => openVmmSettingScreen(props.api)}
      />
      <VmmDialogHost />
    </>
  )
}

/**
 * Full-screen overlay shell used by the rebuilt Memory Settings entry.
 * 重建后的 Memory Settings 入口使用的全屏遮罩层外壳。
 *
 * The user asked for the same newer interaction model used by the other
 * rewritten managers: pick one function first, then choose the write scope,
 * while current effective information stays in the footer instead of a
 * dedicated right-side details pane.
 * 用户要求记忆设置也沿用新版管理页交互：
 * 先选择功能，再选择写入范围；
 * 同时把当前信息收拢到页脚，而不是继续保留一个独立右侧说明面板。
 */
export const VmmMemorySettingsOverlay = (props: {
  api: TuiPluginApi
  language: () => VmmLanguage
  onClose: () => void
}) => {
  const locale = createVmmTuiLocaleState(props.api)
  const [items, setItems] = createSignal<ReadonlyArray<VmmMemorySettingsItem>>([])
  const [selectedId, setSelectedId] = createSignal("")

  /**
   * Format one bool-like raw mode value into a localized compact label.
   * 把布尔态模式值格式化成一个本地化的紧凑标签。
   */
  const formatModeStateValue = (
    currentLanguage: VmmLanguage,
    visibleMemoryInjection: boolean | undefined,
  ) => {
    if (visibleMemoryInjection === undefined) {
      return tVmmTui(currentLanguage, "memory_settings_inherit_value")
    }
    return tVmmTui(
      currentLanguage,
      visibleMemoryInjection ? "setting_home_mode_visible" : "setting_home_mode_implicit",
    )
  }

  /**
   * Format one compact-recall bool into a localized compact label.
   * 把 compact-recall 布尔态格式化成本地化紧凑标签。
   */
  const formatCompactRecallStateValue = (
    currentLanguage: VmmLanguage,
    sessionCompactRecall: boolean | undefined,
  ) => {
    if (sessionCompactRecall === undefined) {
      return tVmmTui(currentLanguage, "memory_settings_inherit_value")
    }
    return tVmmTui(
      currentLanguage,
      sessionCompactRecall
        ? "memory_settings_session_compact_enabled_value"
        : "memory_settings_session_compact_disabled_value",
    )
  }

  /**
   * Format one optional numeric override into a localized compact label.
   * 把一个可选数字覆盖值格式化成本地化紧凑标签。
   */
  const formatNumericStateValue = (
    currentLanguage: VmmLanguage,
    value: number | undefined,
  ) => {
    return value === undefined
      ? tVmmTui(currentLanguage, "memory_settings_inherit_value")
      : String(value)
  }

  /**
   * Format one local/global state pair for list-row remarks.
   * 为列表备注格式化一组 local/global 当前状态。
   */
  const formatScopedStatePair = (
    currentLanguage: VmmLanguage,
    projectValue: string,
    globalValue: string,
  ) => {
    return tVmmTui(currentLanguage, "memory_settings_state_pair", {
      project: projectValue,
      global: globalValue,
    })
  }

  /**
   * Append one compact scoped-state suffix to the primary row title.
   * 把一段紧凑的作用域状态后缀追加到主标题里。
   *
   * Mode-like actions need to expose the current project/global state before
   * the user opens the second-step selector, so the title carries that summary
   * while the subtitle can stay focused on behavior explanation only.
   * 模式类动作需要在用户进入第二步选择前就暴露当前项目/全局状态，
   * 因而这里把状态摘要放进标题，让副标题只承担行为解释。
   */
  const appendStateToTitle = (
    baseTitle: string,
    currentLanguage: VmmLanguage,
    projectValue: string,
    globalValue: string,
  ) => {
    return `${baseTitle} [${formatScopedStatePair(currentLanguage, projectValue, globalValue)}]`
  }

  /**
   * Rebuild the memory overlay rows from the latest config snapshot.
   * 根据最新配置快照重建记忆弹层条目。
   *
   * The rebuilt layout keeps state remarks on each row instead of relying on a
   * footer summary bar. This makes every function self-explanatory even before
   * the operator opens the next dialog step.
   * 重构后的布局把当前状态和用途备注直接放回每条功能项，
   * 不再依赖底部摘要栏。这样操作者在打开下一步对话框之前，也能一眼看懂每个功能。
   */
  const reloadMemorySettingsOverlay = async (reason: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const workspaceModeRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "local",
      "visible_memory_injection",
    )
    const workspaceTurnsRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "local",
      "implicit_memory_turns",
    )
    const workspaceProfileRefreshTurnsRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "local",
      "profile_refresh_turns",
    )
    const workspaceSessionCompactRecallRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "local",
      "session_compact_recall",
    )
    const globalModeRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "global",
      "visible_memory_injection",
    )
    const globalTurnsRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "global",
      "implicit_memory_turns",
    )
    const globalProfileRefreshTurnsRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "global",
      "profile_refresh_turns",
    )
    const globalSessionCompactRecallRaw = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      "global",
      "session_compact_recall",
    )

    const workspaceModeValue = formatModeStateValue(
      currentLanguage,
      parseScopedMemoryModeValue(workspaceModeRaw),
    )
    const globalModeValue = formatModeStateValue(
      currentLanguage,
      parseScopedMemoryModeValue(globalModeRaw),
    )
    const workspaceTurnsValue = formatNumericStateValue(
      currentLanguage,
      parseScopedImplicitTurnsValue(workspaceTurnsRaw),
    )
    const globalTurnsValue = formatNumericStateValue(
      currentLanguage,
      parseScopedImplicitTurnsValue(globalTurnsRaw),
    )
    const workspaceProfileRefreshValue = formatNumericStateValue(
      currentLanguage,
      parseScopedProfileRefreshTurnsValue(workspaceProfileRefreshTurnsRaw),
    )
    const globalProfileRefreshValue = formatNumericStateValue(
      currentLanguage,
      parseScopedProfileRefreshTurnsValue(globalProfileRefreshTurnsRaw),
    )
    const workspaceCompactRecallValue = formatCompactRecallStateValue(
      currentLanguage,
      parseScopedSessionCompactRecallValue(workspaceSessionCompactRecallRaw),
    )
    const globalCompactRecallValue = formatCompactRecallStateValue(
      currentLanguage,
      parseScopedSessionCompactRecallValue(globalSessionCompactRecallRaw),
    )

    setItems([
      {
        id: "action:adjust-mode",
        kind: "mode",
        title: appendStateToTitle(
          tVmmTui(currentLanguage, "memory_settings_mode_adjust_title"),
          currentLanguage,
          workspaceModeValue,
          globalModeValue,
        ),
        subtitle: tVmmTui(currentLanguage, "memory_settings_mode_adjust_subtitle"),
      },
      {
        id: "action:turns",
        kind: "turns",
        title: appendStateToTitle(
          tVmmTui(currentLanguage, "memory_settings_turns_title"),
          currentLanguage,
          workspaceTurnsValue,
          globalTurnsValue,
        ),
        subtitle: tVmmTui(currentLanguage, "memory_settings_turns_subtitle"),
      },
      {
        id: "action:profile-refresh-turns",
        kind: "profile-refresh-turns",
        title: appendStateToTitle(
          tVmmTui(currentLanguage, "memory_settings_profile_refresh_title"),
          currentLanguage,
          workspaceProfileRefreshValue,
          globalProfileRefreshValue,
        ),
        subtitle: tVmmTui(currentLanguage, "memory_settings_profile_refresh_subtitle"),
      },
      {
        id: "action:session-compact-recall",
        kind: "session-compact-recall",
        title: appendStateToTitle(
          tVmmTui(currentLanguage, "memory_settings_session_compact_adjust_title"),
          currentLanguage,
          workspaceCompactRecallValue,
          globalCompactRecallValue,
        ),
        subtitle: tVmmTui(
          currentLanguage,
          "memory_settings_session_compact_adjust_subtitle",
        ),
      },
    ])

    writeVmmTuiLog("vmm.tui.memory_settings.reload", {
      reason,
      workspaceModeRaw,
      workspaceTurnsRaw,
      workspaceProfileRefreshTurnsRaw,
      workspaceSessionCompactRecallRaw,
      globalModeRaw,
      globalTurnsRaw,
      globalProfileRefreshTurnsRaw,
      globalSessionCompactRecallRaw,
      effectiveVisibleMemoryInjection: config.visibleMemoryInjection,
      effectiveImplicitMemoryTurns: config.implicitMemoryTurns,
      effectiveProfileRefreshTurns: config.profileRefreshTurns,
      effectiveSessionCompactRecall: config.sessionCompactRecall,
      renderedItemCount: 4,
    })
  }

  /**
   * Persist one visible/implicit mode into the chosen scope.
   * 把一次显式/隐式模式保存到选中的作用域。
   */
  const saveVisibleMemoryMode = async (
    scope: VmmConfigScope,
    visibleMemoryInjection: boolean,
  ) => {
    await saveVmmConfig(
      props.api.state.path.directory,
      scope,
      "visible_memory_injection",
      visibleMemoryInjection,
    )
    const currentLanguage = (await locale.refreshConfig()).language
    const message = tVmmTui(
      currentLanguage,
      visibleMemoryInjection ? "memory_settings_saved_visible" : "memory_settings_saved_implicit",
      {
        scope: getConfigScopeLabel(scope, currentLanguage),
      },
    )
    await reloadMemorySettingsOverlay("save-mode")
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "memory_settings_toast_title"),
      message,
    })
  }

  /**
   * Persist one implicit-turn count after validating the typed value.
   * 校验并保存一次隐式轮数输入。
   */
  const saveImplicitTurns = async (scope: VmmConfigScope, rawValue: string) => {
    const trimmed = rawValue.trim()
    if (!/^\d+$/.test(trimmed)) {
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(locale.language(), "memory_settings_toast_title"),
        message: tVmmTui(locale.language(), "memory_settings_turns_prompt_invalid"),
      })
      return
    }
    await saveVmmConfig(
      props.api.state.path.directory,
      scope,
      "implicit_memory_turns",
      Number.parseInt(trimmed, 10),
    )
    const currentLanguage = (await locale.refreshConfig()).language
    const message = tVmmTui(currentLanguage, "memory_settings_saved_turns", {
      scope: getConfigScopeLabel(scope, currentLanguage),
      value: trimmed,
    })
    await reloadMemorySettingsOverlay("save-turns")
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "memory_settings_toast_title"),
      message,
    })
  }

  /**
   * Persist one profile-refresh-turn count after validating the typed value.
   * 校验并保存一次画像刷新轮数输入。
   */
  const saveProfileRefreshTurns = async (scope: VmmConfigScope, rawValue: string) => {
    const trimmed = rawValue.trim()
    if (!/^\d+$/.test(trimmed)) {
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(locale.language(), "memory_settings_toast_title"),
        message: tVmmTui(locale.language(), "memory_settings_profile_refresh_prompt_invalid"),
      })
      return
    }
    await saveVmmConfig(
      props.api.state.path.directory,
      scope,
      "profile_refresh_turns",
      Number.parseInt(trimmed, 10),
    )
    const currentLanguage = (await locale.refreshConfig()).language
    const message = tVmmTui(currentLanguage, "memory_settings_saved_profile_refresh", {
      scope: getConfigScopeLabel(scope, currentLanguage),
      value: trimmed,
    })
    await reloadMemorySettingsOverlay("save-profile-refresh-turns")
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "memory_settings_toast_title"),
      message,
    })
  }

  /**
   * Persist one compact-aware recall switch into the chosen scope.
   * 把一次 compact-aware recall 开关保存到选中的作用域。
   */
  const saveSessionCompactRecall = async (
    scope: VmmConfigScope,
    sessionCompactRecall: boolean,
  ) => {
    await saveVmmConfig(
      props.api.state.path.directory,
      scope,
      "session_compact_recall",
      sessionCompactRecall,
    )
    const currentLanguage = (await locale.refreshConfig()).language
    const message = tVmmTui(
      currentLanguage,
      sessionCompactRecall
        ? "memory_settings_saved_session_compact_on"
        : "memory_settings_saved_session_compact_off",
      {
        scope: getConfigScopeLabel(scope, currentLanguage),
      },
    )
    await reloadMemorySettingsOverlay("save-session-compact-recall")
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "memory_settings_toast_title"),
      message,
    })
  }

  /**
   * Open the second-step injection-mode picker after one scope is chosen.
   * 在选定作用域后，打开第二步注入模式选择框。
   *
   * The new interaction intentionally asks for scope first and mode second so
   * one list row can cover both visible and implicit choices without doubling
   * the action list.
   * 新交互刻意采用“先选作用域、再选模式”，
   * 这样同一条列表项就能覆盖显式和隐式两种选择，而不必把动作列表拆成两条。
   */
  const openInjectionModeDialog = async (scope: VmmConfigScope) => {
    const currentLanguage = (await locale.refreshConfig()).language
    openVmmSelectDialog({
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "memory_settings_mode_select_title", {
        scope: getConfigScopeLabel(scope, currentLanguage),
      }),
      options: [
        {
          title: tVmmTui(currentLanguage, "memory_settings_mode_visible_title"),
          subtitle: tVmmTui(currentLanguage, "memory_settings_mode_visible_detail_1"),
          value: "visible",
        },
        {
          title: tVmmTui(currentLanguage, "memory_settings_mode_implicit_title"),
          subtitle: tVmmTui(currentLanguage, "memory_settings_mode_implicit_detail_1"),
          value: "implicit",
        },
      ],
      onCancel: () => {},
      onSelect: (value) => {
        void saveVisibleMemoryMode(scope, value === "visible")
      },
    })
  }

  /**
   * Open the second-step compact-recall picker after one scope is chosen.
   * 在选定作用域后，打开第二步 compact-recall 选择框。
   *
   * This mirrors the injection-mode flow so operators learn one consistent
   * pattern for both two-step memory toggles.
   * 这里和注入模式保持同一套流程，
   * 让操作者只需要记住一种两步式记忆开关交互。
   */
  const openSessionCompactRecallDialog = async (scope: VmmConfigScope) => {
    const currentLanguage = (await locale.refreshConfig()).language
    openVmmSelectDialog({
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "memory_settings_session_compact_select_title", {
        scope: getConfigScopeLabel(scope, currentLanguage),
      }),
      options: [
        {
          title: tVmmTui(currentLanguage, "memory_settings_session_compact_on_title"),
          subtitle: tVmmTui(currentLanguage, "memory_settings_session_compact_on_detail_1"),
          value: "enabled",
        },
        {
          title: tVmmTui(currentLanguage, "memory_settings_session_compact_off_title"),
          subtitle: tVmmTui(currentLanguage, "memory_settings_session_compact_off_detail_1"),
          value: "disabled",
        },
      ],
      onCancel: () => {},
      onSelect: (value) => {
        void saveSessionCompactRecall(scope, value === "enabled")
      },
    })
  }

  /**
   * Open the implicit-turn prompt only after the operator picks one write scope.
   * 只有在操作者先选定写入范围后，才打开隐式轮数输入框。
   */
  const openImplicitTurnsPrompt = async (scope: VmmConfigScope) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const rawScopedTurns = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      scope,
      "implicit_memory_turns",
    )
    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "memory_settings_turns_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "memory_settings_turns_prompt_placeholder"),
      description: tVmmTui(currentLanguage, "memory_settings_turns_prompt_description"),
      emptyMessage: tVmmTui(currentLanguage, "memory_settings_turns_prompt_empty"),
      initialValue: rawScopedTurns || String(config.implicitMemoryTurns ?? 0),
      toastTitle: tVmmTui(currentLanguage, "memory_settings_toast_title"),
      validateValue: (value) =>
        /^\d+$/.test(value.trim())
          ? undefined
          : tVmmTui(currentLanguage, "memory_settings_turns_prompt_invalid"),
      onConfirmValue: (value) => {
        void saveImplicitTurns(scope, value)
      },
    })
  }

  /**
   * Open the profile-refresh-turn prompt after the operator picks one scope.
   * 在操作者选定作用域后，打开画像刷新轮数输入框。
   */
  const openProfileRefreshTurnsPrompt = async (scope: VmmConfigScope) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const rawScopedTurns = await readScopedVmmConfigValue(
      props.api.state.path.directory,
      scope,
      "profile_refresh_turns",
    )
    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "memory_settings_profile_refresh_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "memory_settings_profile_refresh_prompt_placeholder"),
      description: tVmmTui(currentLanguage, "memory_settings_profile_refresh_prompt_description"),
      emptyMessage: tVmmTui(currentLanguage, "memory_settings_profile_refresh_prompt_empty"),
      initialValue: rawScopedTurns || String(config.profileRefreshTurns ?? 0),
      toastTitle: tVmmTui(currentLanguage, "memory_settings_toast_title"),
      validateValue: (value) =>
        /^\d+$/.test(value.trim())
          ? undefined
          : tVmmTui(currentLanguage, "memory_settings_profile_refresh_prompt_invalid"),
      onConfirmValue: (value) => {
        void saveProfileRefreshTurns(scope, value)
      },
    })
  }

  /**
   * Execute the currently selected memory function, then ask for write scope.
   * 执行当前选中的记忆功能，然后再询问写入范围。
   */
  const activateSelectedItem = (item?: VmmMemorySettingsItem) => {
    const nextItem = item ?? items().find((entry) => entry.id === selectedId()) ?? items()[0]
    if (!nextItem) return
    if (nextItem.kind === "mode") {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openMemorySettingsScopeDialog({
          api: props.api,
          language: currentLanguage,
          onSelectScope: (scope) => {
            void openInjectionModeDialog(scope)
          },
        })
      })()
      return
    }
    if (nextItem.kind === "profile-refresh-turns") {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openMemorySettingsScopeDialog({
          api: props.api,
          language: currentLanguage,
          onSelectScope: (scope) => {
            void openProfileRefreshTurnsPrompt(scope)
          },
        })
      })()
      return
    }
    if (nextItem.kind === "session-compact-recall") {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openMemorySettingsScopeDialog({
          api: props.api,
          language: currentLanguage,
          onSelectScope: (scope) => {
            void openSessionCompactRecallDialog(scope)
          },
        })
      })()
      return
    }
    void (async () => {
      const currentLanguage = (await locale.refreshConfig()).language
      openMemorySettingsScopeDialog({
        api: props.api,
        language: currentLanguage,
        onSelectScope: (scope) => {
          void openImplicitTurnsPrompt(scope)
        },
      })
    })()
  }

  /**
   * Move the current selection through the compact memory rows.
   * 在紧凑的记忆条目之间移动当前选中项。
   */
  const moveSelection = (direction: -1 | 1) => {
    const currentItems = items()
    if (currentItems.length === 0) return
    const currentIndex = currentItems.findIndex((item) => item.id === selectedId())
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + currentItems.length) % currentItems.length
    setSelectedId(currentItems[nextIndex]?.id ?? currentItems[0].id)
  }

  /**
   * Close the overlay from Esc or full-page right click.
   * 通过 Esc 或整页鼠标右键关闭弹层。
   */
  const closeOverlay = () => {
    props.onClose()
  }

  createEffect(() => {
    void reloadMemorySettingsOverlay("overlay-open")
  })

  createEffect(() => {
    const current = selectedId()
    const nextItems = items()
    if (nextItems.some((item) => item.id === current)) return
    setSelectedId(nextItems[0]?.id ?? "")
  })

  /**
   * Keep custom dialogs aligned with the current overlay language.
   * 让自定义对话框持续跟随当前覆盖层语言。
   */
  createEffect(() => {
    setVmmDialogLanguage(locale.language())
  })

  useKeyboard((event) => {
    if (isVmmDialogOpen()) return

    /**
     * Keep the overlay on the same compact keyboard model used by the newer managers.
     * 继续沿用新版管理页那套紧凑键盘模型，保持操作手感一致。
     */
    if (["up", "down", "j", "k"].includes(event.name)) {
      if (items().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      moveSelection(event.name === "up" || event.name === "k" ? -1 : 1)
      return
    }

    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      closeOverlay()
      return
    }

    if (["return", "enter", "linefeed"].includes(event.name)) {
      if (items().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      activateSelectedItem()
    }
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
          if (event.button !== 2) return
          closeOverlay()
        }}
      >
        <box
          width="78%"
          height="78%"
          backgroundColor={VMM_TUI_COLOR_SURFACE}
          border
          borderColor={VMM_TUI_COLOR_BORDER}
          flexDirection="column"
          paddingTop={1}
          paddingBottom={1}
          paddingLeft={1}
          paddingRight={1}
          gap={1}
        >
          {/**
           * Keep the overlay header aligned with the launcher family style.
           * 继续把头部对齐到启动器家族的视觉风格，保持整个设置中心统一。
           */}
          <box
            width="100%"
            height={5}
            backgroundColor="transparent"
            flexDirection="column"
            justifyContent="center"
            alignItems="center"
          >
            <ascii_font
              text="MEMORY SETTINGS"
              font="tiny"
              color="#ffffff"
              backgroundColor="transparent"
            />
          </box>
          {/**
           * The new structure keeps one compact action list, places current
           * scoped states inside row titles, and leaves the footer dedicated to
           * keyboard guidance only.
           * 新结构只保留一块紧凑的功能列表，
           * 并把当前作用域状态放进每条标题里，让页脚只负责快捷键提示。
           */}
          <box
            width="100%"
            minHeight={0}
            flexGrow={1}
            border
            borderColor={VMM_TUI_COLOR_BORDER}
            title={tVmmTui(locale.language(), "memory_settings_section_list")}
            titleAlignment="center"
            backgroundColor="transparent"
            flexDirection="column"
            padding={1}
            gap={1}
          >
            <VmmScrollColumn
              selectedChildId={buildVmmRowRenderableId("memory-settings", selectedId())}
              gap={0}
            >
              {items().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("memory-settings", item.id)}
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
                {tVmmTui(locale.language(), "memory_settings_loading")}
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
              {tVmmTui(locale.language(), "memory_settings_keys_hint")}
            </text>
          </box>
        </box>
      </box>
    </>
  )
}

/**
 * Compatibility wrapper for callers that still navigate to the memory route.
 * 兼容层：如果仍有旧调用命中记忆设置路由，就转发到新的记忆弹层。
 */
export const VmmMemorySettingsScreen = (props: { api: TuiPluginApi }) => {
  const locale = createVmmTuiLocaleState(props.api)
  return (
    <>
      <VmmMemorySettingsOverlay
        api={props.api}
        language={locale.language}
        onClose={() => openVmmSettingScreen(props.api)}
      />
      <VmmDialogHost />
    </>
  )
}

