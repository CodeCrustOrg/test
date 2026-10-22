export const site = {
  name: "VerdictLab",
  tagline: "Side-by-side product comparisons, without the fluff.",
  description:
    "Ranked top lists and interactive side-by-side comparisons across product categories — every spec on one page, with links to official sites.",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
  youtube: process.env.NEXT_PUBLIC_YOUTUBE_URL || "",
};
