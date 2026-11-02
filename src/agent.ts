import {
  type AnthropicLanguageModelOptions,
  anthropic,
} from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import type { CanopyClient } from "./canopy.ts";
import { createCanopyTools } from "./tools.ts";

export const DEFAULT_MODEL = "claude-haiku-5-5";

export interface ShopperAgentOptions {
  canopy: CanopyClient;
  instructions: string;
  modelId?: string;
}

export function createShopperAgent({
  canopy,
  instructions,
  modelId = DEFAULT_MODEL,
}: ShopperAgentOptions) {
  return new ToolLoopAgent({
    model: anthropic(modelId),
    instructions,
    tools: {
      ...createCanopyTools(canopy),
      web_search: anthropic.tools.webSearch_20260209({
        maxUses: 10,
        userLocation: { type: "approximate", country: "GB" },
      }),
    },
    stopWhen: stepCountIs(40),
    maxOutputTokens: 16_000,
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "high",
      } satisfies AnthropicLanguageModelOptions,
    },
  });
}
