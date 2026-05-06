/** @jsxImportSource @opentui/solid */
/**
 * VMM TUI user/project manager feature module.
 * VMM TUI 用户与项目管理功能模块。
 *
 * This file belongs to the TUI interaction layer. It contains the rebuilt
 * overlay-based user manager and project manager so those two CRUD-heavy flows
 * can be debugged without scanning the whole setting-center entry file.
 * 这个文件属于 TUI 交互层。
 * 它承载了重建后的用户管理和项目管理覆盖层，
 * 让这两条偏 CRUD 的管理链路可以独立调试，而不用每次都翻完整个设置中心入口文件。
 */

import { useKeyboard } from "@opentui/solid"
import { createEffect, createMemo, createSignal } from "solid-js"
import type { InputRenderable } from "@opentui/core"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import {
  getConfigScopeLabel,
  hasConfiguredGrpcTarget,
  saveVmmConfig,
  type VmmConfigScope,
} from "./vmm-config.js"
import type { VmmGrpcProjectEntry, VmmGrpcUserEntry } from "./vmm-grpc.js"
import {
  callVmmTuiDeleteProject,
  callVmmTuiDeleteUser,
  callVmmTuiEnsureProject,
  callVmmTuiListProjects,
  callVmmTuiListUsers,
  callVmmTuiMigrateProject,
  callVmmTuiResolveUser,
} from "./vmm-tui-grpc-bridge.js"
import type { VmmLanguage } from "./vmm-language.js"
import { tVmmTui } from "./vmm-tui-language.js"
import {
  VMM_TUI_COLOR_BORDER,
  VMM_TUI_COLOR_BODY,
  VMM_TUI_COLOR_HINT,
  VMM_TUI_COLOR_MUTED,
  VMM_TUI_COLOR_ROW_SELECTED_BORDER,
  VMM_TUI_COLOR_SURFACE,
  VMM_TUI_COLOR_TITLE,
  VmmCompactListRow,
  VmmScrollColumn,
  buildVmmRowRenderableId,
  buildVmmTuiTransportConfig,
  createVmmTuiLocaleState,
  formatProjectEntry,
  formatVmmProjectManagerIdLabel,
  formatVmmUserManagerAccountLabel,
  formatVmmUserManagerIdLabel,
  isVmmDialogOpen,
  looksLikeCanonicalProjectPath,
  normalizeCanonicalProjectPathInput,
  openNewUserPrompt,
  openProjectManagerReplacementDialog,
  openProjectManagerScopeDialog,
  openUserManagerReplacementDialog,
  openUserManagerScopeDialog,
  openVmmConfirmDialog,
  openVmmExactConfirmPrompt,
  openVmmInfoDialog,
  openVmmPendingDialog,
  openVmmTextPrompt,
  readScopedVmmBindingValue,
  setVmmDialogLanguage,
  summarizeGrpcResult,
  summarizeProjectCreateFailure,
  writeVmmTuiLog,
  type VmmProjectManagerItem,
  type VmmUserManagerItem,
} from "./vmm-tui.js"
/**
 * Full-screen overlay shell used by the experimental User Manager entry.
 * 实验中的 User Manager 入口使用的全屏遮罩层外壳。
 *
 * The overlay keeps the original home launcher visible underneath a dimmed
 * mask, but all interaction focus is redirected to the centered overlay panel so
 * background shortcuts and clicks do not leak through.
 * 这层遮罩会把原始首页保留在下方并整体压暗，
 * 但所有交互焦点都会转移到中间的覆盖层面板里，避免背景快捷键和点击继续串过去。
 */
