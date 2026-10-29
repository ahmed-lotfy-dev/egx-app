import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { router } from "expo-router";
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

const LIST_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  egx30: "trending-up",
  egx70: "trending-up",
  ewi: "grid",
  egx33_sharia: "shield-checkmark",
  default: "list",
};

export default function WatchlistScreen() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const [refreshing, setRefreshing] = useState(false);

  const query = useQuery({
    queryKey: ["watchlists", "predefined"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/watchlists/predefined");
      if (error) throw new Error("Watchlists unavailable");
      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const lists = query.data?.data ?? [];
  const indexLists = lists.filter((l) => l.type === "index" || l.type === "sharia");
  const sectorLists = lists.filter((l) => l.type === "sector");

  const renderList = ({ item }: { item: PredefinedWatchlist }) => (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/(app)/watchlist/[listId]", params: { listId: item.id } })}
      className="mx-5 my-2 rounded-2xl border border-border bg-surface p-4 active:opacity-80 flex-row items-center gap-4"
    >
      <View className="h-12 w-12 rounded-xl items-center justify-center bg-surface-elevated">
        <Ionicons
          name={LIST_ICONS[item.id] ?? LIST_ICONS.default}
          size={24}
          color={colors.gold}
        />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="font-title text-[16px] text-text" numberOfLines={1}>
          {locale === "ar" ? item.nameAr : item.nameEn}
        </Text>
        <Text className="mt-1 font-body text-[13px] text-text-muted">
          {t("watchlist.instrumentCount", { count: item.instrumentCount })}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
    </Pressable>
  );

  if (query.isPending) {
    return (
      <Screen>
        <View className="px-5 pb-4 pt-2">
          <Text className="font-display text-[28px] leading-9 text-text">{t("watchlist.title")}</Text>
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
          <Text className="font-display text-[28px] leading-9 text-text">{t("watchlist.title")}</Text>
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

  return (
    <Screen>
      <FlatList
        data={indexLists.length > 0 ? [{ section: "index", title: t("watchlist.indicesTitle"), lists: indexLists }, { section: "sector", title: t("watchlist.sectorsTitle"), lists: sectorLists }] : []}
        keyExtractor={(_, index) => `section-${index}`}
        renderItem={({ item }) => (
          <View className="px-5">
            <Text className="font-title text-[15px] text-text mt-4 mb-2">{item.title}</Text>
            <FlatList
              data={item.lists}
              keyExtractor={(l) => l.id}
              renderItem={renderList}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}
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
          <View className="px-5 pb-4 pt-2">
            <Text className="font-display text-[28px] leading-9 text-text">{t("watchlist.title")}</Text>
          </View>
        }
        ListFooterComponent={
          lists.length === 0 ? (
            <View className="pt-10">
              <Text className="text-center font-body text-[15px] leading-6 text-text-secondary px-8">
                {t("watchlist.empty")}
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

// React import missing
import { useState } from "react";