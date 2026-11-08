import type { Metadata } from "next";

// Account and authentication pages are private: never indexed.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
