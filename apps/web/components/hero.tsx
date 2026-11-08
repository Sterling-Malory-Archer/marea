"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { HeroSlide } from "@/lib/types";
import { Placeholder } from "./placeholder";

const AUTOPLAY_MS = 7000;

export function Hero({ slides }: { slides: HeroSlide[] }) {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (slides.length < 2 || paused) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setActive((i) => (i + 1) % slides.length), AUTOPLAY_MS);
    return () => clearTimeout(t);
  }, [active, paused, slides.length]);

  if (slides.length === 0) return null;
  const s = slides[active]!;
  const textLeft = s.layout !== "SPLIT_LEFT";

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured campaigns"
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        key={s.id}
        aria-roledescription="slide"
        aria-label={`${active + 1} of ${slides.length}`}
        className="grid animate-[fade_0.7s_ease] lg:min-h-[min(calc(100svh-6.75rem),52rem)] lg:grid-cols-12"
      >
        {/* Colour field + photograph. On large screens the photo crosses the seam into the text panel. */}
        <div
          className={`relative order-first aspect-[4/5] overflow-hidden sm:aspect-[16/11] lg:order-none lg:col-span-5 lg:aspect-auto lg:overflow-visible ${
            textLeft ? "lg:col-start-8 lg:row-start-1" : "lg:col-start-1 lg:row-start-1"
          }`}
          style={{ backgroundColor: s.panelColor }}
        >
          <div
            className={`absolute bottom-0 top-[9%] w-[64%] sm:w-[44%] lg:top-[11%] lg:w-[92%] ${
              textLeft ? "left-1/2 -translate-x-1/2 lg:left-auto lg:right-[30%] lg:translate-x-0" : "left-1/2 -translate-x-1/2 lg:left-[30%] lg:translate-x-0"
            }`}
          >
            {s.imageUrl && !s.imageIsPlaceholder ? (
              <Image src={s.imageUrl} alt={s.imageAlt ?? ""} fill priority sizes="(min-width: 1024px) 34vw, 64vw" className="object-cover object-top" />
            ) : (
              <Placeholder
                alt={s.imageAlt ?? s.headline}
                className="h-full w-full"
                tint={`color-mix(in srgb, ${s.panelColor} 80%, #202020)`}
                label="Placeholder — campaign photograph (4:5, min. 2400 px tall)"
              />
            )}
          </div>
        </div>

        {/* Text panel */}
        <div
          className={`relative z-10 flex flex-col justify-center px-5 pb-12 pt-9 sm:px-10 lg:col-span-7 lg:row-start-1 lg:py-20 ${
            textLeft ? "lg:col-start-1 lg:pl-16 xl:pl-24" : "lg:col-start-6 lg:pl-20 xl:pl-28"
          }`}
        >
          <div className="max-w-[36rem]">
            {s.eyebrow && <p className="mb-6 text-small text-mute lg:mb-9">{s.eyebrow}</p>}
            <h1 className="display text-[clamp(3.1rem,7.2vw,7.25rem)] text-balance">{s.headline}</h1>
            {s.body && <p className="mt-6 max-w-[28rem] text-lead text-ink/75 lg:mt-9">{s.body}</p>}
            <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-4 lg:mt-11">
              <Link href={s.primaryCtaUrl} className="btn btn-outline uppercase tracking-[0.14em]">
                {s.primaryCtaLabel}
              </Link>
              {s.secondaryCtaLabel && s.secondaryCtaUrl && (
                <Link href={s.secondaryCtaUrl} className="link-underline text-small">
                  {s.secondaryCtaLabel}
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {slides.length > 1 && (
        <div
          className={`absolute z-20 flex gap-3 max-lg:left-5 max-lg:top-4 lg:top-1/2 lg:-translate-y-1/2 lg:flex-col lg:items-center ${
            textLeft ? "lg:right-7" : "lg:left-7"
          }`}
          role="group"
          aria-label="Choose slide"
        >
          {slides.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Show slide ${i + 1} of ${slides.length}: ${slide.headline}`}
              aria-current={i === active}
              className="group flex items-center gap-2 py-1 text-micro text-ink lg:flex-col"
            >
              <span className={`tabular-nums transition-opacity ${i === active ? "opacity-100" : "opacity-45 group-hover:opacity-80"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`block bg-ink transition-all duration-500 max-lg:h-px lg:w-px ${i === active ? "max-lg:w-8 lg:h-10" : "max-lg:w-3 lg:h-3 opacity-40"}`}
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
