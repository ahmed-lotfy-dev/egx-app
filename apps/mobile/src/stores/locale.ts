import * as SecureStore from "expo-secure-store";
import { create } from "zustand";

import i18n, { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";

const LOCALE_KEY = "egx.locale";

type LocaleState = {
  hydrated: boolean;
  locale: Locale;
  hydrate: () => Promise<void>;
  setLocale: (locale: Locale) => Promise<void>;
};

export const useLocaleStore = create<LocaleState>((set, get) => ({
  hydrated: false,
  locale: DEFAULT_LOCALE,
  hydrate: async () => {
    if (get().hydrated) {
      return;
    }

    const stored = await SecureStore.getItemAsync(LOCALE_KEY).catch(() => null);
    const locale: Locale =
      stored === "en" || stored === "ar" ? stored : DEFAULT_LOCALE;

    await i18n.changeLanguage(locale);
    set({ hydrated: true, locale });
  },
  setLocale: async (locale) => {
    await SecureStore.setItemAsync(LOCALE_KEY, locale);
    await i18n.changeLanguage(locale);
    set({ locale });
  },
}));
