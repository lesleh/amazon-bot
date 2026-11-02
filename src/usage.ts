import type { LanguageModelUsage } from "ai";

const count = (n: number | undefined) => (n ?? 0).toLocaleString("en-GB");

// Cache reads cost a tenth of uncached input, so the split matters more than the total.
export function formatUsage(
  usage: LanguageModelUsage,
  costUsd?: number,
): string {
  const { noCacheTokens, cacheReadTokens, cacheWriteTokens } =
    usage.inputTokenDetails;
  const tokens =
    `Tokens: ${count(usage.inputTokens)} in ` +
    `(${count(cacheReadTokens)} cache reads, ${count(cacheWriteTokens)} cache writes, ${count(noCacheTokens)} uncached), ` +
    `${count(usage.outputTokens)} out.`;
  return costUsd === undefined
    ? tokens
    : `${tokens} Model cost: $${costUsd.toFixed(3)}.`;
}

export interface ModelCost {
  costUSD: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  webSearchRequests: number;
}

// Claude Code reports every model call, including the ones its web search makes.
export function formatModelCosts(models: Record<string, ModelCost>): string[] {
  return Object.entries(models).map(
    ([model, m]) =>
      `  ${model}: $${m.costUSD.toFixed(3)} (${count(m.inputTokens)} uncached in, ` +
      `${count(m.cacheReadInputTokens)} cache reads, ${count(m.cacheCreationInputTokens)} cache writes, ` +
      `${count(m.outputTokens)} out, ${m.webSearchRequests} web searches)`,
  );
}
