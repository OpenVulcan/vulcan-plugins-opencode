/**
 * OpenCode tool registrations for LuaSkills dynamic runtime entries.
 * 面向 LuaSkills 动态运行时入口的 OpenCode tool 注册模块。
 *
 * This file belongs to the host integration layer. The plugin uses it during
 * startup to turn vulcan-host LuaSkills descriptors into static OpenCode tools,
 * then relays every execution back to LuaSkillsService over gRPC.
 * 这个文件属于宿主集成层。插件会在启动时用它把 vulcan-host 的 LuaSkills
 * 描述转换成静态 OpenCode tools，并在每次执行时经由 gRPC 中转回 LuaSkillsService。
 */

import { tool, type ToolDefinition } from "@opencode-ai/plugin"

import { loadVmmConfig } from "./vmm-config.js"
import { extractTransportConfig, type VmmGrpcTransportConfig } from "./vmm-grpc.js"
import {
  callVmmLuaSkillsCallTool,
  callVmmLuaSkillsInstall,
  callVmmLuaSkillsListInstalled,
  callVmmLuaSkillsListTools,
  callVmmLuaSkillsReloadRuntimeConfigs,
  callVmmLuaSkillsUninstall,
  callVmmLuaSkillsUpdate,
  type VmmLuaSkillsGrpcClientContext,
  type VmmLuaSkillsGrpcProjectionContext,
  type VmmLuaSkillsGrpcToolDescriptor,
} from "./vmm-luaskills-grpc.js"
import { formatWorkspaceToolUnaryFailure } from "./vmm-tool-runtime.js"

/**
 * Stable plugin client name sent to vulcan-host LuaSkillsService.
 * 发送给 vulcan-host LuaSkillsService 的稳定插件客户端名称。
 */
const LUASKILLS_CLIENT_NAME = "opencode"

/**
 * Plugin client version marker used for LuaSkills diagnostics.
 * LuaSkills 诊断使用的插件客户端版本标记。
 */
const LUASKILLS_CLIENT_VERSION = "vmm-opencode-plugin"

/**
 * Extra notice appended after lifecycle operations that can change tool ids.
 * 会改变 tool id 的生命周期操作完成后追加的提示文本。
 */
const LUASKILL_TOOL_RESTART_NOTICE =
  "LuaSkills tool registry may have changed. OpenCode reads plugin tools during host startup, so restart OpenCode to make newly installed, updated, or removed LuaSkills tools visible to the model."

/**
 * JSON-object shape used while converting MCP input schema into Zod.
 * 将 MCP input schema 转换成 Zod 时使用的 JSON 对象形态。
 */
type JsonObject = Record<string, unknown>

/**
 * Raw OpenCode tool args shape accepted by `tool()`.
 * `tool()` 接收的 OpenCode 原始参数形态。
 */
type LuaSkillOpenCodeArgsShape = Record<string, any>

/**
 * Argument mapping mode selected for one dynamic LuaSkill descriptor.
 * 单个动态 LuaSkill 描述选择的参数映射模式。
 */
type LuaSkillArgumentMode = "direct" | "wrapped"

/**
 * Converted OpenCode args shape plus how execution should unwrap arguments.
 * 转换后的 OpenCode 参数形态，以及执行阶段应如何还原参数。
 */
type LuaSkillArgsBuildResult = {
  shape: LuaSkillOpenCodeArgsShape
  mode: LuaSkillArgumentMode
}

/**
 * Optional call-context fields used to build LuaSkills request metadata.
 * 用于构建 LuaSkills 请求元数据的可选调用上下文字段。
 */
type LuaSkillsCallContextInput = {
  sessionID?: string
  messageID?: string
  toolName?: string
}

/**
 * Minimal host identity used to request the managed LuaSkills surface.
 * 用于请求托管 LuaSkills 表面的最小宿主身份载荷。
 */
type LuaSkillsProjectionContextInput = {
  sessionID?: string
}

/**
 * Minimal descriptor fields needed to render model-facing LuaSkills help.
 * 渲染面向模型的 LuaSkills 帮助文本所需的最小描述字段。
 */
type LuaSkillToolDescriptionDescriptor = Pick<
  VmmLuaSkillsGrpcToolDescriptor,
  "name" | "description" | "input_schema_json"
>

/**
 * Supported lifecycle actions exposed by the single stable management tool.
 * 单个稳定管理 tool 暴露的生命周期操作集合。
 */
