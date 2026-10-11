import Link from "next/link";
import type { Product } from "@/lib/types";
import { scoreLabel } from "@/lib/format";
import { buyHref, outboundRel } from "@/lib/links";

export function ScoreRing({ score, size = 64, label = true }: { score: number; size?: number; label?: boolean }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, score / 10));
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={5} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--brand)"
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
          />
        </svg>
        <span
          className="absolute inset-0 grid place-items-center font-semibold tabular"
          style={{ fontSize: size * 0.3 }}
          aria-label={`Score ${score.toFixed(1)} out of 10`}
        >
          {score.toFixed(1)}
        </span>
      </div>
      {label && <span className="text-[11px] font-medium text-ink-3">{scoreLabel(score)}</span>}
    </div>
  );
}

export function ScoreBar({ label, value, max = 10, highlight }: { label: string; value: number; max?: number; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[minmax(0,7rem)_1fr_2.5rem] items-center gap-3 text-sm">
      <span className="truncate text-ink-2">{label}</span>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full"
          style={{ width: `${(value / max) * 100}%`, background: highlight ? "var(--win)" : "var(--brand)" }}
        />
      </div>
      <span className="text-right font-semibold tabular">{value.toFixed(1)}</span>
    </div>
  );
}

export function AwardChip({ award, className = "" }: { award: string; className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-gold-soft px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gold ${className}`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 7.1-1.01z" />
      </svg>
      {award}
    </span>
  );
}

function hue(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

export function ProductImage({ product, className = "" }: { product: Pick<Product, "name" | "brand" | "image">; className?: string }) {
  if (product.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={product.image}
        alt={product.name}
        loading="lazy"
        className={`object-contain ${className}`}
      />
    );
  }
  const h = hue(product.brand || product.name);
  const initials = (product.brand || product.name).slice(0, 2).toUpperCase();
  return (
    <div
      aria-hidden
      className={`grid place-items-center overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(135deg, hsl(${h} 70% 62% / 0.22), hsl(${(h + 40) % 360} 70% 55% / 0.08))`,
      }}
    >
      <span className="font-display text-2xl font-semibold" style={{ color: `hsl(${h} 45% 45%)` }}>
        {initials}
      </span>
    </div>
  );
}

export function BuyButtons({ product, compact = false }: { product: Product; compact?: boolean }) {
  const hasBuy = product.affiliateUrl || product.officialUrl;
  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "" : "sm:flex-nowrap"}`}>
      {hasBuy && (
        <a
          href={buyHref(product)}
          rel={outboundRel}
          target="_blank"
          className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-brand-ink shadow-card transition hover:brightness-110"
        >
          Check price
          <ArrowOut />
        </a>
      )}
      {product.officialUrl && !compact && (
        <a
          href={product.officialUrl}
          rel={outboundRel}
          target="_blank"
          className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-line-2 bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-surface-2"
        >
          Official site
        </a>
      )}
    </div>
  );
}

export function ArrowOut() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Check({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
      <path d="M5 12.5l4.2 4.2L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Cross({ className = "" }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden>
      <path d="M7 7l10 10M17 7L7 17" strokeLinecap="round" />
    </svg>
  );
}

export function Breadcrumbs({ items }: { items: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-ink-3">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href ? (
              <Link href={it.href} className="hover:text-ink">
                {it.label}
              </Link>
            ) : (
              <span className="text-ink-2">{it.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export function SectionHead({ title, kicker }: { title: string; kicker?: string }) {
  return (
    <div>
      <h2 className="font-display text-3xl font-semibold sm:text-4xl">{title}</h2>
      {kicker && <p className="mt-2 text-ink-3">{kicker}</p>}
    </div>
  );
}