export const VmmUserManagerOverlay = (props: {
  api: TuiPluginApi
  language: () => VmmLanguage
  onClose: () => void
}) => {
  const locale = createVmmTuiLocaleState(props.api)
  const [filterText, setFilterText] = createSignal("")
  const [statusMessage, setStatusMessage] = createSignal("")
  const [isLoading, setIsLoading] = createSignal(false)
  const [workspaceUserLabel, setWorkspaceUserLabel] = createSignal("")
  const [globalUserLabel, setGlobalUserLabel] = createSignal("")
  let filterInputRef: InputRenderable | undefined
  const [items, setItems] = createSignal<ReadonlyArray<VmmUserManagerItem>>([])
  const filteredItems = createMemo(() => {
    const normalizedFilter = filterText().trim().toLowerCase()
    if (!normalizedFilter) return items()
    return items().filter((item) =>
      [item.title, item.subtitle].join(" ").toLowerCase().includes(normalizedFilter),
    )
  })
  const liveUsers = createMemo(() =>
    items()
      .filter((item): item is Extract<VmmUserManagerItem, { kind: "user" }> => item.kind === "user")
      .map((item) => item.user),
  )
  const [selectedId, setSelectedId] = createSignal("")

  /**
   * Keep the selected item in sync even though the first overlay slice is empty.
   * 即使当前这版还是空列表，也保持选中项同步逻辑一致，
   * 方便后面直接往列表里加真实节点。
   */
  createEffect(() => {
    const current = selectedId()
    const nextItems = filteredItems()
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

  /**
   * Load the live user list once when the overlay mounts.
   * 在弹层挂载时加载一次实时用户列表。
   */
  createEffect(() => {
    void reloadUserManagerOverlay("overlay-open")
  })

  /**
   * Render one bottom summary label for either workspace or global binding.
   * 为工作区或公共设置渲染一条底部绑定摘要。
   *
   * The overlay needs to show both local and global state at the same time,
   * so this helper resolves ids back to names when the live user list is
   * available and falls back to inherit/unset labels otherwise.
   * 覆盖层需要同时展示本地和公共设置状态，
   * 因此这里会优先把 id 反查成用户名；如果没有值，再回退成继承或未设置文案。
   */
  const formatScopedUserSummary = (
    language: VmmLanguage,
    scope: VmmConfigScope,
    userId: string,
    users: ReadonlyArray<VmmGrpcUserEntry>,
  ) => {
    if (!userId) {
      return scope === "local"
        ? tVmmTui(language, "user_manager_overlay_inherit_global")
        : tVmmTui(language, "user_manager_unset")
    }
    const matchedUser = users.find((user) => String(user.user_id) === userId)
    const idLabel = formatVmmUserManagerIdLabel(language, userId)
    return matchedUser ? `${idLabel}/${matchedUser.user_name}` : idLabel
  }

  /**
   * Rebuild the overlay list from live backend users plus two local actions.
   * 使用实时后端用户和两个本地动作，重建覆盖层列表。
   */
  const reloadUserManagerOverlay = async (reason: string) => {
    setIsLoading(true)
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const workspaceUserId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "local",
      "user_id",
    )
    const globalUserId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "global",
      "user_id",
    )

    if (!hasConfiguredGrpcTarget(config)) {
      setItems([
        {
          id: "action:new-user",
          kind: "new-user",
          title: tVmmTui(currentLanguage, "user_manager_overlay_add_title"),
          subtitle: tVmmTui(currentLanguage, "user_manager_overlay_add_subtitle"),
        },
        {
          id: "action:clear-workspace",
          kind: "clear-workspace",
          title: tVmmTui(currentLanguage, "user_manager_overlay_clear_workspace_title"),
          subtitle: tVmmTui(currentLanguage, "user_manager_overlay_clear_workspace_subtitle"),
        },
      ])
      setWorkspaceUserLabel(
        formatScopedUserSummary(currentLanguage, "local", workspaceUserId, []),
      )
      setGlobalUserLabel(
        formatScopedUserSummary(currentLanguage, "global", globalUserId, []),
      )
      setStatusMessage(tVmmTui(currentLanguage, "user_manager_missing_grpc"))
      setIsLoading(false)
      return
    }

    const result = await callVmmTuiListUsers({
      config: buildVmmTuiTransportConfig(config),
    })

    writeVmmTuiLog("vmm.tui.user_manager_overlay.reload", {
      reason,
      ok: result.ok,
      userCount: result.response?.users?.length ?? 0,
      details: result.details,
      grpcCodeName: result.grpcCodeName,
      timedOutPhase: result.timedOutPhase,
    })

    if (!result.ok) {
      setItems([
        {
          id: "action:new-user",
          kind: "new-user",
          title: tVmmTui(currentLanguage, "user_manager_overlay_add_title"),
          subtitle: tVmmTui(currentLanguage, "user_manager_overlay_add_subtitle"),
        },
        {
          id: "action:clear-workspace",
          kind: "clear-workspace",
          title: tVmmTui(currentLanguage, "user_manager_overlay_clear_workspace_title"),
          subtitle: tVmmTui(currentLanguage, "user_manager_overlay_clear_workspace_subtitle"),
        },
      ])
      setWorkspaceUserLabel(
        formatScopedUserSummary(currentLanguage, "local", workspaceUserId, []),
      )
      setGlobalUserLabel(
        formatScopedUserSummary(currentLanguage, "global", globalUserId, []),
      )
      setStatusMessage(
        summarizeGrpcResult(
          currentLanguage,
          tVmmTui(currentLanguage, "user_manager_overlay_list_title"),
          result,
        ),
      )
      setIsLoading(false)
      return
    }

    const users = result.response?.users ?? []
    setItems([
      {
        id: "action:new-user",
        kind: "new-user",
        title: tVmmTui(currentLanguage, "user_manager_overlay_add_title"),
        subtitle: tVmmTui(currentLanguage, "user_manager_overlay_add_subtitle"),
      },
      {
        id: "action:clear-workspace",
        kind: "clear-workspace",
        title: tVmmTui(currentLanguage, "user_manager_overlay_clear_workspace_title"),
        subtitle: tVmmTui(currentLanguage, "user_manager_overlay_clear_workspace_subtitle"),
      },
      ...users.map<VmmUserManagerItem>((user) => ({
        id: `user:${user.user_id}`,
        kind: "user",
        title: formatVmmUserManagerAccountLabel(
          currentLanguage,
          user.user_name || String(user.user_id),
        ),
        subtitle: formatVmmUserManagerIdLabel(currentLanguage, user.user_id),
        user,
      })),
    ])
    setWorkspaceUserLabel(
      formatScopedUserSummary(currentLanguage, "local", workspaceUserId, users),
    )
    setGlobalUserLabel(
      formatScopedUserSummary(currentLanguage, "global", globalUserId, users),
    )
    setStatusMessage(
      tVmmTui(currentLanguage, "user_manager_overlay_status_loaded", {
        count: users.length,
      }),
    )
    setIsLoading(false)
  }

  /**
   * Persist one selected user into the chosen local/global config scope.
   * 把选中的用户写入指定的工作区或公共配置范围。
   */
  const bindUserInScope = async (scope: VmmConfigScope, user: VmmGrpcUserEntry) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    await saveVmmConfig(props.api.state.path.directory, scope, "user_id", user.user_id)
    const scopeLabel = getConfigScopeLabel(scope, currentLanguage)
    const message = tVmmTui(currentLanguage, "user_manager_overlay_status_bound", {
      name: user.user_name,
      id: formatVmmUserManagerIdLabel(currentLanguage, user.user_id),
      scope: scopeLabel,
    })
    setStatusMessage(message)
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
      message,
    })
    await reloadUserManagerOverlay("bind-user")
  }

  /**
   * Resolve or create one user name, then bind it into the chosen scope.
   * 解析或创建一个用户名，然后把它绑定到选中的写入范围。
   */
  const createUserInScope = async (scope: VmmConfigScope, userName: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language

    if (!hasConfiguredGrpcTarget(config)) {
      const message = tVmmTui(currentLanguage, "user_manager_missing_grpc")
      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
        message,
      })
      return
    }

    const result = await callVmmTuiResolveUser({
      request: {
        user_ref: userName,
        confirm_create: true,
      },
      config: buildVmmTuiTransportConfig(config),
    })

    writeVmmTuiLog("vmm.tui.user_manager_overlay.create", {
      userRef: userName,
      scope,
      ok: result.ok,
      created: result.response?.created,
      details: result.details,
      grpcCodeName: result.grpcCodeName,
      timedOutPhase: result.timedOutPhase,
    })

    if (!result.ok || !result.response?.user) {
      const message = summarizeGrpcResult(
        currentLanguage,
        tVmmTui(currentLanguage, "new_user_dialog_title"),
        result,
      )
      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
        message,
      })
      return
    }

    await bindUserInScope(scope, result.response.user)
  }

  /**
   * Execute one delete-user flow and then repair any affected local/global binding.
   * 执行一次删除用户流程，并在成功后修复受影响的本地或公共绑定。
   *
   * The destructive delete stays on the backend confirmation chain. This overlay
   * helper only decides what config follow-up is required after the user has
   * really been deleted, so local and shared bindings never point at a removed
   * account afterwards.
   * 破坏性的删除动作仍交给后端确认链完成。
   * 这个覆盖层助手只负责决定账号真正删除后还需要补哪些配置修正，
   * 避免本地或公共绑定在成功删除后仍然指向一个已被移除的账号。
   */
  const deleteUserWithAdjustments = async (args: {
    user: VmmGrpcUserEntry
    workspaceFallsBackToGlobal: boolean
    replacementGlobalUser?: VmmGrpcUserEntry
  }) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const transportConfig = buildVmmTuiTransportConfig(config)
    const userRef = String(args.user.user_id)

    const firstPass = await callVmmTuiDeleteUser({
      request: {
        user_ref: userRef,
        confirmation_code: "",
      },
      config: transportConfig,
    })

    if (!firstPass.ok) {
      const message = summarizeGrpcResult(
        currentLanguage,
        tVmmTui(currentLanguage, "user_manager_overlay_scope_delete_title"),
        firstPass,
      )
      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
        message,
      })
      return
    }

    /**
     * Persist binding repairs only after the backend confirms the account is gone.
     * 只有在后端确认账号已删除后，才真正落库后续绑定修复。
     */
    const finalizeDeleteSuccess = async () => {
      if (args.replacementGlobalUser) {
        await saveVmmConfig(
          props.api.state.path.directory,
          "global",
          "user_id",
          args.replacementGlobalUser.user_id,
        )
      }
      if (args.workspaceFallsBackToGlobal) {
        await saveVmmConfig(props.api.state.path.directory, "local", "user_id", "")
      }

      const message = [
        tVmmTui(currentLanguage, "user_manager_overlay_status_deleted", {
          name: args.user.user_name || userRef,
          id: formatVmmUserManagerIdLabel(currentLanguage, userRef),
        }),
        args.workspaceFallsBackToGlobal
          ? tVmmTui(currentLanguage, "user_manager_overlay_delete_effect_workspace_inherit")
          : "",
        args.replacementGlobalUser
          ? tVmmTui(currentLanguage, "user_manager_overlay_delete_effect_global_replace", {
              value: formatVmmUserManagerAccountLabel(
                currentLanguage,
                args.replacementGlobalUser.user_name || String(args.replacementGlobalUser.user_id),
              ),
            })
          : "",
      ]
        .filter((part) => part.trim().length > 0)
        .join(" ")

      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
        message,
      })
      await reloadUserManagerOverlay("delete-user")
    }

    if (firstPass.response?.requires_confirmation) {
      const secondPass = await callVmmTuiDeleteUser({
        request: {
          user_ref: userRef,
          confirmation_code: firstPass.response?.confirmation_code ?? "",
        },
        config: transportConfig,
      })

      if (!secondPass.ok) {
        const message = summarizeGrpcResult(
          currentLanguage,
          tVmmTui(currentLanguage, "user_manager_overlay_scope_delete_title"),
          secondPass,
        )
        setStatusMessage(message)
        openVmmInfoDialog({
          api: props.api,
          title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
          message,
        })
        return
      }

      await finalizeDeleteSuccess()
      return
    }

    await finalizeDeleteSuccess()
  }

  /**
   * Ask the operator to type the exact account name before starting deletion.
   * 在真正启动删除前，要求操作者输入准确账号名作为确认。
   *
   * This extra prompt carries the irreversible warning that the user asked for.
   * It also keeps the dialog open when the input is wrong so the operator can
   * retry immediately or cancel without losing context.
   * 这一步承载了用户要求的不可逆风险提示。
   * 输入错误时对话框会继续保留，让操作者可以直接重试，或者取消退出而不丢上下文。
   */
  const promptDeleteUserConfirmation = (args: {
    user: VmmGrpcUserEntry
    workspaceFallsBackToGlobal: boolean
    replacementGlobalUser?: VmmGrpcUserEntry
  }) => {
    const currentLanguage = props.language()
    const expectedAccountName = args.user.user_name || String(args.user.user_id)
    openVmmExactConfirmPrompt({
      api: props.api,
      title: tVmmTui(currentLanguage, "user_manager_overlay_delete_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "user_manager_overlay_delete_prompt_placeholder", {
        name: expectedAccountName,
      }),
      descriptionLines: [
        tVmmTui(currentLanguage, "user_manager_overlay_delete_prompt_warning"),
        tVmmTui(currentLanguage, "user_manager_overlay_delete_prompt_expected", {
          name: expectedAccountName,
        }),
        ...(args.workspaceFallsBackToGlobal
          ? [tVmmTui(currentLanguage, "user_manager_overlay_delete_effect_workspace_inherit")]
          : []),
        ...(args.replacementGlobalUser
          ? [
              tVmmTui(currentLanguage, "user_manager_overlay_delete_effect_global_replace", {
                value: formatVmmUserManagerAccountLabel(
                  currentLanguage,
                  args.replacementGlobalUser.user_name ||
                    String(args.replacementGlobalUser.user_id),
                ),
              }),
            ]
          : []),
        tVmmTui(currentLanguage, "user_manager_overlay_delete_prompt_retry"),
      ],
      expectedValue: expectedAccountName,
      emptyMessage: tVmmTui(currentLanguage, "user_manager_overlay_delete_prompt_empty"),
      mismatchMessage: tVmmTui(currentLanguage, "user_manager_overlay_delete_prompt_mismatch", {
        name: expectedAccountName,
      }),
      toastTitle: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
      onConfirmValue: () => {
        void deleteUserWithAdjustments(args)
      },
    })
  }

  /**
   * Inspect current bindings and start the overlay delete flow for one selected user.
   * 检查当前绑定状态，并为一个选中的用户启动覆盖层删除流程。
   *
   * If the shared global binding still points at the same account, the user
   * must pick a replacement first. If only the workspace binding points there,
   * the workspace simply falls back to global after the delete succeeds.
   * 如果公共设置仍指向这个账号，就必须先挑选一个替代账号；
   * 如果只有工作空间绑定指向它，则在删除成功后让工作空间自动回退到公共设置。
   */
  const startDeleteUserFromOverlay = async (user: VmmGrpcUserEntry) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const deletedUserId = String(user.user_id)
    const workspaceUserId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "local",
      "user_id",
    )
    const globalUserId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "global",
      "user_id",
    )
    const workspaceFallsBackToGlobal = workspaceUserId === deletedUserId
    const globalNeedsReplacement = globalUserId === deletedUserId

    if (globalNeedsReplacement) {
      const candidates = liveUsers().filter((entry) => String(entry.user_id) !== deletedUserId)
      if (candidates.length === 0) {
        const message = tVmmTui(
          currentLanguage,
          "user_manager_overlay_delete_missing_global_replacement",
        )
        setStatusMessage(message)
        openVmmInfoDialog({
          api: props.api,
          title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
          message,
        })
        return
      }

      openUserManagerReplacementDialog({
        api: props.api,
        language: currentLanguage,
        users: liveUsers(),
        deletedUserId,
        onSelectReplacement: (replacementUser) => {
          promptDeleteUserConfirmation({
            user,
            workspaceFallsBackToGlobal,
            replacementGlobalUser: replacementUser,
          })
        },
      })
      return
    }

    promptDeleteUserConfirmation({
      user,
      workspaceFallsBackToGlobal,
    })
  }

  /**
   * Clear the workspace-level override so the effective user falls back to global.
   * 清空工作区级别的用户覆盖值，让最终生效用户重新回退到公共设置。
   */
  const clearWorkspaceUserBinding = async () => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    await saveVmmConfig(props.api.state.path.directory, "local", "user_id", "")
    const message = tVmmTui(currentLanguage, "user_manager_overlay_status_cleared")
    setStatusMessage(message)
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "user_manager_overlay_toast_title"),
      message,
    })
    await reloadUserManagerOverlay("clear-workspace")
  }

  /**
   * Activate the currently selected overlay row.
   * 执行当前选中的覆盖层行动作。
   */
  const activateSelectedItem = (item?: VmmUserManagerItem) => {
    const nextItem = item ?? filteredItems().find((entry) => entry.id === selectedId()) ?? filteredItems()[0]
    if (!nextItem) return
    if (nextItem.kind === "user") {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openUserManagerScopeDialog({
          api: props.api,
          language: currentLanguage,
          onSelectScope: (scope) => {
            void bindUserInScope(scope, nextItem.user)
          },
          onDeleteUser: () => {
            void startDeleteUserFromOverlay(nextItem.user)
          },
        })
      })()
      return
    }
    if (nextItem.kind === "new-user") {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openNewUserPrompt(props.api, currentLanguage, (userName) => {
          void (async () => {
            const latestLanguage = (await locale.refreshConfig()).language
            openUserManagerScopeDialog({
              api: props.api,
              language: latestLanguage,
              onSelectScope: (scope) => {
                void createUserInScope(scope, userName)
              },
            })
          })()
        })
      })()
      return
    }
    void clearWorkspaceUserBinding()
  }

  /**
   * Move the current selection through filtered selectable rows.
   * 在过滤后的可选行之间移动当前选中项。
   */
  const moveSelection = (direction: -1 | 1) => {
    const currentItems = filteredItems()
    if (currentItems.length === 0) return
    const currentIndex = currentItems.findIndex((item) => item.id === selectedId())
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + currentItems.length) % currentItems.length
    setSelectedId(currentItems[nextIndex]?.id ?? currentItems[0].id)
  }

  /**
   * The overlay uses one shared close path so Esc and right-click behave the same.
   * 遮罩层统一复用一条关闭路径，让 Esc 和鼠标右键保持相同行为。
   */
  const closeOverlay = () => {
    if (filterText()) {
      setFilterText("")
      queueMicrotask(() => {
        filterInputRef?.focus()
      })
      return
    }
    props.onClose()
  }

  useKeyboard((event) => {
    if (isVmmDialogOpen()) return

    /**
     * Reuse the launcher navigation muscle memory inside the modal so the
     * future overlay page already feels consistent with the home screen.
     * 在弹层内部继续复用首页的导航手感，
     * 让后续正式覆盖层页面接入时仍然和首页保持一致的交互记忆。
     */
    if (["up", "down", "j", "k"].includes(event.name)) {
      if (filteredItems().length === 0) return
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
      if (filteredItems().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      activateSelectedItem()
      return
    }

    queueMicrotask(() => {
      filterInputRef?.focus()
    })
  })

  /**
   * Split the filtered rows into one action group and one user group.
   * 把过滤后的条目拆成“操作”和“用户列表”两组。
   *
   * The user asked for explicit non-selectable group separators, so the overlay
   * overlay keeps the data rows flat but renders them in two visible sections.
   * 用户要求显式的不可选分组标题，因此这里保持数据仍是平铺结构，
   * 但在界面上把它们渲染成两个可见分区。
   */
  const actionItems = createMemo(() =>
    filteredItems().filter((item) => item.kind === "new-user" || item.kind === "clear-workspace"),
  )
  const userItems = createMemo(() =>
    filteredItems().filter((item) => item.kind === "user"),
  )

  return (
    <>
      {/**
       * The mask layer only dims the background and intentionally has no border.
       * 遮罩层只负责压暗背景，并且刻意不加任何边框。
       */}
      <box
        width="100%"
        height="100%"
        position="absolute"
        left={0}
        top={0}
        backgroundColor="#000000"
        opacity={0.8}
      />
      {/**
       * The interaction wrapper sits above the mask and captures all mouse
       * events so the background launcher stays visually present but inert.
       * 交互包裹层位于遮罩层之上，并吞掉所有鼠标事件，
       * 让背景首页虽然还看得见，但不会再继续响应交互。
       */}
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
           * Keep the modal header visually aligned with the launcher styling
           * so the overlay dialog still reads as part of the same setting system.
           * 头部继续对齐首页启动器风格，
           * 让这个覆盖层仍然保持在同一套设置系统视觉里。
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
              text="USER MANAGER"
              font="tiny"
              color="#ffffff"
              backgroundColor="transparent"
            />
          </box>
          {/**
           * Reuse the launcher filter row because the future overlay list will be
           * driven by the same quick-search interaction pattern.
           * 继续复用首页式过滤输入行，
           * 因为后续正式覆盖层列表也会沿用同一种快速筛选交互。
           */}
          <box
            width="100%"
            height={3}
            border
            borderColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
            flexDirection="row"
            alignItems="center"
            paddingLeft={1}
            paddingRight={1}
          >
            <input
              ref={filterInputRef}
              width="100%"
              value={filterText()}
              placeholder={tVmmTui(props.language(), "user_manager_overlay_filter_placeholder")}
              placeholderColor={VMM_TUI_COLOR_MUTED}
              backgroundColor="transparent"
              focusedBackgroundColor="transparent"
              textColor={VMM_TUI_COLOR_BODY}
              focusedTextColor={VMM_TUI_COLOR_TITLE}
              cursorColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
              focused
              onInput={(value) => {
                setFilterText(value)
              }}
            />
          </box>
          {/**
           * The grouped list keeps one launcher-like shell while inserting
           * non-selectable section headers above actions and users.
           * 这块分组列表会保留启动器式外壳，
           * 同时在动作项和用户项上方插入不可选的分组标题。
           */}
          <box
            width="100%"
            minHeight={0}
            flexGrow={1}
            border
            borderColor={VMM_TUI_COLOR_BORDER}
            title={tVmmTui(props.language(), "user_manager_overlay_list_title")}
            titleAlignment="center"
            backgroundColor="transparent"
            flexDirection="column"
            padding={1}
            gap={1}
          >
            <VmmScrollColumn
              selectedChildId={buildVmmRowRenderableId("user-manager", selectedId())}
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
                    <b>{tVmmTui(props.language(), "user_manager_overlay_group_actions")}</b>
                  </text>
                </box>
              ) : null}
              {actionItems().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("user-manager", item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={item.id === selectedId()}
                  onHover={() => setSelectedId(item.id)}
                  onPress={() => activateSelectedItem(item)}
                />
              ))}
              {actionItems().length > 0 && userItems().length > 0 ? <box width="100%" height={1} /> : null}
              {userItems().length > 0 ? (
                <box
                  width="100%"
                  paddingLeft={1}
                  paddingTop={0}
                  paddingBottom={0}
                  flexDirection="row"
                  justifyContent="center"
                >
                  <text fg="#b89cff">
                    <b>{tVmmTui(props.language(), "user_manager_overlay_group_users")}</b>
                  </text>
                </box>
              ) : null}
              {userItems().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("user-manager", item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={item.id === selectedId()}
                  onHover={() => setSelectedId(item.id)}
                  onPress={() => activateSelectedItem(item)}
                />
              ))}
            </VmmScrollColumn>
            {isLoading() ? (
              <text fg={VMM_TUI_COLOR_MUTED}>{tVmmTui(props.language(), "user_manager_overlay_loading")}</text>
            ) : filteredItems().length === 0 ? (
              <text fg={VMM_TUI_COLOR_MUTED}>{tVmmTui(props.language(), "user_manager_overlay_empty")}</text>
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
            <text fg={VMM_TUI_COLOR_HINT}>{tVmmTui(props.language(), "user_manager_overlay_keys_hint")}</text>
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
                tVmmTui(props.language(), "user_manager_overlay_workspace_summary", {
                  value: workspaceUserLabel(),
                }),
                tVmmTui(props.language(), "user_manager_overlay_global_summary", {
                  value: globalUserLabel(),
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
 * Full-screen overlay shell used by the rebuilt Project Manager entry.
 * 重建后的 Project Manager 入口使用的全屏遮罩层外壳。
 *
 * The project flow intentionally mirrors the User Manager launcher pattern:
 * keep the home screen underneath, capture all focus inside one centered
 * overlay, and keep actions plus live rows in one compact grouped list.
 * 项目管理会刻意镜像用户管理那套启动器模式：
 * 首页继续留在下方，所有焦点收束到中间遮罩层里，
 * 再把动作项和实时项目都放进一个紧凑的分组列表。
 */
export const VmmProjectManagerOverlay = (props: {
  api: TuiPluginApi
  language: () => VmmLanguage
  onClose: () => void
}) => {
  const locale = createVmmTuiLocaleState(props.api)
  const [filterText, setFilterText] = createSignal("")
  const [statusMessage, setStatusMessage] = createSignal("")
  const [isLoading, setIsLoading] = createSignal(false)
  const [workspaceProjectLabel, setWorkspaceProjectLabel] = createSignal("")
  const [globalProjectLabel, setGlobalProjectLabel] = createSignal("")
  let filterInputRef: InputRenderable | undefined
  const [items, setItems] = createSignal<ReadonlyArray<VmmProjectManagerItem>>([])
  const filteredItems = createMemo(() => {
    const normalizedFilter = filterText().trim().toLowerCase()
    if (!normalizedFilter) return items()
    return items().filter((item) =>
      [item.title, item.subtitle].join(" ").toLowerCase().includes(normalizedFilter),
    )
  })
  const liveProjects = createMemo(() =>
    items()
      .filter((item): item is Extract<VmmProjectManagerItem, { kind: "project" }> => item.kind === "project")
      .map((item) => item.project),
  )
  const [selectedId, setSelectedId] = createSignal("")

  /**
   * Keep one valid selected row while filters and live project data are changing.
   * 在过滤条件和实时项目数据变化时，持续保持一个有效选中行。
   */
  createEffect(() => {
    const current = selectedId()
    const nextItems = filteredItems()
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

  /**
   * Load the live project list once when the overlay mounts.
   * 在弹层挂载时加载一次实时项目列表。
   */
  createEffect(() => {
    void reloadProjectManagerOverlay("overlay-open")
  })

  /**
   * Render one bottom summary label for either workspace or global project binding.
   * 为工作区或公共设置渲染一条底部项目绑定摘要。
   */
  const formatScopedProjectSummary = (
    language: VmmLanguage,
    scope: VmmConfigScope,
    projectId: string,
    projects: ReadonlyArray<VmmGrpcProjectEntry>,
  ) => {
    if (!projectId) {
      return scope === "local"
        ? tVmmTui(language, "project_manager_overlay_inherit_global")
        : tVmmTui(language, "user_manager_unset")
    }
    const matchedProject = projects.find((project) => String(project.project_id) === projectId)
    const idLabel = formatVmmProjectManagerIdLabel(language, projectId)
    return matchedProject ? `${idLabel}/${matchedProject.display_path}` : idLabel
  }

  /**
   * Rebuild the overlay list from live backend projects plus two local actions.
   * 使用实时后端项目和两个本地动作，重建项目管理弹层列表。
   */
  const reloadProjectManagerOverlay = async (
    reason: string,
    options: {
      preserveStatusMessage?: string
    } = {},
  ) => {
    setIsLoading(true)
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const workspaceProjectId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "local",
      "project_id",
    )
    const globalProjectId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "global",
      "project_id",
    )

    if (!hasConfiguredGrpcTarget(config)) {
      setItems([
        {
          id: "action:new-project",
          kind: "new-project",
          title: tVmmTui(currentLanguage, "project_manager_overlay_add_title"),
          subtitle: tVmmTui(currentLanguage, "project_manager_overlay_add_subtitle"),
        },
        {
          id: "action:clear-workspace",
          kind: "clear-workspace",
          title: tVmmTui(currentLanguage, "project_manager_overlay_clear_workspace_title"),
          subtitle: tVmmTui(currentLanguage, "project_manager_overlay_clear_workspace_subtitle"),
        },
      ])
      setWorkspaceProjectLabel(
        formatScopedProjectSummary(currentLanguage, "local", workspaceProjectId, []),
      )
      setGlobalProjectLabel(
        formatScopedProjectSummary(currentLanguage, "global", globalProjectId, []),
      )
      setStatusMessage(tVmmTui(currentLanguage, "project_manager_missing_grpc"))
      setIsLoading(false)
      return
    }

    const result = await callVmmTuiListProjects({
      config: buildVmmTuiTransportConfig(config),
    })

    writeVmmTuiLog("vmm.tui.project_manager_overlay.reload", {
      reason,
      ok: result.ok,
      details: result.details,
      grpcCodeName: result.grpcCodeName,
      timedOutPhase: result.timedOutPhase,
      projectCount: result.response?.projects?.length ?? 0,
    })

    if (!result.ok) {
      setItems([
        {
          id: "action:new-project",
          kind: "new-project",
          title: tVmmTui(currentLanguage, "project_manager_overlay_add_title"),
          subtitle: tVmmTui(currentLanguage, "project_manager_overlay_add_subtitle"),
        },
        {
          id: "action:clear-workspace",
          kind: "clear-workspace",
          title: tVmmTui(currentLanguage, "project_manager_overlay_clear_workspace_title"),
          subtitle: tVmmTui(currentLanguage, "project_manager_overlay_clear_workspace_subtitle"),
        },
      ])
      setWorkspaceProjectLabel(
        formatScopedProjectSummary(currentLanguage, "local", workspaceProjectId, []),
      )
      setGlobalProjectLabel(
        formatScopedProjectSummary(currentLanguage, "global", globalProjectId, []),
      )
      setStatusMessage(
        summarizeGrpcResult(
          currentLanguage,
          tVmmTui(currentLanguage, "project_manager_overlay_list_title"),
          result,
        ),
      )
      setIsLoading(false)
      return
    }

    const projects = result.response?.projects ?? []
    setItems([
      {
        id: "action:new-project",
        kind: "new-project",
        title: tVmmTui(currentLanguage, "project_manager_overlay_add_title"),
        subtitle: tVmmTui(currentLanguage, "project_manager_overlay_add_subtitle"),
      },
      {
        id: "action:clear-workspace",
        kind: "clear-workspace",
        title: tVmmTui(currentLanguage, "project_manager_overlay_clear_workspace_title"),
        subtitle: tVmmTui(currentLanguage, "project_manager_overlay_clear_workspace_subtitle"),
      },
      ...projects.map<VmmProjectManagerItem>((project) => ({
        id: `project:${project.project_id}`,
        kind: "project",
        title: project.display_path || project.project_name || `#${project.project_id}`,
        subtitle: formatVmmProjectManagerIdLabel(currentLanguage, project.project_id),
        project,
      })),
    ])
    setWorkspaceProjectLabel(
      formatScopedProjectSummary(currentLanguage, "local", workspaceProjectId, projects),
    )
    setGlobalProjectLabel(
      formatScopedProjectSummary(currentLanguage, "global", globalProjectId, projects),
    )
    setStatusMessage(
      options.preserveStatusMessage ??
        tVmmTui(currentLanguage, "project_manager_overlay_status_loaded", {
          count: projects.length,
        }),
    )
    setIsLoading(false)
  }

  /**
   * Persist one existing project binding into the chosen local/global config scope.
   * 把一个已存在项目写入指定的工作区或公共配置范围。
   */
  const bindProjectInScope = async (scope: VmmConfigScope, project: VmmGrpcProjectEntry) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    await saveVmmConfig(props.api.state.path.directory, scope, "project_id", project.project_id)
    const scopeLabel = getConfigScopeLabel(scope, currentLanguage)
    const message = tVmmTui(currentLanguage, "project_manager_overlay_status_bound", {
      scope: scopeLabel,
      path: project.display_path || project.project_name || `#${project.project_id}`,
      id: formatVmmProjectManagerIdLabel(currentLanguage, project.project_id),
    })
    setStatusMessage(message)
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      message,
    })
    await reloadProjectManagerOverlay("bind-project", {
      preserveStatusMessage: message,
    })
  }

  /**
   * Resolve or create one project path, then bind it into the chosen scope.
   * 解析或创建一条项目路径，然后把它绑定到选中的写入范围。
   */
  const createProjectInScope = async (scope: VmmConfigScope, projectPath: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const canonicalProjectPath = normalizeCanonicalProjectPathInput(projectPath)

    if (!hasConfiguredGrpcTarget(config)) {
      const message = tVmmTui(currentLanguage, "project_manager_missing_grpc")
      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
        message,
      })
      return
    }

    const result = await callVmmTuiEnsureProject({
      request: {
        project_path: canonicalProjectPath,
        confirm_create: true,
      },
      config: buildVmmTuiTransportConfig(config),
    })

    writeVmmTuiLog("vmm.tui.project_manager_overlay.create", {
      projectPath: canonicalProjectPath,
      scope,
      ok: result.ok,
      details: result.details,
      grpcCodeName: result.grpcCodeName,
      timedOutPhase: result.timedOutPhase,
      exists: result.response?.exists,
    })

    if (!result.ok || !result.response?.project) {
      const message = summarizeProjectCreateFailure(currentLanguage, result)
      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
        message,
      })
      return
    }

    await saveVmmConfig(
      props.api.state.path.directory,
      scope,
      "project_id",
      result.response.project.project_id,
    )
    const scopeLabel = getConfigScopeLabel(scope, currentLanguage)
    const pathLabel =
      result.response.project.display_path ||
      result.response.project.project_name ||
      canonicalProjectPath ||
      `#${result.response.project.project_id}`
    const statusKey = result.response.exists
      ? "project_manager_overlay_status_resolved"
      : "project_manager_overlay_status_created"
    const message = tVmmTui(currentLanguage, statusKey, {
      scope: scopeLabel,
      path: pathLabel,
      id: formatVmmProjectManagerIdLabel(currentLanguage, result.response.project.project_id),
    })
    setStatusMessage(message)
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      message,
    })
    await reloadProjectManagerOverlay("create-project", {
      preserveStatusMessage: message,
    })
  }

  /**
   * Delete one project and repair any affected local/global bindings afterwards.
   * 删除一个项目，并在成功后修复受影响的本地或公共绑定。
   *
   * Project deletion can invalidate both the workspace override and the shared
   * global fallback. This helper keeps those follow-up adjustments in one place
   * so the overlay never leaves `project_id` pointing at a removed project.
   * 项目删除可能同时影响工作区覆盖值和公共回退值。
   * 这里把删除后的配置善后统一收口，避免覆盖层在成功删除后仍把 `project_id`
   * 留在一个已经不存在的项目上。
   */
  const deleteProjectWithAdjustments = async (args: {
    project: VmmGrpcProjectEntry
    workspaceFallsBackToGlobal: boolean
    replacementGlobalProject?: VmmGrpcProjectEntry
  }) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const transportConfig = buildVmmTuiTransportConfig(config)
    const projectPath = normalizeCanonicalProjectPathInput(
      args.project.display_path || args.project.project_name,
    )
    const closePendingDialog = openVmmPendingDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      message: tVmmTui(currentLanguage, "project_manager_overlay_delete_running"),
    })
    const firstPass = await (async () => {
      try {
        return await callVmmTuiDeleteProject({
          request: {
            project_path: projectPath,
            confirm_delete: false,
          },
          config: transportConfig,
        })
      } finally {
        closePendingDialog()
      }
    })()

    if (!firstPass.ok) {
      const message = summarizeGrpcResult(
        currentLanguage,
        tVmmTui(currentLanguage, "project_manager_overlay_scope_delete_title"),
        firstPass,
      )
      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
        message,
      })
      return
    }

    /**
     * Persist binding repairs only after the backend confirms the project is gone.
     * 只有在后端确认项目已删除后，才真正落库后续绑定修复。
     */
    const finalizeDeleteSuccess = async () => {
      if (args.replacementGlobalProject) {
        await saveVmmConfig(
          props.api.state.path.directory,
          "global",
          "project_id",
          args.replacementGlobalProject.project_id,
        )
      }
      if (args.workspaceFallsBackToGlobal) {
        await saveVmmConfig(props.api.state.path.directory, "local", "project_id", "")
      }

      const message = [
        tVmmTui(currentLanguage, "project_manager_overlay_status_deleted", {
          path: projectPath,
          id: formatVmmProjectManagerIdLabel(currentLanguage, args.project.project_id),
        }),
        args.workspaceFallsBackToGlobal
          ? tVmmTui(currentLanguage, "project_manager_overlay_delete_effect_workspace_inherit")
          : "",
        args.replacementGlobalProject
          ? tVmmTui(currentLanguage, "project_manager_overlay_delete_effect_global_replace", {
              value: formatProjectEntry(args.replacementGlobalProject),
            })
          : "",
      ]
        .filter((part) => part.trim().length > 0)
        .join(" ")

      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
        message,
      })
      await reloadProjectManagerOverlay("delete-project", {
        preserveStatusMessage: message,
      })
    }

    if (firstPass.response?.needs_confirm) {
      openVmmConfirmDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_delete_backend_confirm_title"),
        message: tVmmTui(currentLanguage, "project_manager_overlay_delete_backend_confirm_message"),
        onConfirm: () => {
          void (async () => {
            const closeSecondPendingDialog = openVmmPendingDialog({
              api: props.api,
              title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
              message: tVmmTui(currentLanguage, "project_manager_overlay_delete_running"),
            })
            const secondPass = await (async () => {
              try {
                return await callVmmTuiDeleteProject({
                  request: {
                    project_path: projectPath,
                    confirm_delete: true,
                  },
                  config: transportConfig,
                })
              } finally {
                closeSecondPendingDialog()
              }
            })()

            if (!secondPass.ok) {
              const message = summarizeGrpcResult(
                currentLanguage,
                tVmmTui(currentLanguage, "project_manager_overlay_scope_delete_title"),
                secondPass,
              )
              setStatusMessage(message)
              openVmmInfoDialog({
                api: props.api,
                title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
                message,
              })
              return
            }

            await finalizeDeleteSuccess()
          })()
        },
      })
      return
    }

    await finalizeDeleteSuccess()
  }

  /**
   * Require one exact full-path input before project deletion starts.
   * 在真正启动项目删除前，要求输入准确完整路径作为确认。
   *
   * The first confirmation is path-based because deleting a project can remove
   * sessions, messages, memories, and vector rows attached to that scope.
   * 路径输入确认是删除项目的第一层保护，
   * 因为它会一并删除挂在该项目范围下的 session、消息、记忆和向量数据。
   */
  const promptDeleteProjectConfirmation = (args: {
    project: VmmGrpcProjectEntry
    workspaceFallsBackToGlobal: boolean
    replacementGlobalProject?: VmmGrpcProjectEntry
  }) => {
    const currentLanguage = props.language()
    const expectedProjectPath = normalizeCanonicalProjectPathInput(
      args.project.display_path || args.project.project_name,
    )
    openVmmExactConfirmPrompt({
      api: props.api,
      title: tVmmTui(currentLanguage, "project_manager_overlay_delete_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "project_manager_overlay_delete_prompt_placeholder", {
        path: expectedProjectPath,
      }),
      descriptionLines: [
        tVmmTui(currentLanguage, "project_manager_overlay_delete_prompt_warning"),
        tVmmTui(currentLanguage, "project_manager_overlay_delete_prompt_expected", {
          path: expectedProjectPath,
        }),
        ...(args.workspaceFallsBackToGlobal
          ? [tVmmTui(currentLanguage, "project_manager_overlay_delete_effect_workspace_inherit")]
          : []),
        ...(args.replacementGlobalProject
          ? [
              tVmmTui(currentLanguage, "project_manager_overlay_delete_effect_global_replace", {
                value: formatProjectEntry(args.replacementGlobalProject),
              }),
            ]
          : []),
        tVmmTui(currentLanguage, "project_manager_overlay_delete_prompt_retry"),
      ],
      expectedValue: expectedProjectPath,
      emptyMessage: tVmmTui(currentLanguage, "project_manager_overlay_delete_prompt_empty"),
      mismatchMessage: tVmmTui(currentLanguage, "project_manager_overlay_delete_prompt_mismatch", {
        path: expectedProjectPath,
      }),
      toastTitle: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      onConfirmValue: () => {
        void deleteProjectWithAdjustments(args)
      },
    })
  }

  /**
   * Inspect current bindings and start the overlay delete flow for one project.
   * 检查当前绑定状态，并为一个项目启动覆盖层删除流程。
   */
  const prepareDeleteProjectFlow = async (project: VmmGrpcProjectEntry) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const workspaceProjectId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "local",
      "project_id",
    )
    const globalProjectId = await readScopedVmmBindingValue(
      props.api.state.path.directory,
      "global",
      "project_id",
    )
    const deletedProjectId = String(project.project_id)
    const workspaceFallsBackToGlobal = workspaceProjectId === deletedProjectId
    const globalNeedsReplacement = globalProjectId === deletedProjectId

    /**
     * If the shared global binding would break, force a replacement pick first.
     * 如果公共设置会因删除而失效，就必须先挑选一个替代项目。
     */
    if (globalNeedsReplacement) {
      const replacementCandidates = liveProjects().filter(
        (candidate) => String(candidate.project_id) !== deletedProjectId,
      )
      if (replacementCandidates.length === 0) {
        const message = tVmmTui(
          currentLanguage,
          "project_manager_overlay_delete_missing_global_replacement",
        )
        setStatusMessage(message)
        openVmmInfoDialog({
          api: props.api,
          title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
          message,
        })
        return
      }

      openProjectManagerReplacementDialog({
        api: props.api,
        language: currentLanguage,
        projects: liveProjects(),
        deletedProjectId,
        onSelectReplacement: (replacementProject) => {
          promptDeleteProjectConfirmation({
            project,
            workspaceFallsBackToGlobal,
            replacementGlobalProject: replacementProject,
          })
        },
      })
      return
    }

    promptDeleteProjectConfirmation({
      project,
      workspaceFallsBackToGlobal,
    })
  }

  /**
   * Migrate one project and repair any workspace/global binding that still points at the source.
   * 迁移一个项目，并修复仍然指向源项目的工作区或公共绑定。
   *
   * A successful migration returns the target project node, so bindings that
   * previously pointed at the source can be redirected to the new project id
   * instead of being left stale.
   * 成功迁移后后端会返回目标项目节点，
   * 因此原先指向源项目的绑定可以直接重定向到新项目 id，
   * 而不是留下一条过期引用。
   */
  const migrateProjectWithAdjustments = async (args: {
    sourceProject: VmmGrpcProjectEntry
    targetProjectPath: string
  }) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const transportConfig = buildVmmTuiTransportConfig(config)
    const sourceProjectPath = normalizeCanonicalProjectPathInput(
      args.sourceProject.display_path || args.sourceProject.project_name,
    )
    const targetProjectPath = normalizeCanonicalProjectPathInput(args.targetProjectPath)
    const sourceProjectId = String(args.sourceProject.project_id)
    const closePendingDialog = openVmmPendingDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      message: tVmmTui(currentLanguage, "project_manager_overlay_migrate_running"),
    })
    const firstPass = await (async () => {
      try {
                return await callVmmTuiMigrateProject({
                  request: {
                    source_project_path: sourceProjectPath,
                    target_project_path: targetProjectPath,
                    confirm_migrate: false,
                  },
          config: transportConfig,
        })
      } finally {
        closePendingDialog()
      }
    })()

    if (!firstPass.ok) {
      const message = summarizeGrpcResult(
        currentLanguage,
        tVmmTui(currentLanguage, "project_manager_overlay_scope_migrate_title"),
        firstPass,
      )
      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
        message,
      })
      return
    }

    /**
     * Redirect bindings after the backend confirms the migration is complete.
     * 只有在后端确认迁移完成后，才去修正指向源项目的绑定。
     */
    const finalizeMigrateSuccess = async (
      targetProject: VmmGrpcProjectEntry | undefined,
    ) => {
      const workspaceProjectId = await readScopedVmmBindingValue(
        props.api.state.path.directory,
        "local",
        "project_id",
      )
      const globalProjectId = await readScopedVmmBindingValue(
        props.api.state.path.directory,
        "global",
        "project_id",
      )
      const workspaceSwitched =
        workspaceProjectId === sourceProjectId && Boolean(targetProject?.project_id)
      const globalSwitched =
        globalProjectId === sourceProjectId && Boolean(targetProject?.project_id)

      if (workspaceSwitched && targetProject) {
        await saveVmmConfig(
          props.api.state.path.directory,
          "local",
          "project_id",
          targetProject.project_id,
        )
      }
      if (globalSwitched && targetProject) {
        await saveVmmConfig(
          props.api.state.path.directory,
          "global",
          "project_id",
          targetProject.project_id,
        )
      }

      const message = [
        tVmmTui(currentLanguage, "project_manager_overlay_status_migrated", {
          source: sourceProjectPath,
          target: normalizeCanonicalProjectPathInput(
            targetProject?.display_path || targetProjectPath,
          ),
        }),
        workspaceSwitched && targetProject
          ? tVmmTui(currentLanguage, "project_manager_overlay_migrate_effect_workspace_switch", {
              value: formatProjectEntry(targetProject),
            })
          : "",
        globalSwitched && targetProject
          ? tVmmTui(currentLanguage, "project_manager_overlay_migrate_effect_global_switch", {
              value: formatProjectEntry(targetProject),
            })
          : "",
      ]
        .filter((part) => part.trim().length > 0)
        .join(" ")

      setStatusMessage(message)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
        message,
      })
      await reloadProjectManagerOverlay("migrate-project", {
        preserveStatusMessage: message,
      })
    }

    if (firstPass.response?.needs_confirm) {
      openVmmConfirmDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "project_manager_overlay_migrate_backend_confirm_title"),
        message: tVmmTui(
          currentLanguage,
          "project_manager_overlay_migrate_backend_confirm_message",
        ),
        onConfirm: () => {
          void (async () => {
            const closeSecondPendingDialog = openVmmPendingDialog({
              api: props.api,
              title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
              message: tVmmTui(currentLanguage, "project_manager_overlay_migrate_running"),
            })
            const secondPass = await (async () => {
              try {
                return await callVmmTuiMigrateProject({
                  request: {
                    source_project_path: sourceProjectPath,
                    target_project_path: targetProjectPath,
                    confirm_migrate: true,
                  },
                  config: transportConfig,
                })
              } finally {
                closeSecondPendingDialog()
              }
            })()

            if (!secondPass.ok) {
              const message = summarizeGrpcResult(
                currentLanguage,
                tVmmTui(currentLanguage, "project_manager_overlay_scope_migrate_title"),
                secondPass,
              )
              setStatusMessage(message)
              openVmmInfoDialog({
                api: props.api,
                title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
                message,
              })
              return
            }

            await finalizeMigrateSuccess(secondPass.response?.target_project)
          })()
        },
      })
      return
    }

    await finalizeMigrateSuccess(firstPass.response?.target_project)
  }

  /**
   * Require one exact `source => target` input before project migration starts.
   * 在真正启动项目迁移前，要求输入准确的 `source => target` 组合确认。
   */
  const promptMigrateProjectConfirmation = (args: {
    sourceProject: VmmGrpcProjectEntry
    targetProjectPath: string
  }) => {
    const currentLanguage = props.language()
    const sourceProjectPath = normalizeCanonicalProjectPathInput(
      args.sourceProject.display_path || args.sourceProject.project_name,
    )
    const targetProjectPath = normalizeCanonicalProjectPathInput(args.targetProjectPath)
    const expectedMigrationSpec = `${sourceProjectPath} => ${targetProjectPath}`
    openVmmExactConfirmPrompt({
      api: props.api,
      title: tVmmTui(currentLanguage, "project_manager_overlay_migrate_confirm_input_title"),
      placeholder: tVmmTui(
        currentLanguage,
        "project_manager_overlay_migrate_confirm_input_placeholder",
        {
          value: expectedMigrationSpec,
        },
      ),
      descriptionLines: [
        tVmmTui(currentLanguage, "project_manager_overlay_migrate_confirm_input_warning"),
        tVmmTui(currentLanguage, "project_manager_overlay_migrate_confirm_input_expected", {
          value: expectedMigrationSpec,
        }),
        tVmmTui(currentLanguage, "project_manager_overlay_migrate_confirm_input_retry"),
      ],
      expectedValue: expectedMigrationSpec,
      emptyMessage: tVmmTui(
        currentLanguage,
        "project_manager_overlay_migrate_confirm_input_empty",
      ),
      mismatchMessage: tVmmTui(
        currentLanguage,
        "project_manager_overlay_migrate_confirm_input_mismatch",
        {
          value: expectedMigrationSpec,
        },
      ),
      toastTitle: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      onConfirmValue: () => {
        void migrateProjectWithAdjustments({
          ...args,
          targetProjectPath,
        })
      },
    })
  }

  /**
   * Ask for the target path first, then require the full migration spec as the second confirmation.
   * 先输入目标路径，再要求完整迁移规格作为第二层确认。
   */
  const startProjectMigrationFlow = (sourceProject: VmmGrpcProjectEntry) => {
    const currentLanguage = props.language()
    openVmmTextPrompt({
      api: props.api,
      language: currentLanguage,
      title: tVmmTui(currentLanguage, "project_manager_overlay_migrate_prompt_title"),
      placeholder: tVmmTui(currentLanguage, "project_manager_overlay_migrate_prompt_placeholder"),
      description: tVmmTui(currentLanguage, "project_manager_overlay_migrate_prompt_description"),
      emptyMessage: tVmmTui(currentLanguage, "project_manager_overlay_migrate_prompt_empty"),
      toastTitle: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      validateValue: (value) =>
        looksLikeCanonicalProjectPath(value)
          ? undefined
          : tVmmTui(currentLanguage, "project_manager_overlay_invalid_path"),
      onConfirmValue: (targetProjectPath) => {
        promptMigrateProjectConfirmation({
          sourceProject,
          targetProjectPath: normalizeCanonicalProjectPathInput(targetProjectPath),
        })
      },
    })
  }

  /**
   * Clear the workspace-level override so the effective project falls back to global.
   * 清空工作区级别的项目覆盖值，让最终生效项目重新回退到公共设置。
   */
  const clearWorkspaceProjectBinding = async () => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    await saveVmmConfig(props.api.state.path.directory, "local", "project_id", "")
    const message = tVmmTui(currentLanguage, "project_manager_overlay_status_cleared")
    setStatusMessage(message)
    openVmmInfoDialog({
      api: props.api,
      title: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
      message,
    })
    await reloadProjectManagerOverlay("clear-workspace-project", {
      preserveStatusMessage: message,
    })
  }

  /**
   * Execute the currently selected overlay row.
   * 执行当前选中的项目管理弹层行动作。
   */
  const activateSelectedItem = (item?: VmmProjectManagerItem) => {
    const nextItem =
      item ?? filteredItems().find((entry) => entry.id === selectedId()) ?? filteredItems()[0]
    if (!nextItem) return

    if (nextItem.kind === "project") {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openProjectManagerScopeDialog({
          api: props.api,
          language: currentLanguage,
          onSelectScope: (scope) => {
            void bindProjectInScope(scope, nextItem.project)
          },
          onDeleteProject: () => {
            void prepareDeleteProjectFlow(nextItem.project)
          },
          onMigrateProject: () => {
            startProjectMigrationFlow(nextItem.project)
          },
        })
      })()
      return
    }
    if (nextItem.kind === "new-project") {
      void (async () => {
        const currentLanguage = (await locale.refreshConfig()).language
        openVmmTextPrompt({
          api: props.api,
          language: currentLanguage,
          title: tVmmTui(currentLanguage, "project_manager_new_prompt_title"),
          placeholder: tVmmTui(currentLanguage, "project_manager_new_prompt_placeholder"),
          description: tVmmTui(currentLanguage, "project_manager_new_prompt_description"),
          emptyMessage: tVmmTui(currentLanguage, "project_manager_new_prompt_empty"),
          toastTitle: tVmmTui(currentLanguage, "project_manager_overlay_toast_title"),
          validateValue: (value) =>
            looksLikeCanonicalProjectPath(value)
              ? undefined
              : tVmmTui(currentLanguage, "project_manager_overlay_invalid_path"),
          onConfirmValue: (value) => {
            void (async () => {
              const latestLanguage = (await locale.refreshConfig()).language
              openProjectManagerScopeDialog({
                api: props.api,
                language: latestLanguage,
                onSelectScope: (scope) => {
                  void createProjectInScope(scope, value)
                },
              })
            })()
          },
        })
      })()
      return
    }
    void clearWorkspaceProjectBinding()
  }

  /**
   * Move the current selection through filtered selectable rows.
   * 在过滤后的可选行之间移动当前选中项。
   */
  const moveSelection = (direction: -1 | 1) => {
    const currentItems = filteredItems()
    if (currentItems.length === 0) return
    const currentIndex = currentItems.findIndex((item) => item.id === selectedId())
    const safeIndex = currentIndex >= 0 ? currentIndex : 0
    const nextIndex = (safeIndex + direction + currentItems.length) % currentItems.length
    setSelectedId(currentItems[nextIndex]?.id ?? currentItems[0].id)
  }

  /**
   * The overlay uses one shared close path so Esc and right-click behave the same.
   * 遮罩层统一复用一条关闭路径，让 Esc 和鼠标右键保持相同行为。
   */
  const closeOverlay = () => {
    if (filterText()) {
      setFilterText("")
      queueMicrotask(() => {
        filterInputRef?.focus()
      })
      return
    }
    props.onClose()
  }

  useKeyboard((event) => {
    if (isVmmDialogOpen()) return

    /**
     * Keep the keyboard behavior identical to the launcher-based user manager.
     * 继续对齐启动器式用户管理的键盘交互，保持一套统一手感。
     */
    if (["up", "down", "j", "k"].includes(event.name)) {
      if (filteredItems().length === 0) return
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
      if (filteredItems().length === 0) return
      event.preventDefault()
      event.stopPropagation()
      activateSelectedItem()
      return
    }

    queueMicrotask(() => {
      filterInputRef?.focus()
    })
  })

  /**
   * Split the filtered rows into one action group and one live-project group.
   * 把过滤后的条目拆成“功能列表”和“项目列表”两组。
   */
  const actionItems = createMemo(() =>
    filteredItems().filter(
      (item) => item.kind === "new-project" || item.kind === "clear-workspace",
    ),
  )
  const projectItems = createMemo(() =>
    filteredItems().filter((item) => item.kind === "project"),
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
           * Keep the modal header visually aligned with the launcher styling.
           * 头部继续对齐首页启动器风格，确保项目管理与总入口属于同一视觉体系。
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
              text="PROJECT MANAGER"
              font="tiny"
              color="#ffffff"
              backgroundColor="transparent"
            />
          </box>
          {/**
           * Reuse the launcher filter row so project search keeps the same quick-access feel.
           * 继续复用首页式过滤输入行，让项目搜索保持同一种快速进入手感。
           */}
          <box
            width="100%"
            height={3}
            border
            borderColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
            flexDirection="row"
            alignItems="center"
            paddingLeft={1}
            paddingRight={1}
          >
            <input
              ref={filterInputRef}
              width="100%"
              value={filterText()}
              placeholder={tVmmTui(props.language(), "project_manager_overlay_filter_placeholder")}
              placeholderColor={VMM_TUI_COLOR_MUTED}
              backgroundColor="transparent"
              focusedBackgroundColor="transparent"
              textColor={VMM_TUI_COLOR_BODY}
              focusedTextColor={VMM_TUI_COLOR_TITLE}
              cursorColor={VMM_TUI_COLOR_ROW_SELECTED_BORDER}
              focused
              onInput={(value) => {
                setFilterText(value)
              }}
            />
          </box>
          {/**
           * Keep one grouped list shell so the rebuilt project flow visually matches User Manager.
           * 这里继续使用一整块分组列表外壳，让新的项目管理在视觉上和用户管理保持一致。
           */}
          <box
            width="100%"
            minHeight={0}
            flexGrow={1}
            border
            borderColor={VMM_TUI_COLOR_BORDER}
            title={tVmmTui(props.language(), "project_manager_overlay_list_title")}
            titleAlignment="center"
            backgroundColor="transparent"
            flexDirection="column"
            padding={1}
            gap={1}
          >
            <VmmScrollColumn
              selectedChildId={buildVmmRowRenderableId("project-manager", selectedId())}
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
                    <b>{tVmmTui(props.language(), "project_manager_overlay_group_actions")}</b>
                  </text>
                </box>
              ) : null}
              {actionItems().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("project-manager", item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={item.id === selectedId()}
                  onHover={() => setSelectedId(item.id)}
                  onPress={() => activateSelectedItem(item)}
                />
              ))}
              {actionItems().length > 0 && projectItems().length > 0 ? <box width="100%" height={1} /> : null}
              {projectItems().length > 0 ? (
                <box
                  width="100%"
                  paddingLeft={1}
                  paddingTop={0}
                  paddingBottom={0}
                  flexDirection="row"
                  justifyContent="center"
                >
                  <text fg="#b89cff">
                    <b>{tVmmTui(props.language(), "project_manager_overlay_group_projects")}</b>
                  </text>
                </box>
              ) : null}
              {projectItems().map((item) => (
                <VmmCompactListRow
                  rowId={buildVmmRowRenderableId("project-manager", item.id)}
                  title={item.title}
                  subtitle={item.subtitle}
                  selected={item.id === selectedId()}
                  onHover={() => setSelectedId(item.id)}
                  onPress={() => activateSelectedItem(item)}
                />
              ))}
            </VmmScrollColumn>
            {isLoading() ? (
              <text fg={VMM_TUI_COLOR_MUTED}>{tVmmTui(props.language(), "project_manager_overlay_loading")}</text>
            ) : filteredItems().length === 0 ? (
              <text fg={VMM_TUI_COLOR_MUTED}>{tVmmTui(props.language(), "project_manager_overlay_empty")}</text>
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
            <text fg={VMM_TUI_COLOR_HINT}>{tVmmTui(props.language(), "project_manager_overlay_keys_hint")}</text>
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
                tVmmTui(props.language(), "project_manager_overlay_status_loaded", {
                  count: liveProjects().length,
                }),
                tVmmTui(props.language(), "project_manager_overlay_workspace_summary", {
                  value: workspaceProjectLabel(),
                }),
                tVmmTui(props.language(), "project_manager_overlay_global_summary", {
                  value: globalProjectLabel(),
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

