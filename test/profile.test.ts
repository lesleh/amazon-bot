import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProfile, withProfile } from "../src/prompt.ts";

describe("loadProfile", () => {
  it("reads and trims the profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amazon-bot-"));
    await writeFile(join(dir, "profile.md"), "\nWe have 4 cats.\n\n");

    expect(await loadProfile(pathToFileURL(join(dir, "profile.md")))).toBe(
      "We have 4 cats.",
    );
  });

  it("returns undefined when there is no profile", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amazon-bot-"));

    expect(
      await loadProfile(pathToFileURL(join(dir, "profile.md"))),
    ).toBeUndefined();
  });
});

describe("withProfile", () => {
  it("puts the profile before the request", () => {
    expect(withProfile("dry cat food", "We have 4 cats.")).toBe(
      "## My household\n\nWe have 4 cats.\n\n## What I want\n\ndry cat food",
    );
  });

  it("leaves the request alone without a profile", () => {
    expect(withProfile("dry cat food")).toBe("dry cat food");
  });
});
