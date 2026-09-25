/**
 * German VMM shared language catalog.
 * 德语 VMM 共享语言目录。
 *
 * This file belongs to the language-data layer. It stores the German copy
 * used by runtime toasts, config flows, and hidden citation-rule prompts.
 * 这个文件属于语言数据层，承载运行时 toast、配置流程与隐藏引用规则提示词
 * 所使用的德语文案目录。
 */

import type { VmmLanguageCatalog } from "./shared.js"

/**
 * German catalog entry registered by the unified VMM language registry.
 * 统一 VMM 语言注册表登记的德语目录项。
 */
export const VMM_LANGUAGE_CATALOG_DE = {
  option: {
    code: "de",
    englishName: "German",
    nativeName: "Deutsch",
    aliases: ["de", "deutsch", "german"],
  },
  sharedText: {
    scope_global: "Global",
    scope_local: "Aktuelles Projekt",
    scope_default_english: "Standard-Englisch",
    visible_memory_title: "> **Von VulcanMemoryMesh abgerufene Erinnerung**",
    visible_memory_intro:
      "> Die folgenden Zeilen wurden aus dem Speicher abgerufen und sollten als bisheriger Kontext gelten, sofern der Benutzer ihnen nicht klar widerspricht.",
    visible_memory_current_input: "> **Aktuelle Benutzereingabe:**",
    implicit_memory_inject_notice:
      "##Hinweis: Die folgenden Einträge wurden aus der Analyse historischer Daten abgeleitet. Nutze sie nur als Referenz, nicht als garantierte Fakten. Wenn ein TURN_ID vorhanden ist, verwende die Tools, um den ursprünglichen Dialog nachzuschlagen.",
    recall_in_progress: "Abgerufenen Verlauf wird geprüft...",
    recall_complete_empty: "Keine Verlaufsprüfung erforderlich.",
    recall_complete_injected: "Die Verlaufsprüfung ist abgeschlossen. {count} Erinnerungseinträge wurden injiziert.",
    missing_vulcan_host_target:
      "vulcan_host_target ist noch nicht konfiguriert. Abruf und Writeback werden derzeit übersprungen.",
    binding_repair_user: "Bitte /vulcan-setting erneut öffnen und die Benutzerbindung aktualisieren.",
    binding_repair_project: "Bitte /vulcan-setting erneut öffnen und die Projektbindung aktualisieren.",
    binding_repair_both: "Bitte /vulcan-setting erneut öffnen und Benutzer- sowie Projektbindung aktualisieren.",
    binding_repair_generic: "Bitte prüfe die aktuelle VMM-Konfiguration.",
    language_list_toast: "Die unterstützten VMM-Sprachen wurden geladen.",
    language_missing: "Sprachwert fehlt. Verwende einen unterstützten Code oder inherit/default, um die aktuelle Überschreibung zu löschen.",
    language_invalid: "Nicht unterstützter Sprachwert: {value}. Öffne /vulcan-setting, um eine unterstützte Sprache auszuwählen.",
    language_restart_notice: "Starte OpenCode neu, damit die Befehlsbeschreibungen in der Palette aktualisiert werden.",
    memory_context_handshake_timeout: "Zeitüberschreitung bei der Verbindung zur Speicherabfrage. Die Verlaufsinjektion wurde für diesen Turn übersprungen.",
    memory_context_receive_timeout: "Zeitüberschreitung bei der Antwort der Speicherabfrage. Die Verlaufsinjektion wurde für diesen Turn übersprungen.",
    memory_context_unavailable: "Die Speicherabfrage ist vorübergehend nicht verfügbar. Die Verlaufsinjektion wurde für diesen Turn übersprungen.",
    memory_service_reconnected: "Die VMM-Verbindung wurde wiederhergestellt.",
    memory_sync_outbox_stalled: "Der Speicherdienst ist vorübergehend nicht verfügbar. Dieser Writeback wurde lokal in Reihenfolge in die Warteschlange gelegt.",
    memory_sync_outbox_enqueued: "Das Senden an den Speicherdienst ist fehlgeschlagen. Dieser Writeback wurde lokal in Reihenfolge in die Warteschlange gelegt.",
    memory_sync_success: "Die vollständige Unterhaltung wurde erfolgreich an den Speicherdienst übermittelt.",
    memory_sync_success_with_flush: "Die aktuelle Erinnerung wurde gesendet und {count} Warteschlangen-Writebacks wurden erneut abgespielt.",
    critical_citation_rules_prompt: `# VMM (Vulcan Memory Mesh) Disziplin für Speicherverwendung und Rückverfolgbarkeit

Beim Erzeugen einer Antwort musst du jeden von VMM bereitgestellten Kontext strikt rückverfolgen. Du musst die folgenden 3 Ausgabedisziplinen ohne Ausnahme einhalten:

## 1. Lokale Zitation (Inhaltsfragment umschließen)
**Bedingung**: Nur **ein Teil** deiner Antwort verwendet Fakten, Details oder Gewohnheiten, die von VMM bereitgestellt wurden, und dieselbe Antwort enthält außerdem Inhalt, der nicht aus speicherbasierter Zitierung erzeugt wird. Andernfalls musst du das Format der **globalen Zitation** verwenden.
**Regel**: Du musst \`⏩VMM🧠\` und \`⏪\` verwenden, um genau das Fragment zu umschließen, das vollständig aus der Erinnerung erzeugt wurde.
**Formatstandard**: \`⏩VMM🧠hier den konkreten speicherbasierten Inhalt schreiben⏪\`
**Beispiel**:
Aus deinen früheren Konfigurationsgewohnheiten heraus ⏩VMM🧠bevorzugst du LuaJIT als Grundlage⏪. In Kombination mit dem Fehler, den du gerade gesendet hast, muss aber zuerst die GCC-Abhängigkeit des Hosts behoben werden.

## 2. Globale Zitation (Erinnerung vollständig wiedergeben)
**Bedingung**: Deine endgültige Antwort wird **vollständig aus** der von VMM bereitgestellten historischen Erinnerung erzeugt, ohne internes Wissen oder neue Schlusslogik hinzuzufügen.
**Regel**: Füge im Haupttext keinerlei Fragment-Umschließung hinzu. Stattdessen musst du ganz am **Ende der gesamten Antwort** in einer eigenen Zeile einen festen globalen Rückverfolgungssuffix ausgeben.
**Formatstandard**:
💠VMM🧠Dieser Inhalt wurde auf Basis einer speicherbasierten Analyse erstellt💠
**Beispiel**:
Das passiert normalerweise wegen eines Konflikts in der Portkonfiguration, daher müssen die Proxy-Einstellungen angepasst werden.
💠VMM🧠Dieser Inhalt wurde auf Basis einer speicherbasierten Analyse erstellt💠

## 3. Null-Zitations-Disziplin (oberste rote Linie)
**Bedingung**: Du hast überhaupt keinen VMM-Speicher verwendet, oder der von VMM gelieferte Speicher ist für die aktuelle Frage des Benutzers **vollständig irrelevant**.
**Regel**: Erzeuge keinerlei Symbol \`⏩\`, \`⏪\` oder \`🧠\`. Antworte einfach in natürlicher Sprache.`,
    final_check_notice: `## Du musst strikt einhalten: VMM (Vulcan Memory Mesh) Disziplin für Speicherverwendung und Rückverfolgbarkeit`,
  },
} satisfies VmmLanguageCatalog

