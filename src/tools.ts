import { tool } from "ai";
import { z } from "zod";
import type { CanopyClient } from "./canopy.ts";

// Errors go back to the model as data so it can adapt, for example by stopping early.
async function safely<T>(
  run: () => Promise<T>,
): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

const asin = z
  .string()
  .describe("The Amazon product ID, for example B0CX1Y2Z3A");

export function createCanopyTools(canopy: CanopyClient) {
  return {
    search_amazon: tool({
      description:
        "Search amazon.co.uk. Returns only Prime products, up to 20, with price, rating, rating count and a sponsored flag. Costs one request.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("A plain search query, as a shopper would type it"),
        page: z.number().int().min(1).optional(),
      }),
      execute: ({ query, page }) =>
        safely(async () =>
          (await canopy.search(query, page)).filter((p) => p.isPrime === true),
        ),
    }),

    get_product: tool({
      description:
        "Get one product's details: brand, price, seller, rating breakdown, feature bullets and specifications. Returns an error for a product without Prime. Costs one request.",
      inputSchema: z.object({ asin }),
      execute: ({ asin }) =>
        safely(async () => {
          const product = await canopy.product(asin);
          if (product.isPrime !== true) {
            throw new Error(`${asin} is not available with Prime. Skip it.`);
          }
          return product;
        }),
    }),

    get_top_reviews: tool({
      description:
        "Get a product's top reviews (about 10): text, rating, verified purchase flag, reviewer and photo count. Costs one request.",
      inputSchema: z.object({ asin }),
      execute: ({ asin }) => safely(() => canopy.topReviews(asin)),
    }),

    get_seller: tool({
      description:
        "Get a third-party seller's profile: rating, about text and up to 10 of their other products. Costs one request.",
      inputSchema: z.object({
        sellerId: z.string().describe("The seller ID from get_product"),
      }),
      execute: ({ sellerId }) => safely(() => canopy.seller(sellerId)),
    }),
  };
}
