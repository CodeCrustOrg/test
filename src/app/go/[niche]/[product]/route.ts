import { NextResponse } from "next/server";
import { getProduct } from "@/lib/data";

// Outbound redirect for "Check price" buttons. Use these short links in YouTube
// descriptions: swapping an affiliate URL in the database updates every video at once.
export async function GET(req: Request, { params }: { params: Promise<{ niche: string; product: string }> }) {
  const { niche, product } = await params;
  const p = await getProduct(niche, product);
  const target = p?.affiliateUrl || p?.officialUrl;
  if (!target) return NextResponse.redirect(new URL(`/${niche}`, req.url), 302);
  const res = NextResponse.redirect(target, 302);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
