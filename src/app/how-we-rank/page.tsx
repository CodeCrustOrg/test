import type { Metadata } from "next";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "How We Rank Products", alternates: { canonical: "/how-we-rank" } };

const steps = [
  ["Same spec sheet for every product", "Every product in a category is described with the same set of specs, in the same units, so differences are visible at a glance."],
  ["Directional comparisons", "For each numeric spec we record whether higher or lower is better. That's what powers the green 'best in column' highlights and head-to-head spec wins."],
  ["Overall score", "Products carry an overall score out of 10. Where a product has no editorial score, it is computed from its specs relative to the other products in the same category — the product page says when that is the case."],
  ["Commissions never change rank", "Some outbound links earn us a commission. Rankings are ordered by score only; whether a product has an affiliate link is not an input."],
];

export default function HowWeRank() {
  return (
    <div className="container-x max-w-3xl py-14">
      <p className="eyebrow">Methodology</p>
      <h1 className="font-display mt-3 text-4xl font-semibold sm:text-5xl">How {site.name} ranks products</h1>
      <ol className="mt-10 space-y-4">
        {steps.map(([t, b], i) => (
          <li key={t} className="card flex gap-5 p-6">
            <span className="font-display text-3xl text-ink-3">{i + 1}</span>
            <div>
              <h2 className="text-lg font-semibold">{t}</h2>
              <p className="mt-1.5 leading-relaxed text-ink-2">{b}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
