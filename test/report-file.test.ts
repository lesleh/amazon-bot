import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import {
  defaultRecordingDir,
  reportFileName,
  saveReport,
} from "../src/report-file.ts";

const date = new Date(2026, 10, 3, 9, 5);

describe("reportFileName", () => {
  it("starts with the date and time, then names the request", () => {
    expect(reportFileName("Dry cat food, not too expensive!", date)).toBe(
      "2026-11-03-0905-dry-cat-food-not-too-expensive.html",
    );
  });

  it("falls back to a plain name for a request with no letters", () => {
    expect(reportFileName("£££", date)).toBe("2026-11-03-0905-report.html");
  });
});

describe("saveReport", () => {
  it("writes the page and returns its path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amazon-bot-"));

    const path = await saveReport(
      "<html></html>",
      "eye mask",
      date,
      pathToFileURL(`${dir}/reports/`),
    );

    expect(path).toBe(join(dir, "reports", "2026-11-03-0905-eye-mask.html"));
    expect(await readFile(path, "utf8")).toBe("<html></html>");
  });
});

describe("defaultRecordingDir", () => {
  it("names the folder like the report, inside recordings", () => {
    expect(defaultRecordingDir("eye mask", date)).toMatch(
      /\/recordings\/2026-11-03-0905-eye-mask\/$/,
    );
  });
});
