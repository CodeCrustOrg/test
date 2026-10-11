# VerdictLab — product comparison site

Next.js 16 (App Router) + Tailwind CSS 4. Every page is statically generated from the catalog at build time; only `/go/*` redirects run on the server.

## What's in it

| Route | What it is |
|---|---|
| `/` | Home: category grid, current #1 picks, trending head-to-heads |
| `/[niche]` | Niche hub: award tiles, ranked top list, sortable/filterable spec table (tick up to 4 → compare), price-vs-score value map, head-to-head links, buying guide, FAQ (with `ItemList` + `FAQPage` JSON-LD) |
| `/[niche]/[product]` | Product page: score + sub-scores, grouped spec sheet with "best in class" flags, pros/cons, nearest rivals (`Product` JSON-LD) |
| `/[niche]/vs/[a]-vs-[b]` | Pre-rendered head-to-heads for every pair in each niche's top 6: verdict, spec-win tally, "choose X if…", side-by-side table |
| `/[niche]/compare?p=a,b,c` | Interactive 2–4 product comparison; the URL is shareable |
| `/go/[niche]/[product]` | 302 to `affiliateUrl`, falling back to `officialUrl`. Use these in YouTube descriptions: changing a URL in the DB updates every video. `noindex`, disallowed in robots.txt |
| `/how-we-rank`, `/disclosure` | Methodology and affiliate disclosure (FTC-style) |
| `/sitemap.xml`, `/robots.txt` | Generated from the catalog |

Outbound links carry `rel="sponsored nofollow noopener noreferrer"`.

## Data

`src/lib/data/index.ts` loads the catalog once per build:

- **`MONGODB_URI` set** → reads the `niches` and `products` collections (override with `MONGODB_NICHES_COLLECTION` / `MONGODB_PRODUCTS_COLLECTION`, database with `MONGODB_DB`), maps each document through `src/lib/data/mapping.ts`, ranks by score.
- **Not set** → uses `src/lib/data/sample.ts`, which is **entirely fictional** placeholder data. A banner says so on every page.

The mapping reads each field from a list of likely names (`name|title`, `image|imageUrl|thumbnail`, …) because the real schema hasn't been inspected yet. Run:

```bash
MONGODB_URI="mongodb+srv://..." npm run db:inspect
```

to print every collection's field names/types, then tighten `mapping.ts` to match. Niches without a spec definition get one inferred from product specs; products without a score get one computed from directional numeric specs (flagged on the product page).

Expected canonical shape (see `src/lib/types.ts`):

- **niche**: `slug, name, noun, tagline, description, emoji, specs[{key,label,type,unit,higherIsBetter,group,highlight}], guide[{title,body}], faqs[{q,a}], updatedAt, youtubeId`
- **product**: `slug, niche, name, brand, image, price, currency, score (0–10), subscores{}, award, bestFor, summary, pros[], cons[], specs{key: value}, officialUrl, affiliateUrl`

## Run

```bash
cp .env.example .env.local   # fill in MONGODB_URI, NEXT_PUBLIC_SITE_URL
npm install
npm run dev                  # or: npm run build && npm start
```

Rebuild (or redeploy) to pick up database changes.
