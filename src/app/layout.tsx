import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Footer, Header, SampleBanner } from "@/components/Chrome";
import { getDataSource, getNiches } from "@/lib/data";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} — ${site.tagline}`, template: `%s · ${site.name}` },
  description: site.description,
  openGraph: { siteName: site.name, type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf7" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d12" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const [niches, source] = await Promise.all([getNiches(), getDataSource()]);
  return (
    <html lang="en">
      <body className="min-h-dvh">
        {source === "sample" && <SampleBanner />}
        <Header niches={niches} />
        <main>{children}</main>
        <Footer niches={niches} />
      </body>
    </html>
  );
}
