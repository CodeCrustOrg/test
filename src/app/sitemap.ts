import type { MetadataRoute } from "next";
import { getNiches, getProducts } from "@/lib/data";
import { productHref, vsHref } from "@/lib/links";
import { topPairs } from "@/lib/pairs";
import { site } from "@/lib/site";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const urls: MetadataRoute.Sitemap = [{ url: site.url, priority: 1 }];
  for (const n of await getNiches()) {
    const products = await getProducts(n.slug);
    urls.push({ url: `${site.url}/${n.slug}`, lastModified: n.updatedAt, priority: 0.9 });
    for (const p of products) urls.push({ url: `${site.url}${productHref(p)}`, lastModified: n.updatedAt, priority: 0.6 });
    for (const [a, b] of topPairs(products, 6)) urls.push({ url: `${site.url}${vsHref(n.slug, a.slug, b.slug)}`, lastModified: n.updatedAt, priority: 0.5 });
  }
  return urls;
}
