import { describe, expect, it, vi } from "vitest";
import {
  BudgetExceededError,
  CanopyError,
  createCanopyClient,
} from "../src/canopy.ts";

function fakeFetch(body: unknown, status = 200) {
  return vi.fn(
    async (_url: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify(body), { status }),
  );
}

const productBody = {
  data: {
    amazonProduct: {
      asin: "B000TEST01",
      title: "Cat food 2kg",
      brand: "Purrfect",
      url: "https://www.amazon.co.uk/dp/B000TEST01",
      imageUrls: ["a.jpg", "b.jpg"],
      price: { symbol: "£", value: 12.5, currency: "GBP", display: "£12.50" },
      coupon: null,
      rating: 4.6,
      ratingsTotal: 1200,
      categories: [
        {
          id: "1",
          name: "Cats",
          url: "x",
          breadcrumbPath: "Pet Supplies > Cats",
        },
      ],
      seller: { sellerId: "A1", name: "Amazon" },
    },
  },
};

describe("createCanopyClient", () => {
  it("sends every request to the UK marketplace with the API key", async () => {
    const fetch = fakeFetch(productBody);
    const canopy = createCanopyClient({ apiKey: "key-123", budget: 5, fetch });

    await canopy.product("B000TEST01");

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "https://rest.canopyapi.co/api/amazon/product?domain=UK&asin=B000TEST01",
    );
    expect(init?.headers).toEqual({ "API-KEY": "key-123" });
  });

  it("trims a product to the fields the agent reads", async () => {
    const canopy = createCanopyClient({
      apiKey: "k",
      budget: 5,
      fetch: fakeFetch(productBody),
    });

    const product = await canopy.product("B000TEST01");

    expect(product).not.toHaveProperty("imageUrls");
    expect(product).not.toHaveProperty("url");
    expect(product.price).toBe("£12.50");
    expect(product.categories).toBe("Pet Supplies > Cats");
    expect(product.seller).toEqual({ sellerId: "A1", name: "Amazon" });
  });

  it("replaces review photos with a count", async () => {
    const canopy = createCanopyClient({
      apiKey: "k",
      budget: 5,
      fetch: fakeFetch({
        data: {
          amazonProduct: {
            topReviews: [
              {
                id: "R1",
                title: "Good",
                body: "My cat likes it",
                rating: 5,
                helpfulVotes: 3,
                verifiedPurchase: true,
                imageUrls: ["1.jpg", "2.jpg"],
                videos: [],
                reviewer: { id: "U1", name: "Sam", url: "x" },
              },
            ],
          },
        },
      }),
    });

    const [review] = await canopy.topReviews("B000TEST01");

    expect(review).toEqual({
      title: "Good",
      body: "My cat likes it",
      rating: 5,
      helpfulVotes: 3,
      verifiedPurchase: true,
      imageCount: 2,
      reviewer: { id: "U1", name: "Sam" },
    });
  });

  it("refuses requests once the budget is used up", async () => {
    const fetch = fakeFetch(productBody);
    const canopy = createCanopyClient({ apiKey: "k", budget: 2, fetch });

    await canopy.product("A");
    await canopy.product("B");

    await expect(canopy.product("C")).rejects.toBeInstanceOf(
      BudgetExceededError,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(canopy.requestsUsed).toBe(2);
  });

  it("counts a failed request against the budget", async () => {
    const canopy = createCanopyClient({
      apiKey: "k",
      budget: 5,
      fetch: fakeFetch({ message: "Not found" }, 404),
    });

    await expect(canopy.product("NOPE")).rejects.toBeInstanceOf(CanopyError);
    expect(canopy.requestsUsed).toBe(1);
  });
});
