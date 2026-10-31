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

function toneFor(changePct: number | null): string {
  if (changePct === null) {
    return "text-text-muted";
  }

  return changePct >= 0 ? "text-up" : "text-down";
}

function MacroCard({ quote }: { quote: MacroQuote }) {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);

  const valueText = quote.stale || quote.value === null
    ? "—"
    : formatPrice(quote.value);
  const asOfText =
    quote.asOf && !quote.stale
      ? formatRelativeTime(quote.asOf, locale)
      : t("macro.stale");

  return (
    <View className="min-w-[124px] rounded-2xl border border-border bg-surface px-3 py-2.5">
      <View className="flex-row items-center gap-1">
        <Text className="font-label text-[11px] text-text-muted" numberOfLines={1}>
          {t(CARD_LABELS[quote.key])}
        </Text>
      </View>
      <Text className="mt-1 font-title text-[16px] text-text">
        {valueText}
      </Text>
      <View className="mt-0.5 flex-row items-center justify-between">
        {quote.changePct !== null && !quote.stale ? (
          <View className="flex-row items-center gap-0.5">
            <Ionicons
              name={quote.changePct >= 0 ? "caret-up" : "caret-down"}
              size={10}
              color={quote.changePct >= 0 ? colors.up : colors.down}
            />
            <Text className={`font-label text-[11px] ${toneFor(quote.changePct)}`}>
              {Math.abs(quote.changePct).toFixed(2)}%
            </Text>
          </View>
        ) : null}
        <Text className="font-body text-[9px] text-text-muted" numberOfLines={1}>
          {asOfText}
        </Text>
      </View>
    </View>
  );
}

/**
 * Economy strip for the home screen: USD/EGP, oil grades, global and Egyptian
 * gold. Cards the user hid in settings are skipped; stale quotes show "—"
 * instead of an outdated price.
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
