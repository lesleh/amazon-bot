import { tool } from "ai";
import { z } from "zod";
import { type CanopyClient, CanopyError } from "./canopy.ts";
import { fetchListingImages, type ListingImage } from "./images.ts";
import {
  productUrl,
  reportSchema,
  type ShoppingReport,
} from "./shopping-report.ts";

const asin = z
  .string()
  .describe("The Amazon product ID, for example B0CX1Y2Z3A");

export const DEFAULT_MAX_CANDIDATES = 4;

const AMAZON_SELLER = /^amazon(\.co\.uk)?$/i;

export const CANOPY_TOOL_NAMES: ReadonlySet<string> = new Set([
  "search_amazon",
  "get_product",
  "drop_candidate",
  "get_top_reviews",
  "get_seller",
  "read_listing_images",
  "submit_report",
]);

export interface CanopyToolsOptions {
  // How many products may pass get_product at once; each costs about 3 requests.
  maxCandidates?: number;
  // Called when Canopy rejects the API key, which no amount of retrying fixes.
  onFatalError?: (error: CanopyError) => void;
  // Called as each tool starts, for live progress.
  onCall?: (toolName: string, input: Record<string, unknown>) => void;
  // Fetches listing images, which come from Amazon's image server rather than Canopy.
  imageFetch?: typeof fetch;
  // Receives the finished report from submit_report.
  onReport?: (report: ShoppingReport) => void;
}

export const READ_LISTING_IMAGES_DESCRIPTION =
  "Look at a candidate's listing images. Packaging photos often show facts the listing text leaves out, such as the ingredients, nutrition panel, size chart or specifications. Works once per candidate, and only for products that passed get_product. Costs no requests.";

export type ListingImagesOutput =
  | { asin: string; images: ListingImage[] }
  | { error: string };

export function createCanopyTools(
  canopy: CanopyClient,
  {
    maxCandidates = DEFAULT_MAX_CANDIDATES,
    onFatalError,
    onCall,
    imageFetch,
    onReport,
  }: CanopyToolsOptions = {},
) {
  const candidates = new Set<string>();
  const imageUrls = new Map<string, string[]>();
  // The packshot, for the report. The gallery in imageUrls is what the model reads.
  const mainImages = new Map<string, string>();
  const imagesRead = new Set<string>();
  // Third-party buy box sellers by candidate, so reviews wait for the cheaper checks.
  const thirdPartySellers = new Map<string, string>();
  const sellersChecked = new Set<string>();
  const reviewsDeferred = new Set<string>();
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

  // Shared by the tool and by the Claude Code image server, which needs the raw output.
  function readListingImages(asin: string): Promise<ListingImagesOutput> {
    return safely(async () => {
      onCall?.("read_listing_images", { asin });
      const urls = imageUrls.get(asin);
      if (!candidates.has(asin) || !urls) {
        throw new Error(
          `${asin} is not one of your candidates. Call get_product first.`,
        );
      }
      if (imagesRead.has(asin)) {
        throw new Error(`You have already seen the images for ${asin}.`);
      }
      imagesRead.add(asin);
      return { asin, images: await fetchListingImages(urls, imageFetch) };
    });
  }

  const tools = {
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
            const {
              seller: _listingSeller,
              mainImageUrl,
              imageUrls: urls,
              ...product
            } = await canopy.product(asin);
            candidates.add(asin);
            imageUrls.set(asin, urls ?? []);
            if (mainImageUrl) mainImages.set(asin, mainImageUrl);
            const thirdParty = !AMAZON_SELLER.test(buyBox.seller?.name ?? "");
            if (thirdParty && buyBox.seller?.id) {
              thirdPartySellers.set(asin, buyBox.seller.id);
            }
            return {
              ...product,
              ...(thirdParty && {
                nextStep:
                  "The buy box seller is a third party. Check the listing against the must-haves, and call get_seller unless the brand is sold in UK shops, before you call get_top_reviews.",
              }),
              imageCount: urls?.length ?? 0,
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
        "Get a candidate's top reviews (about 10): text, rating, verified purchase flag, reviewer and photo count. Works only for products that passed get_product. Call it only after the candidate has passed its must-have and seller checks, because reviews for a candidate you then drop waste a request. Costs one request.",
      inputSchema: z.object({ asin }),
      execute: ({ asin }) =>
        safely(async () => {
          onCall?.("get_top_reviews", { asin });
          if (!candidates.has(asin)) {
            throw new Error(
              `${asin} is not one of your candidates. Call get_product first.`,
            );
          }
          const sellerId = thirdPartySellers.get(asin);
          if (
            sellerId &&
            !sellersChecked.has(sellerId) &&
            !reviewsDeferred.has(asin)
          ) {
            reviewsDeferred.add(asin);
            throw new Error(
              `${asin} has a third-party seller. Check its listing against the must-haves and call get_seller for ${sellerId} first, then drop it or call get_top_reviews again. If the seller needs no check, call get_top_reviews again now. This refusal cost no request.`,
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
          sellersChecked.add(sellerId);
          return canopy.seller(sellerId);
        }),
    }),

    read_listing_images: tool({
      description: READ_LISTING_IMAGES_DESCRIPTION,
      inputSchema: z.object({ asin }),
      execute: ({ asin }) => readListingImages(asin),
      toModelOutput: ({ output }) =>
        "error" in output
          ? { type: "json", value: output }
          : {
              type: "content",
              value: [
                {
                  type: "text",
                  text: `${output.images.length} listing images for ${output.asin}, in listing order.`,
                },
                ...output.images.map((image) => ({
                  type: "file" as const,
                  mediaType: image.mediaType,
                  data: { type: "data" as const, data: image.data },
                })),
              ],
            },
    }),

    submit_report: tool({
      description:
        "Submit the finished report. Call it once, last, after every check. Write plain sentences without Markdown. Returns an error if the report names a product you did not check with get_product.",
      inputSchema: reportSchema,
      execute: async (report) => {
        onCall?.("submit_report", {});
        // imageUrls holds every product that passed get_product, including dropped ones.
        const unchecked = [...report.candidates, ...report.dropped]
          .map((product) => product.asin)
          .filter((asin) => !imageUrls.has(asin));
        if (unchecked.length > 0) {
          return {
            error: `You did not check ${unchecked.join(", ")} with get_product. Report only products you checked.`,
          };
        }
        const { recommendedAsin } = report;
        if (
          recommendedAsin !== null &&
          (!candidates.has(recommendedAsin) ||
            !report.candidates.some((c) => c.asin === recommendedAsin))
        ) {
          return {
            error: `${recommendedAsin} is not one of the candidates in your report.`,
          };
        }
        onReport?.({
          ...report,
          candidates: report.candidates
            .toSorted((a, b) => a.rank - b.rank)
            .map((c) => ({
              ...c,
              url: productUrl(c.asin),
              imageUrl: mainImages.get(c.asin) ?? imageUrls.get(c.asin)?.[0],
            })),
          dropped: report.dropped.map((d) => ({
            ...d,
            url: productUrl(d.asin),
          })),
        });
        return {
          saved: true,
          next: "Reply with one short sentence, then stop.",
        };
      },
    }),
  };

  return { tools, readListingImages };
}
