import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ComparisonTable } from "@/components/ComparisonTable";
import { PickTile, RankedProductCard } from "@/components/ProductCard";
import { ValueMap } from "@/components/ValueMap";
import { Breadcrumbs, JsonLd, ProductImage, SectionHead } from "@/components/ui";
import { getNiche, getNiches, getProducts } from "@/lib/data";
import { compareHref, productHref, vsHref } from "@/lib/links";
import { topPairs } from "@/lib/pairs";
import { site } from "@/lib/site";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getNiches()).map((n) => ({ niche: n.slug }));
}

type Props = { params: Promise<{ niche: string }> };

const monthYear = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const niche = await getNiche((await params).niche);
  if (!niche) return {};
  const count = (await getProducts(niche.slug)).length;
  const title = `The ${count} Best ${niche.name} (${monthYear(niche.updatedAt)}) — Compared`;
  return { title, description: niche.tagline || niche.description, alternates: { canonical: `/${niche.slug}` }, openGraph: { title } };
}

export default async function NichePage({ params }: Props) {
  const niche = await getNiche((await params).niche);
  if (!niche) notFound();
  const products = await getProducts(niche.slug);
  const picks = products.filter((p) => p.award).slice(0, 4);
  const pairs = topPairs(products, 5);

  const sections = [
    ["picks", "Top picks"],
    ["compare", "Compare all"],
    ["value", "Value map"],
    ["matchups", "Head-to-head"],
    ...(niche.guide.length ? [["guide", "Buying guide"]] : []),
    ...(niche.faqs.length ? [["faq", "FAQ"]] : []),
  ];

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: `Best ${niche.noun}`,
          itemListElement: products.map((p) => ({ "@type": "ListItem", position: p.rank, url: `${site.url}${productHref(p)}`, name: p.name })),
        }}
      />
      {niche.faqs.length > 0 && (
        <JsonLd
          data={{
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: niche.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          }}
        />
      )}

      <section className="grain border-b border-line">
        <div className="container-x py-10 sm:py-16">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: niche.name }]} />
          <div className="mt-6 grid items-end gap-10 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <p className="eyebrow">
                Updated {monthYear(niche.updatedAt)} · {products.length} compared
              </p>
              <h1 className="font-display mt-3 text-4xl font-semibold leading-[1.05] sm:text-6xl">
                The best {niche.noun}
                <span className="text-ink-3">, ranked.</span>
              </h1>
              {niche.tagline && <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-2">{niche.tagline}</p>}
              {niche.description && <p className="mt-3 max-w-xl leading-relaxed text-ink-3">{niche.description}</p>}
            </div>
            {niche.youtubeId ? (
              <div className="card aspect-video overflow-hidden">
                <iframe
                  className="h-full w-full"
                  src={`https://www.youtube-nocookie.com/embed/${niche.youtubeId}`}
                  title={`${niche.name} video`}
                  loading="lazy"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            ) : (
              <ol className="card divide-y divide-line">
                {products.slice(0, 3).map((p) => (
                  <li key={p.slug}>
                    <a href={`#${p.slug}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-surface-2/60">
                      <span className="w-5 text-sm font-bold text-ink-3">{p.rank}</span>
                      <ProductImage product={p} className="h-10 w-10 rounded-lg bg-surface-2" />
                      <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                      <span className="rounded-md bg-brand-soft px-2 py-0.5 text-sm font-bold text-brand tabular">{p.score.toFixed(1)}</span>
                    </a>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      </section>

      <nav className="sticky top-16 z-30 border-b border-line bg-bg/85 backdrop-blur-xl" aria-label="On this page">
        <div className="container-x scrollbar-thin flex gap-1 overflow-x-auto py-2">
          {sections.map(([id, label]) => (
            <a key={id} href={`#${id}`} className="whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink">
              {label}
            </a>
          ))}
        </div>
      </nav>

      <div className="container-x space-y-20 pt-10">
        {picks.length > 0 && (
          <section aria-labelledby="glance">
            <h2 id="glance" className="eyebrow mb-4">At a glance</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {picks.map((p) => (
                <PickTile key={p.slug} product={p} />
              ))}
            </div>
          </section>
        )}

        <section id="picks" className="scroll-mt-32 space-y-6">
          <SectionHead title={`Top ${products.length} ${niche.noun}`} kicker="Ranked by overall score" />
          {products.map((p) => (
            <RankedProductCard key={p.slug} product={p} specs={niche.specs} />
          ))}
        </section>

        <section id="compare" className="scroll-mt-32 space-y-6">
          <SectionHead title="Compare every spec" kicker="Sort any column, filter by price, tick products to go head-to-head" />
          <ComparisonTable niche={niche.slug} products={products} specs={niche.specs} />
        </section>

        <section id="value" className="scroll-mt-32 space-y-6">
          <SectionHead title="Where's the value?" kicker="Higher is better, further left is cheaper" />
          <ValueMap products={products} />
        </section>

        <section id="matchups" className="scroll-mt-32 space-y-6">
          <SectionHead title="Popular head-to-heads" kicker="Spec-by-spec winners for the most-asked match-ups" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pairs.map(([a, b]) => (
              <Link key={`${a.slug}-${b.slug}`} href={vsHref(niche.slug, a.slug, b.slug)} className="card group flex items-center gap-3 p-4 transition hover:shadow-lift">
                <ProductImage product={a} className="h-11 w-11 shrink-0 rounded-xl bg-surface-2" />
                <span className="text-xs font-bold uppercase text-ink-3">vs</span>
                <ProductImage product={b} className="h-11 w-11 shrink-0 rounded-xl bg-surface-2" />
                <span className="min-w-0 flex-1 text-sm font-medium leading-snug">
                  {a.name} <span className="text-ink-3">vs</span> {b.name}
                </span>
                <span className="text-ink-3 transition group-hover:translate-x-0.5 group-hover:text-ink">→</span>
              </Link>
            ))}
          </div>
          <Link href={compareHref(niche.slug, products.slice(0, 3).map((p) => p.slug))} className="inline-flex text-sm font-semibold text-brand hover:underline">
            Build your own comparison →
          </Link>
        </section>

        {niche.guide.length > 0 && (
          <section id="guide" className="scroll-mt-32 space-y-6">
            <SectionHead title="Buying guide" kicker={`What actually matters when choosing ${niche.noun}`} />
            <div className="grid gap-4 md:grid-cols-2">
              {niche.guide.map((g, i) => (
                <div key={g.title} className="card p-6">
                  <span className="font-display text-3xl text-ink-3">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 text-lg font-semibold">{g.title}</h3>
                  <p className="mt-2 leading-relaxed text-ink-2">{g.body}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {niche.faqs.length > 0 && (
          <section id="faq" className="scroll-mt-32 space-y-6">
            <SectionHead title="Frequently asked" />
            <div className="card divide-y divide-line">
              {niche.faqs.map((f) => (
                <details key={f.q} className="group px-6 py-5">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 font-semibold">
                    {f.q}
                    <span className="text-xl text-ink-3 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 leading-relaxed text-ink-2">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}

        <p className="text-sm text-ink-3">
          How these are scored: <Link href="/how-we-rank" className="underline underline-offset-2 hover:text-ink">our ranking method</Link>. We may earn a commission from links on this page — <Link href="/disclosure" className="underline underline-offset-2 hover:text-ink">disclosure</Link>.
        </p>
      </div>
    </>
  );
}

