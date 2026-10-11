// Canonical shapes the site renders. Whatever the database stores is mapped
// into these in src/lib/data/mapping.ts, so pages never touch raw documents.

export type SpecValue = number | string | boolean | null;

export interface SpecDef {
  key: string;
  label: string;
  type: "number" | "boolean" | "text";
  unit?: string;
  /** For numeric specs: true if a larger value is better, false if smaller is better. */
  higherIsBetter?: boolean;
  /** Section heading on spec sheets, e.g. "Battery", "Audio". */
  group?: string;
  /** Show this spec as a column in the comparison table. */
  highlight?: boolean;
}

export interface GuideSection {
  title: string;
  body: string;
}

export interface Faq {
  q: string;
  a: string;
}

export interface Niche {
  slug: string;
  name: string;
  /** Short, plural noun used in headlines: "wireless earbuds". */
  noun: string;
  tagline: string;
  description: string;
  emoji?: string;
  accent?: string;
  specs: SpecDef[];
  guide: GuideSection[];
  faqs: Faq[];
  updatedAt: string;
  /** YouTube video that sends traffic to this page, if any. */
  youtubeId?: string;
}

export interface Product {
  slug: string;
  niche: string;
  name: string;
  brand: string;
  image?: string;
  price?: number;
  currency: string;
  /** Overall score, 0–10. Derived from specs when the database has none. */
  score: number;
  /** True when the score was computed from specs rather than stored editorially. */
  scoreDerived: boolean;
  /** Optional named sub-scores, 0–10 each. */
  subscores: Record<string, number>;
  /** Editorial award, e.g. "Best overall". */
  award?: string;
  bestFor?: string;
  summary: string;
  pros: string[];
  cons: string[];
  specs: Record<string, SpecValue>;
  officialUrl?: string;
  affiliateUrl?: string;
  /** 1-based position in the niche ranking (computed). */
  rank: number;
}

export interface Catalog {
  source: "mongodb" | "sample";
  niches: Niche[];
  products: Product[];
}
