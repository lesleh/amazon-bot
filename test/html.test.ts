import { describe, expect, it } from "vitest";
import { renderReport } from "../src/html.ts";
import { sampleReport } from "./fixtures/report.ts";

const run = {
  request: "dry cat food",
  generatedAt: new Date("2026-11-03T10:30:00Z"),
  model: "claude-haiku-5-5",
  canopyRequests: 13,
  budget: 15,
  replayed: true,
  modelCostUsd: 0.082,
};

describe("renderReport", () => {
  it("shows the pick with its Amazon link and a resized photo", () => {
    const html = renderReport(sampleReport, run);

    expect(html).toContain('<p class="eyebrow">Recommended</p>');
    expect(html).toContain('href="https://www.amazon.co.uk/dp/B07HXGTZ73"');
    expect(html).toContain(
      "https://m.media-amazon.com/images/I/715LxHofJYL._AC_SL500_.jpg",
    );
    expect(html).toContain("13 of 15 Canopy requests (replayed)");
  });

  it("escapes text from the report", () => {
    const html = renderReport(
      { ...sampleReport, summary: '<script>alert("x")</script>' },
      run,
    );

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
  });

  it("links only to web addresses", () => {
    const html = renderReport(
      {
        ...sampleReport,
        sources: [{ title: "Bad", url: "javascript:alert(1)" }],
      },
      run,
    );

    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="#">Bad</a>');
  });

  it("says so when there is no recommendation", () => {
    const html = renderReport(
      { ...sampleReport, recommendedAsin: null, headline: "Nothing passed." },
      run,
    );

    expect(html).toContain("No recommendation");
    expect(html).toContain("<h2>Nothing passed.</h2>");
  });
});
