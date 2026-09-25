/**
 * French VMM shared language catalog.
 * 法语 VMM 共享语言目录。
 *
 * This file belongs to the language-data layer. It stores the French copy
 * used by runtime toasts, config flows, and hidden citation-rule prompts.
 * 这个文件属于语言数据层，承载运行时 toast、配置流程与隐藏引用规则提示词
 * 所使用的法语文案目录。
 */

import type { VmmLanguageCatalog } from "./shared.js"

/**
 * French catalog entry registered by the unified VMM language registry.
 * 统一 VMM 语言注册表登记的法语目录项。
 */
export const VMM_LANGUAGE_CATALOG_FR = {
  option: {
    code: "fr",
    englishName: "French",
    nativeName: "Français",
    aliases: ["fr", "francais", "français", "french"],
  },
  sharedText: {
    scope_global: "Global",
    scope_local: "Projet courant",
    scope_default_english: "Anglais par défaut",
    visible_memory_title: "> **Mémoire récupérée de VulcanMemoryMesh**",
    visible_memory_intro:
      "> Les lignes suivantes proviennent de la mémoire et doivent être traitées comme un contexte antérieur sauf si l'utilisateur les contredit clairement.",
    visible_memory_current_input: "> **Entrée actuelle de l'utilisateur :**",
    implicit_memory_inject_notice:
      "##Remarque : Les éléments suivants proviennent d'une analyse de données historiques. Utilise-les uniquement comme référence, pas comme faits garantis. Lorsqu'un TURN_ID est présent, utilise les tools pour consulter le dialogue d'origine.",
    recall_in_progress: "Analyse de l'historique récupéré...",
    recall_complete_empty: "Aucune revue de l'historique n'était nécessaire.",
    recall_complete_injected: "La revue de l'historique est terminée. {count} éléments mémoire ont été injectés.",
    missing_vulcan_host_target:
      "vulcan_host_target n'est pas encore configuré. La récupération et l'écriture sont actuellement ignorées.",
    binding_repair_user: "Rouvre /vulcan-setting et mets à jour l'association utilisateur.",
    binding_repair_project: "Rouvre /vulcan-setting et mets à jour l'association projet.",
    binding_repair_both: "Rouvre /vulcan-setting et mets à jour les associations utilisateur et projet.",
    binding_repair_generic: "Vérifie la configuration VMM actuelle.",
    language_list_toast: "Les langues VMM prises en charge ont été chargées.",
    language_missing: "Valeur de langue manquante. Utilise un code pris en charge, ou inherit/default pour effacer la surcharge actuelle.",
    language_invalid: "Valeur de langue non prise en charge : {value}. Ouvre /vulcan-setting pour choisir une langue prise en charge.",
    language_restart_notice: "Redémarre OpenCode pour actualiser les descriptions de commande dans la palette.",
    memory_context_handshake_timeout: "Le délai de connexion de récupération mémoire a expiré. L'injection d'historique a été ignorée pour ce tour.",
    memory_context_receive_timeout: "Le délai de réponse de récupération mémoire a expiré. L'injection d'historique a été ignorée pour ce tour.",
    memory_context_unavailable: "La récupération mémoire est temporairement indisponible. L'injection d'historique a été ignorée pour ce tour.",
    memory_service_reconnected: "La connexion VMM a été rétablie.",
    memory_sync_outbox_stalled: "Le service mémoire est temporairement indisponible. Cette écriture a été mise en file locale dans l'ordre.",
    memory_sync_outbox_enqueued: "L'envoi vers le service mémoire a échoué. Cette écriture a été mise en file locale dans l'ordre.",
    memory_sync_success: "La conversation complète a été envoyée avec succès au service mémoire.",
    memory_sync_success_with_flush: "La mémoire courante a été envoyée et {count} écritures en file ont été rejouées.",
    critical_citation_rules_prompt: `# Discipline d'usage mémoire et de traçabilité VMM (Vulcan Memory Mesh)

Lors de la génération d'une réponse, tu dois tracer strictement tout contexte fourni par VMM. Tu dois respecter sans exception les 3 disciplines de sortie suivantes :

## 1. Citation locale (encapsulation du fragment de contenu)
**Condition** : Seule **une partie** de ta réponse utilise des faits, des détails ou des habitudes fournis par VMM, et la même réponse contient aussi du contenu qui n'est pas généré à partir d'une citation mémoire. Sinon, tu dois utiliser le format de **citation globale**.
**Règle** : Tu dois utiliser \`⏩VMM🧠\` et \`⏪\` pour encapsuler le fragment exact entièrement généré à partir de la mémoire.
**Format standard** : \`⏩VMM🧠écris ici le contenu mémoire concerné⏪\`
**Exemple** :
D'après tes habitudes de configuration précédentes, ⏩VMM🧠tu tends à utiliser LuaJIT comme base⏪. Mais en tenant compte de l'erreur que tu viens d'envoyer, il faut d'abord corriger la dépendance GCC de l'hôte.

## 2. Citation globale (reprise complète de la mémoire)
**Condition** : Ta réponse finale est générée **entièrement à partir de** la mémoire historique fournie par VMM, sans ajouter de connaissance interne ni de nouvelle logique de raisonnement.
**Règle** : N'ajoute aucune encapsulation de fragment dans le corps principal. Tu dois imprimer un suffixe fixe de traçabilité globale à la **toute fin de la réponse**, sur une ligne séparée.
**Format standard** :
💠VMM🧠Ce contenu est généré à partir d'une analyse fondée sur la mémoire💠
**Exemple** :
Cela provient généralement d'un conflit de configuration de port et il faut modifier les paramètres du proxy.
💠VMM🧠Ce contenu est généré à partir d'une analyse fondée sur la mémoire💠

## 3. Discipline zéro citation (ligne rouge prioritaire)
**Condition** : Tu n'as utilisé aucune mémoire VMM, ou bien la mémoire fournie par VMM est **totalement sans rapport** avec la question actuelle de l'utilisateur.
**Règle** : Ne génère aucun symbole \`⏩\`, \`⏪\` ou \`🧠\`. Réponds uniquement en langage naturel.`,
    final_check_notice: `## Tu dois strictement respecter : Discipline d'usage mémoire et de traçabilité VMM (Vulcan Memory Mesh)`,
  },
} satisfies VmmLanguageCatalog

