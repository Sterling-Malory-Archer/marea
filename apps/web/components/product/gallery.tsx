"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { tint } from "@/lib/format";
import { useI18n } from "@/lib/i18n-client";
import type { ProductImage } from "@/lib/types";
import { CloseIcon } from "../icons";
import { Placeholder } from "../placeholder";

function Frame({ img, hex, sizes, priority }: { img: ProductImage; hex: string; sizes: string; priority?: boolean }) {
  const { t } = useI18n();
  if (img.url && !img.isPlaceholder) return <Image src={img.url} alt={img.alt} fill sizes={sizes} priority={priority} className="object-cover" />;
  return <Placeholder alt={img.alt} label={t.placeholder.image} suffix={t.placeholder.suffix} tint={tint(hex, img.kind === "PRODUCT" ? 0.74 : 0.82)} className="absolute inset-0" />;
}

/** Desktop: editorial two-column stack. Mobile: swipeable strip. Both open a zoomable lightbox. */
export function Gallery({ images, hex, title }: { images: ProductImage[]; hex: string; title: string }) {
  const { t } = useI18n();
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [current, setCurrent] = useState(0);
  const strip = useRef<HTMLDivElement>(null);

  // Reset the mobile strip when the colourway (and so the image set) changes.
  useEffect(() => {
    strip.current?.scrollTo({ left: 0 });
    setCurrent(0);
  }, [images]);

  const onScroll = () => {
    const el = strip.current;
    if (el) setCurrent(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div aria-label={t.product.gallery} role="region">
      {/* Mobile strip */}
      <div className="relative -mx-5 sm:-mx-10 lg:hidden">
        <div ref={strip} onScroll={onScroll} className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setLightbox(i)}
              aria-label={t.product.openImage(i + 1)}
              className="relative aspect-[3/4] w-full shrink-0 snap-center"
            >
              <Frame img={img} hex={hex} sizes="100vw" priority={i === 0} />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-1.5" aria-hidden>
            {images.map((img, i) => (
              <span key={img.id} className={`h-1 rounded-full bg-ink transition-all ${i === current ? "w-5" : "w-1 opacity-40"}`} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop grid */}
      <ul className="hidden grid-cols-2 gap-2 lg:grid">
        {images.map((img, i) => (
          <li key={img.id} className={images.length % 2 === 1 && i === 0 ? "col-span-2" : ""}>
            <button
              type="button"
              onClick={() => setLightbox(i)}
              aria-label={t.product.openImage(i + 1)}
              className={`relative block w-full cursor-zoom-in ${images.length % 2 === 1 && i === 0 ? "aspect-[4/5]" : "aspect-[3/4]"}`}
            >
              <Frame img={img} hex={hex} sizes="(min-width: 1024px) 30vw, 100vw" priority={i < 2} />
            </button>
          </li>
        ))}
      </ul>

      {lightbox !== null && <Lightbox images={images} hex={hex} title={title} start={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  );
}

function Lightbox({ images, hex, title, start, onClose }: { images: ProductImage[]; hex: string; title: string; start: number; onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const [origin, setOrigin] = useState("50% 50%");

  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((n) => (n + 1) % images.length);
      if (e.key === "ArrowLeft") setI((n) => (n - 1 + images.length) % images.length);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [images.length]);

  useEffect(() => setZoom(false), [i]);

  const move = (e: React.PointerEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin(`${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <dialog ref={ref} onClose={onClose} aria-label={title} className="m-0 h-full max-h-none w-full max-w-none bg-paper p-0 backdrop:bg-ink/40">
      <div className="flex h-full flex-col">
        <div className="flex h-14 items-center justify-between px-5">
          <span className="text-small tabular-nums text-mute">{i + 1} / {images.length}</span>
          <button type="button" onClick={() => ref.current?.close()} aria-label={t.product.close} className="-mr-2 p-2" autoFocus>
            <CloseIcon />
          </button>
        </div>
        <div className="relative flex flex-1 items-center justify-center overflow-hidden px-4 pb-6">
          <button
            type="button"
            onClick={() => setZoom((z) => !z)}
            onPointerMove={move}
            aria-label={t.product.zoom}
            aria-pressed={zoom}
            className={`relative aspect-[3/4] h-full max-h-full max-w-full overflow-hidden ${zoom ? "cursor-zoom-out" : "cursor-zoom-in"}`}
          >
            <div className="absolute inset-0 transition-transform duration-300" style={{ transform: zoom ? "scale(2.2)" : "scale(1)", transformOrigin: origin }}>
              <Frame img={images[i]!} hex={hex} sizes="100vw" />
            </div>
          </button>
          {images.length > 1 && (
            <>
              <button type="button" onClick={() => setI((n) => (n - 1 + images.length) % images.length)} aria-label={t.product.prevImage} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center bg-paper/80 text-xl">‹</button>
              <button type="button" onClick={() => setI((n) => (n + 1) % images.length)} aria-label={t.product.nextImage} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center bg-paper/80 text-xl">›</button>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
