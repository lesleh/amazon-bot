import { describe, expect, it, vi } from "vitest";
import { createCanopyClient } from "../src/canopy.ts";
import { CANOPY_TOOL_NAMES, createCanopyTools } from "../src/tools.ts";

const options = { toolCallId: "1", messages: [], context: {} };

// Answers each Canopy path with its own body, so multi-request tools can be tested.
function toolsWith(
  bodies: Record<string, unknown>,
  { budget = 20, status = 200, onFatalError = vi.fn(), maxCandidates = 2 } = {},
) {
  const fetch = vi.fn(async (url: URL | RequestInfo) => {
    const path = new URL(String(url)).pathname.replace("/api/amazon", "");
    return new Response(JSON.stringify(bodies[path] ?? {}), { status });
  });
  const { tools } = createCanopyTools(
    createCanopyClient({ apiKey: "k", budget, fetch }),
    { onFatalError, maxCandidates },
  );
  return { tools, fetch };
}

const productBody = {
  data: {
    amazonProduct: {
      asin: "B000TEST01",
      title: "Drill",
      price: { display: "£45.00" },
      seller: { sellerId: "LISTING", name: "Listing seller" },
    },
  },
};

function offersBody(...offers: unknown[]) {
  return { data: { amazonProduct: { offersPaginated: { offers } } } };
}

const amazonOffer = {
  price: { display: "£39.99" },
  isPrime: true,
  buyboxWinner: true,
  delivery: { fulfilledByAmazon: true },
  seller: { id: "AMZ", name: "Amazon" },
};

