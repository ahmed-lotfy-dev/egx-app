import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState, type ReactNode } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";
import { formatRelativeTime } from "@/lib/format";
import { useLocaleStore } from "@/stores/locale";
import type { paths } from "@/types/api";

type NewsFeedResponse =
  paths["/api/news"]["get"]["responses"][200]["content"]["application/json"];
type FeedItem = NewsFeedResponse["data"][number];
type NewsFeed = "market" | "economy";

const FEEDS = ["market", "economy"] as const;

const REGIONS = [
  { id: "all", labelKey: "newsTab.filterAllRegions" },
  { id: "egypt", labelKey: "newsTab.filterEgypt" },
  { id: "saudi", labelKey: "newsTab.filterSaudi" },
  { id: "global", labelKey: "newsTab.filterGlobal" },
  { id: "mena", labelKey: "newsTab.filterMena" },
  { id: "gcc", labelKey: "newsTab.filterGcc" },
] as const;

const SENTIMENTS = [
  { id: "all", labelKey: "newsTab.filterAllSentiments" },
  { id: "bullish", labelKey: "newsTab.filterBullish", color: "up" },
  { id: "bearish", labelKey: "newsTab.filterBearish", color: "down" },
  { id: "neutral", labelKey: "newsTab.filterNeutral", color: "textMuted" },
  { id: "mixed", labelKey: "newsTab.filterMixed", color: "gold" },
] as const;

const IMPACT_LEVELS = [
  { id: "all", labelKey: "newsTab.filterAllImpact" },
  { id: "critical", labelKey: "newsTab.filterCritical", color: "down" },
  { id: "high", labelKey: "newsTab.filterHigh", color: "down" },
  { id: "medium", labelKey: "newsTab.filterMedium", color: "gold" },
  { id: "low", labelKey: "newsTab.filterLow", color: "textMuted" },
] as const;

type FilterState = {
  region: "all" | "egypt" | "saudi" | "global" | "mena" | "gcc";
  sentiment: "all" | "bullish" | "bearish" | "neutral" | "mixed";
  impactLevel: "all" | "critical" | "high" | "medium" | "low";
  hasAI: boolean;
};

