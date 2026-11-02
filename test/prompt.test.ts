import { describe, expect, it } from "vitest";
import { loadInstructions } from "../src/prompt.ts";

describe("loadInstructions", () => {
  it("fills in the budget and appends the category checks", async () => {
    const instructions = await loadInstructions(12);

    expect(instructions).toContain("request budget of 12");
    expect(instructions).not.toContain("{{budget}}");
    expect(instructions).toMatch(/## Category checks[\s\S]*### Pet food/);
  });
});
