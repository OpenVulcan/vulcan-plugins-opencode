/**
 * Public VMM language helper entry.
 * VMM 语言辅助公共入口。
 *
 * This file belongs to the presentation/config helper layer. It keeps the
 * external API stable while delegating concrete language data to the
 * per-language catalog files under `src/vmm-language/`.
 * 这个文件属于展示层与配置辅助层，在对外保持稳定 API 的同时，
 * 把具体语言数据委托给 `src/vmm-language/` 目录下的按语言拆分文件。
 */

import { VMM_LANGUAGE_CATALOGS } from "./vmm-language/catalogs.js"
import type { VmmLanguage, VmmSharedTextKey } from "./vmm-language/shared.js"

export type {
  VmmLanguage,
  VmmLanguageCatalog,
  VmmLanguageOption,
  VmmSharedTextKey,
} from "./vmm-language/shared.js"

/**
 * Normalize one user-provided language alias before matching catalogs.
 * 在匹配语言目录前标准化用户给出的语言别名。
 *
 * Config files, TUI inputs, and future repair flows may all provide the same
 * language in slightly different spellings, so alias normalization stays
 * centralized in the language helper layer.
 * 配置文件、TUI 输入以及后续修复链都可能用不同写法表达同一种语言，
 * 因此这里把别名标准化集中放在语言辅助层统一处理。
 */
function normalizeLanguageAlias(value: string | undefined) {
  return (value ?? "").trim().toLowerCase()
}

/**
 * Fill one localized template with runtime placeholder values.
 * 使用运行时占位变量填充一条本地化模板文本。
 */
function formatTemplate(template: string, vars: Record<string, string | number> = {}) {
  /**
   * Preserve double-braced placeholders as literal text before resolving the
   * runtime placeholders used by normal shared-copy strings.
   * 先把双花括号占位符保留成字面量，再解析共享文案里真正用于运行时填充的普通占位符。
   *
   * Citation-rule prompts need to teach the model a literal format like
   * `{ID}`, while normal UI strings still rely on `{count}`-style substitution.
   * Without this escape pass, the generic formatter would swallow the literal
   * teaching examples and silently change the prompt semantics.
   * 引用纪律提示词需要向模型展示字面量格式，例如 `{ID}`；
   * 但普通 UI 文案仍然依赖 `{count}` 这类运行时替换。
   * 如果没有这一步转义，通用模板器会把这些教学用占位符直接吃掉，悄悄改变提示词语义。
   */
  const literalPlaceholders: string[] = []
  const escapedTemplate = template.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, key) => {
    const token = `__VMM_LITERAL_PLACEHOLDER_${literalPlaceholders.length}__`
    literalPlaceholders.push(`{${key}}`)
    return token
  })

  const formatted = escapedTemplate.replace(/\{([A-Za-z0-9_]+)\}/g, (_match, key) => {
    // Guard against variable values that themselves contain brace patterns.
    // Escape any { } in the value so the second restore pass does not
    // accidentally treat them as placeholders.
    // 防止变量值本身包含花括号模式。转义变量值中的 { }，
    // 避免第二轮恢复时将其误当作占位符处理。
    return String(vars[key] ?? "").replace(/\{/g, "\x00LB\x00").replace(/\}/g, "\x00RB\x00")
  })
  return formatted
    .replace(/__VMM_LITERAL_PLACEHOLDER_(\d+)__/g, (_match, index) => {
      const value = literalPlaceholders[Number(index)]
      return value ?? ""
    })
    // Restore escaped braces from variable values back to literal { }.
    // 把变量值中被转义的花括号恢复回字面量 { }。
    .replace(/\x00LB\x00/g, "{").replace(/\x00RB\x00/g, "}")
}

/**
 * Alias values that mean "clear the scoped language override".
 * 表示“清空当前作用域语言覆盖值”的别名集合。
 */
const VMM_LANGUAGE_CLEAR_ALIASES = new Set([
  "inherit",
  "default",
  "clear",
  "reset",
  "默认",
  "继承",
  "清空",
  "重置",
])

/**
 * List the supported VMM language options for command feedback.
 * 列出命令反馈和帮助里会展示的受支持语言选项。
 */
export function getSupportedVmmLanguages() {
  return Object.values(VMM_LANGUAGE_CATALOGS).map((catalog) => catalog.option)
}

/**
 * Resolve one raw config or command value into the effective VMM language.
 * 把一条原始配置值或命令值解析成最终生效的 VMM 语言。
 *
 * Unknown or empty values intentionally fall back to English so the plugin can
 * keep working even when the language override is missing or malformed.
 * 未知值或空值会有意回退到英语，
 * 这样即使语言覆盖值缺失或写错，插件也能继续稳定工作。
 */
export function resolveVmmLanguage(value: string | undefined) {
  const normalized = normalizeLanguageAlias(value)
  for (const catalog of Object.values(VMM_LANGUAGE_CATALOGS)) {
    if (catalog.option.aliases.includes(normalized)) {
      return {
        code: catalog.option.code,
        matched: true,
        raw: value ?? "",
      }
    }
  }
  // Empty or unknown values fall back to English without claiming a match.
  // 空值或未知值都会回退到英语，且不声称匹配成功。
  return {
    code: "en" as const,
    matched: false,
    raw: value ?? "",
  }
}

/**
 * Check whether one user-provided value means "clear this language override".
 * 检查一条用户给出的值是否表示“清空当前语言覆盖值”。
 */
export function isVmmLanguageClearValue(value: string | undefined) {
  return VMM_LANGUAGE_CLEAR_ALIASES.has(normalizeLanguageAlias(value))
}

/**
 * Read the full language catalog for one effective language code.
 * 读取某个生效语言代码对应的完整语言目录。
 */
export function getVmmLanguageCatalog(language: VmmLanguage | undefined) {
  return VMM_LANGUAGE_CATALOGS[language ?? "en"]
}

/**
 * Read one shared localized UI text with optional placeholder variables.
 * 读取一条共享本地化 UI 文本，并按需填充占位变量。
 */
export function tVmmShared(
  language: VmmLanguage | undefined,
  key: VmmSharedTextKey,
  vars: Record<string, string | number> = {},
) {
  const catalog = getVmmLanguageCatalog(language)
  return formatTemplate(catalog.sharedText[key], vars)
}

/**
 * Format one compact language label for toasts, scope output, and logs.
 * 为 toast、scope 输出和日志格式化简洁语言标签。
 */
export function formatVmmLanguageLabel(language: VmmLanguage | undefined) {
  const catalog = getVmmLanguageCatalog(language)
  return `${catalog.option.code} (${catalog.option.englishName} / ${catalog.option.nativeName})`
}
