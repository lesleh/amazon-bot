import { describe, expect, it, vi } from "vitest";
import { createCanopyClient } from "../src/canopy.ts";
import { createCanopyTools } from "../src/tools.ts";

const options = { toolCallId: "1", messages: [], context: {} };

// Answers each Canopy path with its own body, so multi-request tools can be tested.
function toolsWith(
  bodies: Record<string, unknown>,
  { budget = 5, status = 200, onFatalError = vi.fn() } = {},
) {
  const fetch = vi.fn(async (url: URL | RequestInfo) => {
    const path = new URL(String(url)).pathname.replace("/api/amazon", "");
    return new Response(JSON.stringify(bodies[path] ?? {}), { status });
  });
  const tools = createCanopyTools(
    createCanopyClient({ apiKey: "k", budget, fetch }),
    { onFatalError },
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
});
