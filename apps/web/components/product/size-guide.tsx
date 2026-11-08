"use client";

import { useRef } from "react";
import { useI18n } from "@/lib/i18n-client";
import { CloseIcon } from "../icons";

export function SizeGuide({ guide, highlight }: { guide: { columns: string[]; rows: string[][]; note?: string }; highlight: string | null }) {
  const { t } = useI18n();
  const P = t.product;
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className="link-underline text-small">
        {P.sizeGuide}
      </button>
      <dialog
        ref={ref}
        aria-labelledby="size-guide-title"
        onClick={(e) => e.target === ref.current && ref.current.close()}
        className="m-auto w-[min(94vw,36rem)] bg-paper p-0 text-ink backdrop:bg-ink/40"
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 id="size-guide-title" className="display text-2xl">{P.sizeGuide}</h2>
          <button type="button" onClick={() => ref.current?.close()} aria-label={P.close} className="-mr-2 p-2">
            <CloseIcon />
          </button>
        </div>
        <div className="max-h-[70svh] overflow-auto px-6 py-5">
          <table className="w-full border-collapse text-small tabular-nums">
            <thead>
              <tr>
                {guide.columns.map((c) => (
                  <th key={c} scope="col" className="border-b border-ink py-2 pr-4 text-left font-medium">{P.guideCols[c] ?? c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {guide.rows.map((row) => {
                const on = highlight != null && row[0] === highlight;
                return (
                  <tr key={row.join("|")} className={on ? "bg-sand" : ""} aria-current={on ? "true" : undefined}>
                    {row.map((cell, i) =>
                      i === 0 ? (
                        <th key={i} scope="row" className="border-b border-line py-2.5 pr-4 text-left font-medium">{cell}</th>
                      ) : (
                        <td key={i} className="border-b border-line py-2.5 pr-4">{cell}</td>
                      ),
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {guide.note && P.guideNote[guide.note] && <p className="mt-5 text-small text-ink/70">{P.guideNote[guide.note]}</p>}
        </div>
      </dialog>
    </>
  );
}
