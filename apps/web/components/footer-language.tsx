"use client";

import { usePathname } from "next/navigation";
import { stripLocale } from "@/lib/i18n";
import { LanguageSwitch } from "./header";

export function FooterLanguageSwitch() {
  return <LanguageSwitch basePath={stripLocale(usePathname())} className="-my-2" />;
}
