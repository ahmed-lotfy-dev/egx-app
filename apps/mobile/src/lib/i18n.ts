import { getLocales } from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import ar from "@/locales/ar.json";
import en from "@/locales/en.json";

export type Locale = "ar" | "en";

export const deviceLocale: Locale = getLocales()[0]?.languageCode === "en" ? "en" : "ar";

void i18n.use(initReactI18next).init({
  resources: {
    ar: { translation: ar },
    en: { translation: en },
  },
  lng: deviceLocale,
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export default i18n;
