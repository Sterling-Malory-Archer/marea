"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { eur } from "@/lib/admin/session";

/**
 * Single-series column chart (one hue, no legend — the card title names it).
 * Columns ≤ 24px with a 4px rounded data-end square at the baseline, hairline
 * grid, clean ticks, per-column hover tooltip with a wide hit area, and a
 * table view for screen readers. Colour #A84C5A passed the palette validator
 * (lightness band, chroma floor, ≥ 3:1 contrast on white).
 */
const SERIES = "#A84C5A";
const H = 220, PAD_L = 56, PAD_B = 28, PAD_T = 12;

function niceMax(v: number) {
  if (v <= 0) return 10000;
  const exp = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * exp >= v) return m * exp;
  return 10 * exp;
}

export function RevenueChart({ data }: { data: { date: string; salesMinor: number; orders: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Draw at the real container width so text stays 11px (no viewBox scaling).
  const box = useRef<HTMLElement>(null);
  const [width, setWidth] = useState(760);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, Math.round(e!.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = useMemo(() => niceMax(Math.max(...data.map((d) => d.salesMinor), 0)), [data]);
  const plotW = width - PAD_L - 8;
  const band = plotW / Math.max(1, data.length);
  const barW = Math.max(2, Math.min(24, band - 2)); // 2px surface gap between touching columns
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const tickLabel = (v: number) => (v / 100 >= 10000 ? `€${Math.round(v / 100000)}K` : `€${Math.round(v / 100).toLocaleString("en-IE")}`);
  const labelEvery = Math.ceil(data.length / 8);
  const fmtDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const h = hover != null ? data[hover] : null;

  return (
    <figure ref={box} className="relative">
      <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block" role="img" aria-label={`Revenue per day, ${data.length} days`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={width - 8} y1={y(t)} y2={y(t)} stroke="#EEECE7" strokeWidth={1} />
            <text x={PAD_L - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize="11" fill="#6B6B6B">{tickLabel(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD_L + i * band + (band - barW) / 2;
          const top = y(d.salesMinor);
          const base = H - PAD_B;
          const hgt = Math.max(0, base - top);
          const r = Math.min(4, hgt, barW / 2);
          // Rounded data-end, square at the baseline.
          const path = hgt > 0 ? `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${base} Z` : "";
          return (
            <g key={d.date}>
              {path && <path d={path} fill={SERIES} opacity={hover == null || hover === i ? 1 : 0.55} />}
              {i % labelEvery === 0 && <text x={x + barW / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#6B6B6B">{fmtDay(d.date)}</text>}
              {/* Hit target spans the whole band and full height. */}
              <rect x={PAD_L + i * band} y={PAD_T} width={band} height={H - PAD_T - PAD_B} fill="transparent" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={-1} />
            </g>
          );
        })}
        <line x1={PAD_L} x2={width - 8} y1={H - PAD_B} y2={H - PAD_B} stroke="#E5E2DC" strokeWidth={1} />
      </svg>
      {h && hover != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 border border-line bg-white px-3 py-2 text-micro shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
          style={{ left: `${((PAD_L + hover * band + band / 2) / width) * 100}%` }}
        >
          <p className="text-mute">{fmtDay(h.date)}</p>
          <p className="mt-0.5 text-small tabular-nums text-ink">{eur(h.salesMinor)}</p>
          <p className="text-mute">{h.orders} order{h.orders === 1 ? "" : "s"}</p>
        </div>
      )}
      <details className="mt-2">
        <summary className="cursor-pointer text-micro text-mute">Show as table</summary>
        <table className="mt-2 w-full text-micro">
          <thead><tr className="text-left text-mute"><th className="py-1 font-normal">Day</th><th className="font-normal">Revenue</th><th className="font-normal">Orders</th></tr></thead>
          <tbody>{data.map((d) => <tr key={d.date} className="border-t border-line"><td className="py-1">{d.date}</td><td className="tabular-nums">{eur(d.salesMinor)}</td><td>{d.orders}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  );
}
