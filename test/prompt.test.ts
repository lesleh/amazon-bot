import { describe, expect, it } from "vitest";
import { loadInstructions } from "../src/prompt.ts";

describe("loadInstructions", () => {
  it("fills in the values and appends the category checks", async () => {
    const instructions = await loadInstructions({ budget: 12, candidates: 3 });

    expect(instructions).toContain("request budget of 12");
    expect(instructions).toContain("hold 3 candidates at once");
    expect(instructions).not.toMatch(/\{\{\w+\}\}/);
    expect(instructions).toMatch(/## Category checks[\s\S]*### Pet food/);
  });
});
