import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Affiliate Disclosure", alternates: { canonical: "/disclosure" } };

export default function Disclosure() {
  return (
    <div className="container-x max-w-3xl py-14">
      <p className="eyebrow">Transparency</p>
      <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">Affiliate disclosure</h1>
      <div className="mt-8 space-y-4 text-lg leading-relaxed text-ink-2">
        <p>
          {site.name} is reader-supported. Some links on this site — including “Check price” buttons — are affiliate links. If you buy through
          one, we may earn a commission at no additional cost to you.
        </p>
        <p>Commissions do not influence which products we include or how they are ranked. Products are ordered by their overall score.</p>
        <p>Prices, availability and specifications change frequently. Always confirm details on the retailer or manufacturer site before buying.</p>
      </div>
    </div>
  );
}
