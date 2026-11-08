"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n-client";

export default function NotFound() {
  const { t, href } = useI18n();
  return (
    <section className="shell flex min-h-[60svh] flex-col items-start justify-center py-24">
      <h1 className="display text-[clamp(2.5rem,6vw,5rem)]">{t.errors.notFound}</h1>
      <p className="mt-5 max-w-[32rem] text-lead text-ink/70">{t.errors.notFoundText}</p>
      <div className="mt-9 flex flex-wrap gap-4">
        <Link href={href("/new")} className="btn btn-solid">{t.errors.seeNew}</Link>
        <Link href={href("/")} className="btn btn-outline">{t.errors.backHome}</Link>
      </div>
    </section>
  );
}
