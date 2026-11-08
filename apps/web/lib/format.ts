const formatters = new Map<string, Intl.NumberFormat>();

/** Format integer minor units (cents) as currency in the visitor's language. */
export function formatMoney(minor: number, currency = "EUR", intlLocale = "en-IE") {
  const key = `${intlLocale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(intlLocale, { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(key, f);
  }
  return f.format(minor / 100);
}

/** Blend a hex colour toward the sand tone for soft placeholder tints. */
export function tint(hex: string, amount = 0.78) {
  const n = parseInt(hex.slice(1), 16);
  const base = [0xe6, 0xe2, 0xda] as const;
  const mix = (c: number, t: number) => Math.round(c + (t - c) * amount);
  return `rgb(${mix((n >> 16) & 255, base[0])} ${mix((n >> 8) & 255, base[1])} ${mix(n & 255, base[2])})`;
}

// Unprefixed paths; wrap with localePath()/href() for the active language.
export const categoryHref = (path: string) => `/c/${path}`;
export const productHref = (slug: string) => `/p/${slug}`;
