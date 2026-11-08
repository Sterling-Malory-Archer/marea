import crypto from "node:crypto";

/** URL-safe slug: lowercase ASCII, diacritics folded (č→c, ž→z, đ→d …). */
export function slugify(input: string): string {
  return input
    .replace(/[đĐ]/g, "d")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180);
}

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

/** Percentage off, rounded down so we never overstate a discount. */
export function discountPercent(priceMinor: number, compareAtMinor: number | null | undefined): number | null {
  if (!compareAtMinor || compareAtMinor <= priceMinor) return null;
  return Math.floor(((compareAtMinor - priceMinor) / compareAtMinor) * 100);
}

export function pageParams(page: number, pageSize: number) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Strip fields that should never leave the API. */
export function publicUser<T extends { passwordHash?: unknown; failedLoginCount?: unknown; lockedUntil?: unknown }>(
  u: T,
) {
  const { passwordHash: _p, failedLoginCount: _f, lockedUntil: _l, ...rest } = u;
  return rest;
}
