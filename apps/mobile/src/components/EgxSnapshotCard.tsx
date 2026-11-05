import { View, Text } from "react-native";
import { useTranslation } from "react-i18next";

import { tabular } from "@/constants/theme";

import {
  formatCompact,
  formatDateShort,
  formatPercentValue,
  formatPrice,
  formatRatio,
} from "@/lib/format";
import type { Locale } from "@/lib/i18n";

type EgxSnapshot = {
  periodEnd: string;
  close: number | null;
  listedShares: number | null;
  marketCap: number | null;
  paidCapital: number | null;
  peTrailing: number | null;
  dividendYield: number | null;
  netProfit: number | null;
  netProfitPeriodEnd: string | null;
};

/**
 * Official EGX disclosure-document figures for one stock, as published in the
 * latest approved quarterly file. `net_profit` is the trailing (usually
 * annual) figure — its own period end is always shown next to it.
 */
export function EgxSnapshotCard({
  snapshot,
  locale,
}: {
  snapshot: EgxSnapshot | null;
  locale: Locale;
}) {
  const { t } = useTranslation();

  if (!snapshot) return null;

  const rows = [
    { label: t("stock.egxClose"), value: formatPrice(snapshot.close) },
    {
      label: t("stock.egxListedShares"),
      value: formatCompact(snapshot.listedShares, locale),
    },
    {
      label: t("stock.egxMarketCap"),
      value: formatCompact(snapshot.marketCap, locale),
    },
    {
      label: t("stock.egxPaidCapital"),
      value: formatCompact(snapshot.paidCapital, locale),
    },
    {
      label: t("stock.egxPe"),
      value: formatRatio(snapshot.peTrailing),
    },
    {
      label: t("stock.egxDividendYield"),
      value: formatPercentValue(snapshot.dividendYield),
    },
    {
      label: snapshot.netProfitPeriodEnd
        ? t("stock.egxNetProfitUntil", {
            date: formatDateShort(snapshot.netProfitPeriodEnd, locale),
          })
        : t("stock.egxNetProfit"),
      value: formatCompact(snapshot.netProfit, locale),
    },
  ].filter((row) => row.value !== null && row.value !== undefined);

  if (rows.length === 0) return null;

  return (
    <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-5">
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-[15px] text-text">
          {t("stock.egxTitle")}
        </Text>
        <View className="rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1">
          <Text className="font-body text-[10px] text-gold-soft">
            {t("stock.egxOfficialBadge")}
          </Text>
        </View>
      </View>

      <View className="mt-3 gap-2.5">
        {rows.map((row) => (
          <View key={row.label} className="flex-row items-center justify-between">
            <Text className="flex-1 font-body text-[12px] text-text-secondary">
              {row.label}
            </Text>
            <Text style={tabular} className="font-title text-[13px] text-text">
              {row.value}
            </Text>
          </View>
        ))}
      </View>

      <Text className="mt-3 font-body text-[10px] text-text-muted">
        {t("stock.egxSourceNote", {
          date: formatDateShort(snapshot.periodEnd, locale),
        })}
      </Text>
    </View>
  );
}
