/** @jsxImportSource @opentui/solid */
/**
 * VMM TUI profile-center feature module.
 * VMM TUI 画像中心功能模块。
 *
 * This file belongs to the TUI interaction layer. It contains the rebuilt
 * profile center workspace and its detail views so profile browsing and manual
 * profile instruction flows can evolve independently from manager overlays.
 * 这个文件属于 TUI 交互层。
 * 它承载了重建后的画像中心工作区及详情视图，
 * 让画像浏览和手工画像指令流程可以独立于各类管理弹层演进。
 */

import { createEffect, createMemo, createSignal, onMount } from "solid-js"
import { extend, useKeyboard } from "@opentui/solid"
import type { TuiPluginApi } from "@opencode-ai/plugin/tui"
import { MouseButton, TextTableRenderable, type InputRenderable, type TextChunk, type TextTableContent } from "@opentui/core"
import type { VmmGrpcGetProfileBundleResponse, VmmGrpcProfileNodeEntry } from "./vmm-grpc.js"
import {
  callVmmTuiApplyProfileInstruction,
  callVmmTuiGetProfileBundle,
  callVmmTuiGetProfileNodes,
} from "./vmm-tui-grpc-bridge.js"
import type { VmmLanguage } from "./vmm-language.js"
import { tVmmTui } from "./vmm-tui-language.js"
import {
  VMM_PROFILE_CENTER_ROUTE_NAME,
  VMM_PROFILE_BUNDLE_TEST_ROUTE_NAME,
  VMM_TUI_COLOR_BODY,
  VMM_TUI_COLOR_BORDER,
  VMM_TUI_COLOR_HINT,
  VMM_TUI_COLOR_MUTED,
  VMM_TUI_COLOR_SECTION,
  VMM_TUI_COLOR_STATUS_BUSY,
  VMM_TUI_COLOR_STATUS_IDLE,
  VMM_TUI_COLOR_SURFACE,
  VMM_TUI_COLOR_TITLE,
  VMM_TUI_PANEL_HEADER_HEIGHT,
  VMM_TUI_PANEL_OUTER_GAP,
  VMM_TUI_PANEL_VERTICAL_PADDING,
  VMM_TUI_LEFT_PANE_WIDTH,
  VmmDialogHost,
  VmmCompactListRow,
  VmmListRow,
  VmmProfileTableHeaderRow,
  VmmProfileTableRow,
  VmmScrollColumn,
  VmmSectionBox,
  buildProfileNodePlw,
  buildVmmRowRenderableId,
  buildVmmTuiTransportConfig,
  clearVmmDialog,
  createVmmTuiLocaleState,
  formatEpochMillisecondsAsLocalDate,
  formatTuiProfileSourceKind,
  formatTuiProfileTarget,
  openVmmConfirmDialog,
  openVmmInfoDialog,
  openVmmPendingDialog,
  openVmmSettingScreen,
  openVmmTextPrompt,
  isVmmDialogOpen,
  replaceVmmDialog,
  resolveProfileBindingScope,
  setVmmDialogLanguage,
  summarizeGrpcResult,
  truncateForList,
  writeVmmTuiLog,
  VmmSelectDialogView,
  type VmmTuiProfileTarget,
} from "./vmm-tui.js"

/**
 * Thin wrapper around the standard OpenTUI text table renderable.
 * 对标准 OpenTUI 文本表格渲染器做的一层薄包装。
 *
 * OpenTUI Solid currently stringifies every prop named `content`, which is
 * correct for text renderables but breaks `TextTableRenderable` because the
 * table expects a two-dimensional row matrix. The profile detail pane uses
 * this wrapper so it can pass the real table payload through `tableContent`
 * without being coerced into a plain string first.
 * OpenTUI Solid 当前会把所有名为 `content` 的属性先转成字符串，
 * 这对文本组件是正确的，但会破坏 `TextTableRenderable`，
 * 因为表格需要的是二维行列矩阵。
 * 画像详情区通过这层包装改走 `tableContent` 属性，
 * 避免真实表格数据在进入渲染器前先被压扁成普通字符串。
 */
class VmmTextTableRenderable extends TextTableRenderable {
  /**
   * Initialize the wrapped table with one safe empty matrix.
   * 用一份安全的空矩阵初始化包装表格。
   *
   * OpenTUI may apply visual props before the detail pane pushes the real
   * table payload through `tableContent`. The profile workspace uses this
   * constructor guard so intermediate prop updates never see an undefined
   * backing matrix and crash the whole TUI process.
   * OpenTUI 可能会在详情面板通过 `tableContent` 推送真实表格数据之前，
   * 先应用一批外观属性。这里用构造期兜底，是为了让这些中间态属性更新
   * 永远拿到一份已初始化的底层矩阵，避免整个 TUI 进程因为 `undefined`
   * 的表格内容直接崩掉。
   */
  public constructor(
    ctx: ConstructorParameters<typeof TextTableRenderable>[0],
    options?: ConstructorParameters<typeof TextTableRenderable>[1],
  ) {
    super(ctx, {
      ...options,
      content: options?.content ?? [],
    })
  }

  /**
   * Alias getter used by the custom JSX bridge.
   * 自定义 JSX 桥接使用的别名读取器。
   */
  public get tableContent(): TextTableContent {
    return this.content
  }

  /**
   * Alias setter used by the custom JSX bridge.
   * 自定义 JSX 桥接使用的别名写入器。
   */
  public set tableContent(value: TextTableContent | undefined) {
    this.content = value ?? []
  }
}

/**
 * Register the OpenTUI text-table renderable for this feature module.
 * 为当前功能模块注册 OpenTUI 标准文本表格渲染器。
 *
 * The rebuilt profile center needs a proper detail table instead of another
 * prose list, so the module extends the intrinsic component catalogue once
 * and then reuses the standard table renderable inside the detail pane.
 * 重建后的画像中心需要真正的详情表格，而不是另一段说明式列表，
 * 因此这里会一次性扩展内建组件目录，
 * 之后就在详情面板里复用标准表格渲染器。
 */
declare module "@opentui/solid" {
  interface OpenTUIComponents {
    text_table: typeof VmmTextTableRenderable
  }
}

extend({
  text_table: VmmTextTableRenderable,
})

/**
 * Fixed launcher entry shown before the operator enters one profile workspace.
 * 进入画像工作区前展示的一条固定启动器选项。
 */
