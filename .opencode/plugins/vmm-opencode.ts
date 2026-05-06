/**
 * Main OpenCode plugin entry for this repository.
 * 当前仓库的 OpenCode 主插件入口。
 *
 * This file belongs to the host-entry layer. OpenCode can auto-discover it
 * from a standard `.opencode/plugins` directory, and development workspaces
 * can link to it instead of maintaining their own import shim.
 * 这个文件属于宿主入口层。OpenCode 可以从标准的 `.opencode/plugins`
 * 目录自动发现它，开发工作区也可以直接链接到它，而不必各自维护一份引用 shim。
 */

import plugin from "../../src/plugin.ts"

export default plugin
