import Link from "next/link";

export default function NotFound() {
  return (
    <section className="shell flex min-h-[60svh] flex-col items-start justify-center py-24">
      <h1 className="display text-[clamp(2.5rem,6vw,5rem)]">Page not found</h1>
      <p className="mt-5 max-w-[32rem] text-lead text-ink/70">
        This page doesn&rsquo;t exist or has moved. Try the latest arrivals, or use search to find a specific piece.
      </p>
      <div className="mt-9 flex flex-wrap gap-4">
        <Link href="/new" className="btn btn-solid">See new arrivals</Link>
        <Link href="/" className="btn btn-outline">Back to home</Link>
      </div>
    </section>
  );
}
