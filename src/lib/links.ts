import type { Product } from "./types";

/** Outbound "check price" link. Goes through /go so clicks are trackable and URLs can change without re-uploading YouTube descriptions. */
export const buyHref = (p: Pick<Product, "niche" | "slug">) => `/go/${p.niche}/${p.slug}`;
export const productHref = (p: Pick<Product, "niche" | "slug">) => `/${p.niche}/${p.slug}`;
export const vsHref = (niche: string, a: string, b: string) => `/${niche}/vs/${a}-vs-${b}`;
export const compareHref = (niche: string, slugs: string[]) => `/${niche}/compare${slugs.length ? `?p=${slugs.join(",")}` : ""}`;
/** rel for links that may carry affiliate parameters (Google requires "sponsored"). */
export const outboundRel = "sponsored nofollow noopener noreferrer";
