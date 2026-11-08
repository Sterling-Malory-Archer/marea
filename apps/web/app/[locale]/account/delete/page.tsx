import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountDelete } from "@/components/account/account-pages";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const t = getMessages((await params).locale as Locale);
  return { title: t.account.deleteTitle };
}

export default function Page() {
  return (
    <Suspense>
      <AccountDelete />
    </Suspense>
  );
}
