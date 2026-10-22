"use client";

import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { productHref } from "@/lib/links";

type Pt = Pick<Product, "slug" | "niche" | "name" | "price" | "currency" | "score" | "award">;

// Price (x) vs score (y). Single series, so one color; awarded products get a direct label.
export function ValueMap({ products }: { products: Pt[] }) {
  const pts = products.filter((p): p is Pt & { price: number } => typeof p.price === "number");
  const [hover, setHover] = useState<string | null>(null);
  if (pts.length < 3) return null;

  const W = 720;
  const H = 340;
  const m = { t: 20, r: 24, b: 44, l: 44 };
  const prices = pts.map((p) => p.price);
  const scores = pts.map((p) => p.score);
  const xMin = 0;
  const xStep = niceStep(Math.max(...prices) / 4);
  const xMax = Math.ceil((Math.max(...prices) * 1.05) / xStep) * xStep;
  const yMin = Math.max(0, Math.floor(Math.min(...scores) - 0.6));
  const yMax = Math.min(10, Math.ceil(Math.max(...scores) + 0.3));
  const x = (v: number) => m.l + ((v - xMin) / (xMax - xMin)) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - yMin) / (yMax - yMin)) * (H - m.t - m.b);
  const xTicks = Array.from({ length: Math.round(xMax / xStep) + 1 }, (_, i) => xStep * i);
  const yTicks = Array.from({ length: yMax - yMin + 1 }, (_, i) => yMin + i);
  const active = pts.find((p) => p.slug === hover);

  return (
    <figure className="card overflow-hidden p-4 sm:p-6">
      <figcaption className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-base font-semibold">Value map: score vs price</span>
        <span className="text-xs text-ink-3">Top-left is best value · hover or tap a dot</span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Scatter chart of score against price">
          {yTicks.map((t) => (
            <g key={t}>
              <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={m.l - 10} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-3)">
                {t}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text key={t} x={x(t)} y={H - m.b + 20} textAnchor="middle" fontSize={11} fill="var(--ink-3)">
              {formatPrice({ price: t, currency: pts[0].currency })}
            </text>
          ))}
          <text x={W - m.r} y={H - 6} textAnchor="end" fontSize={11} fill="var(--ink-3)">
            Price →
          </text>
          {pts.map((p) => {
            const isActive = p.slug === hover;
            return (
              <g
                key={p.slug}
                onMouseEnter={() => setHover(p.slug)}
                onMouseLeave={() => setHover(null)}
                onClick={() => setHover(p.slug)}
                className="cursor-pointer"
              >
                <circle cx={x(p.price)} cy={y(p.score)} r={18} fill="transparent" />
                <circle
                  cx={x(p.price)}
                  cy={y(p.score)}
                  r={isActive ? 8 : 6}
                  fill="var(--brand)"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  opacity={hover && !isActive ? 0.45 : 1}
                />
                {p.award && !isActive && (
                  <text x={x(p.price) + 11} y={y(p.score)} dy="0.32em" fontSize={11} fontWeight={600} fill="var(--ink-2)">
                    {p.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {active && (
          <div
            className="pointer-events-none absolute z-10 w-max max-w-[14rem] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lift"
            style={{ left: `${(x(active.price) / W) * 100}%`, top: `${(y(active.score) / H) * 100}%` }}
          >
            <div className="font-semibold text-ink">{active.name}</div>
            <div className="mt-0.5 text-ink-2 tabular">
              Score {active.score.toFixed(1)} · {formatPrice(active)}
            </div>
          </div>
        )}
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-ink-3 hover:text-ink">View as table</summary>
        <table className="mt-2 w-full text-left tabular">
          <thead className="text-ink-3">
            <tr>
              <th className="py-1 font-medium">Product</th>
              <th className="py-1 font-medium">Price</th>
              <th className="py-1 font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {pts.map((p) => (
              <tr key={p.slug} className="border-t border-line">
                <td className="py-1.5">
                  <Link href={productHref(p)} className="hover:underline">
                    {p.name}
                  </Link>
                </td>
                <td>{formatPrice(p)}</td>
                <td>{p.score.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Rounds a raw tick step up to 1, 2, 2.5 or 5 × 10^n. */
function niceStep(raw: number) {
  const pow = 10 ** Math.floor(Math.log10(raw));
  return ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
}