type VmmProfileLauncherItem = {
  id: VmmTuiProfileTarget
  title: string
  subtitle: string
}

/**
 * Action entry rendered in the left-side vertical action list.
 * 渲染在左侧竖向动作列表里的一条动作项。
 */
type VmmProfileActionItem = {
  id: "add-profile" | "refresh-profile"
  title: string
  subtitle: string
}

/**
 * Action entry rendered in the standalone full-profile bundle test screen.
 * 独立完整画像 bundle 测试页左侧渲染的一条动作项。
 *
 * The screen is intentionally disposable, so it keeps only one refresh action
 * that can be removed later without touching the main profile-center workflow.
 * 这个测试页本身就是临时链路，因此这里只保留一条刷新动作，
 * 后续要删除时就不需要再碰主画像中心那条稳定工作流。
 */
type VmmProfileBundleTestActionItem = {
  id: "refresh-bundle"
  title: string
  subtitle: string
}

/**
 * Focusable area inside the full-screen profile workspace.
 * 全屏画像工作区内部可获得焦点的区域。
 */
type VmmProfileWorkspaceArea = "actions" | "nodes" | "filter"

/**
 * Props for the profile-detail table wrapper.
 * 画像详情表包装组件使用的属性。
 */
type VmmProfileDetailTableProps = {
  content: TextTableContent
}

/**
 * Convert one plain string into one TextTable cell payload.
 * 把一条普通字符串转换成 TextTable 单元格可消费的内容结构。
 */
function toVmmTableCell(text: string): TextChunk[] {
  return [
    {
      __isChunk: true,
      text,
    },
  ]
}

/**
 * Build the fixed launcher entries for the profile target selector dialog.
 * 为画像目标选择对话框构建固定启动项。
 *
 * The selector keeps the first line in stable uppercase English while the
 * second line stays localized, mirroring the rest of the setting center.
 * 这个选择框会把第一行固定成稳定的大写英文，
 * 第二行继续使用本地化说明，与设置中心其他入口保持一致。
 */
function buildProfileLauncherItems(language: VmmLanguage): VmmProfileLauncherItem[] {
  return [
    {
      id: "user",
      title: "USER",
      subtitle: tVmmTui(language, "profile_target_user_launcher"),
    },
    {
      id: "project",
      title: "PROJECT",
      subtitle: tVmmTui(language, "profile_target_project_launcher"),
    },
    {
      id: "space",
      title: "SPACE",
      subtitle: tVmmTui(language, "profile_target_space_launcher"),
    },
    {
      id: "team",
      title: "TEAM",
      subtitle: tVmmTui(language, "profile_target_team_launcher"),
    },
  ]
}

/**
 * Build the fixed action list used by the profile workspace.
 * 为画像工作区构建固定动作列表。
 */
function buildProfileActionItems(language: VmmLanguage): VmmProfileActionItem[] {
  return [
    {
      id: "add-profile",
      title: tVmmTui(language, "profile_center_add_title"),
      subtitle: tVmmTui(language, "profile_workspace_action_add_subtitle"),
    },
    {
      id: "refresh-profile",
      title: tVmmTui(language, "profile_center_refresh_title"),
      subtitle: tVmmTui(language, "profile_workspace_action_refresh_subtitle"),
    },
  ]
}

/**
 * Build the fixed action list used by the standalone bundle test screen.
 * 为独立 bundle 测试页构建固定动作列表。
 */
function buildProfileBundleTestActionItems(language: VmmLanguage): VmmProfileBundleTestActionItem[] {
  return [
    {
      id: "refresh-bundle",
      title: tVmmTui(language, "profile_bundle_test_refresh_title"),
      subtitle: tVmmTui(language, "profile_bundle_test_refresh_subtitle"),
    },
  ]
}

/**
 * Assemble one display-ready full bundle text from the backend response.
 * 从后端响应里组装出一段可直接展示的完整 bundle 文本。
 *
 * The plugin uses this test page only to inspect the FULL bundle path, so the
 * visible text mirrors the backend-owned `combined_text` directly.
 * 这个测试页当前只用于检查 FULL bundle 路径，
 * 因此界面文本会直接镜像后端权威提供的 `combined_text`。
 */
function buildProfileBundleDisplayText(
  language: VmmLanguage,
  response: VmmGrpcGetProfileBundleResponse | undefined,
) {
  if (!response) return tVmmTui(language, "profile_bundle_test_empty")
  return response.combined_text.trim() || tVmmTui(language, "profile_bundle_test_empty")
}

/**
 * Check whether one active node matches the current profile filter text.
 * 判断一条 active 节点是否匹配当前画像过滤文本。
 *
 * The filter intentionally searches both visible labels and raw backend values
 * so operators can narrow by content, source, ids, or dates from one input.
 * 过滤会同时检索可见标签和后端原始值，
 * 这样操作者可以通过同一个输入框按内容、来源、编号或日期缩小范围。
 */
function matchesProfileNodeFilter(
  node: VmmGrpcProfileNodeEntry,
  language: VmmLanguage,
  normalizedFilter: string,
) {
  if (!normalizedFilter) return true
  const haystack = [
    node.profile_node_id,
    node.bind_id,
    node.content,
    node.priority,
    node.level,
    String(node.refresh_weight),
    node.profile_date,
    node.expires_timestamp,
    node.level_reason,
    node.source_id,
    buildProfileNodePlw(node),
    formatTuiProfileTarget(language, normalizeProfileTargetToken(node.target)),
    formatTuiProfileSourceKind(language, node.source_kind),
    formatEpochMillisecondsAsLocalDate(node.expires_timestamp),
  ]
    .join(" ")
    .toLowerCase()
  return haystack.includes(normalizedFilter)
}

/**
 * Build the structured metadata table for the inspected profile node.
 * 为当前查看中的画像节点构建结构化字段表格。
 *
 * The detail area now renders structured metadata as two horizontal rows:
 * one header row plus one value row. That keeps the lower pane compact while
 * still exposing every machine-oriented field at one glance.
 * 详情区现在会把结构化元数据渲染成“两条横向行”：
 * 第一行是字段名，第二行是字段值。
 * 这样下方面板可以保持紧凑，同时仍然一次性展示所有面向机器的字段。
 */
