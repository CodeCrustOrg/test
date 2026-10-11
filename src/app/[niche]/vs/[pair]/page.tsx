import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SideBySide } from "@/components/SideBySide";
import { Breadcrumbs, ProductImage, ScoreRing } from "@/components/ui";
import { getNiche, getNiches, getProducts } from "@/lib/data";
import { formatPrice, specWinner } from "@/lib/format";
import { compareHref, productHref, vsHref } from "@/lib/links";
import { topPairs } from "@/lib/pairs";
import type { Product } from "@/lib/types";

export const dynamicParams = false;

export async function generateStaticParams() {
  const out: { niche: string; pair: string }[] = [];
  for (const n of await getNiches()) {
    for (const [a, b] of topPairs(await getProducts(n.slug), 6)) out.push({ niche: n.slug, pair: `${a.slug}-vs-${b.slug}` });
  }
  return out;
}

type Props = { params: Promise<{ niche: string; pair: string }> };

async function resolve(params: Props["params"]) {
  const { niche: nicheSlug, pair } = await params;
  const niche = await getNiche(nicheSlug);
  if (!niche) return null;
  const products = await getProducts(niche.slug);
  for (const a of products) {
    if (!pair.startsWith(`${a.slug}-vs-`)) continue;
    const b = products.find((p) => p.slug === pair.slice(a.slug.length + 4));
    if (b) return { niche, products, a, b };
  }
  return null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const r = await resolve(params);
  if (!r) return {};
  const title = `${r.a.name} vs ${r.b.name}: Which ${r.niche.name.replace(/s$/, "")} Wins?`;
  return {
    title,
    description: `${r.a.name} vs ${r.b.name} compared spec by spec — score, price and every measured difference.`,
    alternates: { canonical: vsHref(r.niche.slug, r.a.slug, r.b.slug) },
  };
}

export default async function VsPage({ params }: Props) {
  const r = await resolve(params);
  if (!r) notFound();
  const { niche, products, a, b } = r;

  let compared = 0;
  let aWins = 0;
  let bWins = 0;
  const aEdges: string[] = [];
  const bEdges: string[] = [];
  for (const s of niche.specs) {
    const w = specWinner(s, a.specs[s.key], b.specs[s.key]);
    if (w !== null) compared++;
    if (w === -1) (aWins++, aEdges.push(s.label));
    if (w === 1) (bWins++, bEdges.push(s.label));
  }
  const winner = a.score === b.score ? null : a.score > b.score ? a : b;
  const others = topPairs(products, 6).filter(([x, y]) => !(x.slug === a.slug && y.slug === b.slug)).slice(0, 6);

  return (
    <>
      <section className="grain border-b border-line">
        <div className="container-x py-10 sm:py-14">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: niche.name, href: `/${niche.slug}` }, { label: `${a.name} vs ${b.name}` }]} />
          <h1 className="font-display mt-6 text-center text-3xl font-semibold leading-tight sm:text-5xl">
            {a.name} <span className="text-ink-3">vs</span> {b.name}
          </h1>
          <div className="mx-auto mt-10 grid max-w-3xl grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8">
            <Fighter p={a} wins={aWins} isWinner={winner?.slug === a.slug} />
            <div className="grid h-14 w-14 place-items-center rounded-full bg-ink font-display text-lg font-semibold text-bg shadow-lift">vs</div>
            <Fighter p={b} wins={bWins} isWinner={winner?.slug === b.slug} />
          </div>
        </div>
      </section>

      <div className="container-x space-y-14 pt-10">
        <section className="card grid gap-6 p-6 sm:p-8 md:grid-cols-[1.2fr_1fr_1fr]">
          <div>
            <p className="eyebrow">The verdict</p>
            <p className="mt-2 text-xl font-semibold leading-snug">
              {winner
                ? `${winner.name} scores higher overall (${winner.score.toFixed(1)} vs ${(winner === a ? b : a).score.toFixed(1)}).`
                : "It's a dead heat on overall score."}
            </p>
            <p className="mt-2 text-sm text-ink-3">
              {a.name} wins {aWins} and {b.name} wins {bWins} of the {compared} directly comparable specs{aWins + bWins < compared ? " (the rest are ties)" : ""}.
            </p>
          </div>
          <Choose p={a} edges={aEdges} />
          <Choose p={b} edges={bEdges} />
        </section>

        <section className="space-y-5">
          <h2 className="font-display text-3xl font-semibold">Spec by spec</h2>
          <SideBySide products={[a, b]} specs={niche.specs} />
          <Link href={compareHref(niche.slug, [a.slug, b.slug])} className="inline-flex text-sm font-semibold text-brand hover:underline">
            Add a third product to this comparison →
          </Link>
        </section>

        {others.length > 0 && (
          <section className="space-y-5">
            <h2 className="font-display text-2xl font-semibold">More {niche.noun} match-ups</h2>
            <div className="flex flex-wrap gap-2">
              {others.map(([x, y]) => (
                <Link key={`${x.slug}-${y.slug}`} href={vsHref(niche.slug, x.slug, y.slug)} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-medium transition hover:border-line-2 hover:shadow-card">
                  {x.name} vs {y.name}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function Fighter({ p, wins, isWinner }: { p: Product; wins: number; isWinner: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div className="relative w-full max-w-[200px]">
        <ProductImage product={p} className={`aspect-square w-full rounded-3xl bg-surface ${isWinner ? "ring-2 ring-win ring-offset-4 ring-offset-bg" : "border border-line"}`} />
        {isWinner && (
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-win px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-card">Winner</span>
        )}
      </div>
      <Link href={productHref(p)} className="font-semibold hover:underline">{p.name}</Link>
      <ScoreRing score={p.score} size={56} />
      <span className="text-sm text-ink-3 tabular">{formatPrice(p)} · {wins} spec wins</span>
    </div>
  );
}

function Choose({ p, edges }: { p: Product; edges: string[] }) {
  return (
    <div className="rounded-2xl bg-surface-2/70 p-5">
      <p className="text-sm font-semibold">Choose {p.name} if…</p>
      <ul className="mt-2 space-y-1 text-sm text-ink-2">
        {p.bestFor && <li>• you want it for: {p.bestFor.toLowerCase()}</li>}
        {edges.slice(0, 3).map((e) => (
          <li key={e}>• {e.toLowerCase()} matters most</li>
        ))}
        {!p.bestFor && !edges.length && <li>• you prefer it on price or design</li>}
      </ul>
    </div>
  );
}
