import { describe, expect, it, vi } from "vitest";
import { fetchListingImages, resizedImageUrl } from "../src/images.ts";

describe("resizedImageUrl", () => {
  it.each([
    [
      "https://m.media-amazon.com/images/I/81yRYw4vdAL._AC_SL1500_.jpg",
      "https://m.media-amazon.com/images/I/81yRYw4vdAL._AC_SL1000_.jpg",
    ],
    [
      "https://m.media-amazon.com/images/I/715LxHofJYL.jpg",
      "https://m.media-amazon.com/images/I/715LxHofJYL._AC_SL1000_.jpg",
    ],
  ])("asks Amazon for 1,000 pixels: %s", (url, resized) => {
    expect(resizedImageUrl(url)).toBe(resized);
  });

  it("ignores images that are not on Amazon's image server", () => {
    expect(resizedImageUrl("https://example.com/images/I/abc.jpg")).toBe(
      undefined,
    );
  });
});

describe("fetchListingImages", () => {
  const url = (n: number) => `https://m.media-amazon.com/images/I/img${n}.jpg`;

  it("fetches at most 8 images", async () => {
    const fetch = vi.fn(
      async () =>
        new Response("x", { headers: { "content-type": "image/jpeg" } }),
    );

    const images = await fetchListingImages(
      Array.from({ length: 10 }, (_, n) => url(n)),
      fetch,
    );

    expect(images).toHaveLength(8);
    expect(images[0]).toEqual({ data: "eA==", mediaType: "image/jpeg" });
  });

  it("fails when Amazon returns something other than an image", async () => {
    const fetch = vi.fn(async () => new Response("<html>"));

    await expect(fetchListingImages([url(1)], fetch)).rejects.toThrow(
      "Amazon returned text/plain",
    );
  });

  it("fails when Amazon returns an error", async () => {
    const fetch = vi.fn(async () => new Response("", { status: 404 }));

    await expect(fetchListingImages([url(1)], fetch)).rejects.toThrow(
      "Amazon returned HTTP 404",
    );
  });
});
