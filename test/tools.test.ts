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
  const tools = createCanopyTools(
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
    const tools = createCanopyTools(
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
});
