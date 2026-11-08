import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout/checkout-page";
import type { Locale } from "@/lib/i18n";
import { getMessages } from "@/lib/messages";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: getMessages((await params).locale as Locale).checkout.title };
}

export default function Page() {
  return <CheckoutPage />;
}
