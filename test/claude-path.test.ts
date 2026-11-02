import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { findClaudeExecutable } from "../src/claude-path.ts";

describe("findClaudeExecutable", () => {
  it("prefers CLAUDE_CODE_PATH", () => {
    expect(
      findClaudeExecutable({ CLAUDE_CODE_PATH: "/opt/claude", PATH: "/bin" }),
    ).toBe("/opt/claude");
  });

  it("finds an executable claude on PATH", async () => {
    const empty = await mkdtemp(join(tmpdir(), "amazon-bot-"));
    const bin = await mkdtemp(join(tmpdir(), "amazon-bot-"));
    await writeFile(join(bin, "claude"), "#!/bin/sh\n");
    await chmod(join(bin, "claude"), 0o755);

    expect(findClaudeExecutable({ PATH: [empty, bin].join(delimiter) })).toBe(
      join(bin, "claude"),
    );
  });

  it("returns undefined when claude is not installed", async () => {
    const empty = await mkdtemp(join(tmpdir(), "amazon-bot-"));

    expect(findClaudeExecutable({ PATH: empty })).toBeUndefined();
  });
});
