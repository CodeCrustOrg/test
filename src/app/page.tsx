import Link from "next/link";
import { ProductImage, SectionHead } from "@/components/ui";
import { getCatalog } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { productHref, vsHref } from "@/lib/links";
import { topPairs } from "@/lib/pairs";
import { site } from "@/lib/site";

export default async function Home() {
  const { niches, products } = await getCatalog();
  const byNiche = (slug: string) => products.filter((p) => p.niche === slug);
  const specCount = niches.reduce((n, x) => n + x.specs.length * byNiche(x.slug).length, 0);
  const featured = niches.map((n) => ({ niche: n, top: byNiche(n.slug)[0] })).filter((x) => x.top);
  const matchups = niches.flatMap((n) => topPairs(byNiche(n.slug), 3).slice(0, 2).map((pair) => ({ niche: n, pair })));

  return (
    <>
      <section className="grain relative overflow-hidden border-b border-line">
        <div className="container-x grid items-center gap-12 py-16 sm:py-24 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1 text-xs font-medium text-ink-2 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-win" /> {site.tagline}
            </p>
            <h1 className="font-display mt-6 text-5xl font-semibold leading-[1.02] sm:text-7xl">
              Compare first.
              <br />
              <span className="text-brand">Buy once.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-ink-2">
              Ranked top lists, spec-by-spec head-to-heads and a comparison table you can actually sort — so the right pick is obvious in seconds.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              {featured[0] && (
                <Link href={`/${featured[0].niche.slug}`} className="rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-bg shadow-lift transition hover:brightness-125">
                  Explore {featured[0].niche.name} →
                </Link>
              )}
              <a href="#categories" className="rounded-xl border border-line-2 bg-surface px-5 py-3 text-sm font-semibold transition hover:bg-surface-2">
                All categories
              </a>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6">
              {[
                [niches.length, "categories"],
                [products.length, "products ranked"],
                [specCount, "data points"],
              ].map(([v, l]) => (
                <div key={l}>
                  <dt className="sr-only">{l}</dt>
                  <dd className="text-3xl font-semibold tabular">{Number(v).toLocaleString("en-US")}</dd>
                  <p className="text-xs text-ink-3">{l}</p>
                </div>
              ))}
            </dl>
          </div>

          {/* Decorative stacked preview of real top picks */}
          <div className="relative mx-auto hidden h-[420px] w-full max-w-md lg:block" aria-hidden>
            {featured.slice(0, 3).map(({ niche, top }, i) => (
              <div
                key={niche.slug}
                className="card absolute left-0 right-0 p-5 shadow-lift"
                style={{ top: i * 120, transform: `translateX(${i % 2 ? 36 : 0}px) rotate(${[-2, 1.5, -1][i]}deg)`, zIndex: 3 - i }}
              >
                <div className="flex items-center gap-4">
                  <ProductImage product={top} className="h-16 w-16 rounded-xl bg-surface-2" />
                  <div className="min-w-0 flex-1">
                    <p className="eyebrow">#1 {niche.name}</p>
                    <p className="truncate font-semibold">{top.name}</p>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-brand" style={{ width: `${top.score * 10}%` }} />
                    </div>
                  </div>
                  <span className="text-2xl font-semibold tabular">{top.score.toFixed(1)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="container-x space-y-24 pt-16">
        <section id="categories" className="scroll-mt-24 space-y-8">
          <SectionHead title="Browse by category" kicker="Each one has a ranked top list, a sortable spec table and head-to-heads." />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {niches.map((n) => {
              const items = byNiche(n.slug);
              return (
                <Link key={n.slug} href={`/${n.slug}`} className="card group relative flex flex-col overflow-hidden p-6 transition hover:-translate-y-1 hover:shadow-lift">
                  <div
                    className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-25 blur-2xl transition group-hover:opacity-40"
                    style={{ background: n.accent ?? "var(--brand)" }}
                  />
                  <span className="text-3xl">{n.emoji ?? "★"}</span>
                  <h3 className="mt-4 text-xl font-semibold tracking-tight">{n.name}</h3>
                  {n.tagline && <p className="mt-2 text-sm leading-relaxed text-ink-2">{n.tagline}</p>}
                  <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
                    <div className="flex -space-x-2">
                      {items.slice(0, 4).map((p) => (
                        <ProductImage key={p.slug} product={p} className="h-8 w-8 rounded-full border-2 border-surface bg-surface-2 [&>span]:text-[10px]" />
                      ))}
                    </div>
                    <span className="text-sm font-medium text-ink-3 transition group-hover:text-ink">{items.length} compared →</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        <section className="space-y-8">
          <SectionHead title="Current #1 picks" kicker="The top-scoring product in every category right now." />
          <div className="card divide-y divide-line">
            {featured.map(({ niche, top }) => (
              <Link key={niche.slug} href={productHref(top)} className="flex items-center gap-4 px-5 py-4 transition hover:bg-surface-2/60 sm:px-6">
                <ProductImage product={top} className="h-14 w-14 shrink-0 rounded-xl bg-surface-2" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-ink-3">{niche.name}</p>
                  <p className="truncate font-semibold">{top.name}</p>
                </div>
                <span className="hidden text-sm text-ink-3 tabular sm:block">{formatPrice(top)}</span>
                <span className="rounded-lg bg-brand-soft px-2.5 py-1 text-sm font-bold text-brand tabular">{top.score.toFixed(1)}</span>
              </Link>
            ))}
          </div>
        </section>

        {matchups.length > 0 && (
          <section className="space-y-8">
            <SectionHead title="Trending head-to-heads" kicker="Spec-by-spec winners, no scrolling through reviews." />
            <div className="grid gap-4 md:grid-cols-2">
              {matchups.map(({ niche, pair: [a, b] }) => (
                <Link key={`${a.slug}-${b.slug}`} href={vsHref(niche.slug, a.slug, b.slug)} className="card group grid grid-cols-[1fr_auto_1fr] items-center gap-4 p-5 transition hover:shadow-lift">
                  <div className="flex items-center gap-3">
                    <ProductImage product={a} className="h-12 w-12 shrink-0 rounded-xl bg-surface-2" />
                    <span className="text-sm font-semibold leading-snug">{a.name}</span>
                  </div>
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-ink text-xs font-bold text-bg transition group-hover:scale-110">VS</span>
                  <div className="flex items-center justify-end gap-3 text-right">
                    <span className="text-sm font-semibold leading-snug">{b.name}</span>
                    <ProductImage product={b} className="h-12 w-12 shrink-0 rounded-xl bg-surface-2" />
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="card grid gap-8 overflow-hidden p-8 sm:p-12 md:grid-cols-3">
          {[
            ["One spec sheet", "Every product in a category is measured on the same specs, in the same units."],
            ["Winners highlighted", "Best value in every row is marked, so trade-offs jump out instead of hiding in paragraphs."],
            ["Rank ≠ commission", "Rankings come from scores. Affiliate links never move a product up the list."],
          ].map(([t, b], i) => (
            <div key={t}>
              <span className="font-display text-4xl text-brand">{String(i + 1).padStart(2, "0")}</span>
              <h3 className="mt-3 text-lg font-semibold">{t}</h3>
              <p className="mt-2 leading-relaxed text-ink-2">{b}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
