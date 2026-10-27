import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import {
  type ComponentRef,
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/Screen";
import { Sparkline } from "@/components/Sparkline";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";
import {
  formatCairoTime,
  formatPercent,
  formatPrice,
  formatSigned,
} from "@/lib/format";
import { sectorKey } from "@/lib/sectors";
import { useLocaleStore } from "@/stores/locale";
import type { paths } from "@/types/api";

type OverviewResponse =
  paths["/api/market/overview"]["get"]["responses"][200]["content"]["application/json"];
type InstrumentsResponse =
  paths["/api/instruments"]["get"]["responses"][200]["content"]["application/json"];

type Overview = OverviewResponse["data"];
type OverviewMeta = OverviewResponse["meta"];
type Instrument = InstrumentsResponse["data"][number];
type Sector = Overview["sectors"][number];
type Locale = "ar" | "en";
type MoverTab = "gainers" | "losers";

type Tone = {
  pill: string;
  text: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const PAGE_SIZE = 50;

function toneFor(value: number | null | undefined): Tone {
  if (value !== null && value !== undefined && value > 0) {
    return {
      pill: "border-up/30 bg-up/10",
      text: "text-up",
      color: colors.up,
      icon: "trending-up",
    };
  }

  if (value !== null && value !== undefined && value < 0) {
    return {
      pill: "border-down/30 bg-down/10",
      text: "text-down",
      color: colors.down,
      icon: "trending-down",
    };
  }

  return {
    pill: "border-border bg-surface-elevated",
    text: "text-text-secondary",
    color: colors.textSecondary,
    icon: "remove",
  };
}

export default function MarketsScreen() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const [moverTab, setMoverTab] = useState<MoverTab>("gainers");
  const [manualRefreshing, setManualRefreshing] = useState(false);

  const overviewQuery = useQuery({
    queryKey: ["market", "overview"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/market/overview");

      if (error) {
        throw new Error("Market overview unavailable");
      }

      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const instrumentsQuery = useInfiniteQuery({
    queryKey: ["instruments", "list"],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.GET("/api/instruments", {
        params: {
          query: {
            limit: PAGE_SIZE,
            cursor: pageParam ?? undefined,
          },
        },
      });

      if (error) {
        throw new Error("Instrument list unavailable");
      }

      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? null,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const instruments = useMemo(
    () => instrumentsQuery.data?.pages.flatMap((page) => page.data) ?? [],
    [instrumentsQuery.data],
  );

  const refresh = useCallback(async () => {
    setManualRefreshing(true);

    try {
      await Promise.all([overviewQuery.refetch(), instrumentsQuery.refetch()]);
    } finally {
      setManualRefreshing(false);
    }
  }, [overviewQuery.refetch, instrumentsQuery.refetch]);

  const header = (
    <View className="flex-row items-start justify-between px-5 pb-4 pt-2">
      <View>
        <Text className="font-label text-[10px] uppercase tracking-[0.18em] text-gold">
          {t("markets.kicker")}
        </Text>
        <Text className="mt-1 font-display text-[28px] leading-9 text-text">
          {t("markets.title")}
        </Text>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("markets.bell")}
        accessibilityState={{ disabled: true }}
        disabled
        className="mt-1 h-11 w-11 items-center justify-center rounded-full border border-border bg-surface opacity-50"
      >
        <Ionicons name="notifications-outline" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  );

  if (!overviewQuery.data) {
    return (
      <Screen>
        {header}

        {overviewQuery.isPending ? (
          <View className="flex-1 items-center justify-center px-8">
            <ActivityIndicator color={colors.gold} />
            <Text className="mt-4 font-body text-[14px] text-text-secondary">
              {t("markets.loading")}
            </Text>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center px-8">
            <View className="h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
              <Ionicons name="cloud-offline-outline" size={28} color={colors.gold} />
            </View>
            <Text className="mt-5 text-center font-title text-[19px] text-text">
              {t("markets.loadErrorTitle")}
            </Text>
            <Text className="mt-2 max-w-[300px] text-center font-body text-[15px] leading-6 text-text-secondary">
              {t("markets.loadErrorBody")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => void overviewQuery.refetch()}
              className="mt-6 min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-5 active:opacity-80"
            >
              <Text className="font-title text-[14px] text-text">{t("common.retry")}</Text>
            </Pressable>
          </View>
        )}
      </Screen>
    );
  }

  const overview = overviewQuery.data.data;
  const meta = overviewQuery.data.meta;
  const totalBreadth =
    overview.breadth.advancers +
    overview.breadth.decliners +
    overview.breadth.unchanged;

  return (
    <Screen>
      {header}

      <FlatList
        data={instruments}
        keyExtractor={(item) => item.ticker}
        renderItem={({ item }) => (
          <InstrumentRow
            item={item}
            locale={locale}
            marketStale={meta.stale}
          />
        )}
        ListHeaderComponent={
          <MarketsHeader
            overview={overview}
            meta={meta}
            locale={locale}
            moverTab={moverTab}
            onChangeMoverTab={setMoverTab}
            totalBreadth={totalBreadth}
          />
        }
        ListEmptyComponent={
          <ListEmpty
            isPending={instrumentsQuery.isPending}
            isError={instrumentsQuery.isError}
            onRetry={() => void instrumentsQuery.refetch()}
          />
        }
        ListFooterComponent={
          <ListFooter
            isFetchingNextPage={instrumentsQuery.isFetchingNextPage}
            hasNextPage={Boolean(instrumentsQuery.hasNextPage)}
            count={instruments.length}
          />
        }
        contentContainerStyle={{ paddingBottom: 28 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={manualRefreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.gold}
            colors={[colors.gold]}
            progressBackgroundColor={colors.surface}
          />
        }
        onEndReached={() => {
          if (
            instrumentsQuery.hasNextPage &&
            !instrumentsQuery.isFetchingNextPage
          ) {
            void instrumentsQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        initialNumToRender={12}
        windowSize={9}
      />
    </Screen>
  );
}

function MarketsHeader({
  overview,
  meta,
  locale,
  moverTab,
  onChangeMoverTab,
  totalBreadth,
}: {
  overview: Overview;
  meta: OverviewMeta;
  locale: Locale;
  moverTab: MoverTab;
  onChangeMoverTab: (tab: MoverTab) => void;
  totalBreadth: number;
}) {
  const { t } = useTranslation();
  const indexQuote = overview.index?.quote;
  const indexTone = toneFor(indexQuote?.changePct);
  const movers = moverTab === "gainers" ? overview.gainers : overview.losers;
  const sourceLabel =
    meta.source === "tradingview"
      ? "TradingView"
      : meta.source === "yahoo"
        ? "Yahoo Finance"
        : meta.source;

  return (
    <View>
      <View className="mx-5 mb-4 flex-row items-center justify-between gap-3">
        <View className="flex-1 flex-row items-center gap-2">
          <View
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: meta.stale ? colors.warning : colors.up }}
          />
          <Text
            numberOfLines={1}
            className={`flex-1 font-body text-[12px] ${meta.stale ? "text-warning" : "text-text-secondary"}`}
          >
            {meta.stale
              ? `${t("markets.stale")} · ${t("markets.staleAsOf", {
                  time: formatCairoTime(meta.asOf, locale),
                })}`
              : t("markets.updatedAt", {
                  time: formatCairoTime(meta.asOf, locale),
                })}
          </Text>
        </View>

        <View className="rounded-full border border-border bg-surface px-3 py-1">
          <Text className="font-label text-[9px] uppercase tracking-[0.08em] text-text-muted">
            {sourceLabel}
          </Text>
        </View>
      </View>

      <View className="mx-5 overflow-hidden rounded-3xl border border-gold/30 bg-surface p-5">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="font-label text-[10px] uppercase tracking-[0.14em] text-gold">
              {t("markets.indexKicker")}
            </Text>
            <Text className="mt-1 font-body text-[12px] text-text-muted">
              {t("markets.indexName")}
            </Text>
            <Text className="mt-3 font-display text-[34px] leading-[42px] text-text">
              {formatPrice(indexQuote?.price)}
            </Text>
          </View>

          <View className="items-end">
            <View
              className={`flex-row items-center gap-1 rounded-full border px-3 py-1.5 ${indexTone.pill}`}
            >
              <Ionicons name={indexTone.icon} size={12} color={indexTone.color} />
              <Text className={`font-title text-[13px] ${indexTone.text}`}>
                {formatPercent(indexQuote?.changePct)}
              </Text>
            </View>
            <Text className={`mt-2 font-body text-[13px] ${indexTone.text}`}>
              {formatSigned(indexQuote?.change)}
            </Text>
            <Text className="mt-1 font-body text-[10px] text-text-muted">
              {formatCairoTime(indexQuote?.asOf, locale)}
            </Text>
          </View>
        </View>

        <Sparkline values={overview.indexSparkline} />

        <View className="mt-4 flex-row items-center justify-between gap-3">
          <Text
            numberOfLines={1}
            className="flex-1 font-body text-[10px] text-text-muted"
          >
            {t("markets.delayedNote")}
          </Text>
          {indexQuote?.stale ? <StalePill label={t("markets.staleQuote")} /> : null}
        </View>
      </View>

      <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-5">
        <View className="flex-row items-center justify-between">
          <Text className="font-title text-[15px] text-text">
            {t("markets.breadthTitle")}
          </Text>
          <Text className="font-label text-[10px] text-text-muted">
            {t("markets.stockCount", { count: overview.instrumentCount })}
          </Text>
        </View>

        <View
          accessible={false}
          className="mt-4 h-2 flex-row overflow-hidden rounded-full bg-surface-elevated"
        >
          {totalBreadth > 0 && overview.breadth.advancers > 0 ? (
            <View
              style={{
                flex: overview.breadth.advancers,
                backgroundColor: colors.up,
              }}
            />
          ) : null}
          {totalBreadth > 0 && overview.breadth.unchanged > 0 ? (
            <View
              style={{
                flex: overview.breadth.unchanged,
                backgroundColor: colors.textMuted,
              }}
            />
          ) : null}
          {totalBreadth > 0 && overview.breadth.decliners > 0 ? (
            <View
              style={{
                flex: overview.breadth.decliners,
                backgroundColor: colors.down,
              }}
            />
          ) : null}
        </View>

        <View className="mt-3 flex-row justify-between">
          <BreadthStat
            color={colors.up}
            label={t("markets.advancers")}
            value={overview.breadth.advancers}
          />
          <BreadthStat
            color={colors.textMuted}
            label={t("markets.unchanged")}
            value={overview.breadth.unchanged}
          />
          <BreadthStat
            color={colors.down}
            label={t("markets.decliners")}
            value={overview.breadth.decliners}
            alignEnd
          />
        </View>
      </View>

      <View className="mx-5 mt-4 rounded-3xl border border-border bg-surface p-5">
        <View className="flex-row items-center justify-between gap-3">
          <Text className="font-title text-[15px] text-text">
            {t("markets.moversTitle")}
          </Text>

          <View className="flex-row rounded-full border border-border bg-canvas p-1">
            {(["gainers", "losers"] as const).map((tab) => {
              const selected = moverTab === tab;

              return (
                <Pressable
                  key={tab}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => onChangeMoverTab(tab)}
                  className={`rounded-full px-3 py-1.5 active:opacity-80 ${selected ? "bg-surface-elevated" : ""}`}
                >
                  <Text
                    className={`font-title text-[11px] ${selected ? "text-gold" : "text-text-muted"}`}
                  >
                    {t(`markets.${tab}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View className="mt-2">
          {movers.map((item) => (
            <MoverRow key={item.ticker} item={item} locale={locale} />
          ))}
          {movers.length === 0 ? (
            <Text className="py-4 text-center font-body text-[13px] text-text-muted">
              {t("markets.noQuote")}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="mt-6">
        <View className="flex-row items-center justify-between px-5">
          <Text className="font-title text-[15px] text-text">
            {t("markets.sectorsTitle")}
          </Text>
          <Text className="font-body text-[11px] text-text-muted">
            {t("markets.sectorCount", { count: overview.sectors.length })}
          </Text>
        </View>

        <SectorStrip key={locale} sectors={overview.sectors} />
      </View>

      <View className="mt-6 flex-row items-center justify-between px-5 pb-3">
        <Text className="font-title text-[15px] text-text">
          {t("markets.allStocks")}
        </Text>
        <Text className="font-body text-[11px] text-text-muted">
          {t("markets.stockCount", { count: overview.instrumentCount })}
        </Text>
      </View>
    </View>
  );
}

function BreadthStat({
  color,
  label,
  value,
  alignEnd = false,
}: {
  color: string;
  label: string;
  value: number;
  alignEnd?: boolean;
}) {
  return (
    <View className={alignEnd ? "items-end" : "items-start"}>
      <View className="flex-row items-center gap-1.5">
        <View
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <Text className="font-title text-[16px] text-text">{value}</Text>
      </View>
      <Text className="mt-1 font-body text-[11px] text-text-muted">{label}</Text>
    </View>
  );
}

function openStock(ticker: string) {
  router.push({ pathname: "/(app)/stock/[ticker]", params: { ticker } });
}

function MoverRow({ item, locale }: { item: Instrument; locale: Locale }) {
  const name = locale === "ar" && item.nameAr ? item.nameAr : item.nameEn;
  const tone = toneFor(item.quote?.changePct);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${item.ticker}`}
      onPress={() => openStock(item.ticker)}
      className="flex-row items-center gap-3 border-t border-border/60 py-2.5 active:opacity-70"
    >
      <Text
        numberOfLines={1}
        ellipsizeMode="tail"
        className="w-14 font-label text-[10px] tracking-[0.04em] text-text-muted"
      >
        {item.ticker}
      </Text>
      <Text
        numberOfLines={1}
        className="flex-1 font-body text-[12px] text-text-secondary"
      >
        {name}
      </Text>
      <Text className="w-16 text-end font-title text-[12px] text-text">
        {formatPrice(item.quote?.price)}
      </Text>
      <Text className={`w-16 text-end font-title text-[12px] ${tone.text}`}>
        {formatPercent(item.quote?.changePct)}
      </Text>
    </Pressable>
  );
}

function SectorStrip({ sectors }: { sectors: Sector[] }) {
  const locale = useLocaleStore((state) => state.locale);
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const aligned = useRef(false);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => {
        if (locale !== "ar" || aligned.current) {
          return;
        }

        aligned.current = true;
        // Yoga puts the first sector at the right edge, but the native scroll
        // view still starts at the left. Jump to the start so Finance leads.
        scrollRef.current?.scrollToEnd({ animated: false });
      }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 12,
        gap: 10,
      }}
    >
      {sectors.map((sector) => (
        <SectorChip key={sector.sector} sector={sector} />
      ))}
    </ScrollView>
  );
}

function SectorChip({ sector }: { sector: Sector }) {
  const { t } = useTranslation();
  const tone = toneFor(sector.changePct);

  return (
    <View className="w-40 rounded-2xl border border-border bg-surface p-4">
      <Text numberOfLines={1} className="font-title text-[12px] text-text">
        {t(`sectors.${sectorKey(sector.sector)}`)}
      </Text>
      <Text className={`mt-2 font-display text-[18px] ${tone.text}`}>
        {formatPercent(sector.changePct)}
      </Text>
      <Text className="mt-1 font-body text-[10px] text-text-muted">
        {t("markets.sectorBreadth", {
          up: sector.advancers,
          down: sector.decliners,
        })}
      </Text>
    </View>
  );
}

function InstrumentRow({
  item,
  locale,
  marketStale,
}: {
  item: Instrument;
  locale: Locale;
  marketStale: boolean;
}) {
  const { t } = useTranslation();
  const name = locale === "ar" && item.nameAr ? item.nameAr : item.nameEn;
  const quote = item.quote;
  const tone = toneFor(quote?.changePct);
  const sector = t(`sectors.${sectorKey(item.sector)}`);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${item.ticker}, ${formatPrice(
        quote?.price,
      )}, ${formatPercent(quote?.changePct)}`}
      onPress={() => openStock(item.ticker)}
      className="mx-5 mb-2 flex-row items-center rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-80"
    >
      <View className="h-10 w-10 items-center justify-center rounded-xl border border-gold/30 bg-surface-elevated">
        <Text
          numberOfLines={1}
          className="font-label text-[8px] tracking-[0.02em] text-gold"
        >
          {item.ticker.slice(0, 4)}
        </Text>
      </View>

      <View className="mx-3 flex-1">
        <Text numberOfLines={1} className="font-title text-[14px] text-text">
          {name}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-2">
          <Text className="font-label text-[9px] tracking-[0.06em] text-text-muted">
            {item.ticker}
          </Text>
          <Text
            numberOfLines={1}
            className="flex-1 font-body text-[11px] text-text-muted"
          >
            {sector}
          </Text>
        </View>
      </View>

      <View className="items-end">
        <Text className="font-title text-[15px] text-text">
          {formatPrice(quote?.price)}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          {quote?.stale && !marketStale ? (
            <View
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: colors.warning }}
            />
          ) : null}
          <Text className={`font-title text-[12px] ${tone.text}`}>
            {formatPercent(quote?.changePct)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

function StalePill({ label }: { label: string }) {
  return (
    <View className="flex-row items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1">
      <Ionicons name="time-outline" size={11} color={colors.warning} />
      <Text className="font-label text-[9px] uppercase tracking-[0.06em] text-warning">
        {label}
      </Text>
    </View>
  );
}

function ListEmpty({
  isPending,
  isError,
  onRetry,
}: {
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <View className="items-center justify-center py-12">
        <ActivityIndicator color={colors.gold} />
        <Text className="mt-3 font-body text-[13px] text-text-secondary">
          {t("markets.loading")}
        </Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View className="mx-5 items-center rounded-2xl border border-border bg-surface p-6">
        <Text className="text-center font-body text-[13px] text-text-secondary">
          {t("markets.listError")}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          className="mt-4 rounded-full border border-border px-4 py-2 active:opacity-80"
        >
          <Text className="font-title text-[12px] text-text">
            {t("common.retry")}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="mx-5 items-center rounded-2xl border border-border bg-surface p-6">
      <Text className="text-center font-body text-[13px] text-text-secondary">
        {t("markets.emptyBody")}
      </Text>
    </View>
  );
}

function ListFooter({
  isFetchingNextPage,
  hasNextPage,
  count,
}: {
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  count: number;
}) {
  const { t } = useTranslation();

  if (isFetchingNextPage) {
    return (
      <View className="items-center py-6">
        <ActivityIndicator color={colors.gold} />
      </View>
    );
  }

  if (!hasNextPage && count > 0) {
    return (
      <Text className="py-6 text-center font-body text-[11px] text-text-muted">
        {t("markets.endOfList")}
      </Text>
    );
  }

  return null;
}
