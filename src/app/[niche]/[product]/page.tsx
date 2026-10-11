import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AwardChip, Breadcrumbs, BuyButtons, Check, Cross, JsonLd, ProductImage, ScoreBar, ScoreRing } from "@/components/ui";
import { getNiche, getNiches, getProduct, getProducts } from "@/lib/data";
import { bestIndices, formatPrice, formatSpec } from "@/lib/format";
import { productHref, vsHref } from "@/lib/links";
import { site } from "@/lib/site";
import type { SpecDef } from "@/lib/types";

export const dynamicParams = false;

export async function generateStaticParams() {
  const out: { niche: string; product: string }[] = [];
  for (const n of await getNiches()) for (const p of await getProducts(n.slug)) out.push({ niche: n.slug, product: p.slug });
  return out;
}

type Props = { params: Promise<{ niche: string; product: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { niche, product } = await params;
  const p = await getProduct(niche, product);
  if (!p) return {};
  return {
    title: `${p.name} — Specs, Score & Alternatives`,
    description: p.summary || `${p.name} specs, score and how it compares to the alternatives.`,
    alternates: { canonical: productHref(p) },
  };
}

export default async function ProductPage({ params }: Props) {
  const { niche: nicheSlug, product } = await params;
  const [niche, p] = await Promise.all([getNiche(nicheSlug), getProduct(nicheSlug, product)]);
  if (!niche || !p) notFound();
  const all = await getProducts(niche.slug);
  const rivals = all.filter((x) => x.slug !== p.slug).sort((x, y) => Math.abs(x.rank - p.rank) - Math.abs(y.rank - p.rank)).slice(0, 3);

  const groups = new Map<string, SpecDef[]>();
  for (const s of niche.specs) groups.set(s.group ?? "Specs", [...(groups.get(s.group ?? "Specs") ?? []), s]);
  const isBest = (s: SpecDef) => bestIndices(s, all.map((x) => x.specs[s.key])).includes(all.indexOf(p));

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          brand: p.brand ? { "@type": "Brand", name: p.brand } : undefined,
          image: p.image,
          description: p.summary,
          url: `${site.url}${productHref(p)}`,
          ...(p.price !== undefined && p.officialUrl
            ? { offers: { "@type": "Offer", price: p.price, priceCurrency: p.currency, url: p.officialUrl } }
            : {}),
        }}
      />
      <section className="grain border-b border-line">
        <div className="container-x py-10 sm:py-14">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: niche.name, href: `/${niche.slug}` }, { label: p.name }]} />
          <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_1.1fr]">
            <ProductImage product={p} className="card aspect-[4/3] w-full rounded-3xl" />
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-center gap-2">
                {p.award && <AwardChip award={p.award} />}
                <span className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-ink-3">
                  #{p.rank} of {all.length} {niche.noun}
                </span>
              </div>
              <div>
                {p.brand && <p className="eyebrow">{p.brand}</p>}
                <h1 className="font-display mt-1 text-4xl font-semibold leading-tight sm:text-5xl">{p.name}</h1>
              </div>
              {p.summary && <p className="text-lg leading-relaxed text-ink-2">{p.summary}</p>}
              <div className="card flex flex-wrap items-center gap-6 p-5">
                <ScoreRing score={p.score} size={76} />
                <div className="min-w-[8rem] flex-1 space-y-2">
                  {Object.entries(p.subscores).map(([k, v]) => (
                    <ScoreBar key={k} label={k} value={v} />
                  ))}
                  {p.scoreDerived && <p className="text-xs text-ink-3">Score computed from specs relative to the other {niche.noun} listed.</p>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-3xl font-semibold tabular">{formatPrice(p)}</span>
                <div className="min-w-[16rem] flex-1">
                  <BuyButtons product={p} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="container-x grid gap-10 pt-12 lg:grid-cols-[1.5fr_1fr]">
        <section className="space-y-6">
          <h2 className="font-display text-3xl font-semibold">Full specifications</h2>
          <div className="card overflow-hidden">
            {[...groups.entries()].map(([g, defs]) => (
              <div key={g}>
                <div className="bg-surface-2/60 px-5 py-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{g}</div>
                <dl>
                  {defs.map((s) => {
                    const v = p.specs[s.key];
                    const best = isBest(s);
                    return (
                      <div key={s.key} className="flex items-center justify-between gap-4 border-t border-line px-5 py-3 text-sm">
                        <dt className="text-ink-2">{s.label}</dt>
                        <dd className="flex items-center gap-2 font-semibold tabular">
                          {best && <span className="rounded-md bg-win-soft px-1.5 py-0.5 text-[10px] font-bold uppercase text-win">Best in class</span>}
                          {typeof v === "boolean" ? (v ? <Check className="text-win" /> : <Cross className="text-ink-3" />) : formatSpec(s, v)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            ))}
          </div>
        </section>

        <aside className="space-y-6">
          {(p.pros.length > 0 || p.cons.length > 0) && (
            <div className="card space-y-5 p-6">
              <div>
                <h3 className="eyebrow mb-3">What we like</h3>
                <ul className="space-y-2 text-sm">
                  {p.pros.map((x) => (
                    <li key={x} className="flex gap-2"><Check className="mt-0.5 shrink-0 text-win" />{x}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="eyebrow mb-3">Watch out for</h3>
                <ul className="space-y-2 text-sm text-ink-2">
                  {p.cons.map((x) => (
                    <li key={x} className="flex gap-2"><Cross className="mt-0.5 shrink-0 text-lose" />{x}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="card p-6">
            <h3 className="eyebrow mb-4">Compare with</h3>
            <ul className="space-y-3">
              {rivals.map((r) => {
                const [x, y] = r.rank < p.rank ? [r, p] : [p, r];
                return (
                  <li key={r.slug}>
                    <Link href={vsHref(niche.slug, x.slug, y.slug)} className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-surface-2">
                      <ProductImage product={r} className="h-12 w-12 shrink-0 rounded-lg bg-surface-2" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">vs {r.name}</span>
                        <span className="text-xs text-ink-3 tabular">Score {r.score.toFixed(1)} · {formatPrice(r)}</span>
                      </span>
                      <span className="text-ink-3">→</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <Link href={`/${niche.slug}`} className="mt-4 block text-sm font-semibold text-brand hover:underline">
              See all {all.length} {niche.noun} →
            </Link>
          </div>
        </aside>
      </div>
    </>
  );
}
