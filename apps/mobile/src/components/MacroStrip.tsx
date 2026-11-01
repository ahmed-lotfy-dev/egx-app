import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { colors, tabular } from "@/constants/theme";
import { api } from "@/lib/api";
import { formatPrice, formatRelativeTime } from "@/lib/format";
import {
  MACRO_CARD_KEYS,
  useMacroPrefsStore,
  type MacroCardKey,
} from "@/stores/macro-prefs";
import { useLocaleStore } from "@/stores/locale";
import type { paths } from "@/types/api";

type MacroQuote =
  paths["/api/macro"]["get"]["responses"][200]["content"]["application/json"]["data"][number];

const CARD_WIDTH = 150;

/** Currency marker shown with every price: ج.م for pounds, $ for dollars. */
function currencyMarker(currency: string | null, locale: "ar" | "en"): string {
  if (currency === "EGP") {
    return locale === "ar" ? "ج.م" : "E£";
  }

  if (currency === "USD") {
    return "$";
  }

  return currency ?? "";
}

/** Unit suffix: per barrel / ounce / gram — shown on the label line. */
function unitSuffix(unit: string | null, locale: "ar" | "en"): string {
  switch (unit) {
    case "bbl":
      return locale === "ar" ? "برميل" : "bbl";
    case "oz":
      return locale === "ar" ? "أونصة" : "oz";
    case "gram":
      return locale === "ar" ? "جرام" : "g";
    default:
      return "";
  }
}

function MacroCard({ quote }: { quote: MacroQuote }) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);

  const stale = quote.stale || quote.value === null;
  const marker = currencyMarker(quote.currency, locale);
  const suffix = unitSuffix(quote.unit, locale);
  const dollarFirst = marker === "$";
  // USD/EGP leads the strip — give it the single gold accent.
  const hero = quote.key === "usd_egp";
  const asOfText = quote.asOf
    ? formatRelativeTime(quote.asOf, locale)
    : t("macro.stale");

  return (
    <View
      style={{ width: CARD_WIDTH }}
      className={`rounded-2xl border px-3.5 py-3 ${
        hero ? "border-gold/35 bg-surface-elevated" : "border-border bg-surface"
      }`}
    >
      <Text
        numberOfLines={1}
        className={`font-label text-[10.5px] ${hero ? "text-gold" : "text-text-muted"}`}
      >
        {suffix ? `${t(`macro.${quote.key}`)} · ${suffix}` : t(`macro.${quote.key}`)}
      </Text>

      {/*
        Value + currency marker are siblings in a baseline-aligned row. Nesting
        the marker inside the value Text made Android lift the Arabic glyphs
        above the digits, so the two run on separate text nodes instead.
      */}
      <View
        style={{
          direction: "ltr",
          flexDirection: "row",
          justifyContent: "flex-end",
          alignItems: "baseline",
          gap: 4,
          marginTop: 6,
        }}
      >
        {!stale && dollarFirst ? (
          <Text
            style={{ includeFontPadding: false }}
            className="font-title text-[12px] text-text-secondary"
          >
            $
          </Text>
        ) : null}
        <Text
          numberOfLines={1}
          style={[tabular, { includeFontPadding: false }]}
          className="font-display text-[19px] leading-7 text-text"
        >
          {stale ? "—" : formatPrice(quote.value)}
        </Text>
        {!stale && marker && !dollarFirst ? (
          <Text
            style={{ includeFontPadding: false }}
            className="font-title text-[11px] text-text-secondary"
          >
            {marker}
          </Text>
        ) : null}
      </View>

      {/* Fixed-height footer so every card lines up regardless of content. */}
      <View className="mt-2 h-4 flex-row items-center justify-between">
        <View className="flex-row items-center gap-1">
          <View
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: stale ? colors.down : colors.up }}
          />
          <Text
            numberOfLines={1}
            className={`font-body text-[9px] ${stale ? "text-down" : "text-text-muted"}`}
          >
            {stale ? t("macro.stale") : asOfText}
          </Text>
        </View>

        {quote.changePct !== null && !stale ? (
          <View className="flex-row items-center">
            <Ionicons
              name={quote.changePct >= 0 ? "caret-up" : "caret-down"}
              size={9}
              color={quote.changePct >= 0 ? colors.up : colors.down}
            />
            <Text
              style={tabular}
              className={`font-label text-[10px] ${
                quote.changePct >= 0 ? "text-up" : "text-down"
              }`}
            >
              {Math.abs(quote.changePct).toFixed(2)}%
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/**
 * Economy strip for the home screen: USD/EGP, oil grades, global and Egyptian
 * gold. Fetched from the API (worker refreshes every minute) and polled once a
 * minute so levels stay current; cards the user hid in settings are skipped;
 * stale quotes show "—" instead of an outdated price.
 */
export function MacroStrip() {
  const hidden = useMacroPrefsStore((state) => state.hidden);
  const hydrated = useMacroPrefsStore((state) => state.hydrated);

  const query = useQuery({
    queryKey: ["macro"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/macro");

      if (error) {
        throw new Error("Macro quotes unavailable");
      }

      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    enabled: hydrated,
  });

  const visible = useMemo(
    () =>
      (query.data?.data ?? []).filter(
        (quote) => !hidden[quote.key as MacroCardKey],
      ),
    [query.data, hidden],
  );

  if (!hydrated || visible.length === 0) {
    return null;
  }

  return (
    <View className="pb-1">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: 20,
          gap: 10,
          paddingVertical: 2,
        }}
      >
        {visible.map((quote) => (
          <MacroCard key={quote.key} quote={quote} />
        ))}
      </ScrollView>
    </View>
  );
}

export { MACRO_CARD_KEYS };
