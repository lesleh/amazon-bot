import { describe, expect, it } from "vitest";
import { DEFAULT_MODEL } from "../src/agent.ts";
import { parseCliArgs, UsageError } from "../src/cli.ts";

describe("parseCliArgs", () => {
  it("joins the request and applies defaults", () => {
    expect(parseCliArgs(["dry", "cat food"])).toEqual({
      request: "dry cat food",
      budget: 15,
      model: DEFAULT_MODEL,
    });
  });

  it("reads the budget and model flags", () => {
    expect(
      parseCliArgs([
        "cat food",
        "--budget",
        "8",
        "--model",
        "claude-sonnet-5-5",
      ]),
    ).toEqual({ request: "cat food", budget: 8, model: "claude-sonnet-5-5" });
  });

  it.each([
    [[]],
    [["cat food", "--budget", "0"]],
    [["cat food", "--budget", "lots"]],
  ])("rejects bad input %j", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
  });
});
