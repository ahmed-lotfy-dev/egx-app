import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
import { useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/Screen";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";
import { formatPrice, formatPercent } from "@/lib/format";
import { useLocaleStore } from "@/stores/locale";
import type { paths } from "@/types/api";

type PredefinedWatchlist =
  paths["/api/watchlists/predefined"]["get"]["responses"][200]["content"]["application/json"]["data"][number];

type Instrument =
  paths["/api/watchlists/predefined"]["get"]["responses"][200]["content"]["application/json"]["data"][number]["instruments"][number];

export default function PredefinedWatchlistScreen() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const { listId } = useLocalSearchParams<{ listId: string }>();
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ["watchlist", "predefined", listId],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/watchlists/predefined");
      if (error) throw new Error("Watchlist unavailable");
      const list = data.data.find((l) => l.id === listId);
      if (!list) throw new Error("List not found");
      return list;
    },
    enabled: !!listId,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const list = query.data;
  const instruments = list?.instruments ?? [];

  const renderItem = ({ item }: { item: Instrument }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.nameEn ?? item.nameAr}, ${item.ticker}`}
      onPress={() => router.push({ pathname: "/(app)/stock/[ticker]", params: { ticker: item.ticker } })}
      className="mx-5 border-t border-border/60 py-3 active:opacity-70"
    >
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 min-w-0">
          <Text className="font-title text-[16px] text-text" numberOfLines={1}>
            {locale === "ar" && item.nameAr ? item.nameAr : item.nameEn}
          </Text>
          <View className="mt-1 flex-row items-center gap-2">
            <Text className="font-body text-[12px] text-text-muted">{item.ticker}</Text>
            {item.sector && (
              <>
                <Text className="font-body text-[12px] text-text-muted">·</Text>
                <Text className="font-body text-[12px] text-text-muted">{item.sector}</Text>
              </>
            )}
          </View>
        </View>
        <View className="items-end">
          {item.quote ? (
            <>
              <Text
                className={`font-display text-[22px] leading-7 ${item.quote.changePct !== null && item.quote.changePct > 0 ? "text-up" : item.quote.changePct !== null && item.quote.changePct < 0 ? "text-down" : "text-text"}`}
              >
                {formatPrice(item.quote.price ?? 0)}
              </Text>
              {item.quote.changePct !== null && (
                <Text
                  className={`font-body text-[12px] ${item.quote.changePct > 0 ? "text-up" : item.quote.changePct < 0 ? "text-down" : "text-text-muted"}`}
                >
                  {formatPercent(item.quote.changePct)}
                </Text>
              )}
            </>
          ) : (
            <Text className="font-body text-[14px] text-text-muted">{t("watchlist.noQuote")}</Text>
          )}
        </View>
      </View>
    </Pressable>
  );

  if (query.isPending) {
    return (
      <Screen>
        <View className="px-5 pb-4 pt-2">
          <Text className="font-display text-[28px] leading-9 text-text">
            {list?.id ? (locale === "ar" ? "قائمة" : "List") : "..."}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center">
          <View className="h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
            <Ionicons name="list-outline" size={28} color={colors.gold} />
          </View>
        </View>
      </Screen>
    );
  }

  if (query.isError) {
    return (
      <Screen>
        <View className="px-5 pb-4 pt-2">
          <Text className="font-display text-[28px] leading-9 text-text">
            {list?.id ? (locale === "ar" ? "قائمة" : "List") : "..."}
          </Text>
        </View>
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
            <Ionicons name="cloud-offline-outline" size={28} color={colors.gold} />
          </View>
          <Text className="mt-5 text-center font-title text-[19px] text-text">
            {t("watchlist.loadErrorTitle")}
          </Text>
          <Text className="mt-2 max-w-[300px] text-center font-body text-[15px] leading-6 text-text-secondary">
            {t("watchlist.loadErrorBody")}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void query.refetch()}
            className="mt-6 min-h-11 items-center justify-center rounded-2xl border border-border bg-surface px-5 active:opacity-80"
          >
            <Text className="font-title text-[14px] text-text">{t("common.retry")}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  if (!list) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8">
          <Text className="font-title text-[19px] text-text">{t("watchlist.notFound")}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={instruments}
        keyExtractor={(item) => item.ticker}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await query.refetch();
              setRefreshing(false);
            }}
            tintColor={colors.gold}
          />
        }
        ListHeaderComponent={
          <View className="px-5 pb-4 pt-2 flex-row items-center justify-between">
            <View>
              <Text className="font-label text-[10px] uppercase tracking-[0.18em] text-gold">
                {t("watchlist.predefined")}
              </Text>
              <Text className="mt-1 font-display text-[28px] leading-9 text-text">
                {locale === "ar" ? list.nameAr : list.nameEn}
              </Text>
            </View>
            <View className="flex-row items-center gap-2">
              <Text className="font-body text-[13px] text-text-muted">
                {t("watchlist.instrumentCount", { count: list.instrumentCount })}
              </Text>
            </View>
          </View>
        }
        ListFooterComponent={
          instruments.length === 0 ? (
            <View className="pt-10 px-5">
              <Text className="text-center font-body text-[15px] leading-6 text-text-secondary">
                {t("watchlist.emptyList")}
              </Text>
            </View>
          ) : (
            <View className="pb-10" />
          )
        }
      />
    </Screen>
  );
}

import { useState } from "react";