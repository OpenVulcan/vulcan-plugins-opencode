/**
 * Japanese VMM shared language catalog.
 * 日语 VMM 共享语言目录。
 *
 * This file belongs to the language-data layer. It stores the Japanese copy
 * used by runtime toasts, config flows, and hidden citation-rule prompts.
 * 这个文件属于语言数据层，承载运行时 toast、配置流程与隐藏引用规则提示词
 * 所使用的日语文案目录。
 */

import type { VmmLanguageCatalog } from "./shared.js"

/**
 * Japanese catalog entry registered by the unified VMM language registry.
 * 统一 VMM 语言注册表登记的日语目录项。
 */
export const VMM_LANGUAGE_CATALOG_JA = {
  option: {
    code: "ja",
    englishName: "Japanese",
    nativeName: "日本語",
    aliases: ["ja", "jp", "japanese", "日本語"],
  },
  sharedText: {
    scope_global: "グローバル",
    scope_local: "現在のプロジェクト",
    scope_default_english: "既定の英語",
    visible_memory_title: "> **VulcanMemoryMesh 取得メモリ**",
    visible_memory_intro:
      "> 次の内容はメモリから取得されたものであり、ユーザーが明確に否定しない限り既存コンテキストとして扱ってください。",
    visible_memory_current_input: "> **現在のユーザー入力:**",
    implicit_memory_inject_notice:
      "##注意: 以下の内容は履歴データの分析から得られた参考情報であり、必ずしも正確とは限りません。TURN_ID がある場合は、元の対話を確認するために tools で照会してください。",
    recall_in_progress: "取得した履歴を確認しています...",
    recall_complete_empty: "履歴確認は不要でした。",
    recall_complete_injected: "履歴確認が完了しました。{count} 件のメモリを注入しました。",
    missing_vulcan_host_target:
      "vulcan_host_target がまだ設定されていないため、取得と書き戻しは現在スキップされています。",
    binding_repair_user: "/vulcan-setting を開き直して、現在のユーザーバインドを更新してください。",
    binding_repair_project: "/vulcan-setting を開き直して、現在のプロジェクトバインドを更新してください。",
    binding_repair_both: "/vulcan-setting を開き直して、ユーザーとプロジェクトの両方のバインドを更新してください。",
    binding_repair_generic: "現在の VMM 設定を確認してください。",
    language_list_toast: "サポートされている VMM 言語を読み込みました。",
    language_missing: "言語値が不足しています。対応コードを指定するか、inherit/default で現在の上書きを解除してください。",
    language_invalid: "サポートされていない言語値です: {value}。/vulcan-setting を開いて対応言語を選択してください。",
    language_restart_notice: "コマンドパレット内の説明を新しい言語に更新するには OpenCode を再起動してください。",
    memory_context_handshake_timeout: "メモリ取得の接続がタイムアウトしました。このターンでは履歴注入をスキップしました。",
    memory_context_receive_timeout: "メモリ取得の応答がタイムアウトしました。このターンでは履歴注入をスキップしました。",
    memory_context_unavailable: "メモリ取得は一時的に利用できません。このターンでは履歴注入をスキップしました。",
    memory_service_reconnected: "VMM 接続が復旧しました。",
    memory_sync_outbox_stalled: "メモリサービスは一時的に利用できません。この書き戻しは順序を保ってローカルキューに入りました。",
    memory_sync_outbox_enqueued: "メモリサービスへの送信に失敗しました。この書き戻しは順序を保ってローカルキューに入りました。",
    memory_sync_success: "完全な会話をメモリサービスへ正常に送信しました。",
    memory_sync_success_with_flush: "現在のメモリを送信し、キュー済みの書き戻し {count} 件を再送しました。",
    critical_citation_rules_prompt: `# VMM (Vulcan Memory Mesh) メモリ利用とトレーサビリティ規律

回答を生成する際、あなたは VMM によって提供されたすべてのコンテキストを厳密に追跡しなければなりません。以下の 3 つの出力規律を絶対に守ってください。

## 1. 局所引用（内容断片のラップ）
**条件**：回答のうち **一部の内容だけ** が、VMM によって提供された事実、詳細、または習慣を使用しており、同じ回答の中に記憶参照から生成されていない内容も存在する場合です。そうでない場合は、**全体引用** 形式を使わなければなりません。
**ルール**：完全に記憶だけに基づいて生成した断片を \`⏩VMM🧠\` と \`⏪\` で包まなければなりません。
**形式標準**：\`⏩VMM🧠ここに具体的な記憶ベースの内容を書く⏪\`
**例**：
以前の設定傾向を見ると、⏩VMM🧠LuaJIT を基盤として使う傾向があります⏪。ただし、今送ってくれたエラーを踏まえると、まずはホスト側の GCC 依存関係を解決する必要があります。

## 2. 全体引用（記憶の完全な再述）
**条件**：最終回答が VMM から提供された履歴記憶 **だけ** を基に生成されており、内部知識や新しい推論ロジックを一切追加していない場合。
**ルール**：本文中には断片ラップを一切入れてはいけません。その代わり、回答全体の **最末尾** に独立した 1 行で固定の全体トレーサビリティ尾部を出力しなければなりません。
**形式標準**：
💠VMM🧠本文は記憶内容の分析に基づいて生成されています💠
**例**：
これは通常、ポート設定の競合が原因であり、プロキシ設定を調整する必要があります。
💠VMM🧠本文は記憶内容の分析に基づいて生成されています💠

## 3. ゼロ引用規律（最優先のレッドライン）
**条件**：VMM 記憶をまったく使用していない、または VMM が提供した記憶が現在のユーザー質問と **完全に無関係** な場合。
**ルール**：\`⏩\`、\`⏪\`、\`🧠\` を一切生成してはいけません。自然言語だけで回答してください。`,
    final_check_notice: `## 厳守義務：VMM (Vulcan Memory Mesh) メモリ利用とトレーサビリティ規律`,
  },
} satisfies VmmLanguageCatalog

