import { tool } from "ai";
import { z } from "zod";
import { type CanopyClient, CanopyError } from "./canopy.ts";

const asin = z
  .string()
  .describe("The Amazon product ID, for example B0CX1Y2Z3A");

export const DEFAULT_MAX_CANDIDATES = 4;

export const CANOPY_TOOL_NAMES: ReadonlySet<string> = new Set([
  "search_amazon",
  "get_product",
  "drop_candidate",
  "get_top_reviews",
  "get_seller",
]);

export interface CanopyToolsOptions {
  // How many products may pass get_product at once; each costs about 3 requests.
  maxCandidates?: number;
  // Called when Canopy rejects the API key, which no amount of retrying fixes.
  onFatalError?: (error: CanopyError) => void;
  // Called as each tool starts, for live progress.
  onCall?: (toolName: string, input: Record<string, unknown>) => void;
}

export function createCanopyTools(
  canopy: CanopyClient,
  {
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    onFatalError,
    onCall,
  }: CanopyToolsOptions = {},
) {
  const candidates = new Set<string>();
  // Products being checked hold a slot too, so parallel calls cannot overshoot the cap.
  const checking = new Set<string>();

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
      execute: ({ query, page }) =>
        safely(async () => {
          onCall?.("search_amazon", { query, page });
          // Sponsored slots repeat products that also appear further down.
          const seen = new Set<string>();
          return (await canopy.search(query, page)).filter(
            (p) => !seen.has(p.asin) && seen.add(p.asin),
          );
        }),
    }),

    get_product: tool({
      description: `Check that a product is available with Prime, then get its details: brand, buy box price and seller, rating breakdown, feature bullets and specifications. A product that passes becomes a candidate. You can hold ${maxCandidates} candidates at once. Returns an error for a product without Prime, a product you already have, or when you hold ${maxCandidates} candidates. Costs one request for a product without Prime, two otherwise.`,
      inputSchema: z.object({ asin }),
      execute: ({ asin }) =>
        safely(async () => {
          onCall?.("get_product", { asin });
          if (candidates.has(asin) || checking.has(asin)) {
            throw new Error(
              `You already have ${asin}. Use the details you got.`,
            );
          }
          if (candidates.size + checking.size >= maxCandidates) {
            throw new Error(
              `You already hold ${maxCandidates} candidates. Call drop_candidate first if one fails a check.`,
            );
          }
          checking.add(asin);
          try {
            // Only the offers report Prime reliably; product and search results always say false.
            const buyBox = (await canopy.offers(asin)).find(
              (offer) => offer.buyboxWinner === true,
            );
            if (buyBox?.isPrime !== true) {
              throw new Error(`${asin} is not available with Prime. Skip it.`);
            }
            const { seller: _listingSeller, ...product } =
              await canopy.product(asin);
            candidates.add(asin);
            return {
              ...product,
              price: buyBox.price ?? product.price,
              buyBox: {
                seller: buyBox.seller,
                fulfilledByAmazon: buyBox.fulfilledByAmazon,
              },
            };
          } finally {
            checking.delete(asin);
          }
        }),
    }),

    drop_candidate: tool({
      description:
        "Give up a candidate that failed a check, so you can check another product with get_product. Costs nothing.",
      inputSchema: z.object({
        asin,
        reason: z.string().describe("The check it failed, in a few words"),
      }),
      execute: async ({ asin, reason }) => {
        onCall?.("drop_candidate", { asin, reason });
        if (!candidates.delete(asin)) {
          return { error: `${asin} is not one of your candidates.` };
        }
        return { dropped: asin, freeSlots: maxCandidates - candidates.size };
      },
    }),

    get_top_reviews: tool({
      description:
        "Get a candidate's top reviews (about 10): text, rating, verified purchase flag, reviewer and photo count. Works only for products that passed get_product. Costs one request.",
      inputSchema: z.object({ asin }),
      execute: ({ asin }) =>
        safely(async () => {
          onCall?.("get_top_reviews", { asin });
          if (!candidates.has(asin)) {
            throw new Error(
              `${asin} is not one of your candidates. Call get_product first.`,
            );
          }
          return canopy.topReviews(asin);
        }),
    }),

    get_seller: tool({
      description:
        "Get a third-party seller's profile: rating, about text and up to 10 of their other products. Costs one request.",
      inputSchema: z.object({
        sellerId: z.string().describe("The buy box seller ID from get_product"),
      }),
      execute: ({ sellerId }) =>
        safely(() => {
          onCall?.("get_seller", { sellerId });
          return canopy.seller(sellerId);
        }),
    }),
  };
}
