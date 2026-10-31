import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { colors } from "@/constants/theme";
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

const CARD_LABELS: Record<MacroCardKey, string> = {
  usd_egp: "macro.usdEgp",
  brent: "macro.brent",
  wti: "macro.wti",
  gold_oz: "macro.goldOz",
  gold_egp_24k: "macro.goldEgp24k",
  gold_egp_21k: "macro.goldEgp21k",
};

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

/** Unit suffix: per barrel / ounce / gram. */
function unitSuffix(unit: string | null, locale: "ar" | "en"): string {
  switch (unit) {
    case "bbl":
      return locale === "ar" ? "/برميل" : "/bbl";
    case "oz":
      return locale === "ar" ? "/أونصة" : "/oz";
    case "gram":
      return locale === "ar" ? "/جرام" : "/g";
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
  const dollarFirst = marker === "$" && !stale;
  const asOfText = quote.asOf
    ? formatRelativeTime(quote.asOf, locale)
    : t("macro.stale");

  return (
    <View className="min-w-[128px] rounded-2xl border border-border bg-surface px-3 py-2.5">
      <Text className="font-label text-[11px] text-text-muted" numberOfLines={1}>
        {t(CARD_LABELS[quote.key])}
      </Text>

      <View className="mt-1 flex-row items-baseline" style={{ direction: "ltr" }}>
        {dollarFirst ? (
          <Text className="font-title text-[12px] text-text-secondary">$</Text>
        ) : null}
        <Text className="font-title text-[16px] text-text">
          {stale ? "—" : formatPrice(quote.value)}
        </Text>
        {!dollarFirst && marker && !stale ? (
          <Text className="ml-1 font-title text-[12px] text-text-secondary">
            {marker}
          </Text>
        ) : null}
        {suffix && !stale ? (
          <Text className="ml-0.5 font-body text-[10px] text-text-muted">
            {suffix}
          </Text>
        ) : null}
      </View>

      {/* Freshness badge + change */}
      <View className="mt-1.5 flex-row items-center justify-between">
        <View
          className={`flex-row items-center gap-1 rounded-full px-1.5 py-0.5 ${
            stale ? "bg-down/10" : "bg-up/10"
          }`}
        >
          <View
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: stale ? colors.down : colors.up }}
          />
          <Text
            className={`font-label text-[9px] ${stale ? "text-down" : "text-up"}`}
            numberOfLines={1}
          >
            {stale ? t("macro.stale") : asOfText}
          </Text>
        </View>

        {quote.changePct !== null && !stale ? (
          <View className="flex-row items-center gap-0.5">
            <Ionicons
              name={quote.changePct >= 0 ? "caret-up" : "caret-down"}
              size={10}
              color={quote.changePct >= 0 ? colors.up : colors.down}
            />
            <Text
              className={`font-label text-[11px] ${
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
 * gold. Cached between refreshes (no live fetch on every mount); cards the
 * user hid in settings are skipped; stale quotes show "—" instead of an
 * outdated price.
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
    // The worker refreshes every 30 min — serve the cache and refresh in the
    // background instead of hitting the API on every mount.
    staleTime: 4 * 60_000,
    refetchInterval: 5 * 60_000,
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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingVertical: 4 }}
    >
      {visible.map((quote) => (
        <MacroCard key={quote.key} quote={quote} />
      ))}
    </ScrollView>
  );
}

export { MACRO_CARD_KEYS };
