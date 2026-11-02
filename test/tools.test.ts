import { describe, expect, it, vi } from "vitest";
import { createCanopyClient } from "../src/canopy.ts";
import { createCanopyTools } from "../src/tools.ts";

const options = { toolCallId: "1", messages: [], context: {} };

function toolsReturning(body: unknown, budget = 5) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body)));
  return createCanopyTools(createCanopyClient({ apiKey: "k", budget, fetch }));
}

function product(isPrime: boolean | null) {
  return {
    data: { amazonProduct: { asin: "B000TEST01", title: "Drill", isPrime } },
  };
}

describe("createCanopyTools", () => {
  it("returns budget errors to the model instead of throwing", async () => {
    const tools = toolsReturning({}, 0);

    const output = await tools.get_product.execute?.(
      { asin: "B000TEST01" },
      options,
    );

    expect(output).toEqual({
      error: "The Canopy request budget of 0 is used up.",
    });
  });

  it("drops search results without Prime", async () => {
    const result = (asin: string, isPrime?: boolean) => ({
      asin,
      title: asin,
      isPrime,
    });
    const tools = toolsReturning({
      data: {
        amazonProductSearchResults: {
          productResults: {
            results: [
              result("PRIME", true),
              result("NOT", false),
              result("UNKNOWN"),
            ],
          },
        },
      },
    });

    const output = await tools.search_amazon.execute?.(
      { query: "drill" },
      options,
    );

    expect(output).toEqual([expect.objectContaining({ asin: "PRIME" })]);
  });

  it("returns a Prime product", async () => {
    const tools = toolsReturning(product(true));

    const output = await tools.get_product.execute?.(
      { asin: "B000TEST01" },
      options,
    );

    expect(output).toMatchObject({ asin: "B000TEST01", isPrime: true });
  });

  it.each([false, null])(
    "refuses a product with isPrime %s",
    async (isPrime) => {
      const tools = toolsReturning(product(isPrime));

      const output = await tools.get_product.execute?.(
        { asin: "B000TEST01" },
        options,
      );

      expect(output).toEqual({
        error: "B000TEST01 is not available with Prime. Skip it.",
      });
    },
  );
});
