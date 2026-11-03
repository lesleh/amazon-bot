import {
  type AnthropicLanguageModelOptions,
  anthropic,
} from "@ai-sdk/anthropic";
import { stepCountIs, ToolLoopAgent } from "ai";
import {
  claudeCode,
  createAiSdkMcpServer,
  createCustomMcpServer,
  type Logger,
  type MinimalCallToolResult,
} from "ai-sdk-provider-claude-code";
import { z } from "zod";
import type { CanopyClient } from "./canopy.ts";
import { findClaudeExecutable } from "./claude-path.ts";
import {
  type CanopyToolsOptions,
  createCanopyTools,
  type ListingImagesOutput,
  READ_LISTING_IMAGES_DESCRIPTION,
} from "./tools.ts";
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

export function toMcpResult(
  output: ListingImagesOutput,
): MinimalCallToolResult {
  if ("error" in output) {
    return { content: [{ type: "text", text: output.error }], isError: true };
  }
  return {
    content: [
      {
        type: "text",
        text: `${output.images.length} listing images for ${output.asin}, in listing order.`,
      },
      ...output.images.map((image) => ({
        type: "image" as const,
        data: image.data,
        mimeType: image.mediaType,
      })),
    ],
  };
}

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
  const { tools: canopyTools, readListingImages } = createCanopyTools(
    canopy,
    toolOptions,
  );

  if (provider === "claude-code") {
    // Claude Code runs its own tool loop, so the Canopy tools go in as an MCP server.
    // That bridge returns only text, so the image tool gets a server of its own.
    const { read_listing_images: _readImages, ...textTools } = canopyTools;
    const listing = createCustomMcpServer({
      name: "listing",
      tools: {
        read_listing_images: {
          description: READ_LISTING_IMAGES_DESCRIPTION,
          inputSchema: z.object({ asin: z.string() }),
          handler: async (args) =>
            toMcpResult(
              await readListingImages((args as { asin: string }).asin),
            ),
        },
      },
    });
    return new ToolLoopAgent({
      model: claudeCode(modelId, {
        pathToClaudeCodeExecutable: findClaudeExecutable(),
        logger: claudeCodeLogger,
        systemPrompt: instructions,
        tools: ["WebSearch"],
        mcpServers: {
          canopy: createAiSdkMcpServer("canopy", textTools),
          listing,
        },
        allowedTools: [
          "WebSearch",
          ...Object.keys(textTools).map((name) => `mcp__canopy__${name}`),
          "mcp__listing__read_listing_images",
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
