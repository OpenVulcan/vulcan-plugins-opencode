/** @jsxImportSource @opentui/solid */
/**
 * Local file-entry wrapper for the VMM TUI diagnostic plugin.
 * VMM TUI 诊断插件的本地文件入口包装器。
 *
 * This file belongs to the host-entry layer. OpenCode loads it from the local
 * `.opencode/tui.json` plugin list so the repository can iterate on a
 * workspace-local TUI plugin before packaging it elsewhere.
 * 这个文件属于宿主入口层。OpenCode 会通过本地 `.opencode/tui.json`
 * 里的插件列表加载它，让仓库可以先在工作区内迭代 TUI 插件，
 * 而不需要先做额外打包。
 */

import plugin from "../../src/vmm-tui.tsx"

export default plugin
