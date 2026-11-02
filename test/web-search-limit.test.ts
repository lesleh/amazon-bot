import { describe, expect, it } from "vitest";
import { webSearchLimitHook } from "../src/web-search-limit.ts";

describe("webSearchLimitHook", () => {
  it("allows searches up to the limit, then denies them", async () => {
    const hook = webSearchLimitHook(2);

    expect(await hook()).toEqual({});
    expect(await hook()).toEqual({});
    expect(await hook()).toEqual({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          "You have used all 2 web searches. Report on what you have.",
      },
    });
  });
});
