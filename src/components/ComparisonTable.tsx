"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Product, SpecDef } from "@/lib/types";
import { bestIndices, formatPrice, formatSpec } from "@/lib/format";
import { compareHref, productHref } from "@/lib/links";
import { Check, Cross, ProductImage } from "./ui";

type SortKey = "rank" | "price" | string;

export function ComparisonTable({ niche, products, specs }: { niche: string; products: Product[]; specs: SpecDef[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "rank", dir: 1 });
  const [allSpecs, setAllSpecs] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const prices = products.map((p) => p.price).filter((v): v is number => typeof v === "number");
  const priceCap = prices.length ? Math.max(...prices) : 0;
  const [maxPrice, setMaxPrice] = useState(priceCap);

  const cols = useMemo(() => {
    const hl = specs.filter((s) => s.highlight);
    return allSpecs || !hl.length ? specs : hl;
  }, [specs, allSpecs]);

  const rows = useMemo(() => {
    const filtered = products.filter((p) => p.price === undefined || p.price <= maxPrice);
    const val = (p: Product): number | string => {
      if (sort.key === "rank") return p.rank;
      if (sort.key === "price") return p.price ?? Infinity;
      const v = p.specs[sort.key];
      return typeof v === "boolean" ? Number(v) : typeof v === "number" ? v : String(v ?? "");
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
    });
  }, [products, sort, maxPrice]);

  const toggleSort = (key: SortKey, def?: SpecDef) => {
    // Default direction: best-first for directional specs.
    const bestFirst: 1 | -1 = def?.higherIsBetter === false || key === "rank" || key === "price" ? 1 : -1;
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: bestFirst }));
  };

  const toggle = (slug: string) =>
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : s.length >= 4 ? s : [...s, slug]));

  const SortHead = ({ k, label, def, className = "" }: { k: SortKey; label: string; def?: SpecDef; className?: string }) => (
    <th scope="col" className={`whitespace-nowrap px-3 py-3 text-left font-medium ${className}`}>
      <button onClick={() => toggleSort(k, def)} className="inline-flex items-center gap-1 text-ink-3 hover:text-ink">
        {label}
        <span className={`text-[10px] ${sort.key === k ? "text-brand" : "opacity-30"}`}>{sort.key === k && sort.dir === -1 ? "▼" : "▲"}</span>
      </button>
    </th>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-line px-4 py-3 sm:px-6">
        {priceCap > 0 && (
          <label className="flex items-center gap-3 text-sm">
            <span className="text-ink-3">Max price</span>
            <input
              type="range"
              min={Math.min(...prices)}
              max={priceCap}
              step={10}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-36 accent-[var(--brand)]"
            />
            <span className="w-16 font-semibold tabular">{formatPrice({ price: maxPrice, currency: products[0]?.currency ?? "USD" })}</span>
          </label>
        )}
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={allSpecs} onChange={(e) => setAllSpecs(e.target.checked)} className="accent-[var(--brand)]" />
          <span className="text-ink-2">Show all specs</span>
        </label>
        <span className="ml-auto text-xs text-ink-3">
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-win align-middle" /> best in column · tick up to 4 to compare
        </span>
      </div>

      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm tabular">
          <thead className="bg-surface-2/60">
            <tr>
              <th className="w-10 px-3" />
              <SortHead k="rank" label="Product" className="sticky left-0 bg-surface-2" />
              <SortHead k="price" label="Price" />
              {cols.map((s) => (
                <SortHead key={s.key} k={s.key} label={s.label} def={s} />
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              return (
                <tr key={p.slug} className={`border-t border-line transition ${selected.includes(p.slug) ? "bg-brand-soft/60" : "hover:bg-surface-2/50"}`}>
                  <td className="px-3">
                    <input
                      type="checkbox"
                      aria-label={`Select ${p.name} to compare`}
                      checked={selected.includes(p.slug)}
                      disabled={!selected.includes(p.slug) && selected.length >= 4}
                      onChange={() => toggle(p.slug)}
                      className="h-4 w-4 accent-[var(--brand)]"
                    />
                  </td>
                  <td className="sticky left-0 bg-surface px-3 py-3">
                    <Link href={productHref(p)} className="flex items-center gap-3">
                      <span className="w-5 text-center text-xs font-semibold text-ink-3">{p.rank}</span>
                      <ProductImage product={p} className="h-10 w-10 shrink-0 rounded-lg" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink hover:underline">{p.name}</span>
                        <span className="block text-xs text-ink-3">Score {p.score.toFixed(1)}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 font-medium">{formatPrice(p)}</td>
                  {cols.map((s) => {
                    const best = bestIndices(s, rows.map((r) => r.specs[s.key])).includes(rows.indexOf(p));
                    const v = p.specs[s.key];
                    return (
                      <td key={s.key} className="whitespace-nowrap px-3 py-3">
                        {typeof v === "boolean" ? (
                          v ? <Check className="text-win" /> : <Cross className="text-ink-3/60" />
                        ) : (
                          <span className={best ? "rounded-md bg-win-soft px-1.5 py-0.5 font-semibold text-win" : "text-ink-2"}>
                            {formatSpec(s, v)}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {!rows.length && (
              <tr>
                <td colSpan={cols.length + 3} className="px-6 py-10 text-center text-ink-3">
                  Nothing under that price — drag the slider right.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className={`sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur transition sm:px-6 ${selected.length ? "" : "hidden"}`}
      >
        <span className="text-sm text-ink-2">
          <strong className="text-ink">{selected.length}</strong> selected
          <button onClick={() => setSelected([])} className="ml-3 text-ink-3 underline-offset-2 hover:underline">
            Clear
          </button>
        </span>
        <Link
          href={compareHref(niche, selected)}
          aria-disabled={selected.length < 2}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${selected.length >= 2 ? "bg-brand text-brand-ink hover:brightness-110" : "pointer-events-none bg-surface-2 text-ink-3"}`}
        >
          {selected.length >= 2 ? `Compare ${selected.length} side by side →` : "Pick at least 2"}
        </Link>
      </div>
    </div>
  );
}
