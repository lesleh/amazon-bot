import {
  type AnthropicLanguageModelOptions,
  anthropic,
} from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import { claudeCode, createAiSdkMcpServer } from "ai-sdk-provider-claude-code";
import type { CanopyClient } from "./canopy.ts";
import { type CanopyToolsOptions, createCanopyTools } from "./tools.ts";

export const PROVIDERS = ["claude-code", "anthropic"] as const;
export type ProviderName = (typeof PROVIDERS)[number];

export const DEFAULT_PROVIDER: ProviderName = "claude-code";
export const DEFAULT_MODELS: Record<ProviderName, string> = {
  "claude-code": "haiku",
  anthropic: "claude-haiku-5-5",
};

const MAX_STEPS = 40;

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
        systemPrompt: instructions,
        tools: ["WebSearch"],
        mcpServers: { canopy: createAiSdkMcpServer("canopy", canopyTools) },
        allowedTools: [
          "WebSearch",
          ...Object.keys(canopyTools).map((name) => `mcp__canopy__${name}`),
        ],
        maxTurns: MAX_STEPS,
      }),
    });
  }

  return new ToolLoopAgent({
    model: anthropic(modelId),
    instructions,
    tools: {
      ...canopyTools,
      web_search: anthropic.tools.webSearch_20260209({
        maxUses: 10,
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
