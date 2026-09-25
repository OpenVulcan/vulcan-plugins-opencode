/**
 * Korean VMM shared language catalog.
 * 韩语 VMM 共享语言目录。
 *
 * This file belongs to the language-data layer. It stores the Korean copy
 * used by runtime toasts, config flows, and hidden citation-rule prompts.
 * 这个文件属于语言数据层，承载运行时 toast、配置流程与隐藏引用规则提示词
 * 所使用的韩语文案目录。
 */

import type { VmmLanguageCatalog } from "./shared.js"

/**
 * Korean catalog entry registered by the unified VMM language registry.
 * 统一 VMM 语言注册表登记的韩语目录项。
 */
export const VMM_LANGUAGE_CATALOG_KO = {
  option: {
    code: "ko",
    englishName: "Korean",
    nativeName: "한국어",
    aliases: ["ko", "korean", "한국어"],
  },
  sharedText: {
    scope_global: "전역",
    scope_local: "현재 프로젝트",
    scope_default_english: "기본 영어",
    visible_memory_title: "> **VulcanMemoryMesh 검색 메모리**",
    visible_memory_intro:
      "> 다음 내용은 메모리에서 검색된 것으로, 사용자가 명확히 부정하지 않는 한 이전 컨텍스트로 취급해야 합니다.",
    visible_memory_current_input: "> **현재 사용자 입력:**",
    implicit_memory_inject_notice:
      "##안내: 아래 항목은 과거 데이터 분석에서 추론된 참고 정보이며, 반드시 정확한 사실이라고 보장되지는 않습니다. TURN_ID 가 있으면 원본 대화를 확인하기 위해 tools 로 조회하세요.",
    recall_in_progress: "검색된 기록을 검토하는 중...",
    recall_complete_empty: "기록 검토가 필요하지 않았습니다.",
    recall_complete_injected: "기록 검토가 완료되었습니다. 메모리 {count}개를 주입했습니다.",
    missing_vulcan_host_target:
      "vulcan_host_target 이 아직 설정되지 않아 검색과 쓰기 반환이 현재 건너뛰어집니다.",
    binding_repair_user: "/vulcan-setting 을 다시 열고 현재 사용자 바인딩을 업데이트해 주세요.",
    binding_repair_project: "/vulcan-setting 을 다시 열고 현재 프로젝트 바인딩을 업데이트해 주세요.",
    binding_repair_both: "/vulcan-setting 을 다시 열고 사용자와 프로젝트 바인딩을 모두 업데이트해 주세요.",
    binding_repair_generic: "현재 VMM 설정을 확인해 주세요.",
    language_list_toast: "지원되는 VMM 언어를 불러왔습니다.",
    language_missing: "언어 값이 없습니다. 지원되는 코드를 사용하거나 inherit/default 로 현재 재정의를 해제하세요.",
    language_invalid: "지원되지 않는 언어 값입니다: {value}. /vulcan-setting 을 열어 지원되는 언어를 선택해 주세요.",
    language_restart_notice: "명령 팔레트의 설명을 새 언어로 갱신하려면 OpenCode 를 다시 시작해 주세요.",
    memory_context_handshake_timeout: "메모리 검색 연결 시간이 초과되었습니다. 이 턴의 기록 주입을 건너뛰었습니다.",
    memory_context_receive_timeout: "메모리 검색 응답 시간이 초과되었습니다. 이 턴의 기록 주입을 건너뛰었습니다.",
    memory_context_unavailable: "메모리 검색을 일시적으로 사용할 수 없습니다. 이 턴의 기록 주입을 건너뛰었습니다.",
    memory_service_reconnected: "VMM 연결이 복구되었습니다.",
    memory_sync_outbox_stalled: "메모리 서비스를 일시적으로 사용할 수 없습니다. 이번 쓰기 반환은 순서를 유지한 채 로컬 큐에 저장되었습니다.",
    memory_sync_outbox_enqueued: "메모리 서비스로 전송하지 못했습니다. 이번 쓰기 반환은 순서를 유지한 채 로컬 큐에 저장되었습니다.",
    memory_sync_success: "전체 대화를 메모리 서비스에 성공적으로 제출했습니다.",
    memory_sync_success_with_flush: "현재 메모리를 제출했고, 대기 중이던 쓰기 반환 {count}건을 재전송했습니다.",
    critical_citation_rules_prompt: `# VMM (Vulcan Memory Mesh) 메모리 사용 및 추적 규율

답변을 생성할 때는 VMM 이 제공한 모든 컨텍스트를 엄격하게 추적해야 합니다. 다음 3가지 출력 규율을 반드시 준수하세요.

## 1. 국소 인용 (내용 조각 감싸기)
**조건**: 답변의 **일부 내용만** VMM 이 제공한 사실, 세부사항 또는 습관을 사용하고, 같은 답변 안에 기억 인용으로 생성되지 않은 내용도 **함께 존재하는 경우**입니다. 그렇지 않다면 **전역 인용** 형식을 사용해야 합니다.
**규칙**: 기억만을 기반으로 생성된 정확한 조각을 \`⏩VMM🧠\` 와 \`⏪\` 로 감싸야 합니다.
**형식 표준**: \`⏩VMM🧠여기에 구체적인 기억 기반 내용을 작성⏪\`
**예시**:
이전 설정 습관을 보면, ⏩VMM🧠LuaJIT 를 기반으로 사용하는 편입니다⏪. 하지만 방금 보낸 오류를 함께 보면 먼저 호스트의 GCC 의존성부터 해결해야 합니다.

## 2. 전역 인용 (기억의 완전한 재진술)
**조건**: 최종 답변이 VMM 이 제공한 과거 기억만으로 **완전히 생성** 되었고, 내부 지식이나 새로운 추론 로직을 전혀 추가하지 않은 경우.
**규칙**: 본문에는 어떤 내용 조각 감싸기도 넣지 마세요. 대신 답변 전체의 **맨 마지막** 에 독립된 한 줄로 고정된 전역 추적 꼬리표를 출력해야 합니다.
**형식 표준**:
💠VMM🧠본문 내용은 기억 내용 분석을 바탕으로 생성되었습니다💠
**예시**:
이것은 보통 포트 설정 충돌 때문에 발생하므로 프록시 설정을 수정해야 합니다.
💠VMM🧠본문 내용은 기억 내용 분석을 바탕으로 생성되었습니다💠

## 3. 무인용 규율 (최고 우선 레드라인)
**조건**: 어떤 VMM 기억도 사용하지 않았거나, VMM 이 제공한 기억이 현재 사용자 질문과 **완전히 무관한** 경우.
**규칙**: \`⏩\`, \`⏪\`, \`🧠\` 를 절대 생성하지 마세요. 자연어로만 답하세요.`,
    final_check_notice: `## 반드시 엄수해야 함: VMM (Vulcan Memory Mesh) 메모리 사용 및 추적 규율`,
  },
} satisfies VmmLanguageCatalog

