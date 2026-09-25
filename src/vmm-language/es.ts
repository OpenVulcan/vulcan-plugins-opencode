/**
 * Spanish VMM shared language catalog.
 * 西班牙语 VMM 共享语言目录。
 *
 * This file belongs to the language-data layer. It stores the Spanish copy
 * used by runtime toasts, config flows, and hidden citation-rule prompts.
 * 这个文件属于语言数据层，承载运行时 toast、配置流程与隐藏引用规则提示词
 * 所使用的西班牙语文案目录。
 */

import type { VmmLanguageCatalog } from "./shared.js"

/**
 * Spanish catalog entry registered by the unified VMM language registry.
 * 统一 VMM 语言注册表登记的西班牙语目录项。
 */
export const VMM_LANGUAGE_CATALOG_ES = {
  option: {
    code: "es",
    englishName: "Spanish",
    nativeName: "Español",
    aliases: ["es", "espanol", "español", "spanish"],
  },
  sharedText: {
    scope_global: "Global",
    scope_local: "Proyecto actual",
    scope_default_english: "Inglés predeterminado",
    visible_memory_title: "> **Memoria recuperada de VulcanMemoryMesh**",
    visible_memory_intro:
      "> Las siguientes líneas se recuperaron de la memoria y deben tratarse como contexto previo salvo que el usuario las contradiga claramente.",
    visible_memory_current_input: "> **Entrada actual del usuario:**",
    implicit_memory_inject_notice:
      "##Aviso: Los siguientes elementos se infirieron a partir del análisis de datos históricos. Úsalos solo como referencia, no como hechos garantizados. Cuando exista un TURN_ID, usa las tools para consultar el diálogo original.",
    recall_in_progress: "Revisando el historial recuperado...",
    recall_complete_empty: "No fue necesario revisar el historial.",
    recall_complete_injected: "La revisión del historial terminó. Se inyectaron {count} elementos de memoria.",
    missing_vulcan_host_target:
      "vulcan_host_target aún no está configurado. La recuperación y la escritura están omitidas por ahora.",
    binding_repair_user: "Abre de nuevo /vulcan-setting y actualiza la vinculación del usuario.",
    binding_repair_project: "Abre de nuevo /vulcan-setting y actualiza la vinculación del proyecto.",
    binding_repair_both: "Abre de nuevo /vulcan-setting y actualiza las vinculaciones de usuario y proyecto.",
    binding_repair_generic: "Revisa la configuración actual de VMM.",
    language_list_toast: "Se cargaron los idiomas VMM compatibles.",
    language_missing: "Falta el valor del idioma. Usa un código admitido o inherit/default para borrar la anulación actual.",
    language_invalid: "Valor de idioma no compatible: {value}. Abre /vulcan-setting para elegir un idioma admitido.",
    language_restart_notice: "Reinicia OpenCode para actualizar las descripciones de comandos en la paleta.",
    memory_context_handshake_timeout: "Se agotó el tiempo de conexión para recuperar memoria. Se omitió la inyección de historial en este turno.",
    memory_context_receive_timeout: "Se agotó el tiempo de respuesta al recuperar memoria. Se omitió la inyección de historial en este turno.",
    memory_context_unavailable: "La recuperación de memoria no está disponible temporalmente. Se omitió la inyección de historial en este turno.",
    memory_service_reconnected: "La conexión de VMM se ha restablecido.",
    memory_sync_outbox_stalled: "El servicio de memoria no está disponible temporalmente. Esta escritura se puso en cola localmente y en orden.",
    memory_sync_outbox_enqueued: "Falló el envío al servicio de memoria. Esta escritura se puso en cola localmente y en orden.",
    memory_sync_success: "La conversación completa se envió correctamente al servicio de memoria.",
    memory_sync_success_with_flush: "Se envió la memoria actual y se reprocesaron {count} escrituras en cola.",
    critical_citation_rules_prompt: `# Disciplina de uso de memoria y trazabilidad de VMM (Vulcan Memory Mesh)

Al generar una respuesta, debes rastrear estrictamente cualquier contexto proporcionado por VMM. Debes obedecer sin excepción las siguientes 3 disciplinas de salida:

## 1. Cita local (envoltura de fragmento de contenido)
**Condición**: Solo **una parte** de tu respuesta usa hechos, detalles o hábitos proporcionados por VMM, y en la misma respuesta también existe contenido que no se genera a partir de citas basadas en memoria. En caso contrario, debes usar el formato de **cita global**.
**Regla**: Debes usar \`⏩VMM🧠\` y \`⏪\` para envolver el fragmento exacto que se genera totalmente a partir de la memoria.
**Formato estándar**: \`⏩VMM🧠escribe aquí el contenido concreto basado en memoria⏪\`
**Ejemplo**:
Según tus hábitos de configuración anteriores, ⏩VMM🧠tiendes a usar LuaJIT como base⏪. Pero, combinándolo con el error que acabas de enviar, primero hay que resolver la dependencia de GCC del host.

## 2. Cita global (repetición completa de la memoria)
**Condición**: Tu respuesta final se genera **enteramente a partir de** la memoria histórica proporcionada por VMM, sin añadir conocimiento interno ni nueva lógica de razonamiento.
**Regla**: No añadas ninguna envoltura de fragmento en el cuerpo principal. Debes imprimir un sufijo fijo de trazabilidad global al **final de toda la respuesta**, en una línea separada.
**Formato estándar**:
💠VMM🧠Este contenido se genera a partir de un análisis basado en memoria💠
**Ejemplo**:
Esto suele ocurrir por un conflicto en la configuración del puerto y es necesario ajustar la configuración del proxy.
💠VMM🧠Este contenido se genera a partir de un análisis basado en memoria💠

## 3. Disciplina de cero citas (línea roja de máxima prioridad)
**Condición**: No usaste ninguna memoria de VMM, o la memoria proporcionada por VMM es **completamente irrelevante** para la pregunta actual del usuario.
**Regla**: No generes ningún icono \`⏩\`, \`⏪\` o \`🧠\`. Responde solo en lenguaje natural.`,
    final_check_notice: `## Debes cumplir estrictamente: Disciplina de uso de memoria y trazabilidad de VMM (Vulcan Memory Mesh)`,
  },
} satisfies VmmLanguageCatalog

