import type { Niche, Product, SpecDef, SpecValue } from "../types";

// Maps raw database documents to the site's canonical types.
//
// The production schema was not inspectable when this was written (the build
// container could not reach the cluster), so every field below is read through
// a list of candidate names. Run `npm run db:inspect` against the real database
// and tighten these lists to the actual field names.

type Raw = Record<string, unknown>;

function pick(doc: Raw, paths: string[]): unknown {
  for (const path of paths) {
    let cur: unknown = doc;
    for (const part of path.split(".")) {
      if (cur && typeof cur === "object" && part in (cur as Raw)) cur = (cur as Raw)[part];
      else {
        cur = undefined;
        break;
      }
    }
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

const str = (v: unknown) => (v === undefined ? undefined : String(v));
const num = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return v.trim() && Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String).filter(Boolean) : typeof v === "string" ? v.split(/\n|;/).map((s) => s.trim()).filter(Boolean) : [];

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function humanize(key: string): string {
  return key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^\w/, (c) => c.toUpperCase());
}

function toSpecDefs(v: unknown): SpecDef[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is Raw => !!s && typeof s === "object")
    .map((s) => {
      const key = str(pick(s, ["key", "id", "name"])) ?? "";
      return {
        key,
        label: str(pick(s, ["label", "title", "name"])) ?? humanize(key),
        type: (["number", "boolean", "text"].includes(String(s.type)) ? s.type : "text") as SpecDef["type"],
        unit: str(s.unit),
        higherIsBetter: typeof s.higherIsBetter === "boolean" ? s.higherIsBetter : undefined,
        group: str(s.group),
        highlight: s.highlight === true,
      };
    })
    .filter((s) => s.key);
}

export function mapNiche(doc: Raw): Niche {
  const name = str(pick(doc, ["name", "title", "label", "category"])) ?? "Untitled";
  return {
    slug: str(pick(doc, ["slug", "handle", "key"])) ?? slugify(name),
    name,
    noun: str(pick(doc, ["noun", "plural"])) ?? name.toLowerCase(),
    tagline: str(pick(doc, ["tagline", "subtitle", "headline"])) ?? "",
    description: str(pick(doc, ["description", "intro", "summary"])) ?? "",
    emoji: str(pick(doc, ["emoji", "icon"])),
    accent: str(pick(doc, ["accent", "color"])),
    specs: toSpecDefs(pick(doc, ["specs", "specDefs", "attributes", "fields"])),
    guide: (Array.isArray(doc.guide) ? doc.guide : [])
      .map((g: Raw) => ({ title: String(g.title ?? ""), body: String(g.body ?? g.text ?? "") }))
      .filter((g) => g.title),
    faqs: (Array.isArray(doc.faqs) ? doc.faqs : [])
      .map((f: Raw) => ({ q: String(f.q ?? f.question ?? ""), a: String(f.a ?? f.answer ?? "") }))
      .filter((f) => f.q),
    updatedAt: new Date(String(pick(doc, ["updatedAt", "updated_at", "modifiedAt"]) ?? Date.now())).toISOString(),
    youtubeId: str(pick(doc, ["youtubeId", "videoId", "youtube"])),
  };
}

function toSpecs(v: unknown): Record<string, SpecValue> {
  const out: Record<string, SpecValue> = {};
  if (Array.isArray(v)) {
    // [{ key|name, value }]
    for (const item of v as Raw[]) {
      const key = str(pick(item, ["key", "name", "label"]));
      if (key) out[key] = (item.value ?? null) as SpecValue;
    }
  } else if (v && typeof v === "object") {
    for (const [k, val] of Object.entries(v as Raw)) {
      if (val === null || ["number", "string", "boolean"].includes(typeof val)) out[k] = val as SpecValue;
    }
  }
  return out;
}

export function mapProduct(doc: Raw): Omit<Product, "rank" | "scoreDerived"> | null {
  const name = str(pick(doc, ["name", "title", "productName"]));
  const niche = str(pick(doc, ["niche", "nicheSlug", "category", "categorySlug"]));
  if (!name || !niche) return null;
  const rawScore = num(pick(doc, ["score", "rating", "overallScore"]));
  return {
    slug: str(pick(doc, ["slug", "handle"])) ?? slugify(name),
    niche: slugify(niche),
    name,
    brand: str(pick(doc, ["brand", "manufacturer", "maker"])) ?? "",
    image: str(pick(doc, ["image", "imageUrl", "image_url", "thumbnail", "images.0", "img"])),
    price: num(pick(doc, ["price", "priceUsd", "msrp", "pricing.price"])),
    currency: str(pick(doc, ["currency", "pricing.currency"])) ?? "USD",
    // Accept 0–5 star ratings as well as 0–10 / 0–100 scores. -1 means "derive later".
    score: rawScore === undefined ? -1 : rawScore > 10 ? rawScore / 10 : rawScore <= 5 && pick(doc, ["rating"]) !== undefined ? rawScore * 2 : rawScore,
    subscores: Object.fromEntries(
      Object.entries((pick(doc, ["subscores", "scores"]) as Raw) ?? {}).flatMap(([k, v]) => {
        const n = num(v);
        return n === undefined ? [] : [[k, n > 10 ? n / 10 : n]];
      }),
    ),
    award: str(pick(doc, ["award", "badge", "label"])),
    bestFor: str(pick(doc, ["bestFor", "best_for", "idealFor"])),
    summary: str(pick(doc, ["summary", "description", "verdict", "blurb"])) ?? "",
    pros: strList(pick(doc, ["pros", "positives", "strengths"])),
    cons: strList(pick(doc, ["cons", "negatives", "weaknesses"])),
    specs: toSpecs(pick(doc, ["specs", "specifications", "attributes", "features"])),
    officialUrl: str(pick(doc, ["officialUrl", "official_url", "website", "url", "productUrl"])),
    affiliateUrl: str(pick(doc, ["affiliateUrl", "affiliate_url", "buyUrl", "amazonUrl"])),
  };
}

/** Infers spec definitions from product values when a niche document has none. */
export function inferSpecs(products: { specs: Product["specs"] }[]): SpecDef[] {
  const seen = new Map<string, SpecValue[]>();
  for (const p of products) for (const [k, v] of Object.entries(p.specs)) seen.set(k, [...(seen.get(k) ?? []), v]);
  return [...seen.entries()].map(([key, values], i) => {
    const present = values.filter((v) => v !== null);
    const type: SpecDef["type"] = present.every((v) => typeof v === "number")
      ? "number"
      : present.every((v) => typeof v === "boolean")
        ? "boolean"
        : "text";
    return { key, label: humanize(key), type, highlight: i < 5 };
  });
}
