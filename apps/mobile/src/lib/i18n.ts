import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ar from "@/locales/ar.json";
import en from "@/locales/en.json";

export type Locale = "ar" | "en";

/** The app is Arabic-first; English is a full translation, not a fallback. */
export const DEFAULT_LOCALE: Locale = "ar";

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
