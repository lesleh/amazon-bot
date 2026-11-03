const AMAZON_IMAGE =
  /^(https:\/\/m\.media-amazon\.com\/images\/I\/[\w+-]+)(?:\.[^/]*)?\.(jpe?g|png)$/i;
const MAX_IMAGES = 8;

export interface ListingImage {
  data: string;
  mediaType: string;
}

// 1,000 pixels keeps small print such as a nutrition panel readable at a third of the tokens of 1,500.
export function resizedImageUrl(url: string, size = 1000): string | undefined {
  const match = AMAZON_IMAGE.exec(url);
  return match ? `${match[1]}._AC_SL${size}_.${match[2]}` : undefined;
}

export async function fetchListingImages(
  urls: string[],
  fetchFn: typeof fetch = fetch,
): Promise<ListingImage[]> {
  const resized = urls
    .map((url) => resizedImageUrl(url))
    .filter((url): url is string => url !== undefined)
    .slice(0, MAX_IMAGES);
  return Promise.all(
    resized.map(async (url) => {
      const response = await fetchFn(url);
      if (!response.ok) {
        throw new Error(`Amazon returned HTTP ${response.status} for ${url}`);
      }
      const mediaType = response.headers.get("content-type") ?? "";
      if (!mediaType.startsWith("image/")) {
        throw new Error(`Amazon returned ${mediaType || "no type"} for ${url}`);
      }
      return {
        data: Buffer.from(await response.arrayBuffer()).toString("base64"),
        mediaType,
      };
    }),
  );
}