function buildProfileStructuredDetailTableContent(
  language: VmmLanguage,
  node: VmmGrpcProfileNodeEntry,
): TextTableContent {
  return [
    [
      toVmmTableCell(tVmmTui(language, "profile_detail_field_node_id")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_target")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_bind_id")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_plw")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_priority")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_level")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_refresh_weight")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_profile_date")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_expires")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_source")),
      toVmmTableCell(tVmmTui(language, "profile_detail_field_source_id")),
    ],
    [
      toVmmTableCell(`#${node.profile_node_id}`),
      toVmmTableCell(formatTuiProfileTarget(language, normalizeProfileTargetToken(node.target))),
      toVmmTableCell(node.bind_id || "-"),
      toVmmTableCell(buildProfileNodePlw(node)),
      toVmmTableCell(node.priority || "-"),
      toVmmTableCell(node.level || "-"),
      toVmmTableCell(String(node.refresh_weight)),
      toVmmTableCell(node.profile_date || "-"),
      toVmmTableCell(formatEpochMillisecondsAsLocalDate(node.expires_timestamp)),
      toVmmTableCell(formatTuiProfileSourceKind(language, node.source_kind)),
      toVmmTableCell(node.source_id || "-"),
    ],
  ]
}

/**
 * Build the detail title for the currently inspected profile node.
 * 为当前查看中的画像节点构建详情标题。
 *
 * The title appends the inspected node id so operators can always tell which
 * row the lower pane is describing, even after filtering or moving selection.
 * 标题会追加当前查看节点的编号，
 * 这样即使在过滤或切换选中项之后，操作者也能立刻看出下方面板描述的是哪一条记录。
 */
function buildProfileDetailsTitle(
  language: VmmLanguage,
  node: VmmGrpcProfileNodeEntry | undefined,
) {
  const baseTitle = tVmmTui(language, "profile_center_details_title")
  if (!node) return baseTitle
  return `${baseTitle} (#${node.profile_node_id})`
}

/**
 * Normalize one long-form text field for direct detail rendering.
 * 规范化一条长文本字段，供详情区直接渲染。
 */
function normalizeProfileNarrativeText(value: string | undefined) {
  return value?.trim() || "-"
}

/**
 * Render one stable OpenTUI detail table inside the profile detail pane.
 * 在画像详情面板中渲染一张稳定的 OpenTUI 详情表。
 *
 * The wrapper pushes the row matrix through the renderable ref instead of the
 * `content` JSX prop, because the current OpenTUI Solid reconciler coerces any
 * prop named `content` into a plain string before it reaches custom elements.
 * 这个包装组件会通过 renderable ref 把二维表格数据写进去，
 * 而不是直接使用 `content` JSX 属性，
 * 因为当前 OpenTUI Solid 协调器会先把所有名为 `content` 的属性压成普通字符串，
 * 自定义表格元素一旦走这条路径就会收到错误的数据结构。
 */
const VmmProfileDetailTableView = (props: VmmProfileDetailTableProps) => {
  let tableRef: VmmTextTableRenderable | undefined

  /**
   * Keep the underlying table content synchronized with the currently
   * inspected node, so selecting a different node only replaces row data
   * without rebuilding the entire detail container.
   * 让底层表格内容持续与当前查看节点保持同步，
   * 这样切换节点时只会替换行数据，而不会把整个详情容器销毁重建。
   */
  createEffect(() => {
    if (!tableRef) return
    tableRef.tableContent = props.content
  })

  return (
    <text_table
      ref={(node: VmmTextTableRenderable) => {
        tableRef = node
      }}
      wrapMode="word"
      columnWidthMode="full"
      columnFitter="balanced"
      cellPadding={0}
      showBorders
      outerBorder
      borderColor={VMM_TUI_COLOR_BORDER}
      fg={VMM_TUI_COLOR_BODY}
      backgroundColor={VMM_TUI_COLOR_SURFACE}
    />
  )
}

/**
 * Dedicated VMM profile-center route.
 * 独立的 VMM 画像中心路由。
 */
/**
 * Normalize one backend profile target enum into the route-level target token.
 * 把后端画像目标枚举归一化成当前路由使用的目标 token。
 */
function normalizeProfileTargetToken(
  target: VmmGrpcProfileNodeEntry["target"],
): VmmTuiProfileTarget {
  switch (target) {
    case "PROFILE_TARGET_PROJECT":
      return "project"
    case "PROFILE_TARGET_TEAM":
      return "team"
    case "PROFILE_TARGET_SPACE":
      return "space"
    default:
      return "user"
  }
}

/**
 * Dedicated VMM profile-center route.
 * 独立的 VMM 画像中心路由。
 */
