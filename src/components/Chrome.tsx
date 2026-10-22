import Link from "next/link";
import type { Niche } from "@/lib/types";
import { site } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5" aria-label={`${site.name} home`}>
      <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-ink text-bg shadow-card transition group-hover:rotate-[-6deg]">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 6h6v12H4zM14 10h6v8h-6z" fill="currentColor" />
          <path d="M14 6h6" stroke="var(--brand)" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-[17px] font-semibold tracking-tight">{site.name}</span>
    </Link>
  );
}

export function Header({ niches }: { niches: Niche[] }) {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-bg/80 backdrop-blur-xl">
      <div className="container-x flex h-16 items-center justify-between gap-6">
        <Logo />
        <nav className="hidden items-center gap-1 md:flex" aria-label="Categories">
          {niches.slice(0, 6).map((n) => (
            <Link key={n.slug} href={`/${n.slug}`} className="rounded-lg px-3 py-2 text-sm font-medium text-ink-2 transition hover:bg-surface-2 hover:text-ink">
              {n.name}
            </Link>
          ))}
        </nav>
        <details className="relative md:hidden">
          <summary className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-sm font-medium">Categories</summary>
          <div className="card absolute right-0 mt-2 w-60 p-2">
            {niches.map((n) => (
              <Link key={n.slug} href={`/${n.slug}`} className="block rounded-lg px-3 py-2 text-sm hover:bg-surface-2">
                {n.emoji} {n.name}
              </Link>
            ))}
          </div>
        </details>
      </div>
    </header>
  );
}

export function Footer({ niches }: { niches: Niche[] }) {
  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="container-x grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-sm text-sm leading-relaxed text-ink-2">{site.description}</p>
        </div>
        <div>
          <p className="eyebrow mb-3">Categories</p>
          <ul className="space-y-2 text-sm">
            {niches.map((n) => (
              <li key={n.slug}>
                <Link href={`/${n.slug}`} className="text-ink-2 hover:text-ink">
                  Best {n.noun}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="eyebrow mb-3">About</p>
          <ul className="space-y-2 text-sm">
            <li><Link href="/how-we-rank" className="text-ink-2 hover:text-ink">How we rank</Link></li>
            <li><Link href="/disclosure" className="text-ink-2 hover:text-ink">Affiliate disclosure</Link></li>
            {site.youtube && <li><a href={site.youtube} className="text-ink-2 hover:text-ink">YouTube</a></li>}
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="container-x py-6 text-xs leading-relaxed text-ink-3">
          © {new Date().getFullYear()} {site.name}. When you buy through links on this site we may earn a commission, at no extra cost to you.
          It never affects rankings. Prices and specs can change — always confirm on the retailer or official site.
        </p>
      </div>
    </footer>
  );
}

export function SampleBanner() {
  return (
    <div className="border-b border-gold/30 bg-gold-soft text-gold">
      <p className="container-x py-2 text-center text-xs font-medium">
        Sample data — all products shown are fictional placeholders. Set <code className="font-mono">MONGODB_URI</code> to load the real catalog.
      </p>
    </div>
  );
}
