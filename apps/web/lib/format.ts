const formatters = new Map<string, Intl.NumberFormat>();

/** Format integer minor units (cents) as a currency string. */
export function formatMoney(minor: number, currency = "EUR", locale = "en-ME") {
  const key = `${locale}|${currency}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: 2 });
    formatters.set(key, f);
  }
  return f.format(minor / 100);
}

/** Mix a hex colour toward white for soft placeholder tints. */
export function tint(hex: string, amount = 0.78) {
  const n = parseInt(hex.slice(1), 16);
  // Blend toward the sand tone (#E6E2DA) so both black and white colourways read as soft, visible tones.
  const base = [0xe6, 0xe2, 0xda] as const;
  const mix = (c: number, t: number) => Math.round(c + (t - c) * amount);
  const r = mix((n >> 16) & 255, base[0]), g = mix((n >> 8) & 255, base[1]), b = mix(n & 255, base[2]);
  return `rgb(${r} ${g} ${b})`;
}

export const categoryHref = (path: string) => `/c/${path}`;
export const productHref = (slug: string) => `/p/${slug}`;
