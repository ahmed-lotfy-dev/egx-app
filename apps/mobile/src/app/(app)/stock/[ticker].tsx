import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { PriceChart } from "@/components/PriceChart";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";
import {
  formatCairoTime,
  formatCompact,
  formatDateShort,
  formatPercent,
  formatPercentValue,
  formatPrice,
  formatRatio,
  formatRelativeTime,
  formatSigned,
  formatVolume,
} from "@/lib/format";
import { sectorKey } from "@/lib/sectors";
import { useLocaleStore } from "@/stores/locale";
import type { paths } from "@/types/api";

type DetailResponse =
  paths["/api/instruments/{ticker}"]["get"]["responses"][200]["content"]["application/json"];
type HistoryResponse =
  paths["/api/instruments/{ticker}/history"]["get"]["responses"][200]["content"]["application/json"];
type NewsResponse =
  paths["/api/instruments/{ticker}/news"]["get"]["responses"][200]["content"]["application/json"];

type Detail = DetailResponse["data"];
type History = HistoryResponse;
type Levels = History["levels"];
type Stats = History["stats"];
type Bar = History["data"][number];
type NewsItem = NewsResponse["data"][number];
type Fundamentals = NonNullable<Detail["fundamentals"]>;
type Locale = "ar" | "en";

const RANGES = ["1W", "1M", "3M", "6M", "1Y"] as const;
type Range = (typeof RANGES)[number];

const RANGE_LABELS: Record<Range, string> = {
  "1W": "1W",
  "1M": "1M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
};

function toneColor(value: number | null | undefined): string {
  if (value !== null && value !== undefined && value > 0) {
    return colors.up;
  }

  if (value !== null && value !== undefined && value < 0) {
    return colors.down;
  }

  return colors.textSecondary;
}

