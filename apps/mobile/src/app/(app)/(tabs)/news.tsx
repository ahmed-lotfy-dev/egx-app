import { Ionicons } from "@expo/vector-icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import { useRef, useState, type ReactNode } from "react";import {
  FlatList,
  Pressable,
  RefreshControl,
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

export default function NewsScreen() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const [feed, setFeed] = useState<NewsFeed>("market");

  const query = useInfiniteQuery({
    queryKey: ["news", feed],
    queryFn: async ({ pageParam }) => {
      const { data, error } = await api.GET("/api/news", {
        params: {
          query: {
            feed,
            limit: 20,
            cursor: pageParam ?? undefined,
          },
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
  const refreshing = query.isRefetching && !query.isFetchingNextPage;

  return (
    <Screen>
      <FlatList
        data={items}
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
            refreshing={refreshing}
            onRefresh={() => void query.refetch()}
            tintColor={colors.gold}
          />
        }
        ListHeaderComponent={
          <View className="px-5 pb-4 pt-2">
            <Text className="font-display text-[28px] leading-9 text-text">
              {t("newsTab.title")}
            </Text>
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
          </View>
        }
        ListFooterComponent={
          <ListFooter
            feed={feed}
            isPending={query.isPending}
            isError={query.isError}
            isEmpty={!query.isPending && items.length === 0}
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
  const source =
    item.source === "google-news"
      ? "newsTab.sourceGoogleNews"
      : "newsTab.sourceArabFinance";

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={item.title}
      onPress={() => {
        void openArticle(item.url, openingRef);
      }}
      className="mx-5 mt-2 rounded-3xl border border-border bg-surface p-4 active:opacity-80"
    >
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 font-body text-[11px] text-text-muted" numberOfLines={1}>
          {t(source)}
          <Text> · </Text>
          {formatRelativeTime(item.publishedAt, locale)}
        </Text>
        {item.category ? (
          <View className="rounded-full border border-border bg-surface-elevated px-2 py-0.5">
            <Text className="font-body text-[10px] text-text-muted" numberOfLines={1}>
              {item.category}
            </Text>
          </View>
        ) : null}
        <Ionicons name="open-outline" size={14} color={colors.textMuted} />
      </View>
      <Text
        className="mt-2 font-title text-[15px] leading-6 text-text"
        numberOfLines={2}
      >
        {item.title}
      </Text>
      {item.summary && item.summary !== item.title ? (
        <Text
          className="mt-1 font-body text-[13px] leading-5 text-text-secondary"
          numberOfLines={2}
        >
          {item.summary}
        </Text>
      ) : null}
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