export default function NewsScreen() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const [feed, setFeed] = useState<NewsFeed>("market");
  const [filters, setFilters] = useState<FilterState>({
  region: "all",
  sentiment: "all",
  impactLevel: "all",
  hasAI: false,
});
  const [showFilters, setShowFilters] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const buildQuery = (pageParam?: string) => ({
    feed,
    limit: 20,
    cursor: pageParam,
    region: filters.region !== "all" ? filters.region : undefined,
    sentiment: filters.sentiment !== "all" ? filters.sentiment : undefined,
    impactLevel: filters.impactLevel !== "all" ? filters.impactLevel : undefined,
    hasAI: filters.hasAI || undefined,
  });

  const query = useInfiniteQuery({
    queryKey: ["news", feed, filters],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.GET("/api/news", {
        params: {
          query: buildQuery(pageParam),
        },
      });

      if (error) {
        throw new Error("News feed unavailable");
      }

      return data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const isRefreshing = query.isRefetching && !query.isFetchingNextPage;

  const handleFilterChange = (key: keyof FilterState, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const toggleHasAI = () => {
    setFilters((prev) => ({ ...prev, hasAI: !prev.hasAI }));
  };

  const clearFilters = () => {
    setFilters({ region: "all", sentiment: "all", impactLevel: "all", hasAI: false });
  };

  const hasActiveFilters =
    filters.region !== "all" ||
    filters.sentiment !== "all" ||
    filters.impactLevel !== "all" ||
    filters.hasAI;

  return (
    <Screen>
      <FlatList
        data={query.data?.pages.flatMap((page) => page.data) ?? []}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <NewsCard item={item} locale={locale} />}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage();
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing || refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await query.refetch();
              setRefreshing(false);
            }}
            tintColor={colors.gold}
          />
        }
        ListHeaderComponent={
          <View className="px-5 pb-4 pt-2">
            <Text className="font-display text-[28px] leading-9 text-text">
              {t("newsTab.title")}
            </Text>

            {/* Main segmented control: Market / Economy */}
            <View className="mt-3 self-start flex-row rounded-full border border-border bg-canvas p-1">
              {FEEDS.map((tab) => {
                const selected = feed === tab;
                return (
                  <Pressable
                    key={tab}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    onPress={() => setFeed(tab)}
                    className={`rounded-full px-4 py-1.5 active:opacity-80 ${selected ? "bg-surface-elevated" : ""}`}
                  >
                    <Text
                      className={`font-title text-[13px] ${selected ? "text-gold" : "text-text-muted"}`}
                    >
                      {t(`newsTab.${tab}Tab`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Filter button row */}
            <View className="mt-3 flex-row items-center gap-2">
              <Pressable
                onPress={() => setShowFilters(!showFilters)}
                className={`rounded-full px-4 py-1.5 active:opacity-80 ${showFilters ? "bg-surface-elevated" : "bg-canvas border border-border"}`}
              >
                <View className="flex-row items-center gap-1.5">
                  <Ionicons name="funnel-outline" size={16} color={colors.gold} />
                  <Text className="font-title text-[12px] text-text">
                    {t("newsTab.filters")}
                  </Text>
                  {hasActiveFilters && (
                    <View className="h-4 w-4 rounded-full bg-gold" />
                  )}
                </View>
              </Pressable>

              {hasActiveFilters && (
                <Pressable
                  onPress={clearFilters}
                  className="rounded-full px-3 py-1.5 active:opacity-80 bg-canvas border border-border"
                >
                  <Text className="font-title text-[11px] text-text-muted">
                    {t("newsTab.clearFilters")}
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Expanded filter chips */}
            {showFilters && (
              <View className="mt-3">
                <FilterChipGroup
                  label={t("newsTab.filterRegion")}
                  options={REGIONS}
                  value={filters.region}
                  onChange={(v) => handleFilterChange("region", v)}
                />
                <FilterChipGroup
                  label={t("newsTab.filterSentiment")}
                  options={SENTIMENTS}
                  value={filters.sentiment}
                  onChange={(v) => handleFilterChange("sentiment", v)}
                />
                <FilterChipGroup
                  label={t("newsTab.filterImpact")}
                  options={IMPACT_LEVELS}
                  value={filters.impactLevel}
                  onChange={(v) => handleFilterChange("impactLevel", v)}
                />
                <View className="flex-row items-center gap-3 mt-2">
                  <Text className="font-body text-[12px] text-text-muted">{t("newsTab.filterHasAI")}</Text>
                  <Pressable
                    onPress={toggleHasAI}
                    className={`rounded-full px-4 py-1.5 active:opacity-80 ${filters.hasAI ? "bg-surface-elevated border border-gold" : "bg-canvas border border-border"}`}
                  >
                    <Text className={`font-title text-[12px] ${filters.hasAI ? "text-gold" : "text-text-muted"}`}>
                      {filters.hasAI ? t("newsTab.filterHasAIOn") : t("newsTab.filterHasAIOff")}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        }
        ListFooterComponent={
          <ListFooter
            feed={feed}
            isPending={query.isPending}
            isError={query.isError}
            isEmpty={!query.isPending && query.data?.pages.flatMap((page) => page.data).length === 0}
            hasMore={query.hasNextPage ?? false}
            isFetchingMore={query.isFetchingNextPage}
            onRetry={() => void query.refetch()}
            onEndOfList={t("newsTab.endOfList")}
          />
        }
      />
    </Screen>
  );
}

function FilterChipGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ id: string; labelKey: string; color?: string }>;
  value: string;
  onChange: (v: string) => void;
}): ReactNode {
  const { t } = useTranslation();

  return (
    <View className="mt-2">
      <Text className="font-body text-[12px] text-text-muted mb-2">{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="gap-2">
        {options.map((opt) => {
          const selected = value === opt.id;
          const colorClass = opt.color
            ? selected
              ? "bg-gold/10 border-gold"
              : "bg-canvas border-border"
            : selected
            ? "bg-surface-elevated border-gold"
            : "bg-canvas border-border";

          return (
            <Pressable
              key={opt.id}
              onPress={() => onChange(opt.id)}
              className={`rounded-full px-3 py-1.5 active:opacity-80 ${colorClass}`}
            >
              <Text
                className={`font-title text-[12px] ${selected ? "text-gold" : "text-text-muted"}`}
              >
                {t(opt.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function ListFooter({
  feed,
  isPending,
  isError,
  isEmpty,
  hasMore,
  isFetchingMore,
  onRetry,
  onEndOfList,
}: {
  feed: NewsFeed;
  isPending: boolean;
  isError: boolean;
  isEmpty: boolean;
  hasMore: boolean;
  isFetchingMore: boolean;
  onRetry: () => void;
  onEndOfList: string;
}): ReactNode {
  const { t } = useTranslation();

  if (isPending) {
    return (
      <View className="px-5">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="px-5">
        <View className="rounded-3xl border border-border bg-surface p-5">
          <View className="h-12 w-12 items-center justify-center rounded-xl border border-border bg-surface-elevated">
            <Ionicons name="cloud-offline-outline" size={22} color={colors.gold} />
          </View>
          <Text className="mt-4 font-title text-[17px] text-text">
            {t("newsTab.errorTitle")}
          </Text>
          <Text className="mt-1 font-body text-[13px] leading-5 text-text-secondary">
            {t("newsTab.errorBody")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            className="mt-4 min-h-11 items-center justify-center rounded-2xl border border-border bg-surface-elevated px-5 active:opacity-80"
          >
            <Text className="font-title text-[14px] text-text">
              {t("common.retry")}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (isEmpty) {
    return (
      <View className="pt-10">
        <EmptyState
          icon="newspaper-outline"
          title={t(
            feed === "market"
              ? "newsTab.emptyMarketTitle"
              : "newsTab.emptyEconomyTitle",
          )}
          body={t(
            feed === "market"
              ? "newsTab.emptyMarketBody"
              : "newsTab.emptyEconomyBody",
          )}
        />
      </View>
    );
  }

  if (isFetchingMore) {
    return (
      <View className="px-5">
        <SkeletonCard />
      </View>
    );
  }

  if (!hasMore) {
    return (
      <Text className="py-6 text-center font-body text-[13px] text-text-muted">
        {onEndOfList}
      </Text>
    );
  }

  return null;
}

function NewsCard({ item, locale }: { item: FeedItem; locale: "ar" | "en" }) {
  const { t } = useTranslation();
  const openingRef = useRef(false);

  const sourceLabel =
    item.source === "google-news"
      ? "newsTab.sourceGoogleNews"
      : item.source === "arabfinance"
      ? "newsTab.sourceArabFinance"
      : item.source;

  const displayTitle = locale === "ar" && item.translatedTitle ? item.translatedTitle : item.title;
  const displaySummary = locale === "ar" && item.translatedSummary
    ? item.translatedSummary
    : item.summary && item.summary !== item.title
      ? item.summary
      : null;

  const sentimentColor = item.sentiment === "bullish"
    ? colors.up
    : item.sentiment === "bearish"
    ? colors.down
    : item.sentiment === "mixed"
    ? colors.gold
    : colors.textMuted;

  const impactColor = item.impactLevel === "critical" || item.impactLevel === "high"
    ? colors.down
    : item.impactLevel === "medium"
    ? colors.gold
    : colors.textMuted;

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={displayTitle}
      onPress={() => {
        void openArticle(item.url, openingRef);
      }}
      className="mx-5 mt-2 rounded-3xl border border-border bg-surface p-4 active:opacity-80"
    >
      {/* Header: source, time, region, AI badge */}
      <View className="flex-row items-center gap-2 mb-2">
        <Text className="flex-1 font-body text-[11px] text-text-muted" numberOfLines={1}>
          {t(sourceLabel)}
          <Text> · </Text>
          {formatRelativeTime(item.publishedAt, locale)}
        </Text>
        {item.sourceRegion && (
          <View className="rounded-full border border-border bg-surface-elevated px-2 py-0.5">
            <Text className="font-body text-[10px] text-text-muted" numberOfLines={1}>
              {item.sourceRegion === "egypt" ? "🇪🇬" : item.sourceRegion === "saudi" ? "🇸🇦" : "🌍"} {item.sourceRegion}
            </Text>
          </View>
        )}
        {item.aiSummary && (
          <View className="rounded-full bg-gold/10 border border-gold/30 px-2 py-0.5">
            <View className="flex-row items-center gap-1">
              <Ionicons name="sparkles" size={10} color={colors.gold} />
              <Text className="font-body text-[10px] text-gold">
                {t("newsTab.aiBadge")}
              </Text>
            </View>
          </View>
        )}
        <Ionicons name="open-outline" size={14} color={colors.textMuted} />
      </View>

      {/* Title */}
      <Text
        className="font-title text-[15px] leading-6 text-text"
        numberOfLines={3}
      >
        {displayTitle}
      </Text>

      {/* AI Summary */}
      {item.aiSummary && (
        <View className="mt-3 p-3 rounded-xl bg-gold/5 border border-gold/20">
          <View className="flex-row items-center gap-1.5 mb-1">
            <Ionicons name="sparkles" size={12} color={colors.gold} />
            <Text className="font-title text-[12px] text-gold">{t("newsTab.aiSummary")}</Text>
          </View>
          <Text className="font-body text-[13px] leading-5 text-text" numberOfLines={4}>
            {item.aiSummary}
          </Text>
          {item.aiKeyPoints && item.aiKeyPoints.length > 0 && (
            <View className="mt-2 space-y-1">
              {item.aiKeyPoints.slice(0, 3).map((point, idx) => (
                <View key={idx} className="flex-row items-start gap-1.5">
                  <Text className="font-body text-[12px] text-gold">•</Text>
                  <Text className="font-body text-[12px] text-text-secondary flex-1">{point}</Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

      {/* Summary (original) */}
      {displaySummary && !item.aiSummary && (
        <Text
          className="mt-1 font-body text-[13px] leading-5 text-text-secondary"
          numberOfLines={2}
        >
          {displaySummary}
        </Text>
      )}

      {/* Badges row: sentiment, impact, trading signals */}
      <View className="mt-3 flex-row items-center gap-2 flex-wrap">
        {item.sentiment && (
          <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: `${sentimentColor}15`, borderColor: `${sentimentColor}40` }}>
            <Ionicons
              name={
                item.sentiment === "bullish" ? "trending-up" :
                item.sentiment === "bearish" ? "trending-down" :
                item.sentiment === "mixed" ? "swap-horizontal" : "remove"
              }
              size={10}
              color={sentimentColor}
            />
            <Text className="font-body text-[10px]" style={{ color: sentimentColor }}>
              {t(`newsTab.sentiment.${item.sentiment}`)}
            </Text>
          </View>
        )}
        {item.impactLevel && (
          <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: `${impactColor}15`, borderColor: `${impactColor}40` }}>
            <Ionicons
              name={item.impactLevel === "critical" ? "alert-circle" : item.impactLevel === "high" ? "trending-up" : "remove"}
              size={10}
              color={impactColor}
            />
            <Text className="font-body text-[10px]" style={{ color: impactColor }}>
              {t(`newsTab.impact.${item.impactLevel}`)}
            </Text>
          </View>
        )}
        {item.entities?.tickers && item.entities.tickers.length > 0 && (
          <View className="rounded-full border border-border bg-surface-elevated px-2 py-0.5">
            <Text className="font-body text-[10px] text-text-muted" numberOfLines={1}>
              {item.entities.tickers.slice(0, 3).join(", ")}
              {item.entities.tickers.length > 3 && "…"}
            </Text>
          </View>
        )}
        {item.tradingSignals && item.tradingSignals.length > 0 && (
          <View className="rounded-full bg-gold/10 border border-gold/30 px-2 py-0.5">
            <Text className="font-body text-[10px] text-gold">
              {item.tradingSignals.slice(0, 2).map((s) => t(`newsTab.signal.${s}`)).join(", ")}
            </Text>
          </View>
        )}
      </View>

      {/* Category chip */}
      {item.category && (
        <View className="mt-2">
          <View className="rounded-full border border-border bg-surface-elevated px-2 py-0.5">
            <Text className="font-body text-[10px] text-text-muted" numberOfLines={1}>
              {item.category}
            </Text>
          </View>
        </View>
      )}
    </Pressable>
  );
}

async function openArticle(url: string, openingRef: { current: boolean }) {
  if (openingRef.current) {
    return;
  }

  openingRef.current = true;

  try {
    await WebBrowser.openBrowserAsync(url);
  } finally {
    openingRef.current = false;
  }
}

function SkeletonCard({
  className = "mt-2",
}: {
  className?: string;
}) {
  return (
    <View className={`rounded-3xl border border-border bg-surface p-4 ${className}`}>
      <View className="h-2.5 w-24 rounded-full bg-surface-elevated" />
      <View className="mt-3 h-3.5 w-full rounded-full bg-surface-elevated" />
      <View className="mt-2 h-3.5 w-2/3 rounded-full bg-surface-elevated" />
    </View>
  );
}