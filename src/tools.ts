import { tool } from "ai";
import { z } from "zod";
import { type CanopyClient, CanopyError } from "./canopy.ts";

const asin = z
  .string()
  .describe("The Amazon product ID, for example B0CX1Y2Z3A");

export interface CanopyToolsOptions {
  // Called when Canopy rejects the API key, which no amount of retrying fixes.
  onFatalError?: (error: CanopyError) => void;
}

export function createCanopyTools(
  canopy: CanopyClient,
  { onFatalError }: CanopyToolsOptions = {},
) {
  // Errors go back to the model as data so it can adapt, for example by stopping early.
  async function safely<T>(
    run: () => Promise<T>,
  ): Promise<T | { error: string }> {
    try {
      return await run();
    } catch (error) {
      if (
        error instanceof CanopyError &&
        (error.status === 401 || error.status === 403)
      ) {
        onFatalError?.(error);
      }
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  return {
    search_amazon: tool({
      description:
        "Search amazon.co.uk. Returns up to 20 products with price, rating, rating count and a sponsored flag. Prime is not known yet: get_product checks it. Costs one request.",
      inputSchema: z.object({
        query: z
          .string()
          .describe("A plain search query, as a shopper would type it"),
        page: z.number().int().min(1).optional(),
      }),
      execute: ({ query, page }) => safely(() => canopy.search(query, page)),
    }),

    get_product: tool({
      description:
        "Check that a product is available with Prime, then get its details: brand, buy box price and seller, rating breakdown, feature bullets and specifications. Returns an error for a product without Prime. Costs one request for a product without Prime, two otherwise.",
      inputSchema: z.object({ asin }),
      execute: ({ asin }) =>
        safely(async () => {
          // Only the offers report Prime reliably; product and search results always say false.
          const buyBox = (await canopy.offers(asin)).find(
            (offer) => offer.buyboxWinner === true,
          );
          if (buyBox?.isPrime !== true) {
            throw new Error(`${asin} is not available with Prime. Skip it.`);
          }
          const { seller: _listingSeller, ...product } =
            await canopy.product(asin);
          return {
            ...product,
            price: buyBox.price ?? product.price,
            buyBox: {
              seller: buyBox.seller,
              fulfilledByAmazon: buyBox.fulfilledByAmazon,
            },
          };
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
        sellerId: z.string().describe("The buy box seller ID from get_product"),
      }),
      execute: ({ sellerId }) => safely(() => canopy.seller(sellerId)),
    }),
  };
}
