import { z } from "zod";

const BASE_URL = "https://rest.canopyapi.co/api/amazon";
const DOMAIN = "UK";

export class BudgetExceededError extends Error {
  constructor(budget: number) {
    super(`The Canopy request budget of ${budget} is used up.`);
    this.name = "BudgetExceededError";
  }
}

export class CanopyError extends Error {
  readonly status: number;

  constructor(status: number, body: string) {
    super(`Canopy returned HTTP ${status}: ${body.slice(0, 200)}`);
    this.name = "CanopyError";
    this.status = status;
  }
}

// Zod strips unknown keys, so each schema also trims the response to what the agent reads.
const price = z
  .object({ display: z.string() })
  .nullish()
  .transform((p) => p?.display ?? null);

const coupon = z
  .object({ label: z.string() })
  .nullish()
  .transform((c) => c?.label ?? null);

const searchResult = z.object({
  asin: z.string(),
  title: z.string(),
  price,
  rating: z.number().nullish(),
  ratingsTotal: z.number().nullish(),
  sponsored: z.boolean().nullish(),
  coupon,
});

const searchResponse = z.object({
  data: z.object({
    amazonProductSearchResults: z.object({
      productResults: z.object({ results: z.array(searchResult) }),
    }),
  }),
});

const product = z.object({
  asin: z.string(),
  title: z.string(),
  brand: z.string().nullish(),
  isInStock: z.boolean().nullish(),
  price,
  coupon,
  rating: z.number().nullish(),
  ratingsTotal: z.number().nullish(),
  // Canopy derives these counts from Amazon's rounded percentages, so percentages are the honest form.
  ratingsBreakdown: z
    .object({
      fiveStarRatingsCount: z.number().nullish(),
      fourStarRatingsCount: z.number().nullish(),
      threeStarRatingsCount: z.number().nullish(),
      twoStarRatingsCount: z.number().nullish(),
      oneStarRatingsCount: z.number().nullish(),
    })
    .nullish()
    .transform((counts) => {
      if (!counts) return null;
      const stars = [
        ["fiveStar", counts.fiveStarRatingsCount ?? 0],
        ["fourStar", counts.fourStarRatingsCount ?? 0],
        ["threeStar", counts.threeStarRatingsCount ?? 0],
        ["twoStar", counts.twoStarRatingsCount ?? 0],
        ["oneStar", counts.oneStarRatingsCount ?? 0],
      ] as const;
      const total = stars.reduce((sum, [, count]) => sum + count, 0);
      if (total === 0) return null;
      return Object.fromEntries(
        stars.map(([name, count]) => [
          `${name}Percent`,
          Math.round((count / total) * 100),
        ]),
      );
    }),
  itemHighlights: z.string().nullish(),
  featureBullets: z.array(z.string()).nullish(),
  technicalSpecifications: z
    .array(z.object({ name: z.string(), value: z.string() }))
    .nullish(),
  categories: z
    .array(z.object({ breadcrumbPath: z.string().nullish() }))
    .nullish()
    .transform((cs) => cs?.[0]?.breadcrumbPath ?? null),
  seller: z.object({ sellerId: z.string(), name: z.string() }).nullish(),
});

const productResponse = z.object({
  data: z.object({ amazonProduct: product }),
});

const review = z
  .object({
    title: z.string().nullish(),
    body: z.string().nullish(),
    rating: z.number().nullish(),
    helpfulVotes: z.number().nullish(),
    verifiedPurchase: z.boolean().nullish(),
    imageUrls: z.array(z.string()).nullish(),
    reviewer: z
      .object({ id: z.string().nullish(), name: z.string().nullish() })
      .nullish(),
  })
  .transform(({ imageUrls, ...rest }) => ({
    ...rest,
    imageCount: imageUrls?.length ?? 0,
  }));

const topReviewsResponse = z.object({
  data: z.object({
    amazonProduct: z.object({ topReviews: z.array(review) }),
  }),
});

const offer = z
  .object({
    price,
    isPrime: z.boolean().nullish(),
    buyboxWinner: z.boolean().nullish(),
    delivery: z.object({ fulfilledByAmazon: z.boolean().nullish() }).nullish(),
    seller: z
      .object({
        id: z.string().nullish(),
        name: z.string().nullish(),
        rating: z.number().nullish(),
        ratingsPercentagePositive: z.number().nullish(),
        ratingsTotal: z.number().nullish(),
      })
      .nullish(),
  })
  .transform(({ delivery, ...rest }) => ({
    ...rest,
    fulfilledByAmazon: delivery?.fulfilledByAmazon ?? null,
  }));

const offersResponse = z.object({
  data: z.object({
    amazonProduct: z.object({
      offersPaginated: z
        .object({ offers: z.array(offer) })
        .nullish()
        .transform((o) => o?.offers ?? []),
    }),
  }),
});

const sellerResponse = z.object({
  data: z.object({
    amazonSeller: z.object({
      sellerId: z.string(),
      name: z.string(),
      rating: z.number().nullish(),
      about: z.string().nullish(),
      productResults: z
        .object({ results: z.array(searchResult) })
        .nullish()
        .transform((r) => r?.results.slice(0, 10) ?? []),
    }),
  }),
});

export type SearchResult = z.infer<typeof searchResult>;
export type Product = z.infer<typeof product>;
export type Review = z.infer<typeof review>;
export type Offer = z.infer<typeof offer>;
export type Seller = z.infer<typeof sellerResponse>["data"]["amazonSeller"];

export interface CanopyClientOptions {
  apiKey: string;
  budget: number;
  fetch?: typeof fetch;
}

export type CanopyClient = ReturnType<typeof createCanopyClient>;

export function createCanopyClient({
  apiKey,
  budget,
  fetch: fetchFn = fetch,
}: CanopyClientOptions) {
  let used = 0;

  async function get<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    schema: z.ZodType<T>,
  ): Promise<T> {
    if (used >= budget) throw new BudgetExceededError(budget);
    used++;

    const url = new URL(`${BASE_URL}${path}`);
    url.searchParams.set("domain", DOMAIN);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const response = await fetchFn(url, { headers: { "API-KEY": apiKey } });
    if (!response.ok) {
      throw new CanopyError(response.status, await response.text());
    }
    return schema.parse(await response.json());
  }

  return {
    get requestsUsed() {
      return used;
    },

    async search(searchTerm: string, page?: number): Promise<SearchResult[]> {
      const body = await get(
        "/search",
        { searchTerm, page, limit: 20 },
        searchResponse,
      );
      return body.data.amazonProductSearchResults.productResults.results;
    },

    async product(asin: string): Promise<Product> {
      const body = await get("/product", { asin }, productResponse);
      return body.data.amazonProduct;
    },

    // First page of offers only; the buy box offer is on it.
    async offers(asin: string): Promise<Offer[]> {
      const body = await get("/product/offers", { asin }, offersResponse);
      return body.data.amazonProduct.offersPaginated;
    },

    async topReviews(asin: string): Promise<Review[]> {
      const body = await get(
        "/product/top-reviews",
        { asin },
        topReviewsResponse,
      );
      return body.data.amazonProduct.topReviews;
    },

    async seller(sellerId: string): Promise<Seller> {
      const body = await get("/seller", { sellerId }, sellerResponse);
      return body.data.amazonSeller;
    },
  };
}