export default function StockScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const [range, setRange] = useState<Range>("3M");
  const [aiOpen, setAiOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const symbol = (ticker ?? "").toUpperCase();

  const detailQuery = useQuery({
    queryKey: ["instrument", symbol],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/instruments/{ticker}", {
        params: { path: { ticker: symbol } },
      });

      if (error) {
        throw new Error("Instrument unavailable");
      }

      return data;
    },
    enabled: symbol.length > 0,
  });

  const historyQuery = useQuery({
    queryKey: ["instrument", symbol, "history", range],
    queryFn: async () => {
      const { data, error } = await api.GET(
        "/api/instruments/{ticker}/history",
        {
          params: { path: { ticker: symbol }, query: { range } },
        },
      );

      if (error) {
        throw new Error("History unavailable");
      }

      return data;
    },
    enabled: symbol.length > 0,
  });

  const newsQuery = useQuery({
    queryKey: ["instrument", symbol, "news", locale],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/instruments/{ticker}/news", {
        params: {
          path: { ticker: symbol },
          query: { limit: 10, lang: locale },
        },
      });

      if (error) {
        throw new Error("News unavailable");
      }

      return data;
    },
    enabled: symbol.length > 0,
  });

  const detail = detailQuery.data?.data;
  const history = historyQuery.data;
  const bars = history?.data ?? [];
  const lastBar = bars.length > 0 ? bars[bars.length - 1] : null;
  const previousBar = bars.length > 1 ? bars[bars.length - 2] : null;
  const fundamentals = detail?.fundamentals ?? null;

  const refresh = async () => {
    setRefreshing(true);

    try {
      await Promise.all([
        detailQuery.refetch(),
        historyQuery.refetch(),
        newsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.replace("/(app)/(tabs)");
  };

  if (!symbol) {
    return (
      <Screen>
        <SimpleState
          title={t("stock.loadErrorTitle")}
          body={t("stock.loadErrorBody")}
          actionLabel={t("common.goHome")}
          onAction={() => router.replace("/(app)/(tabs)")}
        />
      </Screen>
    );
  }

  if (detailQuery.isPending) {
    return (
      <Screen>
        <TopBar onBack={goBack} locale={locale} title={t("stock.title")} />
        <View className="flex-1 items-center justify-center px-8">
          <ActivityIndicator color={colors.gold} />
          <Text className="mt-4 font-body text-[14px] text-text-secondary">
            {t("stock.loading")}
          </Text>
        </View>
      </Screen>
    );
  }

  if (detailQuery.isError || !detail) {
    return (
      <Screen>
        <TopBar onBack={goBack} locale={locale} title={t("stock.title")} />
        <SimpleState
          title={t("stock.loadErrorTitle")}
          body={t("stock.loadErrorBody")}
          actionLabel={t("common.retry")}
          onAction={() => void detailQuery.refetch()}
        />
      </Screen>
    );
  }

  const quote = detail.quote;
  const meta = detailQuery.data.meta;
  const stale = Boolean(quote?.stale) || meta.stale;
  const changeColor = toneColor(quote?.changePct);
  const name =
    locale === "ar" && detail.nameAr ? detail.nameAr : detail.nameEn;
  const secondaryName = locale === "ar" ? detail.nameEn : detail.nameAr;
  const subtitle =
    secondaryName && secondaryName !== name
      ? `${secondaryName} · ${detail.ticker}`
      : detail.ticker;
  const sector = t(`sectors.${sectorKey(detail.sector)}`);
  const prevClose =
    previousBar?.close ??
    (quote?.price !== null &&
    quote?.price !== undefined &&
    quote?.change !== null &&
    quote?.change !== undefined
      ? quote.price - quote.change
      : null);

  return (
    <Screen>
      <TopBar onBack={goBack} locale={locale} title={t("stock.title")} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.gold}
            colors={[colors.gold]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        <View className="mx-5 rounded-3xl border border-gold/30 bg-surface p-5">
          <View className="flex-row items-center gap-3">
            <View className="h-12 w-12 items-center justify-center rounded-2xl border border-gold/30 bg-surface-elevated">
              <Text
                numberOfLines={1}
                className="font-label text-[9px] tracking-[0.02em] text-gold"
              >
                {detail.ticker.slice(0, 4)}
              </Text>
            </View>

            <View className="flex-1">
              <Text numberOfLines={2} className="font-title text-[16px] text-text">
                {name}
              </Text>
              <Text numberOfLines={1} className="mt-0.5 font-body text-[11px] text-text-muted">
                {subtitle}
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row items-end justify-between gap-3">
            <View>
              <Text className="font-display text-[34px] leading-[42px] text-text">
                {formatPrice(quote?.price)}
              </Text>
              <View className="mt-1 flex-row items-center gap-2">
                <View
                  className="flex-row items-center gap-1 rounded-full border px-2.5 py-1"
                  style={{ borderColor: `${changeColor}55`, backgroundColor: `${changeColor}1A` }}
                >
                  <Ionicons
                    name={
                      quote?.changePct !== null &&
                      quote?.changePct !== undefined &&
                      quote.changePct > 0
                        ? "trending-up"
                        : quote?.changePct !== null &&
                            quote?.changePct !== undefined &&
                            quote.changePct < 0
                          ? "trending-down"
                          : "remove"
                    }
                    size={11}
                    color={changeColor}
                  />
                  <Text
                    className="font-title text-[12px]"
                    style={{ color: changeColor }}
                  >
                    {formatPercent(quote?.changePct)}
                  </Text>
                </View>
                <Text className="font-body text-[12px]" style={{ color: changeColor }}>
                  {formatSigned(quote?.change)}
                </Text>
              </View>
            </View>

            <View className="items-end">
              <Text className="font-label text-[10px] tracking-[0.08em] text-text-muted">
                {detail.currency}
              </Text>
              <Text className="mt-1 font-body text-[11px] text-text-secondary">
                {formatCairoTime(quote?.asOf, locale)}
              </Text>
            </View>
          </View>

          <View className="mt-4 flex-row flex-wrap items-center gap-2">
            <View className="rounded-full border border-border bg-canvas px-3 py-1">
              <Text className="font-body text-[10px] text-text-secondary">
                {sector}
              </Text>
            </View>
            <View className="rounded-full border border-border bg-canvas px-3 py-1">
              <Text className="font-label text-[9px] uppercase tracking-[0.06em] text-text-muted">
                {meta.source === "none" ? "—" : meta.source}
              </Text>
            </View>
            {stale ? (
              <View className="flex-row items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1">
                <Ionicons name="time-outline" size={11} color={colors.warning} />
                <Text className="font-label text-[9px] uppercase tracking-[0.06em] text-warning">
                  {t("stock.stale")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-4">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="font-title text-[15px] text-text">
              {t("stock.chartTitle")}
            </Text>

            <View className="flex-row rounded-full border border-border bg-canvas p-1">
              {RANGES.map((item) => {
                const selected = range === item;

                return (
                  <Pressable
                    key={item}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setRange(item)}
                    className={`rounded-full px-2.5 py-1 active:opacity-80 ${
                      selected ? "bg-surface-elevated" : ""
                    }`}
                  >
                    <Text
                      className={`font-label text-[10px] ${
                        selected ? "text-gold" : "text-text-muted"
                      }`}
                    >
                      {RANGE_LABELS[item]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View className="mt-3">
            {historyQuery.isPending ? (
              <View className="items-center justify-center" style={{ height: 236 }}>
                <ActivityIndicator color={colors.gold} />
              </View>
            ) : historyQuery.isError ? (
              <View className="items-center justify-center px-4" style={{ height: 236 }}>
                <Text className="text-center font-body text-[12px] text-text-secondary">
                  {t("stock.chartError")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void historyQuery.refetch()}
                  className="mt-4 rounded-full border border-border px-4 py-2 active:opacity-80"
                >
                  <Text className="font-title text-[12px] text-text">
                    {t("common.retry")}
                  </Text>
                </Pressable>
              </View>
            ) : bars.length < 2 ? (
              <ChartCoverage
                count={history?.stats.barCount ?? 0}
                lastDate={history?.stats.lastDate ?? null}
                locale={locale}
              />
            ) : (
              <PriceChart
                bars={bars}
                levels={history?.levels ?? null}
                locale={locale}
              />
            )}
          </View>

          <Text className="mt-3 font-body text-[10px] text-text-muted">
            {t("stock.chartNote")}
          </Text>
        </View>

        <LevelsCard
          levels={history?.levels ?? null}
          stats={history?.stats ?? null}
          locale={locale}
        />

        <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-5">
          <Text className="font-title text-[15px] text-text">
            {t("stock.statsTitle")}
          </Text>

          <View className="mt-2 flex-row flex-wrap">
            <StatCell label={t("stock.open")} value={formatPrice(lastBar?.open)} />
            <StatCell label={t("stock.high")} value={formatPrice(lastBar?.high)} />
            <StatCell label={t("stock.low")} value={formatPrice(lastBar?.low)} />
            <StatCell label={t("stock.prevClose")} value={formatPrice(prevClose)} />
            <StatCell
              label={t("stock.volume")}
              value={formatVolume(quote?.volume ?? lastBar?.volume, locale)}
            />
            <StatCell
              label={t("stock.marketCap")}
              value={formatCompact(
                quote?.marketCap ?? fundamentals?.marketCap ?? null,
                locale,
              )}
            />
            <StatCell
              label={t("stock.high52w")}
              value={formatPrice(history?.stats.high52w)}
            />
            <StatCell
              label={t("stock.low52w")}
              value={formatPrice(history?.stats.low52w)}
            />
            <StatCell
              label={t("stock.avgVolume20")}
              value={formatVolume(history?.stats.avgVolume20, locale)}
            />
          </View>
        </View>

        <FundamentalsCard fundamentals={fundamentals} locale={locale} />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stock.aiTitle")}
          onPress={() => setAiOpen(true)}
          className="mx-5 mt-4 overflow-hidden rounded-3xl border border-gold/40 bg-surface p-5 active:opacity-90"
        >
          <View className="flex-row items-start gap-3">
            <View className="h-11 w-11 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10">
              <Ionicons name="sparkles" size={20} color={colors.goldSoft} />
            </View>

            <View className="flex-1">
              <View className="flex-row items-center gap-2">
                <Text className="flex-1 font-title text-[15px] text-text">
                  {t("stock.aiTitle")}
                </Text>
                <View className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1">
                  <Text className="font-label text-[9px] tracking-[0.06em] text-gold">
                    {t("stock.aiBadge")}
                  </Text>
                </View>
              </View>
              <Text className="mt-1.5 font-body text-[12px] leading-5 text-text-secondary">
                {t("stock.aiBody")}
              </Text>
            </View>
          </View>
        </Pressable>

        <View className="mt-6 px-5">
          <View className="flex-row items-center justify-between">
            <Text className="font-title text-[15px] text-text">
              {t("stock.newsTitle")}
            </Text>
            {newsQuery.data && newsQuery.data.data.length > 0 ? (
              <Text className="font-body text-[11px] text-text-muted">
                {t("stock.newsCount", { count: newsQuery.data.data.length })}
              </Text>
            ) : null}
          </View>

          <View className="mt-3">
            {newsQuery.isPending ? (
              <View className="items-center rounded-3xl border border-border bg-surface py-8">
                <ActivityIndicator color={colors.gold} />
              </View>
            ) : newsQuery.isError ? (
              <View className="items-center rounded-3xl border border-border bg-surface p-6">
                <Text className="text-center font-body text-[12px] text-text-secondary">
                  {t("stock.newsError")}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void newsQuery.refetch()}
                  className="mt-4 rounded-full border border-border px-4 py-2 active:opacity-80"
                >
                  <Text className="font-title text-[12px] text-text">
                    {t("common.retry")}
                  </Text>
                </Pressable>
              </View>
            ) : newsQuery.data && newsQuery.data.data.length > 0 ? (
              <View className="overflow-hidden rounded-3xl border border-border bg-surface">
                {newsQuery.data.data.map((item, index) => (
                  <NewsRow
                    key={item.id}
                    item={item}
                    locale={locale}
                    isLast={index === newsQuery.data.data.length - 1}
                  />
                ))}
              </View>
            ) : (
              <View className="items-center rounded-3xl border border-border bg-surface px-6 py-8">
                <Ionicons
                  name="newspaper-outline"
                  size={24}
                  color={colors.textMuted}
                />
                <Text className="mt-3 text-center font-title text-[14px] text-text">
                  {t("stock.newsEmptyTitle")}
                </Text>
                <Text className="mt-1.5 text-center font-body text-[12px] leading-5 text-text-muted">
                  {t("stock.newsEmptyBody")}
                </Text>
              </View>
            )}
          </View>

          <Text className="mt-3 font-body text-[10px] text-text-muted">
            {t("stock.newsNote")}
          </Text>
        </View>

        <View className="mx-5 mt-6 rounded-2xl border border-border/60 bg-canvas px-4 py-4">
          <Text className="font-body text-[11px] leading-5 text-text-muted">
            {detail.history.barCount > 0
              ? t("stock.historyCoverage", {
                  count: detail.history.barCount,
                  date: formatDateShort(detail.history.lastDate, locale),
                })
              : t("stock.noHistory")}
          </Text>
          <Text className="mt-2 font-body text-[10px] leading-5 text-text-muted">
            {t("stock.footer")}
          </Text>
          <Text className="mt-1 font-body text-[10px] leading-5 text-text-muted">
            {t("stock.sourcesLabel")}{" "}
            {"\u2066TradingView · Yahoo Finance · Arab Finance\u2069"}
          </Text>
        </View>
      </ScrollView>

      <AiSheet visible={aiOpen} onClose={() => setAiOpen(false)} locale={locale} />
    </Screen>
  );
}

function TopBar({
  onBack,
  locale,
  title,
}: {
  onBack: () => void;
  locale: Locale;
  title: string;
}) {
  const { t } = useTranslation();

  return (
    <View className="flex-row items-center justify-between px-5 pb-3 pt-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("stock.back")}
        onPress={onBack}
        className="h-11 w-11 items-center justify-center rounded-full border border-border bg-surface active:opacity-80"
      >
        <Ionicons
          name={locale === "ar" ? "arrow-forward" : "arrow-back"}
          size={20}
          color={colors.text}
        />
      </Pressable>

      <Text className="font-title text-[14px] text-text-secondary">{title}</Text>

      <View className="h-11 w-11" />
    </View>
  );
}

function ChartCoverage({
  count,
  lastDate,
  locale,
}: {
  count: number;
  lastDate: string | null;
  locale: Locale;
}) {
  const { t } = useTranslation();

  return (
    <View
      className="items-center justify-center rounded-2xl border border-border/60 bg-canvas px-5"
      style={{ height: 236 }}
    >
      <Ionicons name="stats-chart-outline" size={24} color={colors.textMuted} />
      <Text className="mt-3 text-center font-title text-[13px] text-text">
        {t("stock.chartEmptyTitle")}
      </Text>
      <Text className="mt-1.5 text-center font-body text-[11px] leading-5 text-text-muted">
        {count > 0 && lastDate
          ? t("stock.chartSparseBody", {
              count,
              date: formatDateShort(lastDate, locale),
            })
          : t("stock.chartEmptyBody", { count })}
      </Text>
    </View>
  );
}

function LevelsCard({
  levels,
  stats,
  locale,
}: {
  levels: Levels;
  stats: Stats | null;
  locale: Locale;
}) {
  const { t } = useTranslation();

  const cells = levels
    ? [
        { key: "S2", value: levels.s2, color: colors.down },
        { key: "S1", value: levels.s1, color: colors.down },
        { key: "P", value: levels.pivot, color: colors.gold },
        { key: "R1", value: levels.r1, color: colors.up },
        { key: "R2", value: levels.r2, color: colors.up },
      ]
    : [];

  return (
    <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-title text-[15px] text-text">
          {t("stock.levelsTitle")}
        </Text>
        {levels ? (
          <Text className="font-body text-[10px] text-text-muted">
            {formatDateShort(levels.asOf, locale)}
          </Text>
        ) : null}
      </View>

      {levels ? (
        <>
          <View className="mt-4 flex-row gap-1.5">
            {cells.map((cell) => (
              <View
                key={cell.key}
                className="flex-1 items-center rounded-xl border border-border/60 bg-canvas py-2"
              >
                <Text
                  className="font-label text-[9px] tracking-[0.06em]"
                  style={{ color: cell.color }}
                >
                  {cell.key}
                </Text>
                <Text className="mt-1 font-title text-[11px] text-text">
                  {formatPrice(cell.value)}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-4 gap-2">
            <RangeRow
              label={t("stock.range20")}
              low={stats?.low20 ?? null}
              high={stats?.high20 ?? null}
            />
            <RangeRow
              label={t("stock.range52w")}
              low={stats?.low52w ?? null}
              high={stats?.high52w ?? null}
            />
          </View>
        </>
      ) : (
        <Text className="mt-3 font-body text-[12px] text-text-secondary">
          {t("stock.levelsEmpty")}
        </Text>
      )}

      <Text className="mt-3 font-body text-[10px] leading-4 text-text-muted">
        {t("stock.levelsNote")}
      </Text>
    </View>
  );
}

function RangeRow({
  label,
  low,
  high,
}: {
  label: string;
  low: number | null;
  high: number | null;
}) {
  return (
    <View className="flex-row items-center justify-between gap-3">
      <Text className="font-body text-[11px] text-text-muted">{label}</Text>
      <Text className="font-title text-[11px] text-text-secondary">
        {formatPrice(low)} — {formatPrice(high)}
      </Text>
    </View>
  );
}

function StatCell({
  label,
  value,
}: {
  label: string;
  value: string | null;
}) {
  const { t } = useTranslation();

  return (
    <View className="w-1/2 py-2 pe-2">
      <Text className="font-body text-[10px] text-text-muted">{label}</Text>
      <Text className="mt-1 font-title text-[13px] text-text">
        {value ?? t("stock.notAvailable")}
      </Text>
    </View>
  );
}

function FundamentalsCard({
  fundamentals,
  locale,
}: {
  fundamentals: Fundamentals | null;
  locale: Locale;
}) {
  const { t } = useTranslation();

  if (!fundamentals) {
    return (
      <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-5">
        <Text className="font-title text-[15px] text-text">
          {t("stock.fundamentalsTitle")}
        </Text>
        <Text className="mt-3 font-body text-[12px] text-text-secondary">
          {t("stock.fundamentalsEmpty")}
        </Text>
      </View>
    );
  }

  const percent = (value: number | null) => formatPercentValue(value);
  const ratio = (value: number | null) => formatRatio(value);
  const money = (value: number | null) => formatCompact(value, locale);

  const groups = [
    {
      title: t("stock.groupValuation"),
      rows: [
        { label: t("stock.pe"), value: ratio(fundamentals.pe) },
        { label: t("stock.pb"), value: ratio(fundamentals.pb) },
        { label: t("stock.eps"), value: ratio(fundamentals.eps) },
        { label: t("stock.evEbitda"), value: ratio(fundamentals.evEbitda) },
        { label: t("stock.marketCap"), value: money(fundamentals.marketCap) },
      ],
    },
    {
      title: t("stock.groupProfitability"),
      rows: [
        { label: t("stock.roe"), value: percent(fundamentals.roe) },
        { label: t("stock.roa"), value: percent(fundamentals.roa) },
        { label: t("stock.grossMargin"), value: percent(fundamentals.grossMargin) },
        { label: t("stock.netMargin"), value: percent(fundamentals.netMargin) },
        {
          label: t("stock.dividendYield"),
          value: percent(fundamentals.dividendYield),
        },
      ],
    },
    {
      title: t("stock.groupHealth"),
      rows: [
        {
          label: t("stock.debtToEquity"),
          value: ratio(fundamentals.debtToEquity),
        },
        {
          label: t("stock.currentRatio"),
          value: ratio(fundamentals.currentRatio),
        },
        { label: t("stock.beta"), value: ratio(fundamentals.beta) },
        { label: t("stock.revenueTtm"), value: money(fundamentals.revenueTtm) },
        {
          label: t("stock.netIncomeTtm"),
          value: money(fundamentals.netIncomeTtm),
        },
        { label: t("stock.fcfTtm"), value: money(fundamentals.fcfTtm) },
        { label: t("stock.totalDebt"), value: money(fundamentals.totalDebt) },
        { label: t("stock.totalAssets"), value: money(fundamentals.totalAssets) },
        {
          label: t("stock.bookValue"),
          value: ratio(fundamentals.bookValuePerShare),
        },
      ],
    },
  ];

  return (
    <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-5">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="font-title text-[15px] text-text">
          {t("stock.fundamentalsTitle")}
        </Text>
        <View className="rounded-full border border-border bg-canvas px-2.5 py-1">
          <Text className="font-label text-[9px] uppercase tracking-[0.06em] text-text-muted">
            {fundamentals.source}
          </Text>
        </View>
      </View>

      {groups.map((group) => (
        <View key={group.title} className="mt-4">
          <Text className="font-label text-[10px] uppercase tracking-[0.1em] text-gold">
            {group.title}
          </Text>
          <View className="mt-1.5">
            {group.rows.map((row) => (
              <View
                key={row.label}
                className="flex-row items-center justify-between gap-3 border-b border-border/40 py-2"
              >
                <Text className="flex-1 font-body text-[12px] text-text-secondary">
                  {row.label}
                </Text>
                <Text className="font-title text-[12px] text-text">
                  {row.value ?? t("stock.notAvailable")}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}

      <Text className="mt-4 font-body text-[10px] leading-4 text-text-muted">
        {t("stock.fundamentalsNote", {
          date: formatDateShort(fundamentals.asOf, locale),
        })}
      </Text>
    </View>
  );
}

function NewsRow({
  item,
  locale,
  isLast,
}: {
  item: NewsItem;
  locale: Locale;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const open = async () => {
    try {
      const supported = await Linking.canOpenURL(item.url);

      if (supported) {
        await Linking.openURL(item.url);
      }
    } catch {
      // Ignore link failures; the headline stays readable in place.
    }
  };

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${item.title} — ${t("stock.newsOpen")}`}
      onPress={() => void open()}
      className={`px-4 py-3.5 active:opacity-80 ${
        isLast ? "" : "border-b border-border/60"
      }`}
    >
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row items-center gap-2">
          <Text className="font-label text-[9px] uppercase tracking-[0.06em] text-gold">
            {item.source === "arabfinance" ? "Arab Finance" : item.source}
          </Text>
          {item.lang !== locale ? (
            <View className="rounded-full border border-border px-1.5 py-0.5">
              <Text className="font-label text-[8px] uppercase text-text-muted">
                {item.lang}
              </Text>
            </View>
          ) : null}
        </View>
        <Text className="font-body text-[10px] text-text-muted">
          {formatRelativeTime(item.publishedAt, locale)}
        </Text>
      </View>

      <View className="mt-1.5 flex-row items-start gap-2">
        <Text className="flex-1 font-body text-[13px] leading-5 text-text">
          {item.title}
        </Text>
        <Ionicons name="open-outline" size={13} color={colors.textMuted} />
      </View>
    </Pressable>
  );
}

function AiSheet({
  visible,
  onClose,
  locale,
}: {
  visible: boolean;
  onClose: () => void;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const inputs = [
    t("stock.aiInputQuote"),
    t("stock.aiInputChart"),
    t("stock.aiInputLevels"),
    t("stock.aiInputFundamentals"),
    t("stock.aiInputNews"),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/60">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("stock.aiSheetClose")}
          onPress={onClose}
          className="flex-1"
        />

        <View
          className="rounded-t-3xl border border-border bg-surface px-5 pb-8 pt-5"
          style={{ direction: locale === "ar" ? "rtl" : "ltr" }}
        >
          <View className="items-center">
            <View className="h-1 w-10 rounded-full bg-border" />
          </View>

          <View className="mt-4 flex-row items-center gap-2">
            <Ionicons name="sparkles" size={18} color={colors.goldSoft} />
            <Text className="flex-1 font-title text-[17px] text-text">
              {t("stock.aiSheetTitle")}
            </Text>
            <View className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1">
              <Text className="font-label text-[9px] tracking-[0.06em] text-gold">
                {t("stock.aiBadge")}
              </Text>
            </View>
          </View>

          <Text className="mt-3 font-body text-[13px] leading-6 text-text-secondary">
            {t("stock.aiSheetBody")}
          </Text>

          <View className="mt-4 gap-2">
            {inputs.map((input) => (
              <View key={input} className="flex-row items-center gap-2">
                <View className="h-1.5 w-1.5 rounded-full bg-gold" />
                <Text className="flex-1 font-body text-[12px] text-text-secondary">
                  {input}
                </Text>
              </View>
            ))}
          </View>

          <View className="mt-4 rounded-2xl border border-border/60 bg-canvas px-4 py-3">
            <Text className="font-body text-[11px] leading-5 text-text-muted">
              {t("stock.aiDisclaimer")}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            className="mt-5 min-h-11 items-center justify-center rounded-2xl border border-gold/40 bg-gold/10 active:opacity-80"
          >
            <Text className="font-title text-[14px] text-gold">
              {t("stock.aiSheetClose")}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function SimpleState({
  title,
  body,
  actionLabel,
  onAction,
}: {
  title: string;
  body: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
        <Ionicons name="cloud-offline-outline" size={28} color={colors.gold} />
      </View>
      <Text className="mt-5 text-center font-title text-[19px] text-text">
        {title}
      </Text>
      <Text className="mt-2 max-w-[300px] text-center font-body text-[15px] leading-6 text-text-secondary">
        {body}
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onAction}
        className="mt-6 min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-5 active:opacity-80"
      >
        <Text className="font-title text-[14px] text-text">{actionLabel}</Text>
      </Pressable>
    </View>
  );
}
