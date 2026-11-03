import type { ShoppingReport } from "../../src/shopping-report.ts";

export const sampleReport: ShoppingReport = {
  recommendedAsin: "B07HXGTZ73",
  headline: "Buy the by Amazon Chicken and Rice 3kg.",
  summary:
    "Chicken is the first ingredient and it has 34% protein, for £3.11 a kg from Amazon itself. The bag lasts about 2 weeks for 4 cats, so you will reorder often.",
  candidates: [
    {
      asin: "B07HXGTZ73",
      rank: 1,
      name: "by Amazon Complete Chicken and Rice 3kg",
      price: "£9.34",
      pricePerUnit: "£3.11/kg",
      seller: "Amazon",
      rating: 4.5,
      ratingCount: 4086,
      verdict: "Best value on evidence: chicken first, 34% protein.",
      facts: [
        {
          label: "First ingredient",
          value: "Chicken",
          source: "listing image",
        },
        { label: "Protein %", value: "34%", source: "listing image" },
        {
          label: "Bag size",
          value: "3kg, about 2 weeks for 4 cats",
          source: "calculated",
        },
      ],
      redFlags: [
        {
          severity: "minor",
          text: 'The item form field says "Pate", but the title, images and reviews all describe dry food.',
        },
        {
          severity: "moderate",
          text: "A deal site lists a similar bag at £5.06, but I could not confirm it is the same pack.",
        },
      ],
      url: "https://www.amazon.co.uk/dp/B07HXGTZ73",
      imageUrl: "https://m.media-amazon.com/images/I/715LxHofJYL.jpg",
    },
    {
      asin: "B00KVGRZ6A",
      rank: 2,
      name: "IAMS Adult Chicken 3kg",
      price: "£14.48",
      pricePerUnit: "£4.83/kg",
      seller: "Amazon",
      rating: 4.7,
      ratingCount: 9305,
      verdict: "The most meat and protein, but 55% dearer per kg.",
      facts: [
        {
          label: "First ingredient",
          value: "Dried chicken and turkey, 38%",
          source: "listing image",
        },
        { label: "Protein %", value: "35%", source: "listing image" },
        {
          label: "Bag size",
          value: "3kg, about 2 weeks for 4 cats",
          source: "calculated",
        },
      ],
      redFlags: [
        {
          severity: "minor",
          text: "Recipes differ between markets, so check the panel on the bag you receive.",
        },
      ],
      url: "https://www.amazon.co.uk/dp/B00KVGRZ6A",
      imageUrl:
        "https://m.media-amazon.com/images/I/71C9Ap7yYFL._AC_SL1500_.jpg",
    },
    {
      asin: "B018SQLXGC",
      rank: 3,
      name: "Whiskas Adult Chicken 7kg",
      price: "£17.00",
      pricePerUnit: "£2.43/kg",
      seller: "Amazon",
      rating: 4.8,
      ratingCount: 12494,
      verdict: "Cheapest per kg, but cereal comes first.",
      facts: [
        {
          label: "First ingredient",
          value: "Cereals",
          source: "listing image",
        },
        { label: "Protein %", value: "not found", source: "" },
        {
          label: "Bag size",
          value: "7kg, about 4.5 weeks for 4 cats",
          source: "calculated",
        },
      ],
      redFlags: [
        {
          severity: "serious",
          text: "Chicken is only 4% of the brown kibble.",
        },
      ],
      url: "https://www.amazon.co.uk/dp/B018SQLXGC",
    },
  ],
  dropped: [
    {
      asin: "B07HXGV45L",
      name: "by Amazon Salmon and Rice 3kg",
      reason: "No protein figure in the text or the images.",
      url: "https://www.amazon.co.uk/dp/B07HXGV45L",
    },
  ],
  couldNotCheck: ["Price history", "Only 10 top reviews per product"],
  defaults: [
    "4 adult cats, about 55g a day each",
    "No budget given, so a limit of £20 a bag",
  ],
  sources: [
    {
      title: "Whiskas 1+ chicken ingredients",
      url: "https://millbryhill.co.uk/products/whiskas-dry-1-chicken",
    },
    {
      title: "IAMS adult nutrition",
      url: "https://www.ocado.com/products/iams-adult-dry-cat-food-chicken/27420011",
    },
  ],
};
