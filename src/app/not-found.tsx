import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container-x py-28 text-center">
      <p className="eyebrow">404</p>
      <h1 className="font-display mt-3 text-4xl font-semibold">That comparison doesn&apos;t exist (yet)</h1>
      <Link href="/" className="mt-8 inline-flex rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-ink">Browse categories</Link>
    </div>
  );
}
