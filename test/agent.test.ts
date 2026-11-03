import { describe, expect, it } from "vitest";
import { toMcpResult } from "../src/agent.ts";

describe("toMcpResult", () => {
  it("turns listing images into MCP image content", () => {
    expect(
      toMcpResult({
        asin: "B000TEST01",
        images: [{ data: "cG5n", mediaType: "image/png" }],
      }),
    ).toEqual({
      content: [
        {
          type: "text",
          text: "1 listing images for B000TEST01, in listing order.",
        },
        { type: "image", data: "cG5n", mimeType: "image/png" },
      ],
    });
  });

  it("marks an error as an MCP error", () => {
    expect(toMcpResult({ error: "No." })).toEqual({
      content: [{ type: "text", text: "No." }],
      isError: true,
    });
  });
});
