import type { Product, SpecDef, SpecValue } from "./types";

export function formatPrice(p: Pick<Product, "price" | "currency">): string {
  if (p.price === undefined) return "See price";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: p.currency || "USD", maximumFractionDigits: 0 }).format(p.price);
}

export function formatSpec(def: SpecDef, v: SpecValue | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number") {
    const n = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(v);
    return def.unit ? `${n} ${def.unit}` : n;
  }
  return String(v);
}

export function scoreLabel(score: number): string {
  if (score >= 9) return "Outstanding";
  if (score >= 8.5) return "Excellent";
  if (score >= 8) return "Very good";
  if (score >= 7) return "Good";
  if (score >= 6) return "Fair";
  return "Weak";
}

/** Which side wins a spec: -1 = a, 1 = b, 0 = tie, null = not comparable. */
export function specWinner(def: SpecDef, a: SpecValue | undefined, b: SpecValue | undefined): -1 | 0 | 1 | null {
  if (def.type === "number" && def.higherIsBetter !== undefined && typeof a === "number" && typeof b === "number") {
    if (a === b) return 0;
    return (a > b) === def.higherIsBetter ? -1 : 1;
  }
  if (def.type === "boolean" && typeof a === "boolean" && typeof b === "boolean") {
    if (a === b) return 0;
    return a ? -1 : 1;
  }
  return null;
}

/** Index/indices of the best value in a row, or [] when the row isn't rankable. */
export function bestIndices(def: SpecDef, values: (SpecValue | undefined)[]): number[] {
  if (def.type === "number" && def.higherIsBetter !== undefined) {
    const nums = values.map((v) => (typeof v === "number" ? v : null));
    const present = nums.filter((v): v is number => v !== null);
    if (present.length < 2 || Math.min(...present) === Math.max(...present)) return [];
    const best = def.higherIsBetter ? Math.max(...present) : Math.min(...present);
    return nums.flatMap((v, i) => (v === best ? [i] : []));
  }
  if (def.type === "boolean") {
    const trues = values.flatMap((v, i) => (v === true ? [i] : []));
    return trues.length && trues.length < values.length ? trues : [];
  }
  return [];
}

/** 0–1 position of a value within its column, oriented so 1 is always "better". */
export function relative(def: SpecDef, v: SpecValue | undefined, all: (SpecValue | undefined)[]): number | null {
  if (def.type !== "number" || typeof v !== "number") return null;
  const nums = all.filter((x): x is number => typeof x === "number");
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (max === min) return 1;
  if (def.higherIsBetter === false) return 0.15 + 0.85 * ((max - v) / (max - min));
  return 0.15 + 0.85 * ((v - min) / (max - min));
}
