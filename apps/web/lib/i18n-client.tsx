"use client";

import { createContext, useContext } from "react";
import { LOCALE_META, localePath, type Locale } from "./i18n";
import { getMessages, type Messages } from "./messages";

const Ctx = createContext<Locale>("en");

/** Supplies the active locale to client components; messages are looked up locally (functions can't cross the server/client boundary). */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useI18n(): { locale: Locale; t: Messages; href: (path: string) => string; intl: string } {
  const locale = useContext(Ctx);
  return { locale, t: getMessages(locale), href: (p) => localePath(locale, p), intl: LOCALE_META[locale].intl };
}
