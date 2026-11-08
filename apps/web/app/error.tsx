"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="shell flex min-h-[60svh] flex-col items-start justify-center py-24">
      <h1 className="display text-[clamp(2.5rem,6vw,5rem)]">This page didn&rsquo;t load</h1>
      <p className="mt-5 max-w-[32rem] text-lead text-ink/70">
        We couldn&rsquo;t reach the store just now. Your bag is safe — try again in a moment.
      </p>
      <button type="button" onClick={reset} className="btn btn-solid mt-9">
        Try again
      </button>
    </section>
  );
}