export const VmmProfileCenterScreen = (props: { api: TuiPluginApi }) => {
  const locale = createVmmTuiLocaleState(props.api)
  const language = locale.language
  const [selectedTarget, setSelectedTarget] = createSignal<VmmTuiProfileTarget | null>(null)
  /**
   * Keep one explicit selector-intent flag for the lightweight target picker.
   * 为轻量目标选择框维护一条显式的“应该显示”状态标记。
   *
   * The profile route now starts from one compact dialog instead of a full
   * screen launcher. When the dialog closes unexpectedly before navigation
   * finishes, this flag lets the route decide whether it should reopen the
   * selector or leave the profile center entirely.
   * 画像路由现在从一个紧凑对话框起步，而不是旧的全屏启动页。
   * 如果对话框在路由跳转完成前意外关闭，这个标记能帮助当前路由判断：
   * 是应该重新弹出选择框，还是直接离开画像中心。
   */
  const [selectorExpected, setSelectorExpected] = createSignal(true)
  const [selectedNodeId, setSelectedNodeId] = createSignal("")
  const [inspectedNodeId, setInspectedNodeId] = createSignal("")
  const [selectedActionId, setSelectedActionId] =
    createSignal<VmmProfileActionItem["id"]>("add-profile")
  const [activeArea, setActiveArea] = createSignal<VmmProfileWorkspaceArea>("nodes")
  const [filterText, setFilterText] = createSignal("")
  const [nodes, setNodes] = createSignal<ReadonlyArray<VmmGrpcProfileNodeEntry>>([])
  const [isLoading, setIsLoading] = createSignal(false)
  const [statusMessage, setStatusMessage] = createSignal(
    tVmmTui(language(), "profile_center_launcher_status_idle"),
  )
  /**
   * Guard the tiny gap between selector close and workspace activation.
   * 保护选择框关闭与工作区激活之间的那一小段过渡窗口。
   *
   * The profile route self-heals by reopening the target selector when the
   * route is alive but no target is active. During a real selection we
   * briefly clear the dialog before the workspace becomes visible, so this
   * flag prevents the self-healing effect from treating that transition as
   * an unexpected cancel and navigating back to the setting home.
   * 画像路由会在“路由还活着但没有选中目标”时自愈地重新弹出选择框。
   * 真正完成一次选择时，对话框会在工作区可见前经历一小段关闭瞬间，
   * 这个标记就是为了让自愈逻辑不要把那段正常过渡误判成异常取消，
   * 从而错误地跳回设置首页。
   */
  const [selectorTransitioning, setSelectorTransitioning] = createSignal(false)
  let filterInputRef: InputRenderable | undefined
  let selectorOpenScheduled = false

  /**
   * Move the workspace interaction focus to one logical area.
   * 把工作区交互焦点切换到一个逻辑区域。
   *
   * The profile workspace mixes one live filter input with keyboard-driven
   * action and node lists. This helper keeps the input focused only while the
   * filter area is active, so Enter inside the search box no longer leaks into
   * the global "inspect node" shortcut.
   * 画像工作区同时存在实时过滤输入框和键盘驱动的动作/节点列表。
   * 这个辅助函数会只在过滤区域激活时保留输入焦点，
   * 这样搜索框里的 Enter 就不会再泄漏成全局“查看节点详情”的快捷键。
   */
  const setWorkspaceArea = (nextArea: VmmProfileWorkspaceArea) => {
    setActiveArea(nextArea)
    if (nextArea === "filter") {
      queueMicrotask(() => {
        filterInputRef?.focus()
      })
      return
    }
    filterInputRef?.blur()
  }

  /**
   * Keep one reusable action list for the full-screen profile workspace.
   * 为全屏画像工作区维护一组固定动作列表。
   */
  const actionItems = createMemo(() => buildProfileActionItems(language()))

  /**
   * Filter the current node set through the workspace filter box.
   * 通过工作区过滤框筛选当前节点集合。
   */
  const filteredNodes = createMemo(() => {
    const normalizedFilter = filterText().trim().toLowerCase()
    return nodes().filter((node) => matchesProfileNodeFilter(node, language(), normalizedFilter))
  })

  /**
   * Keep the selected node valid after reloads or filter changes.
   * 在重载或过滤变化后，持续保持当前节点选中项有效。
   */
  createEffect(() => {
    const current = selectedNodeId()
    const currentNodes = filteredNodes()
    if (currentNodes.some((node) => String(node.profile_node_id) === current)) return
    setSelectedNodeId(String(currentNodes[0]?.profile_node_id ?? ""))
  })

  /**
   * Keep the inspected node valid after reloads or filter changes.
   * 在重载或过滤变化后，持续保持当前详情查看节点有效。
   */
  createEffect(() => {
    const current = inspectedNodeId()
    const currentNodes = filteredNodes()
    if (!current) return
    if (currentNodes.some((node) => String(node.profile_node_id) === current)) return
    setInspectedNodeId("")
  })

  /**
   * Keep custom dialogs aligned with the current route language.
   * 让自定义对话框持续跟随当前路由语言。
   */
  createEffect(() => {
    setVmmDialogLanguage(language())
  })

  /**
   * Keep the filter input focused while the workspace is visible.
   * 在工作区可见期间持续保持过滤输入框焦点。
   */
  createEffect(() => {
    if (!selectedTarget()) return
    if (activeArea() !== "filter") return
    queueMicrotask(() => {
      filterInputRef?.focus()
    })
  })

  /**
   * Open one selected profile target from the shared selector dialog.
   * 从共享选择对话框里打开一个画像目标并进入工作区。
   */
  const openProfileWorkspace = (target: VmmTuiProfileTarget) => {
    setSelectorExpected(false)
    setSelectedTarget(target)
    setFilterText("")
    setSelectedActionId("add-profile")
    setActiveArea("filter")
    setNodes([])
    setSelectedNodeId("")
    setInspectedNodeId("")
    void reloadProfileNodes(`open:${target}`)
  }

  /**
   * Present the compact target selector before the operator enters one workspace.
   * 在操作者进入具体画像工作区前，弹出紧凑目标选择框。
   *
   * The initial selector should not occupy the whole screen anymore. Instead,
   * the route opens one shared select dialog, then enters the full workspace
   * only after the user explicitly picks USER / PROJECT / SPACE / TEAM.
   * 初始选择不再占满整个页面，而是直接弹出共享选择框；
   * 只有当用户明确选择 USER / PROJECT / SPACE / TEAM 之后，
   * 才会进入真正的全屏画像工作区。
   */
  const openProfileTargetSelector = async () => {
    const config = await locale.refreshConfig()
    if (props.api.route.current.name !== VMM_PROFILE_CENTER_ROUTE_NAME) return
    const currentLanguage = config.language
    setVmmDialogLanguage(currentLanguage)
    let hasSelected = false
    replaceVmmDialog(() => (
      <VmmSelectDialogView
        language={currentLanguage}
        title={tVmmTui(currentLanguage, "profile_center_launcher_title")}
        contentLines={[tVmmTui(currentLanguage, "profile_center_launcher_subtitle")]}
        options={buildProfileLauncherItems(currentLanguage).map((item) => ({
          value: item.id,
          title: item.title,
          subtitle: item.subtitle,
        }))}
        onCancel={() => {
          setSelectorExpected(false)
          clearVmmDialog()
          openVmmSettingScreen(props.api)
        }}
        onSelect={(value: string) => {
          if (hasSelected) return
          if (!["user", "project", "space", "team"].includes(value)) return
          hasSelected = true
          setSelectorTransitioning(true)
          openProfileWorkspace(value as VmmTuiProfileTarget)
          clearVmmDialog()
          queueMicrotask(() => {
            setSelectorTransitioning(false)
          })
        }}
      />
    ))
  }

  /**
   * Return from one workspace back to the compact target selector.
   * 从具体画像工作区返回到紧凑目标选择框。
   *
   * The rebuilt flow should keep the selection step lightweight. Returning
   * from USER/PROJECT/SPACE/TEAM should therefore reopen the selector dialog
   * instead of restoring the old full-screen launcher shell.
   * 重建后的流程应该让目标选择保持轻量。
   * 因此从 USER / PROJECT / SPACE / TEAM 返回时，
   * 应该重新弹出选择框，而不是恢复旧的全屏启动页。
   */
  const closeProfileWorkspace = () => {
    setSelectorExpected(true)
    setSelectedTarget(null)
    setActiveArea("filter")
    setFilterText("")
    setNodes([])
    setSelectedNodeId("")
    setInspectedNodeId("")
    setStatusMessage(tVmmTui(language(), "profile_center_launcher_status_idle"))
  }

  /**
   * Keep the compact selector and route exit behavior in one self-healing effect.
   * 用一个自愈 effect 统一维护紧凑选择框和路由退出行为。
   *
   * The compact selector can disappear one render earlier than route navigation
   * finishes. When that happens we either reopen the selector or leave the
   * profile route, so the user never lands on one blank in-between shell.
   * 紧凑选择框有可能比路由跳转更早消失。
   * 这时要么重新弹出选择框，要么直接离开画像路由，
   * 避免用户落到一个中间态的空白壳页面。
   */
  createEffect(() => {
    if (props.api.route.current.name !== VMM_PROFILE_CENTER_ROUTE_NAME) return
    if (selectedTarget()) return
    if (isVmmDialogOpen()) return
    if (selectorTransitioning()) return

    if (selectorExpected()) {
      if (selectorOpenScheduled) return
      selectorOpenScheduled = true
      queueMicrotask(() => {
        selectorOpenScheduled = false
        void openProfileTargetSelector()
      })
      return
    }

    openVmmSettingScreen(props.api)
  })

  /**
   * Reload the active nodes for the currently selected profile target.
   * 重新加载当前选中画像目标的 active 节点。
   */
  const reloadProfileNodes = async (reason: string) => {
    setIsLoading(true)
    setStatusMessage(tVmmTui(language(), "profile_center_loading"))
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const currentTarget = selectedTarget()
    if (!currentTarget) {
      setNodes([])
      setStatusMessage(tVmmTui(currentLanguage, "profile_center_launcher_status_idle"))
      setIsLoading(false)
      return
    }

    const resolvedScope = resolveProfileBindingScope(config, currentTarget)
    if (!resolvedScope) {
      setNodes([])
      setSelectedNodeId("")
      setInspectedNodeId("")
      setStatusMessage(
        currentTarget === "user"
          ? tVmmTui(currentLanguage, "profile_center_no_binding_user")
          : tVmmTui(currentLanguage, "profile_center_no_binding_project"),
      )
      setIsLoading(false)
      return
    }

    const result = await callVmmTuiGetProfileNodes({
      request: {
        target: resolvedScope.target,
        user_id: resolvedScope.userID,
        project_id: resolvedScope.projectID,
        limit: 256,
      },
      config: buildVmmTuiTransportConfig(config),
    })

    writeVmmTuiLog("vmm.tui.profile_center.reload", {
      reason,
      target: currentTarget,
      ok: result.ok,
      details: result.details,
      grpcCodeName: result.grpcCodeName,
      timedOutPhase: result.timedOutPhase,
      nodeCount: result.response?.nodes?.length ?? 0,
    })

    if (!result.ok) {
      setNodes([])
      setSelectedNodeId("")
      setInspectedNodeId("")
      setStatusMessage(
        summarizeGrpcResult(
          currentLanguage,
          tVmmTui(currentLanguage, "profile_center_refresh_title"),
          result,
        ),
      )
      setIsLoading(false)
      return
    }

    const nextNodes = result.response?.nodes ?? []
    setNodes(nextNodes)
    setStatusMessage(
      nextNodes.length
        ? tVmmTui(currentLanguage, "profile_center_loaded_nodes", {
            count: nextNodes.length,
          })
        : tVmmTui(currentLanguage, "profile_center_no_nodes"),
    )
    setIsLoading(false)
  }

  /**
   * Apply one manual profile instruction onto the current target.
   * 把一条手工画像指令应用到当前目标上。
   */
  const applyProfileInstruction = async (instruction: string) => {
    const config = await locale.refreshConfig()
    const currentLanguage = config.language
    const currentTarget = selectedTarget()
    if (!currentTarget) return
    const resolvedScope = resolveProfileBindingScope(config, currentTarget)
    if (!resolvedScope) {
      setStatusMessage(
        currentTarget === "user"
          ? tVmmTui(currentLanguage, "profile_center_no_binding_user")
          : tVmmTui(currentLanguage, "profile_center_no_binding_project"),
      )
      return
    }

    const runApply = async () => {
      setStatusMessage(tVmmTui(currentLanguage, "profile_center_applying"))
      const closePendingDialog = openVmmPendingDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "profile_center_toast_title"),
        message: tVmmTui(currentLanguage, "profile_center_applying"),
      })

      const result = await (async () => {
        try {
          return await callVmmTuiApplyProfileInstruction({
            request: {
              target: resolvedScope.target,
              user_id: resolvedScope.userID,
              project_id: resolvedScope.projectID,
              instruction,
            },
            config: buildVmmTuiTransportConfig(config),
          })
        } finally {
          closePendingDialog()
        }
      })()

      writeVmmTuiLog("vmm.tui.profile_center.apply", {
        target: currentTarget,
        ok: result.ok,
        details: result.details,
        grpcCodeName: result.grpcCodeName,
        timedOutPhase: result.timedOutPhase,
        acceptedCount: result.response?.accepted_nodes?.length ?? 0,
        retiredCount: result.response?.retired_nodes?.length ?? 0,
      })

      if (!result.ok) {
        const message = summarizeGrpcResult(
          currentLanguage,
          tVmmTui(currentLanguage, "profile_center_add_title"),
          result,
        )
        setStatusMessage(message)
        openVmmInfoDialog({
          api: props.api,
          title: tVmmTui(currentLanguage, "profile_center_toast_title"),
          message,
        })
        return
      }

      const successMessage = tVmmTui(currentLanguage, "profile_center_applied", {
        accepted: result.response?.accepted_nodes?.length ?? 0,
        retired: result.response?.retired_nodes?.length ?? 0,
      })
      setStatusMessage(successMessage)
      openVmmInfoDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "profile_center_toast_title"),
        message: successMessage,
      })
      await reloadProfileNodes("apply-profile")
    }

    if (currentTarget === "team" || currentTarget === "space") {
      openVmmConfirmDialog({
        api: props.api,
        title: tVmmTui(currentLanguage, "profile_center_confirm_title"),
        message: tVmmTui(currentLanguage, "profile_center_confirm_message"),
        onConfirm: () => {
          void runApply()
        },
      })
      return
    }

    void runApply()
  }

  /**
   * Execute the action highlighted in the left-side action list.
   * 执行左侧动作列表里当前高亮的动作。
   */
  const activateSelectedAction = () => {
    if (selectedActionId() === "refresh-profile") {
      void reloadProfileNodes("manual-refresh")
      return
    }

    const currentNode =
      filteredNodes().find((node) => String(node.profile_node_id) === inspectedNodeId()) ??
      filteredNodes().find((node) => String(node.profile_node_id) === selectedNodeId())
    const description =
      currentNode?.content
        ? `${tVmmTui(language(), "profile_center_add_prompt_description")} [${truncateForList(currentNode.content, 48)}]`
        : tVmmTui(language(), "profile_center_add_prompt_description")

    openVmmTextPrompt({
      api: props.api,
      language: language(),
      title: tVmmTui(language(), "profile_center_add_prompt_title"),
      placeholder: tVmmTui(language(), "profile_center_add_prompt_placeholder"),
      description,
      emptyMessage: tVmmTui(language(), "profile_center_add_prompt_empty"),
      toastTitle: tVmmTui(language(), "profile_center_toast_title"),
      onConfirmValue: (value) => {
        void applyProfileInstruction(value)
      },
    })
  }

  /**
   * Promote the current node selection into the inspected detail target.
   * 把当前节点选中项提升为详情区真正查看的目标。
   */
  const inspectSelectedNode = () => {
    if (!selectedNodeId()) return
    setInspectedNodeId(selectedNodeId())
    setWorkspaceArea("nodes")
  }

  /**
   * Keep one computed handle to the currently inspected node.
   * 维护一条指向当前查看节点的计算句柄。
   */
  const inspectedNode = createMemo(
    () => filteredNodes().find((node) => String(node.profile_node_id) === inspectedNodeId()),
  )

  /**
   * Build the detail table content for the currently inspected node.
   * 为当前查看节点构建详情表格内容。
   */
  const detailStructuredTableContent = createMemo(() => {
    const currentNode = inspectedNode()
    if (!currentNode) return undefined
    return buildProfileStructuredDetailTableContent(language(), currentNode)
  })

  /**
   * Keep one detail-pane title aligned with the inspected node.
   * 让详情面板标题持续与当前查看节点保持对齐。
   */
  const detailTitle = createMemo(() => buildProfileDetailsTitle(language(), inspectedNode()))

  useKeyboard((event) => {
    if (props.api.route.current.name !== VMM_PROFILE_CENTER_ROUTE_NAME) return
    if (isVmmDialogOpen()) return
    if (!selectedTarget()) {
      if (event.name === "escape") {
        event.preventDefault()
        event.stopPropagation()
        openVmmSettingScreen(props.api)
      }
      return
    }

    if (["left", "right"].includes(event.name)) {
      const actions = actionItems()
      const currentIndex = actions.findIndex((item) => item.id === selectedActionId())
      const safeIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex =
        event.name === "left"
          ? (safeIndex - 1 + actions.length) % actions.length
          : (safeIndex + 1 + actions.length) % actions.length
      event.preventDefault()
      event.stopPropagation()
      setSelectedActionId(actions[nextIndex]?.id ?? actions[0]?.id ?? "add-profile")
      setWorkspaceArea("actions")
      return
    }

    if (["up", "down", "j", "k"].includes(event.name)) {
      const currentNodes = filteredNodes()
      if (currentNodes.length === 0) return
      const currentIndex = currentNodes.findIndex(
        (node) => String(node.profile_node_id) === selectedNodeId(),
      )
      const safeIndex = currentIndex >= 0 ? currentIndex : 0
      const nextIndex =
        event.name === "up" || event.name === "k"
          ? (safeIndex - 1 + currentNodes.length) % currentNodes.length
          : (safeIndex + 1 + currentNodes.length) % currentNodes.length
      event.preventDefault()
      event.stopPropagation()
      setWorkspaceArea("nodes")
      setSelectedNodeId(String(currentNodes[nextIndex]?.profile_node_id ?? ""))
      return
    }

    if (["return", "enter", "linefeed"].includes(event.name)) {
      if (filterInputRef?.focused || activeArea() === "filter") {
        event.preventDefault()
        event.stopPropagation()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (activeArea() === "actions") {
        activateSelectedAction()
        return
      }
      inspectSelectedNode()
      return
    }

    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      closeProfileWorkspace()
    }
  })

  return (
    <>
      <box
        width="100%"
        height="100%"
        backgroundColor={VMM_TUI_COLOR_SURFACE}
        flexDirection="column"
        paddingTop={VMM_TUI_PANEL_VERTICAL_PADDING}
        paddingBottom={VMM_TUI_PANEL_VERTICAL_PADDING}
        paddingLeft={2}
        paddingRight={2}
        gap={VMM_TUI_PANEL_OUTER_GAP}
        onMouseUp={(event) => {
          if (event.button !== MouseButton.RIGHT) return
          event.stopPropagation()
          event.preventDefault()
          if (selectedTarget()) {
            closeProfileWorkspace()
            return
          }
          openVmmSettingScreen(props.api)
        }}
      >
        <box width="100%" alignItems="center" justifyContent="center" height={VMM_TUI_PANEL_HEADER_HEIGHT}>
          <ascii_font
            text="VULCAN PLUGINS"
            font="tiny"
            color="#ffffff"
            backgroundColor="transparent"
          />
        </box>
        {!selectedTarget() ? (
          <box width="100%" flexGrow={1} alignItems="center" justifyContent="center">
            <text fg={VMM_TUI_COLOR_STATUS_IDLE}>{statusMessage()}</text>
          </box>
        ) : (
          <box width="100%" flexGrow={1} flexDirection="row" gap={1}>
            <box width={VMM_TUI_LEFT_PANE_WIDTH} minHeight={0} flexDirection="column">
              <VmmSectionBox title={tVmmTui(language(), "profile_center_section_actions")} flexGrow={1}>
                <VmmScrollColumn
                  selectedChildId={buildVmmRowRenderableId("profile-actions", selectedActionId())}
                >
                  {actionItems().map((item) => (
                    <VmmListRow
                      rowId={buildVmmRowRenderableId("profile-actions", item.id)}
                      title={item.title}
                      subtitle={item.subtitle}
                      selected={item.id === selectedActionId() && activeArea() === "actions"}
                      onHover={() => {
                        setSelectedActionId(item.id)
                        setWorkspaceArea("actions")
                      }}
                      onPress={() => {
                        setSelectedActionId(item.id)
                        setWorkspaceArea("actions")
                        activateSelectedAction()
                      }}
                    />
                  ))}
                </VmmScrollColumn>
              </VmmSectionBox>
            </box>
            <box flexGrow={1} minHeight={0} flexDirection="column" gap={1}>
              <VmmSectionBox
                title={tVmmTui(language(), "profile_center_workspace_header", {
                  value: formatTuiProfileTarget(language(), selectedTarget()!),
                })}
                flexGrow={1}
              >
                <box
                  width="100%"
                  height={3}
                  border
                  borderColor={VMM_TUI_COLOR_SECTION}
                  flexDirection="row"
                  alignItems="center"
                  paddingLeft={1}
                  paddingRight={1}
                  onMouseUp={(event) => {
                    if (event.button !== MouseButton.LEFT) return
                    event.stopPropagation()
                    event.preventDefault()
                    setWorkspaceArea("filter")
                  }}
                >
                  <input
                    ref={filterInputRef}
                    width="100%"
                    value={filterText()}
                    placeholder={tVmmTui(language(), "profile_center_filter_placeholder")}
                    placeholderColor={VMM_TUI_COLOR_MUTED}
                    backgroundColor="transparent"
                    focusedBackgroundColor="transparent"
                    textColor={VMM_TUI_COLOR_BODY}
                    focusedTextColor={VMM_TUI_COLOR_TITLE}
                    cursorColor={VMM_TUI_COLOR_SECTION}
                    focused
                    onInput={(value) => {
                      setWorkspaceArea("filter")
                      setFilterText(value)
                    }}
                  />
                </box>
                <text fg={isLoading() ? VMM_TUI_COLOR_STATUS_BUSY : VMM_TUI_COLOR_STATUS_IDLE}>
                  {statusMessage()}
                </text>
                <box
                  width="100%"
                  minHeight={0}
                  flexGrow={1}
                  border
                  borderColor={VMM_TUI_COLOR_BORDER}
                  title={tVmmTui(language(), "profile_center_section_nodes")}
                  titleAlignment="center"
                  flexDirection="column"
                  padding={1}
                >
                  <VmmProfileTableHeaderRow language={language()} />
                  <VmmScrollColumn
                    selectedChildId={buildVmmRowRenderableId("profile-nodes", selectedNodeId())}
                    gap={0}
                  >
                    {filteredNodes().map((node) => (
                      <VmmProfileTableRow
                        rowId={buildVmmRowRenderableId(
                          "profile-nodes",
                          String(node.profile_node_id),
                        )}
                        language={language()}
                        node={node}
                        selected={
                          String(node.profile_node_id) === selectedNodeId() &&
                          activeArea() === "nodes"
                        }
                        onHover={() => {
                          setSelectedNodeId(String(node.profile_node_id))
                          setWorkspaceArea("nodes")
                        }}
                        onPress={() => {
                          setSelectedNodeId(String(node.profile_node_id))
                          setInspectedNodeId(String(node.profile_node_id))
                          setWorkspaceArea("nodes")
                        }}
                      />
                    ))}
                  </VmmScrollColumn>
                </box>
              </VmmSectionBox>
              <VmmSectionBox title={detailTitle()} flexGrow={1}>
                {detailStructuredTableContent() && inspectedNode() ? (
                  <scrollbox flexGrow={1} scrollY>
                    <box width="100%" minHeight={0} flexDirection="column" gap={1} paddingRight={1}>
                      <text fg={VMM_TUI_COLOR_SECTION}>
                        <b>{tVmmTui(language(), "profile_center_details_meta_title")}</b>
                      </text>
                      <VmmProfileDetailTableView content={detailStructuredTableContent()!} />
                      <text fg={VMM_TUI_COLOR_SECTION}>
                        <b>{tVmmTui(language(), "profile_detail_field_content")}</b>
                      </text>
                      <text fg={VMM_TUI_COLOR_BODY} wrapMode="word">
                        {normalizeProfileNarrativeText(inspectedNode()?.content)}
                      </text>
                      <text fg={VMM_TUI_COLOR_SECTION}>
                        <b>{tVmmTui(language(), "profile_detail_field_reason")}</b>
                      </text>
                      <text fg={VMM_TUI_COLOR_BODY} wrapMode="word">
                        {normalizeProfileNarrativeText(inspectedNode()?.level_reason)}
                      </text>
                    </box>
                  </scrollbox>
                ) : (
                  <box width="100%" flexGrow={1} alignItems="center" justifyContent="center">
                    <text fg={VMM_TUI_COLOR_MUTED}>
                      {tVmmTui(language(), "profile_center_details_hint")}
                    </text>
                  </box>
                )}
              </VmmSectionBox>
            </box>
          </box>
        )}
        <text fg={VMM_TUI_COLOR_HINT}>
          {selectedTarget()
            ? tVmmTui(language(), "profile_center_workspace_hint")
            : tVmmTui(language(), "profile_center_launcher_hint")}
        </text>
      </box>
      <VmmDialogHost />
    </>
  )
}

