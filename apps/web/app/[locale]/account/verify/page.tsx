import type { Metadata } from "next";
import { VerifyEmail } from "@/components/account/auth-forms";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";

type Props = { params: Promise<{ locale: string }>; searchParams: Promise<{ token?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getMessages((await params).locale as Locale);
  return { title: t.auth.verifyTitle, referrer: "no-referrer" };
}

export default async function Page({ searchParams }: Props) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";
  return <VerifyEmail token={token} />;
}
