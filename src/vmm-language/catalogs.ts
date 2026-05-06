/**
 * Unified registry for per-language VMM shared catalogs.
 * 各语言 VMM 共享目录的统一注册表。
 *
 * This file belongs to the language-data assembly layer. It wires the
 * per-language catalog files into one strongly typed registry consumed by the
 * public `vmm-language.ts` entry.
 * 这个文件属于语言数据装配层，负责把每个语言文件组合成统一注册表，
 * 供对外的 `vmm-language.ts` 入口稳定消费。
 */

import { VMM_LANGUAGE_CATALOG_DE } from "./de.js"
import { VMM_LANGUAGE_CATALOG_EN } from "./en.js"
import { VMM_LANGUAGE_CATALOG_ES } from "./es.js"
import { VMM_LANGUAGE_CATALOG_FR } from "./fr.js"
import { VMM_LANGUAGE_CATALOG_JA } from "./ja.js"
import { VMM_LANGUAGE_CATALOG_KO } from "./ko.js"
import type { VmmLanguage, VmmLanguageCatalog } from "./shared.js"
import { VMM_LANGUAGE_CATALOG_ZH_CN } from "./zh-cn.js"

/**
 * Canonical multilingual catalog used by config, command registration, and UI.
 * 配置、命令注册与界面反馈共同使用的标准多语言目录。
 */
export const VMM_LANGUAGE_CATALOGS = {
  en: VMM_LANGUAGE_CATALOG_EN,
  "zh-CN": VMM_LANGUAGE_CATALOG_ZH_CN,
  es: VMM_LANGUAGE_CATALOG_ES,
  fr: VMM_LANGUAGE_CATALOG_FR,
  de: VMM_LANGUAGE_CATALOG_DE,
  ja: VMM_LANGUAGE_CATALOG_JA,
  ko: VMM_LANGUAGE_CATALOG_KO,
} satisfies Record<VmmLanguage, VmmLanguageCatalog>
