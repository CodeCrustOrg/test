import Link from "next/link";
import type { Product, SpecDef } from "@/lib/types";
import { bestIndices, formatPrice, formatSpec, relative } from "@/lib/format";
import { productHref } from "@/lib/links";
import { AwardChip, BuyButtons, Check, Cross, ProductImage, ScoreRing } from "./ui";

/** Column-per-product spec comparison with per-row winners. Works for 2–4 products. */
export function SideBySide({ products, specs }: { products: Product[]; specs: SpecDef[] }) {
  const groups = new Map<string, SpecDef[]>();
  for (const s of specs) groups.set(s.group ?? "Specs", [...(groups.get(s.group ?? "Specs") ?? []), s]);
  const subKeys = [...new Set(products.flatMap((p) => Object.keys(p.subscores)))];
  const grid = { gridTemplateColumns: `minmax(7.5rem, 0.8fr) repeat(${products.length}, minmax(9.5rem, 1fr))` };
  const scoreBest = bestIndices({ key: "score", label: "", type: "number", higherIsBetter: true }, products.map((p) => p.score));
  const priceBest = bestIndices({ key: "price", label: "", type: "number", higherIsBetter: false }, products.map((p) => p.price ?? null));

  const Row = ({ label, cells }: { label: string; cells: React.ReactNode[] }) => (
    <div className="grid items-center border-t border-line" style={grid}>
      <div className="px-4 py-3 text-sm text-ink-3">{label}</div>
      {cells.map((c, i) => (
        <div key={i} className="px-4 py-3 text-sm tabular">
          {c}
        </div>
      ))}
    </div>
  );

  return (
    <div className="card scrollbar-thin overflow-x-auto">
      <div className="min-w-fit">
        <div className="sticky top-0 z-10 grid border-b border-line bg-surface" style={grid}>
          <div />
          {products.map((p) => (
            <div key={p.slug} className="flex flex-col gap-3 px-4 py-5">
              <ProductImage product={p} className="aspect-square w-full max-w-[140px] rounded-2xl bg-surface-2" />
              {p.award && <AwardChip award={p.award} className="self-start" />}
              <Link href={productHref(p)} className="font-semibold leading-snug hover:underline">
                {p.name}
              </Link>
              <BuyButtons product={p} compact />
            </div>
          ))}
        </div>

        <Row
          label="Overall score"
          cells={products.map((p, i) => (
            <div key={p.slug} className="flex items-center gap-2">
              <ScoreRing score={p.score} size={48} label={false} />
              {scoreBest.includes(i) && <WinTag />}
            </div>
          ))}
        />
        <Row
          label="Price"
          cells={products.map((p, i) => (
            <span key={p.slug} className={`font-semibold ${priceBest.includes(i) ? "text-win" : ""}`}>
              {formatPrice(p)} {priceBest.includes(i) && <WinTag label="Cheapest" />}
            </span>
          ))}
        />
        {subKeys.map((k) => {
          const vals = products.map((p) => p.subscores[k]);
          const best = bestIndices({ key: k, label: k, type: "number", higherIsBetter: true }, vals);
          return (
            <Row
              key={k}
              label={k}
              cells={vals.map((v, i) => (v === undefined ? "—" : <Meter key={i} value={v / 10} text={v.toFixed(1)} win={best.includes(i)} />))}
            />
          );
        })}

        {[...groups.entries()].map(([group, defs]) => (
          <div key={group}>
            <div className="border-t border-line bg-surface-2/60 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-ink-3">{group}</div>
            {defs.map((s) => {
              const vals = products.map((p) => p.specs[s.key]);
              const best = bestIndices(s, vals);
              return (
                <Row
                  key={s.key}
                  label={s.label}
                  cells={vals.map((v, i) => {
                    if (typeof v === "boolean")
                      return v ? <Check key={i} className="text-win" /> : <Cross key={i} className="text-ink-3/60" />;
                    const r = relative(s, v, vals);
                    return r === null ? (
                      <span key={i} className="text-ink-2">{formatSpec(s, v)}</span>
                    ) : (
                      <Meter key={i} value={r} text={formatSpec(s, v)} win={best.includes(i)} />
                    );
                  })}
                />
              );
            })}
          </div>
        ))}

        <div className="grid border-t border-line" style={grid}>
          <div className="px-4 py-3 text-sm text-ink-3">Pros</div>
          {products.map((p) => (
            <ul key={p.slug} className="space-y-1 px-4 py-3 text-sm">
              {p.pros.map((x) => (
                <li key={x} className="flex gap-1.5">
                  <Check className="mt-0.5 shrink-0 text-win" />
                  {x}
                </li>
              ))}
            </ul>
          ))}
        </div>
        <div className="grid border-t border-line" style={grid}>
          <div className="px-4 py-3 text-sm text-ink-3">Cons</div>
          {products.map((p) => (
            <ul key={p.slug} className="space-y-1 px-4 py-3 text-sm text-ink-2">
              {p.cons.map((x) => (
                <li key={x} className="flex gap-1.5">
                  <Cross className="mt-0.5 shrink-0 text-lose" />
                  {x}
                </li>
              ))}
            </ul>
          ))}
        </div>
      </div>
    </div>
  );
}

function Meter({ value, text, win }: { value: number; text: string; win?: boolean }) {
  return (
    <div className="space-y-1.5">
      <span className={`font-semibold ${win ? "text-win" : ""}`}>{text}</span>
      <div className="h-1.5 w-full max-w-[9rem] overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full" style={{ width: `${Math.round(value * 100)}%`, background: win ? "var(--win)" : "var(--line-2)" }} />
      </div>
    </div>
  );
}

function WinTag({ label = "Best" }: { label?: string }) {
  return <span className="rounded-md bg-win-soft px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-win">{label}</span>;
}
