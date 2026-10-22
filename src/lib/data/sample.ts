import type { Niche, Product, SpecValue } from "../types";

// SAMPLE DATA — every brand, product, price and spec below is fictional.
// It exists only so the site renders when MONGODB_URI is not set. The UI shows
// a "sample data" banner whenever this catalog is in use.

type Draft = Omit<Product, "rank" | "scoreDerived">;

const UPDATED = "2026-10-01T00:00:00.000Z";

function p(
  niche: string,
  name: string,
  brand: string,
  price: number,
  score: number,
  subscores: Record<string, number>,
  specs: Record<string, SpecValue>,
  copy: { summary: string; pros: string[]; cons: string[]; award?: string; bestFor?: string },
): Draft {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    slug,
    niche,
    name,
    brand,
    price,
    currency: "USD",
    score,
    subscores,
    specs,
    officialUrl: `https://example.com/${slug}`,
    affiliateUrl: undefined,
    ...copy,
  };
}

const niches: Niche[] = [
  {
    slug: "wireless-earbuds",
    name: "Wireless Earbuds",
    noun: "wireless earbuds",
    tagline: "Noise cancelling, battery life and call quality — measured side by side.",
    description:
      "We line up every pair on the same spec sheet so you can see exactly where the money goes: ANC depth, battery, codec support and fit.",
    emoji: "🎧",
    accent: "#6d5dfc",
    updatedAt: UPDATED,
    specs: [
      { key: "anc", label: "Noise cancelling", type: "number", unit: "dB", higherIsBetter: true, group: "Audio", highlight: true },
      { key: "battery", label: "Battery (buds)", type: "number", unit: "h", higherIsBetter: true, group: "Battery", highlight: true },
      { key: "caseBattery", label: "Battery (with case)", type: "number", unit: "h", higherIsBetter: true, group: "Battery" },
      { key: "weight", label: "Weight per bud", type: "number", unit: "g", higherIsBetter: false, group: "Design", highlight: true },
      { key: "ipRating", label: "Water resistance", type: "text", group: "Design" },
      { key: "ldac", label: "Hi-res codec", type: "boolean", group: "Audio", highlight: true },
      { key: "multipoint", label: "Multipoint", type: "boolean", group: "Connectivity" },
      { key: "wireless", label: "Wireless charging", type: "boolean", group: "Battery" },
    ],
    guide: [
      { title: "ANC is the biggest price driver", body: "Above roughly 30 dB of attenuation the difference on a plane or train is obvious. Below 20 dB, think of it as 'takes the edge off'." },
      { title: "Fit beats features", body: "A bud that doesn't seal well loses both bass and noise cancelling. Prefer models that ship with 4+ tip sizes." },
      { title: "Codecs only matter on Android", body: "iPhones use AAC regardless. Hi-res codecs are worth paying for only if your phone supports them." },
    ],
    faqs: [
      { q: "How long do earbud batteries last before degrading?", a: "Lithium cells in earbuds typically show noticeable capacity loss after 2–3 years of daily use." },
      { q: "Is multipoint worth it?", a: "If you switch between a laptop and a phone daily, yes — it removes the re-pairing step." },
    ],
  },
  {
    slug: "robot-vacuums",
    name: "Robot Vacuums",
    noun: "robot vacuums",
    tagline: "Suction, navigation and mopping compared on one page.",
    description: "From budget bump-and-go units to self-emptying LiDAR flagships — see which features justify the price jump.",
    emoji: "🤖",
    accent: "#0ea5a4",
    updatedAt: UPDATED,
    specs: [
      { key: "suction", label: "Suction", type: "number", unit: "Pa", higherIsBetter: true, group: "Cleaning", highlight: true },
      { key: "runtime", label: "Runtime", type: "number", unit: "min", higherIsBetter: true, group: "Battery", highlight: true },
      { key: "noise", label: "Noise", type: "number", unit: "dB", higherIsBetter: false, group: "Comfort", highlight: true },
      { key: "bin", label: "Dustbin", type: "number", unit: "ml", higherIsBetter: true, group: "Cleaning" },
      { key: "lidar", label: "LiDAR navigation", type: "boolean", group: "Navigation", highlight: true },
      { key: "mop", label: "Mopping", type: "boolean", group: "Cleaning" },
      { key: "selfEmpty", label: "Self-emptying dock", type: "boolean", group: "Dock", highlight: true },
    ],
    guide: [
      { title: "Navigation matters more than suction", body: "A LiDAR robot with modest suction usually cleans a home more thoroughly than a random-path robot with twice the Pa." },
      { title: "Self-emptying docks change the routine", body: "Without one you empty the bin every 1–3 runs; with one, roughly monthly." },
    ],
    faqs: [{ q: "Do robot vacuums work on thick carpet?", a: "Most handle low-pile well; high-pile and shag rugs remain hit-or-miss." }],
  },
  {
    slug: "standing-desks",
    name: "Standing Desks",
    noun: "standing desks",
    tagline: "Stability, height range and motor speed — no marketing fluff.",
    description: "Compare frames by the specs that decide whether a desk wobbles at standing height or fits your body at all.",
    emoji: "🪑",
    accent: "#e8833a",
    updatedAt: UPDATED,
    specs: [
      { key: "minHeight", label: "Lowest height", type: "number", unit: "cm", higherIsBetter: false, group: "Range", highlight: true },
      { key: "maxHeight", label: "Highest height", type: "number", unit: "cm", higherIsBetter: true, group: "Range", highlight: true },
      { key: "load", label: "Load capacity", type: "number", unit: "kg", higherIsBetter: true, group: "Frame", highlight: true },
      { key: "speed", label: "Lift speed", type: "number", unit: "mm/s", higherIsBetter: true, group: "Motor" },
      { key: "motors", label: "Motors", type: "number", higherIsBetter: true, group: "Motor", highlight: true },
      { key: "warranty", label: "Warranty", type: "number", unit: "yr", higherIsBetter: true, group: "Support" },
      { key: "presets", label: "Memory presets", type: "boolean", group: "Controls" },
    ],
    guide: [
      { title: "Dual motors, less wobble", body: "Dual-motor frames lift evenly and are generally steadier at full height." },
      { title: "Check the height range against your body", body: "Taller users should look at the maximum height; shorter users at the minimum." },
    ],
    faqs: [{ q: "How much load capacity do I need?", a: "Add up monitors, arms, PC and desktop weight, then leave a 30% margin." }],
  },
];

