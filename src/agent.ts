import {
  type AnthropicLanguageModelOptions,
  anthropic,
} from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import {
  claudeCode,
  createAiSdkMcpServer,
  type Logger,
} from "ai-sdk-provider-claude-code";
import type { CanopyClient } from "./canopy.ts";
import { findClaudeExecutable } from "./claude-path.ts";
import { type CanopyToolsOptions, createCanopyTools } from "./tools.ts";
import { MAX_WEB_SEARCHES, webSearchLimitHook } from "./web-search-limit.ts";

export const PROVIDERS = ["claude-code", "anthropic"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const DEFAULT_PROVIDER: ProviderName = "claude-code";
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  "claude-code": "claude-haiku-5-5",
  anthropic: "claude-haiku-5-5",
};

const MAX_STEPS = 40;

// The provider knows only the aliases, which resolve to older models, so it warns about full IDs.
export const isUnknownModelWarning = (message: string) =>
  message.includes("Unknown model ID");

const claudeCodeLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: (message) => {
    if (!isUnknownModelWarning(message)) console.warn(message);
  },
  error: (message) => console.error(message),
};

export interface ShopperAgentOptions extends CanopyToolsOptions {
  canopy: CanopyClient;
  instructions: string;
  provider?: ProviderName;
  modelId?: string;
}

export function createShopperAgent({
  canopy,
  instructions,
  provider = DEFAULT_PROVIDER,
  modelId = DEFAULT_MODELS[provider],
  ...toolOptions
}: ShopperAgentOptions) {
  const canopyTools = createCanopyTools(canopy, toolOptions);

  if (provider === "claude-code") {
    // Claude Code runs its own tool loop, so the Canopy tools go in as an MCP server.
    return new ToolLoopAgent({
      model: claudeCode(modelId, {
        pathToClaudeCodeExecutable: findClaudeExecutable(),
        logger: claudeCodeLogger,
        systemPrompt: instructions,
        tools: ["WebSearch"],
        mcpServers: { canopy: createAiSdkMcpServer("canopy", canopyTools) },
        allowedTools: [
          "WebSearch",
          ...Object.keys(canopyTools).map((name) => `mcp__canopy__${name}`),
        ],
        maxTurns: MAX_STEPS,
        hooks: {
          PreToolUse: [{ matcher: "WebSearch", hooks: [webSearchLimitHook()] }],
        },
      }),
    });
  }

  return new ToolLoopAgent({
    model: anthropic(modelId),
    instructions,
    tools: {
      ...canopyTools,
      web_search: anthropic.tools.webSearch_20260209({
        maxUses: MAX_WEB_SEARCHES,
        userLocation: { type: "approximate", country: "GB" },
      }),
    },
    stopWhen: stepCountIs(MAX_STEPS),
    maxOutputTokens: 16_000,
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "high",
      } satisfies AnthropicLanguageModelOptions,
    },
  });
}
