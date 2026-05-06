/**
 * VMM notification surface routing helpers.
 * VMM 通知面路由辅助模块。
 *
 * This file belongs to the runtime policy layer. It is used by the main
 * plugin runtime and the transport layer to decide whether one notice should
 * go to host toast, a visible answer notice injected through system context,
 * or stay silent for compatibility.
 * 这个文件属于运行时策略层，供主插件运行时和传输层共同使用，
 * 用来决定一条提示应该走宿主 toast、
 * 通过 system 上下文注入成可见回答提示，
 * 或者为了兼容而保持静默。
 */

/**
 * Supported notification surface modes for VMM runtime feedback.
 * VMM 运行时反馈支持的通知面模式。
 *
 * `auto` stays as the safe default because the upstream OpenCode plugin API
 * still does not expose a reliable first-class host enum to plugins.
 * `auto` 会作为安全默认值保留，因为当前 OpenCode 上游插件 API
 * 仍然没有向插件暴露可靠的一等公民宿主枚举。
 */
export type VmmNotificationSurfaceMode = "auto" | "toast" | "transcript" | "dual"

/**
 * Runtime notice stages that need different delivery behavior.
 * 需要区分投递行为的运行态提示阶段。
 *
 * Warnings happen before the assistant answer exists, while progress and
 * completion remain transient runtime feedback.
 * warning 发生在 assistant 回答生成前，
 * progress 与 completion 则保持为瞬时运行态反馈。
 */
export type VmmNotificationStage = "warning" | "progress" | "completion"

/**
 * One resolved delivery plan for a runtime notice.
 * 一条运行态提示解析后的投递计划。
 *
 * Callers consume this result instead of encoding delivery assumptions in many
 * different places, which keeps transient toast and visible-message behavior aligned.
 * 调用方直接消费这份结果，而不是在很多地方各自硬编码投递假设，
 * 这样瞬时 toast 与可见消息的行为才能保持一致。
 */
export type VmmNotificationRoute = {
  toast: boolean
  visibleAnswerNotice: boolean
}

/**
 * Alias table that maps user-facing config values onto canonical route modes.
 * 把面向用户的配置别名映射到标准路由模式的别名表。
 *
 * Legacy host-oriented aliases are accepted for compatibility, but `web`
 * continues to normalize into the historical `transcript` bucket, which is
 * now kept as a silent compatibility mode after web notice paths proved too
 * brittle and risky for the chat flow.
 * 这里会为了兼容历史配置接受少量宿主心智别名，但 `web`
 * 仍会先归一化到历史上的 `transcript` 桶位；
 * 现在这个桶位已经被收敛成“静默兼容模式”，因为 web 提示链路
 * 被证明过于脆弱，继续保留只会给对话主链引入风险。
 */
const VMM_NOTIFICATION_SURFACE_MODE_ALIASES: Record<string, VmmNotificationSurfaceMode> = {
  auto: "auto",
  default: "auto",
  adaptive: "auto",
  smart: "auto",
  "\u9ed8\u8ba4": "auto",
  "\u81ea\u52a8": "auto",
  toast: "toast",
  tui: "toast",
  cli: "toast",
  terminal: "toast",
  "\u7ec8\u7aef": "toast",
  "\u547d\u4ee4\u884c": "toast",
  transcript: "transcript",
  message: "transcript",
  reply: "transcript",
  web: "transcript",
  "\u6b63\u6587": "transcript",
  "\u6d88\u606f": "transcript",
  "\u7f51\u9875": "transcript",
  dual: "dual",
  both: "dual",
  all: "dual",
  "toast+transcript": "dual",
  "toast+message": "dual",
  "\u53cc\u901a\u9053": "dual",
  "\u5168\u90e8": "dual",
}

/**
 * Normalize one route-mode alias before matching it against the alias table.
 * 在别名表匹配前标准化一条路由模式文本。
 */
function normalizeRouteModeAlias(value: string | undefined) {
  return (value ?? "").trim().toLowerCase()
}

/**
 * Normalize one user-provided notification surface mode.
 * 归一化用户提供的通知面模式。
 *
 * Unknown values fall back to `auto` so a hand-edited config cannot disable
 * runtime feedback accidentally through a typo.
 * 未知值会回退到 `auto`，这样用户手改配置时即使拼错，
 * 也不会意外把运行态反馈整个打掉。
 */
export function normalizeVmmNotificationSurfaceMode(
  raw: unknown,
): VmmNotificationSurfaceMode {
  if (typeof raw !== "string") {
    return "auto"
  }

  return VMM_NOTIFICATION_SURFACE_MODE_ALIASES[normalizeRouteModeAlias(raw)] ?? "auto"
}

/**
 * Resolve the effective delivery plan for one runtime notice.
 * 为一条运行态提示解析最终生效的投递计划。
 *
 * `auto` keeps toast as the primary runtime surface while warning-stage
 * messages can still be surfaced through model-visible notices when needed.
 * The legacy `transcript` bucket is intentionally fully silent now, so old
 * `web`-style configs no longer try to render best-effort notices at all.
 * `auto` 会把 toast 作为主要运行态提示面，
 * 同时在 warning 阶段保留模型可见提示，以应对宿主反馈面不足的情况。
 * 历史上的 `transcript` 桶位现在则被刻意收敛为全静默，
 * 这样旧的 `web` 风格配置也不会再尝试做任何最佳努力提示。
 */
export function resolveVmmNotificationRoute(args: {
  mode: VmmNotificationSurfaceMode
  stage: VmmNotificationStage
}): VmmNotificationRoute {
  if (args.mode === "toast") {
    return {
      toast: true,
      visibleAnswerNotice: false,
    }
  }

  if (args.mode === "transcript") {
    return {
      toast: false,
      visibleAnswerNotice: false,
    }
  }

  if (args.mode === "dual") {
    return {
      toast: true,
      visibleAnswerNotice: args.stage === "warning",
    }
  }

  // `auto` stays as the explicit default. Using a const exhaustiveness check
  // would be ideal, but since `auto` shares the same route as `dual`, we
  // keep the explicit case so future mode additions are visible here.
  // `auto` 作为显式默认分支保留。
  // 这里保留显式分支，以便未来新增 mode 时 TypeScript 编译器能及时报错。
  if (args.mode === "auto") {
    return {
      toast: true,
      visibleAnswerNotice: args.stage === "warning",
    }
  }

  const _exhaustiveCheck: never = args.mode
  void _exhaustiveCheck
  return {
    toast: true,
    visibleAnswerNotice: args.stage === "warning",
  }
}