/**
 * Standalone TUI test screen for the full profile bundle RPC.
 * 用于测试完整画像 bundle RPC 的独立 TUI 页面。
 *
 * This screen is intentionally isolated from the profile center because the
 * user asked for one disposable test surface first. It fetches the backend's
 * FULL bundle for the current user/project pair and renders the raw text so
 * we can verify the transport before deciding how to inject it later.
 * 这个页面刻意独立于画像中心主流程，
 * 因为当前需求是先做一条后续可直接抛弃的测试链。
 * 它会针对当前 user/project 组合读取后端的 FULL bundle，
 * 并把原始文本直接渲染出来，先验证传输和内容，再决定后续注入点。
 */
export const VmmProfileBundleTestScreen = (props: { api: TuiPluginApi }) => {
  const locale = createVmmTuiLocaleState(props.api)
  const language = locale.language
  const [selectedActionId, setSelectedActionId] =
    createSignal<VmmProfileBundleTestActionItem["id"]>("refresh-bundle")
  const [bundleText, setBundleText] = createSignal("")
  const [statusMessage, setStatusMessage] = createSignal(
    tVmmTui(language(), "profile_bundle_test_status_idle"),
  )
  const [isLoading, setIsLoading] = createSignal(false)

  /**
   * Keep the single-action list in one computed handle so localized labels
   * refresh together with the current route language.
   * 用一个计算句柄维护这组单动作列表，
   * 让动作文案可以随当前路由语言一起刷新。
   */
  const actionItems = createMemo(() => buildProfileBundleTestActionItems(language()))

  /**
   * Synchronize custom dialog language with the test route language.
   * 让自定义对话框语言始终与测试路由语言保持同步。
   */
  createEffect(() => {
    setVmmDialogLanguage(language())
  })

  /**
   * Load the current FULL profile bundle for the effective user/project pair.
   * 为当前生效的 user/project 组合加载 FULL 画像 bundle。
   */
  const reloadBundle = async (reason: string) => {
    setIsLoading(true)
    setStatusMessage(tVmmTui(language(), "profile_bundle_test_loading"))

    const config = await locale.refreshConfig()
    const currentLanguage = config.language

    /**
     * The bundle RPC always needs both user and project ids because the backend
     * assembles TEAM/SPACE/PROJECT/USER text from one bound pair.
     * 这条 bundle RPC 固定需要 user 和 project 两个 id，
     * 因为它是基于一组绑定关系一次性拼出 TEAM / SPACE / PROJECT / USER 文本。
     */
    if (!config.userId || !config.projectId) {
      setBundleText("")
      setStatusMessage(tVmmTui(currentLanguage, "profile_bundle_test_missing_scope"))
      setIsLoading(false)
      return
    }

    const result = await callVmmTuiGetProfileBundle({
      request: {
        user_id: config.userId,
        project_id: config.projectId,
        mode: "PROFILE_BUNDLE_MODE_FULL",
        include_explanation: true,
      },
      config: buildVmmTuiTransportConfig(config),
    })

    writeVmmTuiLog("vmm.tui.profile_bundle_test.reload", {
      reason,
      ok: result.ok,
      details: result.details,
      grpcCodeName: result.grpcCodeName,
      timedOutPhase: result.timedOutPhase,
      traceId: result.response?.trace_id,
      combinedLength: result.response?.combined_text?.length ?? 0,
    })

    if (!result.ok) {
      setBundleText("")
      setStatusMessage(
        summarizeGrpcResult(
          currentLanguage,
          tVmmTui(currentLanguage, "profile_bundle_test_title"),
          result,
        ),
      )
      setIsLoading(false)
      return
    }

    setBundleText(buildProfileBundleDisplayText(currentLanguage, result.response))
    setStatusMessage(
      tVmmTui(currentLanguage, "profile_bundle_test_status_loaded", {
        count: result.response?.combined_text?.length ?? 0,
      }),
    )
    setIsLoading(false)
  }

  /**
   * Run the initial bundle fetch when the test screen mounts.
   * 在测试页挂载时执行第一次 bundle 拉取。
   */
  onMount(() => {
    void reloadBundle("route-open")
  })

  useKeyboard((event) => {
    if (props.api.route.current.name !== VMM_PROFILE_BUNDLE_TEST_ROUTE_NAME) return
    if (isVmmDialogOpen()) return

    if (["up", "down", "j", "k", "left", "right"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      setSelectedActionId("refresh-bundle")
      return
    }

    if (["return", "enter", "linefeed"].includes(event.name)) {
      event.preventDefault()
      event.stopPropagation()
      void reloadBundle("manual-refresh")
      return
    }

    if (event.name === "escape") {
      event.preventDefault()
      event.stopPropagation()
      openVmmSettingScreen(props.api)
    }
  })

  return (
    <>
      <box
        width="100%"
        height="100%"
        backgroundColor={VMM_TUI_COLOR_SURFACE}
        flexDirection="column"
        paddingTop={VMM_TUI_PANEL_VERTICAL_PADDING}
        paddingBottom={VMM_TUI_PANEL_VERTICAL_PADDING}
        paddingLeft={2}
        paddingRight={2}
        gap={VMM_TUI_PANEL_OUTER_GAP}
        onMouseUp={(event) => {
          if (event.button !== MouseButton.RIGHT) return
          event.stopPropagation()
          event.preventDefault()
          openVmmSettingScreen(props.api)
        }}
      >
        <box width="100%" alignItems="center" justifyContent="center" height={VMM_TUI_PANEL_HEADER_HEIGHT}>
          <ascii_font
            text="VULCAN PLUGINS"
            font="tiny"
            color="#ffffff"
            backgroundColor="transparent"
          />
        </box>
        <box width="100%" flexGrow={1} flexDirection="row" gap={1}>
          <box width={VMM_TUI_LEFT_PANE_WIDTH} minHeight={0} flexDirection="column">
            <VmmSectionBox title={tVmmTui(language(), "profile_bundle_test_section_actions")} flexGrow={1}>
              <VmmScrollColumn
                selectedChildId={buildVmmRowRenderableId("profile-bundle-test-actions", selectedActionId())}
              >
                {actionItems().map((item) => (
                  <VmmListRow
                    rowId={buildVmmRowRenderableId("profile-bundle-test-actions", item.id)}
                    title={item.title}
                    subtitle={item.subtitle}
                    selected={item.id === selectedActionId()}
                    onHover={() => {
                      setSelectedActionId(item.id)
                    }}
                    onPress={() => {
                      setSelectedActionId(item.id)
                      void reloadBundle("mouse-refresh")
                    }}
                  />
                ))}
              </VmmScrollColumn>
            </VmmSectionBox>
          </box>
          <box flexGrow={1} minHeight={0} flexDirection="column" gap={1}>
            <VmmSectionBox title={tVmmTui(language(), "profile_bundle_test_section_bundle")} flexGrow={1}>
              <text fg={isLoading() ? VMM_TUI_COLOR_STATUS_BUSY : VMM_TUI_COLOR_STATUS_IDLE}>
                {statusMessage()}
              </text>
              <scrollbox flexGrow={1} scrollY>
                <box width="100%" minHeight={0} flexDirection="column" paddingRight={1}>
                  <text fg={VMM_TUI_COLOR_BODY} wrapMode="word">
                    {bundleText() || tVmmTui(language(), "profile_bundle_test_empty")}
                  </text>
                </box>
              </scrollbox>
            </VmmSectionBox>
          </box>
        </box>
        <box width="100%" alignItems="center" justifyContent="center">
          <text fg={VMM_TUI_COLOR_HINT}>{tVmmTui(language(), "profile_bundle_test_keys_hint")}</text>
        </box>
      </box>
      <VmmDialogHost />
    </>
  )
}


