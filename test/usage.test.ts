import type { LanguageModelUsage } from "ai";
import { describe, expect, it } from "vitest";
import { formatUsage } from "../src/usage.ts";

const usage = {
  inputTokens: 110844,
  inputTokenDetails: {
    noCacheTokens: 1200,
    cacheReadTokens: 98000,
    cacheWriteTokens: 11644,
  },
  outputTokens: 6359,
  outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
} as LanguageModelUsage;

describe("formatUsage", () => {
  it("splits input tokens by cache use and adds the cost", () => {
    expect(formatUsage(usage, 0.04213)).toBe(
      "Tokens: 110,844 in (98,000 cache reads, 11,644 cache writes, 1,200 uncached), 6,359 out. Model cost: $0.042.",
    );
  });

  it("leaves out the cost when the provider does not report one", () => {
    expect(formatUsage(usage)).not.toContain("Model cost");
  });
});
