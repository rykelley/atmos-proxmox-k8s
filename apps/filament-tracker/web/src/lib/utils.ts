export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function grams(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(2)} kg`;
  return `${value} g`;
}

export function money(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function pct(remaining: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((remaining / total) * 100)));
}
