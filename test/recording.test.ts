import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { recordingFetch, recordingKey, replayFetch } from "../src/recording.ts";

const productUrl = new URL(
  "https://rest.canopyapi.co/api/amazon/product/top-reviews?domain=UK&asin=B000TEST01",
);

describe("recordingKey", () => {
  it("names the file by endpoint and sorted query", () => {
    expect(recordingKey(productUrl)).toBe(
      "product_top-reviews--asin=B000TEST01&domain=UK.json",
    );
  });
});

describe("recording and replay", () => {
  it("replays a recorded response without calling the network", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amazon-bot-"));
    const inner = vi.fn(async () => new Response('{"ok":true}'));

    await recordingFetch(dir, inner)(productUrl);
    const replayed = await replayFetch(dir)(productUrl);

    expect(await replayed.json()).toEqual({ ok: true });
    expect(inner).toHaveBeenCalledOnce();
  });

  it("does not record failed responses", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amazon-bot-"));
    const inner = vi.fn(async () => new Response("nope", { status: 500 }));

    const response = await recordingFetch(dir, inner)(productUrl);

    expect(response.status).toBe(500);
    expect(await readdir(dir)).toEqual([]);
  });

  it("fails a replay for a request that was not recorded", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amazon-bot-"));

    await expect(replayFetch(dir)(productUrl)).rejects.toThrow(
      "No recorded response for product_top-reviews--asin=B000TEST01&domain=UK.json",
    );
  });

  it("falls back to the only recorded search for a reworded query", async () => {
    const dir = await mkdtemp(join(tmpdir(), "amazon-bot-"));
    const search = (term: string) =>
      new URL(
        `https://rest.canopyapi.co/api/amazon/search?domain=UK&searchTerm=${term}`,
      );
    await recordingFetch(
      dir,
      async () => new Response('{"term":"a"}'),
    )(search("cat+food"));

    const replayed = await replayFetch(dir)(search("dry+cat+food"));

    expect(await replayed.json()).toEqual({ term: "a" });
  });
});
