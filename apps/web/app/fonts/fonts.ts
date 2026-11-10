import localFont from "next/font/local";

/*
 * Self-hosted, preloaded fonts (SIL Open Font License — see LICENSE-*.txt).
 * Basic Latin is preloaded so headlines render without waiting; the
 * latin-ext file (č ć š ž đ for Montenegrin) loads only when a page uses those letters.
 * In CSS the ext face is listed first: its unicode-range skips basic Latin,
 * so the browser falls through to the preloaded face for everything else.
 * (Next.js requires these options as inline literals.)
 */

export const bodoni = localFont({
  src: "./bodoni-moda-latin-opsz-normal.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
  variable: "--font-bodoni",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
  adjustFontFallback: "Times New Roman",
});
export const bodoniExt = localFont({
  src: "./bodoni-moda-latin-ext-opsz-normal.woff2",
  weight: "400 900",
  style: "normal",
  display: "swap",
  variable: "--font-bodoni-ext",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
  preload: false,
  adjustFontFallback: false,
});
export const jost = localFont({
  src: "./jost-latin-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-jost",
  declarations: [{ prop: "unicode-range", value: "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
  adjustFontFallback: "Arial",
});
export const jostExt = localFont({
  src: "./jost-latin-ext-wght-normal.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-jost-ext",
  declarations: [{ prop: "unicode-range", value: "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF" }],
  preload: false,
  adjustFontFallback: false,
});

export const fontVariables = [bodoni.variable, bodoniExt.variable, jost.variable, jostExt.variable].join(" ");