describe("createCanopyTools", () => {
  it("lists every tool in CANOPY_TOOL_NAMES", () => {
    const { tools } = toolsWith({});

    expect(new Set(Object.keys(tools))).toEqual(CANOPY_TOOL_NAMES);
  });

  it("reports each call as it starts", async () => {
    const onCall = vi.fn();
    const fetch = vi.fn(async () => new Response("{}"));
    const { tools } = createCanopyTools(
      createCanopyClient({ apiKey: "k", budget: 5, fetch }),
      { onCall },
    );

    await tools.get_product.execute?.({ asin: "B000TEST01" }, options);

    expect(onCall).toHaveBeenCalledWith("get_product", { asin: "B000TEST01" });
  });

  it("returns budget errors to the model instead of throwing", async () => {
    const { tools } = toolsWith({}, { budget: 0 });

    const output = await tools.get_product.execute?.(
      { asin: "B000TEST01" },
      options,
    );

    expect(output).toEqual({
      error: "The Canopy request budget of 0 is used up.",
    });
  });

  it.each([401, 403])(
    "reports HTTP %i from Canopy as a fatal error",
    async (status) => {
      const onFatalError = vi.fn();
      const { tools } = toolsWith({}, { status, onFatalError });

      const output = await tools.get_product.execute?.(
        { asin: "B000TEST01" },
        options,
      );

      expect(onFatalError).toHaveBeenCalledOnce();
      expect(output).toHaveProperty("error");
    },
  );

  it("does not treat other Canopy errors as fatal", async () => {
    const onFatalError = vi.fn();
    const { tools } = toolsWith({}, { status: 500, onFatalError });

    await tools.get_product.execute?.({ asin: "B000TEST01" }, options);

    expect(onFatalError).not.toHaveBeenCalled();
  });

  it("removes repeated search results", async () => {
    const result = (asin: string) => ({ asin, title: asin });
    const { tools } = toolsWith({
      "/search": {
        data: {
          amazonProductSearchResults: {
            productResults: {
              results: [result("A"), result("B"), result("A")],
            },
          },
        },
      },
    });

    const output = await tools.search_amazon.execute?.(
      { query: "drill" },
      options,
    );

    expect(output).toEqual([
      expect.objectContaining({ asin: "A" }),
      expect.objectContaining({ asin: "B" }),
    ]);
  });

  it("returns a Prime product with its buy box price and seller", async () => {
    const { tools } = toolsWith({
      "/product/offers": offersBody(
        { ...amazonOffer, isPrime: false, buyboxWinner: null },
        amazonOffer,
      ),
      "/product": productBody,
    });

    const output = await tools.get_product.execute?.(
      { asin: "B000TEST01" },
      options,
    );

    expect(output).toMatchObject({
      asin: "B000TEST01",
      price: "£39.99",
      buyBox: { seller: { name: "Amazon" }, fulfilledByAmazon: true },
    });
    expect(output).not.toHaveProperty("seller");
    expect(output).not.toHaveProperty("nextStep");
  });

  describe("reviews for a third-party seller", () => {
    function thirdPartyTools() {
      return toolsWith({
        "/product/offers": offersBody({
          ...amazonOffer,
          seller: { id: "S1", name: "BeiYu Store" },
        }),
        "/product": productBody,
        "/product/top-reviews": { data: { amazonProduct: { topReviews: [] } } },
        "/seller": {
          data: { amazonSeller: { sellerId: "S1", name: "BeiYu Store" } },
        },
      });
    }

    it("waits once for the seller check, without a request", async () => {
      const { tools, fetch } = thirdPartyTools();
      await tools.get_product.execute?.({ asin: "B000TEST01" }, options);
      fetch.mockClear();

      const first = await tools.get_top_reviews.execute?.(
        { asin: "B000TEST01" },
        options,
      );
      const second = await tools.get_top_reviews.execute?.(
        { asin: "B000TEST01" },
        options,
      );

      expect(first).toHaveProperty(
        "error",
        expect.stringContaining("get_seller for S1"),
      );
      expect(second).toEqual([]);
      expect(fetch).toHaveBeenCalledOnce();
    });

    it("gives reviews straight away once the seller is checked", async () => {
      const { tools } = thirdPartyTools();
      await tools.get_product.execute?.({ asin: "B000TEST01" }, options);
      await tools.get_seller.execute?.({ sellerId: "S1" }, options);

      expect(
        await tools.get_top_reviews.execute?.({ asin: "B000TEST01" }, options),
      ).toEqual([]);
    });
  });

  it("tells the model to check a third-party seller before its reviews", async () => {
    const { tools } = toolsWith({
      "/product/offers": offersBody({
        ...amazonOffer,
        seller: { id: "S1", name: "BeiYu Store" },
      }),
      "/product": productBody,
    });

    const output = await tools.get_product.execute?.(
      { asin: "B000TEST01" },
      options,
    );

    expect(output).toHaveProperty(
      "nextStep",
      expect.stringContaining("call get_seller"),
    );
  });

  it.each([
    ["the buy box offer is not Prime", { ...amazonOffer, isPrime: false }],
    ["no offer wins the buy box", { ...amazonOffer, buyboxWinner: null }],
  ])("refuses a product when %s, after one request", async (_, offer) => {
    const { tools, fetch } = toolsWith({
      "/product/offers": offersBody(offer),
      "/product": productBody,
    });

    const output = await tools.get_product.execute?.(
      { asin: "B000TEST01" },
      options,
    );

    expect(output).toEqual({
      error: "B000TEST01 is not available with Prime. Skip it.",
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  describe("candidate cap", () => {
    const primeBodies = {
      "/product/offers": offersBody(amazonOffer),
      "/product": productBody,
      "/product/top-reviews": { data: { amazonProduct: { topReviews: [] } } },
    };
    const call = (
      tools: ReturnType<typeof toolsWith>["tools"],
      name: "get_product" | "get_top_reviews",
      asin: string,
    ) => tools[name].execute?.({ asin }, options);

    it("refuses a product beyond the cap without sending a request", async () => {
      const { tools, fetch } = toolsWith(primeBodies);
      await call(tools, "get_product", "A");
      await call(tools, "get_product", "B");
      fetch.mockClear();

      const output = await call(tools, "get_product", "C");

      expect(output).toEqual({
        error:
          "You already hold 2 candidates. Call drop_candidate first if one fails a check.",
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("holds slots for parallel checks", async () => {
      const { tools, fetch } = toolsWith(primeBodies);

      const outputs = await Promise.all(
        ["A", "B", "C", "D"].map((asin) => call(tools, "get_product", asin)),
      );

      expect(outputs.filter((o) => o && "error" in o)).toHaveLength(2);
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it("frees the slot of a product without Prime", async () => {
      const { tools } = toolsWith({
        ...primeBodies,
        "/product/offers": offersBody({ ...amazonOffer, isPrime: false }),
      });
      await call(tools, "get_product", "A");
      await call(tools, "get_product", "B");

      const output = await call(tools, "get_product", "C");

      expect(output).toEqual({
        error: "C is not available with Prime. Skip it.",
      });
    });

    it("frees a slot when a candidate is dropped", async () => {
      const { tools } = toolsWith(primeBodies);
      await call(tools, "get_product", "A");
      await call(tools, "get_product", "B");

      const dropped = await tools.drop_candidate.execute?.(
        { asin: "A", reason: "bag too big" },
        options,
      );
      const output = await call(tools, "get_product", "C");

      expect(dropped).toEqual({ dropped: "A", freeSlots: 1 });
      expect(output).toMatchObject({ asin: "B000TEST01" });
    });

    it("refuses to check the same product twice", async () => {
      const { tools, fetch } = toolsWith(primeBodies);
      await call(tools, "get_product", "A");
      fetch.mockClear();

      const output = await call(tools, "get_product", "A");

      expect(output).toEqual({
        error: "You already have A. Use the details you got.",
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("gives reviews only for candidates", async () => {
      const { tools, fetch } = toolsWith(primeBodies);
      await call(tools, "get_product", "A");
      fetch.mockClear();

      expect(await call(tools, "get_top_reviews", "A")).toEqual([]);
      expect(await call(tools, "get_top_reviews", "Z")).toEqual({
        error: "Z is not one of your candidates. Call get_product first.",
      });
      expect(fetch).toHaveBeenCalledOnce();
    });
  });

  describe("read_listing_images", () => {
    const image =
      "https://m.media-amazon.com/images/I/81yRYw4vdAL._AC_SL1500_.jpg";

    function imageTools() {
      const canopyFetch = vi.fn(async (url: URL | RequestInfo) => {
        const path = new URL(String(url)).pathname.replace("/api/amazon", "");
        const bodies: Record<string, unknown> = {
          "/product/offers": offersBody(amazonOffer),
          "/product": {
            data: {
              amazonProduct: {
                ...productBody.data.amazonProduct,
                imageUrls: [image],
              },
            },
          },
        };
        return new Response(JSON.stringify(bodies[path] ?? {}));
      });
      const imageFetch = vi.fn(
        async () =>
          new Response("png", { headers: { "content-type": "image/png" } }),
      );
      const created = createCanopyTools(
        createCanopyClient({ apiKey: "k", budget: 5, fetch: canopyFetch }),
        { imageFetch },
      );
      return { ...created, canopyFetch, imageFetch };
    }

    it("gives get_product an image count instead of the links", async () => {
      const { tools } = imageTools();

      const output = await tools.get_product.execute?.(
        { asin: "B000TEST01" },
        options,
      );

      expect(output).toMatchObject({ imageCount: 1 });
      expect(output).not.toHaveProperty("imageUrls");
      expect(output).not.toHaveProperty("mainImageUrl");
    });

    it("returns a candidate's images without a Canopy request", async () => {
      const { tools, readListingImages, canopyFetch, imageFetch } =
        imageTools();
      await tools.get_product.execute?.({ asin: "B000TEST01" }, options);
      canopyFetch.mockClear();

      const output = await readListingImages("B000TEST01");

      expect(output).toEqual({
        asin: "B000TEST01",
        images: [
          {
            data: Buffer.from("png").toString("base64"),
            mediaType: "image/png",
          },
        ],
      });
      expect(imageFetch).toHaveBeenCalledWith(
        "https://m.media-amazon.com/images/I/81yRYw4vdAL._AC_SL1000_.jpg",
      );
      expect(canopyFetch).not.toHaveBeenCalled();
    });

    it("works once per candidate", async () => {
      const { tools, readListingImages } = imageTools();
      await tools.get_product.execute?.({ asin: "B000TEST01" }, options);
      await readListingImages("B000TEST01");

      expect(await readListingImages("B000TEST01")).toEqual({
        error: "You have already seen the images for B000TEST01.",
      });
    });

    it("refuses a product that is not a candidate", async () => {
      const { readListingImages, imageFetch } = imageTools();

      expect(await readListingImages("B000TEST01")).toEqual({
        error:
          "B000TEST01 is not one of your candidates. Call get_product first.",
      });
      expect(imageFetch).not.toHaveBeenCalled();
    });

    it("sends the images to the model as files", async () => {
      const { tools } = imageTools();

      const output = await tools.read_listing_images.toModelOutput?.({
        toolCallId: "1",
        input: { asin: "B000TEST01" },
        output: {
          asin: "B000TEST01",
          images: [{ data: "cG5n", mediaType: "image/png" }],
        },
      });

      expect(output).toEqual({
        type: "content",
        value: [
          {
            type: "text",
            text: "1 listing images for B000TEST01, in listing order.",
          },
          {
            type: "file",
            mediaType: "image/png",
            data: { type: "data", data: "cG5n" },
          },
        ],
      });
    });
  });

  describe("submit_report", () => {
    const candidate = {
      asin: "B000TEST01",
      rank: 1,
      name: "Drill",
      price: "£39.99",
      pricePerUnit: "£39.99 each",
      seller: "Amazon",
      rating: 4.5,
      ratingCount: 100,
      verdict: "Good.",
      facts: [],
      redFlags: [],
    };
    const report = {
      recommendedAsin: "B000TEST01",
      headline: "Buy the drill.",
      summary: "It passed every check.",
      candidates: [candidate],
      dropped: [],
      couldNotCheck: [],
      defaults: [],
      sources: [],
    };

    async function checkedTools() {
      const onReport = vi.fn();
      const canopyFetch = vi.fn(async (url: URL | RequestInfo) => {
        const path = new URL(String(url)).pathname.replace("/api/amazon", "");
        const bodies: Record<string, unknown> = {
          "/product/offers": offersBody(amazonOffer),
          "/product": {
            data: {
              amazonProduct: {
                ...productBody.data.amazonProduct,
                mainImageUrl: "https://m.media-amazon.com/images/I/main.jpg",
                imageUrls: ["https://m.media-amazon.com/images/I/a.jpg"],
              },
            },
          },
        };
        return new Response(JSON.stringify(bodies[path] ?? {}));
      });
      const { tools } = createCanopyTools(
        createCanopyClient({ apiKey: "k", budget: 5, fetch: canopyFetch }),
        { onReport },
      );
      await tools.get_product.execute?.({ asin: "B000TEST01" }, options);
      return { tools, onReport };
    }

    it("passes the report on with links and packshots", async () => {
      const { tools, onReport } = await checkedTools();

      const output = await tools.submit_report.execute?.(report, options);

      expect(output).toMatchObject({ saved: true });
      expect(onReport).toHaveBeenCalledWith(
        expect.objectContaining({
          candidates: [
            expect.objectContaining({
              url: "https://www.amazon.co.uk/dp/B000TEST01",
              imageUrl: "https://m.media-amazon.com/images/I/main.jpg",
            }),
          ],
        }),
      );
    });

    it("refuses a product that was never checked", async () => {
      const { tools, onReport } = await checkedTools();

      const output = await tools.submit_report.execute?.(
        {
          ...report,
          candidates: [
            ...report.candidates,
            { ...candidate, asin: "B000OTHER1", rank: 2 },
          ],
        },
        options,
      );

      expect(output).toEqual({
        error:
          "You did not check B000OTHER1 with get_product. Report only products you checked.",
      });
      expect(onReport).not.toHaveBeenCalled();
    });

    it("refuses to recommend a dropped product", async () => {
      const { tools, onReport } = await checkedTools();
      await tools.drop_candidate.execute?.(
        { asin: "B000TEST01", reason: "fake reviews" },
        options,
      );

      const output = await tools.submit_report.execute?.(report, options);

      expect(output).toEqual({
        error: "B000TEST01 is not one of the candidates in your report.",
      });
      expect(onReport).not.toHaveBeenCalled();
    });
  });
});
