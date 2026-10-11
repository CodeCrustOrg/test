import Link from "next/link";
import type { Product, SpecDef } from "@/lib/types";
import { formatPrice, formatSpec } from "@/lib/format";
import { productHref } from "@/lib/links";
import { AwardChip, BuyButtons, Check, Cross, ProductImage, ScoreBar, ScoreRing } from "./ui";

export function RankedProductCard({ product: p, specs }: { product: Product; specs: SpecDef[] }) {
  const keySpecs = specs.filter((s) => s.highlight && p.specs[s.key] !== undefined && p.specs[s.key] !== null).slice(0, 4);
  const subs = Object.entries(p.subscores);
  return (
    <article id={p.slug} className="card scroll-mt-24 overflow-hidden transition hover:shadow-lift">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[220px_1fr_240px]">
        <div className="relative">
          <span className="absolute -left-1 -top-1 z-10 grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-bold text-bg shadow-card">
            {p.rank}
          </span>
          <ProductImage product={p} className="aspect-square w-full max-w-[160px] rounded-2xl bg-surface-2 lg:max-w-none" />
        </div>

        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            {p.award && <AwardChip award={p.award} />}
            <h3 className="text-2xl font-semibold tracking-tight">
              <Link href={productHref(p)} className="hover:underline">
                {p.name}
              </Link>
            </h3>
            {p.bestFor && (
              <p className="text-sm text-ink-3">
                Best for: <span className="font-medium text-ink-2">{p.bestFor}</span>
              </p>
            )}
          </div>
          {p.summary && <p className="leading-relaxed text-ink-2">{p.summary}</p>}

          {keySpecs.length > 0 && (
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {keySpecs.map((s) => (
                <div key={s.key} className="rounded-xl bg-surface-2 px-3 py-2">
                  <dt className="truncate text-[11px] text-ink-3">{s.label}</dt>
                  <dd className="text-sm font-semibold tabular">{formatSpec(s, p.specs[s.key])}</dd>
                </div>
              ))}
            </dl>
          )}

          {(p.pros.length > 0 || p.cons.length > 0) && (
            <div className="grid gap-4 sm:grid-cols-2">
              <ul className="space-y-1.5 text-sm">
                {p.pros.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Check className="mt-0.5 shrink-0 text-win" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
              <ul className="space-y-1.5 text-sm">
                {p.cons.map((x) => (
                  <li key={x} className="flex gap-2">
                    <Cross className="mt-0.5 shrink-0 text-lose" />
                    <span className="text-ink-2">{x}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="flex flex-col gap-5 rounded-2xl border border-line bg-surface-2/50 p-5">
          <div className="flex items-center justify-between">
            <ScoreRing score={p.score} />
            <div className="text-right">
              <div className="text-xs text-ink-3">From</div>
              <div className="text-2xl font-semibold tabular">{formatPrice(p)}</div>
            </div>
          </div>
          {subs.length > 0 && (
            <div className="space-y-2">
              {subs.map(([k, v]) => (
                <ScoreBar key={k} label={k} value={v} />
              ))}
            </div>
          )}
          <div className="mt-auto space-y-2">
            <BuyButtons product={p} compact />
            <Link href={productHref(p)} className="block text-center text-sm font-medium text-ink-2 hover:text-ink">
              Full breakdown →
            </Link>
          </div>
        </aside>
      </div>
    </article>
  );
}

export function PickTile({ product: p }: { product: Product }) {
  return (
    <a href={`#${p.slug}`} className="card group flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="flex items-start justify-between gap-2">
        <AwardChip award={p.award ?? `#${p.rank} ranked`} />
        <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-bold tabular">{p.score.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-3">
        <ProductImage product={p} className="h-14 w-14 shrink-0 rounded-xl bg-surface-2" />
        <div className="min-w-0">
          <div className="truncate font-semibold">{p.name}</div>
          <div className="text-sm text-ink-3 tabular">{formatPrice(p)}</div>
        </div>
      </div>
      <span className="mt-auto text-xs font-medium text-brand opacity-0 transition group-hover:opacity-100">Jump to review ↓</span>
    </a>
  );
}
