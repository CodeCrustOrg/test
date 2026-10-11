import "server-only";
import type { Catalog, Niche, Product, SpecDef } from "../types";
import { inferSpecs, mapNiche, mapProduct, slugify } from "./mapping";
import { sampleCatalog } from "./sample";

type Draft = Omit<Product, "rank" | "scoreDerived">;

async function loadFromMongo(uri: string): Promise<{ niches: Niche[]; products: Draft[] }> {
  const { MongoClient } = await import("mongodb");
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || undefined);
    const nicheCol = process.env.MONGODB_NICHES_COLLECTION || "niches";
    const productCol = process.env.MONGODB_PRODUCTS_COLLECTION || "products";
    const [rawNiches, rawProducts] = await Promise.all([
      db.collection(nicheCol).find({}).toArray(),
      db.collection(productCol).find({}).toArray(),
    ]);
    const products = rawProducts.map((d) => mapProduct(d)).filter((p): p is Draft => p !== null);
    const niches = rawNiches.map((d) => mapNiche(d));
    // Products may reference niches that have no document of their own.
    for (const slug of new Set(products.map((p) => p.niche))) {
      if (!niches.some((n) => n.slug === slug)) niches.push(mapNiche({ name: slug.replace(/-/g, " "), slug }));
    }
    return { niches, products };
  } finally {
    await client.close();
  }
}

/** Ranks products and fills in spec-derived scores where the source has none. */
function finalize(niches: Niche[], drafts: Draft[]): { niches: Niche[]; products: Product[] } {
  const products: Product[] = [];
  const outNiches: Niche[] = [];
  for (const niche of niches) {
    let items = drafts.filter((p) => p.niche === niche.slug);
    if (!items.length) continue;
    const specs: SpecDef[] = niche.specs.length ? niche.specs : inferSpecs(items);
    const n: Niche = { ...niche, specs };

    // Ensure slugs are unique within the niche.
    const used = new Set<string>();
    items = items.map((p) => {
      const base = p.slug || slugify(p.name);
      let slug = base;
      for (let i = 2; used.has(slug); i++) slug = `${base}-${i}`;
      used.add(slug);
      return { ...p, slug };
    });

    const ranked = items
      .map((p) => {
        const derived = p.score < 0;
        return { ...p, score: derived ? specScore(p, items, specs) : p.score, scoreDerived: derived };
      })
      .sort((a, b) => b.score - a.score || (a.price ?? Infinity) - (b.price ?? Infinity))
      .map((p, i) => ({ ...p, score: Math.round(p.score * 10) / 10, rank: i + 1 }));

    outNiches.push(n);
    products.push(...ranked);
  }
  return { niches: outNiches, products };
}

/** Mean of min–max normalised directional numeric specs, mapped to 5.0–9.8. */
function specScore(p: Draft, all: Draft[], specs: SpecDef[]): number {
  const parts: number[] = [];
  for (const s of specs) {
    if (s.type !== "number" || s.higherIsBetter === undefined) continue;
    const v = p.specs[s.key];
    if (typeof v !== "number") continue;
    const vals = all.map((x) => x.specs[s.key]).filter((x): x is number => typeof x === "number");
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === min) continue;
    const t = (v - min) / (max - min);
    parts.push(s.higherIsBetter ? t : 1 - t);
  }
  if (!parts.length) return 7;
  return 5 + (parts.reduce((a, b) => a + b, 0) / parts.length) * 4.8;
}

let cached: Promise<Catalog> | undefined;

export function getCatalog(): Promise<Catalog> {
  cached ??= (async () => {
    const uri = process.env.MONGODB_URI;
    if (uri) {
      const { niches, products } = await loadFromMongo(uri);
      return { source: "mongodb" as const, ...finalize(niches, products) };
    }
    const sample = sampleCatalog();
    return { source: "sample" as const, ...finalize(sample.niches, sample.products) };
  })();
  return cached;
}

export async function getNiches() {
  return (await getCatalog()).niches;
}

export async function getNiche(slug: string) {
  return (await getCatalog()).niches.find((n) => n.slug === slug);
}

export async function getProducts(niche: string) {
  return (await getCatalog()).products.filter((p) => p.niche === niche);
}

export async function getProduct(niche: string, slug: string) {
  return (await getCatalog()).products.find((p) => p.niche === niche && p.slug === slug);
}

export async function getDataSource() {
  return (await getCatalog()).source;
}
