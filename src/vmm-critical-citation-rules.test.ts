/**
 * Tests for fixed VMM citation-rule system prompt helpers.
 * 固定 VMM 引用规则 system prompt 辅助逻辑测试。
 *
 * These tests protect the hidden prompt contract that keeps the user-supplied
 * citation rules permanently pinned above every later system block.
 * 这些测试用于守护隐藏 prompt 契约，
 * 确保用户给定的引用规则始终固定在后续所有 system 区块之上。
 */

import assert from "node:assert/strict"
import test from "node:test"

import {
  ensureVmmCriticalCitationRulesSystemAtTop,
  renderVmmCriticalCitationRulesSystemBlock,
} from "./vmm-critical-citation-rules.js"

test("ensureVmmCriticalCitationRulesSystemAtTop returns the fixed block when system text is empty", () => {
  assert.equal(
    ensureVmmCriticalCitationRulesSystemAtTop("", "en"),
    renderVmmCriticalCitationRulesSystemBlock("en"),
  )
})

test("ensureVmmCriticalCitationRulesSystemAtTop prepends the fixed block above existing system text", () => {
  assert.equal(
    ensureVmmCriticalCitationRulesSystemAtTop("## Existing policy\nDo something else.", "en"),
    [
      renderVmmCriticalCitationRulesSystemBlock("en"),
      "## Existing policy\nDo something else.",
    ].join("\n\n"),
  )
})

test("ensureVmmCriticalCitationRulesSystemAtTop is idempotent when the fixed block is already on top", () => {
  const existing = [
    renderVmmCriticalCitationRulesSystemBlock("en"),
    "## Existing policy\nDo something else.",
  ].join("\n\n")

  assert.equal(
    ensureVmmCriticalCitationRulesSystemAtTop(existing, "en"),
    existing,
  )
})

test("ensureVmmCriticalCitationRulesSystemAtTop removes a lower duplicate and restores the fixed block to top", () => {
  const existing = [
    "## Existing policy\nDo something else.",
    renderVmmCriticalCitationRulesSystemBlock("en"),
    "## Memory block\n<VULCAN_MEMORY_MESH_INJECTS>\n[TURN_ID:1|SOURCE:1.000]demo\n</VULCAN_MEMORY_MESH_INJECTS>",
  ].join("\n\n")

  assert.equal(
    ensureVmmCriticalCitationRulesSystemAtTop(existing, "en"),
    [
      renderVmmCriticalCitationRulesSystemBlock("en"),
      "## Existing policy\nDo something else.",
      "## Memory block\n<VULCAN_MEMORY_MESH_INJECTS>\n[TURN_ID:1|SOURCE:1.000]demo\n</VULCAN_MEMORY_MESH_INJECTS>",
    ].join("\n\n"),
  )
})

test("renderVmmCriticalCitationRulesSystemBlock keeps Chinese markers in the Chinese catalog", () => {
  const result = renderVmmCriticalCitationRulesSystemBlock("zh-CN")

  assert.match(result, /VMM \(Vulcan Memory Mesh\) 记忆调用与溯源纪律/)
  assert.match(result, /并且\*\*存在\*\*非记忆引用生成的内容时，否则应该使用\*\*全局引用\*\*格式/)
  assert.match(result, /⏩VMM🧠这里写具体的记忆内容⏪/)
  assert.match(result, /💠VMM🧠本文内容基于记忆内容分析生成💠/)
  assert.match(result, /绝对禁止生成任何 `⏩`、`⏪` 或 `🧠` 图标/)
  assert.match(result, /内容片段包裹/)
})

test("renderVmmCriticalCitationRulesSystemBlock keeps updated English markers in the English catalog", () => {
  const result = renderVmmCriticalCitationRulesSystemBlock("en")

  assert.match(result, /VMM \(Vulcan Memory Mesh\) Memory Usage and Traceability Discipline/)
  assert.match(result, /Otherwise, you should use the \*\*Global Citation\*\* format\./)
  assert.match(result, /⏩VMM🧠Put the specific memory-based content here⏪/)
  assert.match(result, /💠VMM🧠This response is generated based on memory-derived analysis💠/)
  assert.match(result, /Do not generate any `⏩`, `⏪`, or `🧠` icon/)
  assert.match(result, /content fragment wrapping/)
})

test("renderVmmCriticalCitationRulesSystemBlock keeps translated markers for every non-English locale", () => {
  for (const [language, titlePattern, conditionPattern, localPattern, globalPattern] of [
    [
      "es",
      /Disciplina de uso de memoria y trazabilidad de VMM/,
      /debes usar el formato de \*\*cita global\*\*/,
      /⏩VMM🧠escribe aquí el contenido concreto basado en memoria⏪/,
      /💠VMM🧠Este contenido se genera a partir de un análisis basado en memoria💠/,
    ],
    [
      "fr",
      /Discipline d'usage mémoire et de traçabilité VMM/,
      /tu dois utiliser le format de \*\*citation globale\*\*/,
      /⏩VMM🧠écris ici le contenu mémoire concerné⏪/,
      /💠VMM🧠Ce contenu est généré à partir d'une analyse fondée sur la mémoire💠/,
    ],
    [
      "de",
      /Disziplin für Speicherverwendung und Rückverfolgbarkeit/,
      /Format der \*\*globalen Zitation\*\* verwenden/,
      /⏩VMM🧠hier den konkreten speicherbasierten Inhalt schreiben⏪/,
      /💠VMM🧠Dieser Inhalt wurde auf Basis einer speicherbasierten Analyse erstellt💠/,
    ],
    [
      "ja",
      /メモリ利用とトレーサビリティ規律/,
      /\*\*全体引用\*\* 形式を使わなければなりません/,
      /⏩VMM🧠ここに具体的な記憶ベースの内容を書く⏪/,
      /💠VMM🧠本文は記憶内容の分析に基づいて生成されています💠/,
    ],
    [
      "ko",
      /메모리 사용 및 추적 규율/,
      /\*\*전역 인용\*\* 형식을 사용해야 합니다/,
      /⏩VMM🧠여기에 구체적인 기억 기반 내용을 작성⏪/,
      /💠VMM🧠본문 내용은 기억 내용 분석을 바탕으로 생성되었습니다💠/,
    ],
  ] as const) {
    const result = renderVmmCriticalCitationRulesSystemBlock(language)

    assert.match(result, titlePattern)
    assert.match(result, conditionPattern)
    assert.match(result, localPattern)
    assert.match(result, globalPattern)
  }
})
