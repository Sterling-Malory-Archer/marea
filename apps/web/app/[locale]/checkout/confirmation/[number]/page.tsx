import type { Metadata } from "next";
import { OrderConfirmation } from "@/components/checkout/confirmation";

type Props = { params: Promise<{ locale: string; number: string }>; searchParams: Promise<{ token?: string | string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).number };
}

export default async function Page({ params, searchParams }: Props) {
  const raw = (await searchParams).token;
  const token = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";
  return <OrderConfirmation orderNumber={(await params).number} token={token} />;
}
