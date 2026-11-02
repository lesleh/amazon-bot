import { describe, expect, it } from "vitest";
import { parseCliArgs, UsageError } from "../src/cli.ts";

describe("parseCliArgs", () => {
  it("joins the request and applies defaults", () => {
    expect(parseCliArgs(["cordless", "drill"])).toEqual({
      request: "cordless drill",
      budget: 15,
      provider: "claude-code",
      model: "haiku",
    });
  });

  it("uses the default model for the chosen provider", () => {
    expect(parseCliArgs(["drill", "--provider", "anthropic"])).toMatchObject({
      provider: "anthropic",
      model: "claude-haiku-5-5",
    });
  });

  it("reads the budget and model flags", () => {
    expect(
      parseCliArgs(["drill", "--budget", "8", "--model", "sonnet"]),
    ).toMatchObject({ request: "drill", budget: 8, model: "sonnet" });
  });

  it.each([
    ["--record", "record"],
    ["--replay", "replay"],
  ])("reads %s with its directory", (flag, mode) => {
    expect(parseCliArgs(["drill", flag, "recordings/drill"])).toMatchObject({
      recording: { mode, dir: "recordings/drill" },
    });
  });

  it.each([
    [["drill", "--record", "a", "--replay", "b"]],
    [[]],
    [["drill", "--budget", "0"]],
    [["drill", "--budget", "lots"]],
    [["drill", "--provider", "openai"]],
  ])("rejects bad input %j", (argv) => {
    expect(() => parseCliArgs(argv)).toThrow(UsageError);
  });
});
