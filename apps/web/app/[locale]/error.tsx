"use client";

import { useI18n } from "@/lib/i18n-client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  return (
    <section className="shell flex min-h-[60svh] flex-col items-start justify-center py-24">
      <h1 className="display text-[clamp(2.5rem,6vw,5rem)]">{t.errors.failed}</h1>
      <p className="mt-5 max-w-[32rem] text-lead text-ink/70">{t.errors.failedText}</p>
      <button type="button" onClick={reset} className="btn btn-solid mt-9">{t.errors.retry}</button>
    </section>
  );
}
