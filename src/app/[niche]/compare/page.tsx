import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CompareBuilder } from "@/components/CompareBuilder";
import { Breadcrumbs } from "@/components/ui";
import { getNiche, getNiches, getProducts } from "@/lib/data";

export const dynamicParams = false;

export async function generateStaticParams() {
  return (await getNiches()).map((n) => ({ niche: n.slug }));
}

type Props = { params: Promise<{ niche: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const niche = await getNiche((await params).niche);
  return niche ? { title: `Compare ${niche.name} Side by Side`, alternates: { canonical: `/${niche.slug}/compare` } } : {};
}

export default async function ComparePage({ params }: Props) {
  const niche = await getNiche((await params).niche);
  if (!niche) notFound();
  const products = await getProducts(niche.slug);
  return (
    <div className="container-x py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: niche.name, href: `/${niche.slug}` }, { label: "Compare" }]} />
      <h1 className="font-display mt-6 text-4xl font-semibold sm:text-5xl">Compare {niche.noun}</h1>
      <p className="mt-3 max-w-xl text-ink-2">Pick up to four. Winners in each row are highlighted, and the link updates so you can share it.</p>
      <div className="mt-8">
        <Suspense>
          <CompareBuilder products={products} specs={niche.specs} />
        </Suspense>
      </div>
    </div>
  );
}
