"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Product, SpecDef } from "@/lib/types";
import { SideBySide } from "./SideBySide";
import { ProductImage } from "./ui";

const MAX = 4;

export function CompareBuilder({ products, specs }: { products: Product[]; specs: SpecDef[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const requested = (params.get("p") ?? "").split(",").filter(Boolean);
  const chosen = requested.map((s) => products.find((p) => p.slug === s)).filter((p): p is Product => !!p).slice(0, MAX);
  const picked = chosen.length ? chosen : products.slice(0, 2);
  const slugs = picked.map((p) => p.slug);

  const set = (next: string[]) => router.replace(`${pathname}?p=${next.join(",")}`, { scroll: false });
  const toggle = (slug: string) =>
    set(slugs.includes(slug) ? slugs.filter((s) => s !== slug) : slugs.length >= MAX ? slugs : [...slugs, slug]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {products.map((p) => {
          const on = slugs.includes(p.slug);
          const disabled = !on && slugs.length >= MAX;
          return (
            <button
              key={p.slug}
              onClick={() => toggle(p.slug)}
              disabled={disabled}
              aria-pressed={on}
              className={`inline-flex items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm font-medium transition ${
                on ? "border-brand bg-brand-soft text-ink" : "border-line bg-surface text-ink-2 hover:border-line-2"
              } ${disabled ? "cursor-not-allowed opacity-40" : ""}`}
            >
              <ProductImage product={p} className="h-7 w-7 rounded-full bg-surface-2 [&>span]:text-[10px]" />
              {p.name}
              <span className={on ? "text-brand" : "text-ink-3"}>{on ? "✓" : "+"}</span>
            </button>
          );
        })}
      </div>
      {picked.length >= 2 ? (
        <SideBySide products={picked} specs={specs} />
      ) : (
        <div className="card p-10 text-center text-ink-3">Pick at least two products to compare.</div>
      )}
    </div>
  );
}