const products: Draft[] = [
  // Wireless earbuds (fictional)
  p("wireless-earbuds", "Aurel Pods Pro 3", "Aurel", 249, 9.2, { Sound: 9.3, ANC: 9.5, Battery: 8.4, Comfort: 9.0 },
    { anc: 42, battery: 8, caseBattery: 30, weight: 5.3, ipRating: "IPX4", ldac: true, multipoint: true, wireless: true },
    { award: "Best overall", bestFor: "Commuters who want the strongest ANC", summary: "The most complete pair in the sample set: deepest noise cancelling with no real weak spot.", pros: ["Class-leading 42 dB ANC", "Hi-res codec + multipoint", "Wireless charging case"], cons: ["Most expensive here", "Only IPX4"] }),
  p("wireless-earbuds", "Nimbus Air 2", "Nimbus", 129, 8.6, { Sound: 8.4, ANC: 8.2, Battery: 9.2, Comfort: 8.6 },
    { anc: 33, battery: 10, caseBattery: 40, weight: 4.8, ipRating: "IPX5", ldac: true, multipoint: true, wireless: false },
    { award: "Best value", bestFor: "Most people on a budget", summary: "Roughly 85% of the flagship experience for about half the price.", pros: ["10 h battery", "Light 4.8 g buds", "Multipoint"], cons: ["No wireless charging"] }),
  p("wireless-earbuds", "Vela Sport X", "Vela", 159, 8.3, { Sound: 8.0, ANC: 7.4, Battery: 9.0, Comfort: 9.1 },
    { anc: 26, battery: 9, caseBattery: 36, weight: 6.1, ipRating: "IP57", ldac: false, multipoint: true, wireless: true },
    { award: "Best for workouts", bestFor: "Runners and gym use", summary: "Ear-hook fit and IP57 rating make it the one to sweat in.", pros: ["IP57 dust and water", "Secure ear-hook fit"], cons: ["Heavier buds", "Average ANC"] }),
  p("wireless-earbuds", "Kestrel Studio", "Kestrel", 299, 8.9, { Sound: 9.7, ANC: 8.6, Battery: 7.2, Comfort: 8.3 },
    { anc: 36, battery: 6, caseBattery: 24, weight: 6.4, ipRating: "IPX4", ldac: true, multipoint: false, wireless: true },
    { award: "Best sound", bestFor: "Critical listening", summary: "The most detailed tuning here, at the cost of battery life.", pros: ["Best-in-set tuning", "Hi-res codec"], cons: ["6 h battery", "No multipoint"] }),
  p("wireless-earbuds", "Lumo Buds", "Lumo", 59, 7.4, { Sound: 7.2, ANC: 6.0, Battery: 8.5, Comfort: 7.8 },
    { anc: 18, battery: 8, caseBattery: 32, weight: 4.5, ipRating: "IPX4", ldac: false, multipoint: false, wireless: false },
    { award: "Best budget", bestFor: "Spare pair / kids", summary: "Cheap, light and dependable; noise cancelling is basic.", pros: ["Very low price", "Lightest pair"], cons: ["Weak ANC", "No multipoint"] }),
  p("wireless-earbuds", "Orrin Fit", "Orrin", 99, 7.9, { Sound: 7.8, ANC: 7.0, Battery: 8.0, Comfort: 8.4 },
    { anc: 24, battery: 7, caseBattery: 28, weight: 5.0, ipRating: "IPX5", ldac: false, multipoint: true, wireless: false },
    { summary: "A sensible mid-range pick that's outclassed by Nimbus Air 2 at a similar price.", pros: ["Multipoint", "Comfortable"], cons: ["Beaten on value"] }),

  // Robot vacuums (fictional)
  p("robot-vacuums", "Sweepr Max S9", "Sweepr", 899, 9.1, { Cleaning: 9.3, Navigation: 9.5, Maintenance: 9.2, Noise: 7.8 },
    { suction: 8000, runtime: 180, noise: 66, bin: 400, lidar: true, mop: true, selfEmpty: true },
    { award: "Best overall", bestFor: "Large homes with mixed floors", summary: "Self-emptying, mopping and accurate LiDAR maps in one dock.", pros: ["8000 Pa suction", "Self-empty + mop", "180 min runtime"], cons: ["Expensive", "Large dock"] }),
  p("robot-vacuums", "Hollo Nav 5", "Hollo", 449, 8.5, { Cleaning: 8.4, Navigation: 9.0, Maintenance: 8.6, Noise: 8.2 },
    { suction: 5000, runtime: 150, noise: 62, bin: 350, lidar: true, mop: false, selfEmpty: true },
    { award: "Best value", bestFor: "Apartments and carpets", summary: "LiDAR and a self-emptying dock at half the flagship price.", pros: ["LiDAR mapping", "Self-emptying"], cons: ["No mopping"] }),
  p("robot-vacuums", "Mira Quiet One", "Mira", 379, 8.0, { Cleaning: 7.6, Navigation: 8.4, Maintenance: 6.8, Noise: 9.6 },
    { suction: 3500, runtime: 140, noise: 54, bin: 450, lidar: true, mop: true, selfEmpty: false },
    { award: "Quietest", bestFor: "Running while you work or sleep", summary: "Noticeably quieter than everything else in this set.", pros: ["54 dB", "Large 450 ml bin"], cons: ["Weaker suction", "Manual emptying"] }),
  p("robot-vacuums", "Bitbot B2", "Bitbot", 179, 7.1, { Cleaning: 7.0, Navigation: 5.8, Maintenance: 6.5, Noise: 7.4 },
    { suction: 2700, runtime: 110, noise: 65, bin: 300, lidar: false, mop: false, selfEmpty: false },
    { award: "Best budget", bestFor: "Small single rooms", summary: "Random-path cleaning that gets there eventually.", pros: ["Low price", "Simple app"], cons: ["No mapping", "Short runtime"] }),
  p("robot-vacuums", "Tidal T7 Combo", "Tidal", 649, 8.4, { Cleaning: 8.6, Navigation: 8.3, Maintenance: 8.9, Noise: 7.5 },
    { suction: 6000, runtime: 160, noise: 67, bin: 380, lidar: true, mop: true, selfEmpty: true },
    { summary: "Feature-complete, but the Sweepr is better for a little more and the Hollo is cheaper.", pros: ["Mop + self-empty"], cons: ["Loudest in set"] }),

  // Standing desks (fictional)
  p("standing-desks", "Atlas Pro Dual", "Atlas", 699, 9.0, { Stability: 9.4, Range: 9.0, Motor: 8.8, Build: 9.0 },
    { minHeight: 60, maxHeight: 128, load: 160, speed: 40, motors: 2, warranty: 10, presets: true },
    { award: "Best overall", bestFor: "Heavy multi-monitor setups", summary: "Rock-solid at full height with the widest range here.", pros: ["160 kg load", "60–128 cm range", "10-year warranty"], cons: ["Premium price"] }),
  p("standing-desks", "Fern Lift E2", "Fern", 389, 8.5, { Stability: 8.6, Range: 8.4, Motor: 8.5, Build: 8.3 },
    { minHeight: 62, maxHeight: 125, load: 120, speed: 38, motors: 2, warranty: 7, presets: true },
    { award: "Best value", bestFor: "Most home offices", summary: "Dual motors and memory presets for well under the flagship price.", pros: ["Dual motor", "Memory presets"], cons: ["Shorter warranty"] }),
  p("standing-desks", "Rise Mini", "Rise", 229, 7.6, { Stability: 7.0, Range: 7.5, Motor: 7.2, Build: 7.8 },
    { minHeight: 72, maxHeight: 118, load: 70, speed: 25, motors: 1, warranty: 5, presets: true },
    { award: "Best budget", bestFor: "Small spaces, laptop setups", summary: "Compact single-motor frame; fine for a laptop and one monitor.", pros: ["Low price", "Compact"], cons: ["Some wobble at height", "Slow motor"] }),
  p("standing-desks", "Summit Tall XL", "Summit", 549, 8.3, { Stability: 8.7, Range: 9.6, Motor: 8.0, Build: 8.4 },
    { minHeight: 70, maxHeight: 135, load: 140, speed: 35, motors: 2, warranty: 7, presets: true },
    { award: "Best for tall users", bestFor: "Users over 190 cm", summary: "The highest maximum height in the set.", pros: ["135 cm max height", "140 kg load"], cons: ["High minimum height"] }),
  p("standing-desks", "Ortho Basic", "Ortho", 299, 7.3, { Stability: 7.4, Range: 7.6, Motor: 6.9, Build: 7.2 },
    { minHeight: 71, maxHeight: 121, load: 80, speed: 30, motors: 1, warranty: 3, presets: false },
    { summary: "Works, but the Fern Lift E2 is a better buy for a little more.", pros: ["Simple"], cons: ["No presets", "3-year warranty"] }),
];

export function sampleCatalog() {
  return { niches, products };
}
