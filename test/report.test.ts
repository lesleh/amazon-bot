import { describe, expect, it } from "vitest";
import { finalReport } from "../src/report.ts";

describe("finalReport", () => {
  it("keeps only the text after the last tool call", () => {
    expect(
      finalReport([
        { type: "text", text: "Let me search Amazon." },
        { type: "tool-call" },
        { type: "tool-result" },
        { type: "text", text: "Now the reviews." },
        { type: "tool-call" },
        { type: "tool-result" },
        { type: "reasoning", text: "thinking" },
        { type: "text", text: "## Recommendation\n" },
        { type: "text", text: "Buy the drill." },
      ]),
    ).toBe("## Recommendation\nBuy the drill.");
  });

  it("returns all text when there were no tool calls", () => {
    expect(finalReport([{ type: "text", text: "Report" }])).toBe("Report");
  });
});
