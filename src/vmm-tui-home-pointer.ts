/**
 * Pointer hit-testing helpers for the setting-center home launcher.
 * 设置中心首页启动器的鼠标命中换算辅助函数。
 *
 * This file belongs to the TUI interaction support layer. It is primarily used
 * by the setting home route to translate terminal mouse coordinates into
 * stable launcher rows while the Select renderable keeps scroll state
 * internally.
 * 这个文件属于 TUI 交互支撑层，主要服务于设置首页路由，
 * 在 Select 渲染器把滚动状态封装在内部时，仍然把终端鼠标坐标稳定地换算成启动器行索引。
 */

/**
 * Each launcher option consumes two terminal lines: title plus description.
 * 首页启动器里的每个选项占用两行终端高度：标题一行，描述一行。
 *
 * The home page intentionally mirrors the OpenTUI launcher style, so this
 * constant stays explicit here instead of being inferred from runtime nodes.
 * 首页刻意对齐 OpenTUI 启动器的展示风格，
 * 因此这里显式保留该常量，而不是在运行时从渲染节点反推。
 */
const VMM_SETTING_HOME_OPTION_LINES = 2

/**
 * Mouse hit-test input for one home-launcher Select interaction.
 * 首页启动器 Select 单次鼠标命中换算所需的输入参数。
 *
 * `scrollAnchorIndex` must come from the last keyboard- or filter-driven
 * stable selection. Reusing the post-hover selected index here would make one
 * stationary pointer keep shifting the computed row during resize repaint.
 * `scrollAnchorIndex` 必须来自最近一次由键盘导航或过滤结果确定的稳定选中项。
 * 如果这里直接复用 hover 之后的选中项，同一个静止鼠标点会在 resize 重绘时持续推动换算结果漂移。
 */
export interface VmmSettingHomeMouseIndexArgs {
  eventY: number
  selectY: number
  selectHeight: number
  scrollAnchorIndex: number
  optionCount: number
}

/**
 * Resolve how many launcher options can be visible inside the current Select.
 * 计算当前 Select 高度下首页启动器最多能展示多少个选项。
 *
 * Small terminal windows can shrink below the ideal layout, so the hit-test
 * logic clamps the visible option count to at least one row.
 * 小尺寸终端可能会把布局压得很窄，因此命中换算会把可见选项数量至少钳制为一行。
 */
function resolveVmmSettingHomeVisibleCount(selectHeight: number) {
  return Math.max(1, Math.floor(selectHeight / VMM_SETTING_HOME_OPTION_LINES))
}

/**
 * Reconstruct the current visible scroll offset for the home launcher list.
 * 反推出首页启动器列表当前可视窗口的滚动偏移。
 *
 * SelectRenderable keeps scroll state internally, so the home page mirrors the
 * same centering rule used by keyboard navigation when it has to translate one
 * pointer coordinate back into the underlying option index.
 * SelectRenderable 把滚动状态维护在内部，
 * 因此首页在把鼠标坐标反推成真实选项索引时，需要镜像键盘导航所使用的同一套居中规则。
 */
export function resolveVmmSettingHomeScrollOffset(
  selectedIndex: number,
  optionCount: number,
  visibleCount: number,
) {
  if (optionCount <= 0) return 0
  const halfVisible = Math.floor(visibleCount / 2)
  return Math.max(0, Math.min(selectedIndex - halfVisible, optionCount - visibleCount))
}

/**
 * Convert one mouse event on the launcher Select into the hovered option index.
 * 把首页 Select 上的一条鼠标事件换算成当前悬停的选项索引。
 *
 * The hit-test uses the frozen `scrollAnchorIndex` instead of the latest
 * hover-mutated selection. This avoids the feedback loop where resize repaint
 * keeps changing the anchor and drives CPU-heavy selection thrashing.
 * 这里刻意使用冻结后的 `scrollAnchorIndex`，而不是最新一次被 hover 改写的选中项。
 * 这样可以避免 resize 重绘不断改变锚点，进而触发高 CPU 的选中项抖动反馈环。
 */
export function resolveVmmSettingHomeMouseIndex(args: VmmSettingHomeMouseIndexArgs) {
  if (args.optionCount <= 0 || args.selectHeight <= 0) return null
  const localY = args.eventY - args.selectY
  if (localY < 0 || localY >= args.selectHeight) return null
  const visibleCount = resolveVmmSettingHomeVisibleCount(args.selectHeight)
  const visibleRowIndex = Math.floor(localY / VMM_SETTING_HOME_OPTION_LINES)
  const scrollOffset = resolveVmmSettingHomeScrollOffset(
    args.scrollAnchorIndex,
    args.optionCount,
    visibleCount,
  )
  const hoveredIndex = scrollOffset + visibleRowIndex
  if (hoveredIndex < 0 || hoveredIndex >= args.optionCount) return null
  return hoveredIndex
}