const LUASKILL_MANAGEMENT_ACTIONS = [
  "list",
  "install",
  "update",
  "uninstall",
  "reload_runtime_configs",
] as const

/**
 * Type of one stable lifecycle action accepted by `luaskill_tools`.
 * `luaskill_tools` 接收的一种稳定生命周期操作类型。
 */
type LuaSkillManagementAction = typeof LUASKILL_MANAGEMENT_ACTIONS[number]

/**
 * Return true when a value is a non-null JSON object.
 * 当某个值是非空 JSON 对象时返回 true。
 */
function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * Normalize one optional text field by trimming whitespace.
 * 通过裁剪空白规范化一项可选文本字段。
 */
function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

/**
 * Parse the descriptor-provided MCP input schema JSON into an object.
 * 把描述中提供的 MCP input schema JSON 解析成对象。
 */
function parseInputSchemaJson(inputSchemaJson: string): JsonObject {
  const text = inputSchemaJson.trim()
  if (!text) {
    return {}
  }

  try {
    const parsed = JSON.parse(text) as unknown
    return isJsonObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * Resolve a JSON-schema `type` value into a stable string list.
 * 把 JSON schema 的 `type` 值解析成稳定字符串列表。
 */
function resolveJsonSchemaTypes(schema: JsonObject) {
  const typeValue = schema["type"]
  if (typeof typeValue === "string") {
    return [typeValue]
  }
  if (Array.isArray(typeValue)) {
    return typeValue.filter((item): item is string => typeof item === "string")
  }
  return []
}

/**
 * Append enum hints to a schema description without enforcing every variant locally.
 * 把 enum 约束追加到 schema 描述里，但不在本地强制校验每个变体。
 *
 * LuaSkills remains the source of truth for validation. Keeping enum handling
 * descriptive avoids rejecting valid backend extensions before OpenCode restarts.
 * LuaSkills 仍然是校验的权威来源。这里把 enum 作为说明而不是强校验，
 * 可以避免后端扩展枚举后在 OpenCode 重启前被插件提前拒绝。
 */
function buildSchemaDescription(schema: JsonObject) {
  const parts: string[] = []
  const description = normalizeOptionalText(schema["description"])
  if (description) {
    parts.push(description)
  }

  const enumValues = schema["enum"]
  if (Array.isArray(enumValues) && enumValues.length > 0) {
    parts.push(`Allowed values: ${enumValues.map((item) => JSON.stringify(item)).join(", ")}.`)
  }

  return parts.join(" ")
}

/**
 * Render a compact JSON-schema type label for model-facing parameter help.
 * 为面向模型的参数帮助渲染紧凑的 JSON Schema 类型标签。
 */
function formatJsonSchemaTypeLabel(schema: JsonObject) {
  const types = resolveJsonSchemaTypes(schema).filter((item) => item !== "null")
  if (types.length > 0) {
    return types.join(" | ")
  }

  if (Array.isArray(schema["enum"]) && schema["enum"].length > 0) {
    return "enum"
  }

  if (isJsonObject(schema["properties"])) {
    return "object"
  }

  if (isJsonObject(schema["items"])) {
    return "array"
  }

  return "unknown"
}

/**
 * Build one human-readable parameter line from a JSON Schema property.
 * 从 JSON Schema 属性构建一行面向人的参数说明。
 */
function buildLuaSkillParameterDescriptionLine(
  name: string,
  propertySchema: JsonObject,
  required: Set<string>,
) {
  const presence = required.has(name) ? "required" : "optional"
  const typeLabel = formatJsonSchemaTypeLabel(propertySchema)
  const description = buildSchemaDescription(propertySchema)
  const prefix = `- ${name} (${presence}, ${typeLabel})`
  return description ? `${prefix}: ${description}` : prefix
}

/**
 * Render a parameter section that survives hosts ignoring JSON-schema property descriptions.
 * 渲染一段即使宿主忽略 JSON Schema 属性说明也仍能保留的参数说明区。
 *
 * Some model surfaces only expose the top-level tool description. Appending a
 * compact parameter summary there keeps LuaSkills usage rules visible without
 * weakening the structured Zod schema used for validation.
 * 有些模型链路只展示顶层 tool description。
 * 因此这里把紧凑参数摘要追加到顶层说明中，既保住 LuaSkills 用法规则可见，
 * 又不削弱用于校验的结构化 Zod schema。
 */
function buildLuaSkillParameterDescriptionSection(inputSchemaJson: string) {
  const schema = parseInputSchemaJson(inputSchemaJson)
  const properties = isJsonObject(schema["properties"]) ? schema["properties"] : {}
  const required = buildRequiredPropertySet(schema)
  const lines = Object.entries(properties)
    .filter((entry): entry is [string, JsonObject] => isJsonObject(entry[1]))
    .map(([name, propertySchema]) =>
      buildLuaSkillParameterDescriptionLine(name, propertySchema, required),
    )

  if (lines.length === 0) {
    return ""
  }

  return ["Input parameters:", ...lines].join("\n")
}

/**
 * Build the full top-level OpenCode description for one LuaSkills dynamic tool.
 * 为单个 LuaSkills 动态工具构建完整的 OpenCode 顶层说明。
 */
export function buildLuaSkillToolDescription(descriptor: LuaSkillToolDescriptionDescriptor) {
  const baseDescription =
    normalizeOptionalText(descriptor.description) ??
    `LuaSkills dynamic tool ${descriptor.name}.`
  const parameterSection = buildLuaSkillParameterDescriptionSection(descriptor.input_schema_json)
  return [baseDescription, parameterSection].filter(Boolean).join("\n\n")
}

/**
 * Attach a human-readable description to one Zod schema when available.
 * 在可用时给一条 Zod schema 附加面向人的描述。
 */
function describeZodSchema<TSchema>(schema: TSchema, description: string): TSchema {
  if (!description) {
    return schema
  }
  const describable = schema as {
    describe?: (text: string) => TSchema
  }
  return typeof describable.describe === "function" ? describable.describe(description) : schema
}

/**
 * Apply shared string constraints from JSON Schema to a Zod string.
 * 把 JSON Schema 中的通用字符串约束应用到 Zod string。
 */
function applyStringConstraints(schema: JsonObject, zodSchema: any) {
  let current = zodSchema
  if (typeof schema["minLength"] === "number") {
    current = current.min(schema["minLength"])
  }
  if (typeof schema["maxLength"] === "number") {
    current = current.max(schema["maxLength"])
  }
  if (typeof schema["pattern"] === "string") {
    try {
      current = current.regex(new RegExp(schema["pattern"]))
    } catch {
      // Invalid backend regex should not make plugin startup fail.
      // 后端正则无效不应导致插件启动失败。
    }
  }
  return current
}

/**
 * Apply shared numeric constraints from JSON Schema to a Zod number.
 * 把 JSON Schema 中的通用数字约束应用到 Zod number。
 */
function applyNumberConstraints(schema: JsonObject, zodSchema: any) {
  let current = zodSchema
  if (typeof schema["minimum"] === "number") {
    current = current.min(schema["minimum"])
  }
  if (typeof schema["maximum"] === "number") {
    current = current.max(schema["maximum"])
  }
  return current
}

/**
 * Apply shared array constraints from JSON Schema to a Zod array.
 * 把 JSON Schema 中的通用数组约束应用到 Zod array。
 */
function applyArrayConstraints(schema: JsonObject, zodSchema: any) {
  let current = zodSchema
  if (typeof schema["minItems"] === "number") {
    current = current.min(schema["minItems"])
  }
  if (typeof schema["maxItems"] === "number") {
    current = current.max(schema["maxItems"])
  }
  return current
}

/**
 * Convert a JSON Schema node into one Zod schema for OpenCode.
 * 把一个 JSON Schema 节点转换成 OpenCode 使用的一条 Zod schema。
 */
function buildZodSchemaFromJsonSchema(schema: JsonObject): any {
  const types = resolveJsonSchemaTypes(schema)
  const primaryType = types.find((item) => item !== "null")
  const description = buildSchemaDescription(schema)
  let zodSchema: any

  switch (primaryType) {
    case "string":
      zodSchema = applyStringConstraints(schema, tool.schema.string())
      break
    case "integer":
      zodSchema = applyNumberConstraints(schema, tool.schema.number().int())
      break
    case "number":
      zodSchema = applyNumberConstraints(schema, tool.schema.number())
      break
    case "boolean":
      zodSchema = tool.schema.boolean()
      break
    case "array": {
      const itemSchema = isJsonObject(schema["items"])
        ? buildZodSchemaFromJsonSchema(schema["items"])
        : tool.schema.unknown()
      zodSchema = applyArrayConstraints(
        schema,
        tool.schema.array(itemSchema),
      )
      break
    }
    case "object": {
      const properties = isJsonObject(schema["properties"]) ? schema["properties"] : {}
      const required = buildRequiredPropertySet(schema)
      const objectShape = buildObjectShapeFromProperties(properties, required)
      zodSchema = tool.schema.object(objectShape).passthrough()
      break
    }
    default:
      zodSchema = tool.schema.unknown()
      break
  }

  if (types.includes("null")) {
    zodSchema = zodSchema.nullable()
  }

  return describeZodSchema(zodSchema, description)
}

/**
 * Build the required-property set from one top-level or nested JSON Schema.
 * 从一条顶层或嵌套 JSON Schema 构建必填属性集合。
 */
function buildRequiredPropertySet(schema: JsonObject) {
  const required = schema["required"]
  if (!Array.isArray(required)) {
    return new Set<string>()
  }
  return new Set(required.filter((item): item is string => typeof item === "string"))
}

/**
 * Convert JSON Schema properties into an OpenCode raw args shape.
 * 把 JSON Schema properties 转换成 OpenCode 原始参数形态。
 */
function buildObjectShapeFromProperties(
  properties: JsonObject,
  required: Set<string>,
): LuaSkillOpenCodeArgsShape {
  const shape: LuaSkillOpenCodeArgsShape = {}
  for (const [name, propertySchema] of Object.entries(properties)) {
    if (!isJsonObject(propertySchema)) {
      continue
    }

    let zodSchema = buildZodSchemaFromJsonSchema(propertySchema)
    if (!required.has(name)) {
      zodSchema = zodSchema.optional()
    }
    shape[name] = zodSchema
  }
  return shape
}

/**
 * Build a generic wrapped argument shape when a descriptor has no mappable properties.
 * 当描述没有可映射 properties 时构造一份通用包装参数形态。
 */
function buildWrappedArgumentShape(description: string): LuaSkillArgsBuildResult {
  return {
    mode: "wrapped",
    shape: {
      arguments: tool.schema
        .record(tool.schema.string(), tool.schema.unknown())
        .optional()
        .describe(description),
    },
  }
}

/**
 * Convert one JSON-encoded input schema into OpenCode tool args.
 * 把一段 JSON 编码的 input schema 转换成 OpenCode tool 参数。
 *
 * This generic helper is shared by LuaSkills and stable VMM tool metadata so
 * every gRPC descriptor uses the same schema interpretation path.
 * 这个通用辅助函数由 LuaSkills 与稳定 VMM 工具元信息共享，
 * 让所有 gRPC descriptor 都走同一套 schema 解释路径。
 */
export function buildOpenCodeArgsShapeFromInputSchema(
  inputSchemaJson: string,
  wrappedDescription: string,
): LuaSkillArgsBuildResult {
  const schema = parseInputSchemaJson(inputSchemaJson)
  const properties = isJsonObject(schema["properties"]) ? schema["properties"] : {}
  const propertyNames = Object.keys(properties)

  if (propertyNames.length === 0) {
    return buildWrappedArgumentShape(wrappedDescription)
  }

  return {
    mode: "direct",
    shape: buildObjectShapeFromProperties(properties, buildRequiredPropertySet(schema)),
  }
}

/**
 * Convert one LuaSkills descriptor input schema into OpenCode tool args.
 * 把单个 LuaSkills 描述的 input schema 转换成 OpenCode tool 参数。
 */
export function buildLuaSkillOpenCodeArgsShape(
  descriptor: Pick<VmmLuaSkillsGrpcToolDescriptor, "input_schema_json">,
): LuaSkillArgsBuildResult {
  return buildOpenCodeArgsShapeFromInputSchema(
    descriptor.input_schema_json,
    "Raw LuaSkills argument object. Use this only when the LuaSkill descriptor does not expose a structured JSON schema.",
  )
}

/**
 * Build the trusted LuaSkills gRPC context for a startup or tool call.
 * 为启动或 tool 调用构建受信任的 LuaSkills gRPC 上下文。
 */
function buildLuaSkillsClientContext(input: LuaSkillsCallContextInput = {}): VmmLuaSkillsGrpcClientContext {
  return {
    client_name: LUASKILLS_CLIENT_NAME,
    client_version: LUASKILLS_CLIENT_VERSION,
    request_id: [input.sessionID, input.messageID, input.toolName].filter(Boolean).join(":"),
  }
}

/**
 * Build the managed LuaSkills projection context for hosts that can supply session ids on every call.
 * 为能够在每次调用时提供 session id 的宿主构建托管 LuaSkills 投影上下文。
 */
function buildLuaSkillsProjectionContext(
  input: LuaSkillsProjectionContextInput = {},
): VmmLuaSkillsGrpcProjectionContext {
  return {
    supports_managed_luaskill_sid: true,
    session_id: normalizeOptionalText(input.sessionID),
  }
}

/**
 * Convert OpenCode tool args back into the LuaSkills JSON argument object.
 * 把 OpenCode tool 参数还原成 LuaSkills JSON 参数对象。
 */
function buildLuaSkillCallArguments(args: Record<string, unknown>, mode: LuaSkillArgumentMode) {
  if (mode === "wrapped" && isJsonObject(args["arguments"])) {
    return args["arguments"]
  }
  return args
}

/**
 * Render one LuaSkills service-level error as model-readable JSON.
 * 把一条 LuaSkills 服务级错误渲染成模型可读的 JSON。
 */
function renderLuaSkillsServiceError(message: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify(
    {
      ok: false,
      message,
      ...extra,
    },
    null,
    2,
  )
}

/**
 * Build one OpenCode dynamic tool wrapper from a LuaSkills descriptor.
 * 基于 LuaSkills 描述构造一个 OpenCode 动态 tool 包装器。
 */
function buildDynamicLuaSkillTool(
  descriptor: VmmLuaSkillsGrpcToolDescriptor,
  argsBuildResult: LuaSkillArgsBuildResult,
): ToolDefinition {
  return tool({
    description: buildLuaSkillToolDescription(descriptor),
    args: argsBuildResult.shape,
    async execute(args, context) {
      const runtimeConfig = await loadVmmConfig(context.directory)
      const transportConfig = extractTransportConfig(runtimeConfig)
      const luaArgs = buildLuaSkillCallArguments(args as Record<string, unknown>, argsBuildResult.mode)
      const result = await callVmmLuaSkillsCallTool({
        config: transportConfig,
        request: {
          context: buildLuaSkillsClientContext({
            sessionID: context.sessionID,
            messageID: context.messageID,
            toolName: descriptor.name,
          }),
          projection: buildLuaSkillsProjectionContext({
            sessionID: context.sessionID,
          }),
          tool_name: descriptor.name,
          arguments_json: JSON.stringify(luaArgs),
        },
      })

      if (!result.ok || !result.response) {
        return formatWorkspaceToolUnaryFailure(`LuaSkills.${descriptor.name}`, result)
      }

      context.metadata({
        title: `LuaSkill ${descriptor.name}`,
        metadata: {
          skillID: descriptor.skill_id,
          entryName: descriptor.entry_name,
          rootName: descriptor.root_name,
          isError: result.response.is_error,
        },
      })

      if (result.response.text) {
        return result.response.text
      }
      if (result.response.result_json) {
        return result.response.result_json
      }
      return result.response.message
    },
  })
}

/**
 * Load the current transport config for LuaSkills management operations.
 * 为 LuaSkills 管理操作加载当前传输配置。
 */
async function loadLuaSkillsTransportConfig(directory: string): Promise<VmmGrpcTransportConfig> {
  const runtimeConfig = await loadVmmConfig(directory)
  return extractTransportConfig(runtimeConfig)
}

/**
 * Append restart guidance to lifecycle results that change the OpenCode tool set.
 * 给会改变 OpenCode tool 集合的生命周期结果追加重启提示。
 */
function appendLifecycleRestartNotice(text: string) {
  return [text.trim(), "", LUASKILL_TOOL_RESTART_NOTICE].filter(Boolean).join("\n")
}

/**
 * Build the single stable management wrapper for LuaSkills lifecycle operations.
 * 构建 LuaSkills 生命周期操作使用的单个稳定管理包装 tool。
 */
function buildLuaSkillManagementTool(directory: string): ToolDefinition {
  return tool({
    description:
      "Manage LuaSkills packages through vulcan-host. Use `list` freely for diagnostics. Only call `install`, `update`, or `uninstall` when the user explicitly asks for that exact lifecycle operation. After lifecycle changes, tell the user to restart OpenCode so changed LuaSkills tool ids are registered.",
    args: {
      action: tool.schema
        .enum(LUASKILL_MANAGEMENT_ACTIONS)
        .describe("LuaSkills management action to run."),
      source: tool.schema
        .string()
        .trim()
        .optional()
        .describe("Install source locator. Required for action=install, for example LuaSkills/vulcan-codekit."),
      sourceType: tool.schema
        .string()
        .trim()
        .optional()
        .describe("Optional install source type override accepted by vulcan-host."),
      skillId: tool.schema
        .string()
        .trim()
        .optional()
        .describe("Target skill id. Required for action=update and action=uninstall."),
    },
    async execute(args, context) {
      const transportConfig = await loadLuaSkillsTransportConfig(directory || context.directory)
      const requestContext = buildLuaSkillsClientContext({
        sessionID: context.sessionID,
        messageID: context.messageID,
        toolName: "luaskill_tools",
      })

      switch (args.action as LuaSkillManagementAction) {
        case "list": {
          const result = await callVmmLuaSkillsListInstalled({
            config: transportConfig,
            request: {
              context: requestContext,
            },
          })
          if (!result.ok || !result.response) {
            return formatWorkspaceToolUnaryFailure("LuaSkills.ListInstalledSkills", result)
          }
          return result.response.text || result.response.message
        }
        case "install": {
          if (!args.source) {
            return renderLuaSkillsServiceError("action=install requires source.")
          }
          const result = await callVmmLuaSkillsInstall({
            config: transportConfig,
            request: {
              context: requestContext,
              source: args.source,
              source_type: args.sourceType,
            },
          })
          if (!result.ok || !result.response) {
            return formatWorkspaceToolUnaryFailure("LuaSkills.InstallSkill", result)
          }
          return appendLifecycleRestartNotice(result.response.text || result.response.message)
        }
        case "update": {
          if (!args.skillId) {
            return renderLuaSkillsServiceError("action=update requires skillId.")
          }
          const result = await callVmmLuaSkillsUpdate({
            config: transportConfig,
            request: {
              context: requestContext,
              skill_id: args.skillId,
            },
          })
          if (!result.ok || !result.response) {
            return formatWorkspaceToolUnaryFailure("LuaSkills.UpdateSkill", result)
          }
          return appendLifecycleRestartNotice(result.response.text || result.response.message)
        }
        case "uninstall": {
          if (!args.skillId) {
            return renderLuaSkillsServiceError("action=uninstall requires skillId.")
          }
          const result = await callVmmLuaSkillsUninstall({
            config: transportConfig,
            request: {
              context: requestContext,
              skill_id: args.skillId,
            },
          })
          if (!result.ok || !result.response) {
            return formatWorkspaceToolUnaryFailure("LuaSkills.UninstallSkill", result)
          }
          return appendLifecycleRestartNotice(result.response.text || result.response.message)
        }
        case "reload_runtime_configs": {
          const result = await callVmmLuaSkillsReloadRuntimeConfigs({
            config: transportConfig,
            request: {
              context: requestContext,
            },
          })
          if (!result.ok || !result.response) {
            return formatWorkspaceToolUnaryFailure("LuaSkills.ReloadRuntimeConfigs", result)
          }
          return result.response.text || result.response.message
        }
      }
    },
  })
}

/**
 * Build the complete LuaSkills OpenCode tool registry for one plugin instance.
 * 为单个插件实例构建完整 LuaSkills OpenCode tool 注册表。
 */
export async function buildVmmLuaSkillTools(directory: string): Promise<Record<string, ToolDefinition>> {
  const registry: Record<string, ToolDefinition> = {
    luaskill_tools: buildLuaSkillManagementTool(directory),
  }

  const runtimeConfig = await loadVmmConfig(directory)
  const transportConfig = extractTransportConfig(runtimeConfig)
  const result = await callVmmLuaSkillsListTools({
    config: transportConfig,
    request: {
      context: buildLuaSkillsClientContext({
        toolName: "startup",
      }),
      projection: buildLuaSkillsProjectionContext(),
    },
  })

  if (!result.ok || !result.response) {
    return registry
  }

  for (const descriptor of result.response.tools) {
    const toolName = normalizeOptionalText(descriptor.name)
    if (!toolName || toolName === "luaskill_tools") {
      continue
    }

    registry[toolName] = buildDynamicLuaSkillTool(
      descriptor,
      buildLuaSkillOpenCodeArgsShape(descriptor),
    )
  }

  return registry
}
