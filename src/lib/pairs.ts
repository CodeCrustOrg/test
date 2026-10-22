import type { Product } from "./types";

/** Head-to-head pairs worth pre-rendering: every pair among the top `n` ranked products. */
export function topPairs(products: Product[], n = 6): [Product, Product][] {
  const top = [...products].sort((a, b) => a.rank - b.rank).slice(0, n);
  const out: [Product, Product][] = [];
  for (let i = 0; i < top.length; i++) for (let j = i + 1; j < top.length; j++) out.push([top[i], top[j]]);
  return out;
}
