import type { Metadata } from "next";
import { AccountOrderDetail } from "@/components/account/account-pages";

type Props = { params: Promise<{ locale: string; number: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: (await params).number };
}

export default async function Page({ params }: Props) {
  return <AccountOrderDetail orderNumber={(await params).number} />;
}
