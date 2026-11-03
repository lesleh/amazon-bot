import { z } from "zod";

const asin = z.string().describe("The Amazon product ID");

const fact = z.object({
  label: z.string().describe('What the value is, for example "Protein %"'),
  value: z.string().describe('The value, or "not found"'),
  source: z
    .string()
    .describe(
      'Where the value came from, for example "listing", "listing image", "Ocado" or "calculated"',
    ),
});

const redFlag = z.object({
  severity: z
    .enum(["serious", "moderate", "minor"])
    .describe(
      "serious: enough to drop a product. moderate: a real doubt that affects the ranking. minor: worth knowing",
    ),
  text: z
    .string()
    .describe("The flag and its evidence, in one or two plain sentences"),
});

const candidate = z.object({
  asin,
  rank: z.number().int().min(1),
  name: z.string().describe("A short product name, with the size"),
  price: z.string().describe('The buy box price, for example "£9.34"'),
  pricePerUnit: z.string().describe('For example "£3.11/kg"'),
  seller: z.string().describe("The buy box seller"),
  rating: z.number().nullable(),
  ratingCount: z.number().int().nullable(),
  verdict: z.string().describe("One short sentence"),
  facts: z
    .array(fact)
    .describe(
      "Every report column of the matching category section, or the 2 or 3 deciding factors when no section matches. Leave out price, price per unit, rating and seller, which have their own fields",
    ),
  redFlags: z.array(redFlag),
});

export const reportSchema = z.object({
  recommendedAsin: z
    .string()
    .nullable()
    .describe("The candidate to buy, or null when nothing can be recommended"),
  headline: z.string().describe("The recommendation in one sentence"),
  summary: z
    .string()
    .describe("Why, in 2 or 3 sentences, including the main trade-off"),
  candidates: z.array(candidate).describe("The candidates you kept, ranked"),
  dropped: z.array(
    z.object({
      asin,
      name: z.string(),
      reason: z.string().describe("The red flag that removed it"),
    }),
  ),
  couldNotCheck: z.array(z.string()),
  defaults: z
    .array(z.string())
    .describe(
      "The defaults you assumed in the brief. Leave out a household profile that does not apply",
    ),
  sources: z
    .array(z.object({ title: z.string(), url: z.string() }))
    .describe("Every web page you relied on"),
});

export type SubmittedReport = z.infer<typeof reportSchema>;
export type Candidate = SubmittedReport["candidates"][number];

// What the page renders: the agent's report plus what the tools know about each product.
export interface ShoppingReport extends SubmittedReport {
  candidates: Array<Candidate & { url: string; imageUrl?: string }>;
  dropped: Array<SubmittedReport["dropped"][number] & { url: string }>;
}

export const productUrl = (asin: string) =>
  `https://www.amazon.co.uk/dp/${asin}`;
