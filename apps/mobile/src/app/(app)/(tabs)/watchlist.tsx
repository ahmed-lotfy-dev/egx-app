import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/Screen";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { formatPrice, formatPercent } from "@/lib/format";
import { useLocaleStore } from "@/stores/locale";
import type { paths } from "@/types/api";

type Watchlist =
  paths["/api/watchlists"]["get"]["responses"][200]["content"]["application/json"]["data"][number];

type WatchlistInstrument = Watchlist["instruments"][number];

type InstrumentSearchResult =
  paths["/api/instruments"]["get"]["responses"][200]["content"]["application/json"]["data"][number];

export default function WatchlistScreen() {
  const { t } = useTranslation();
  const locale = useLocaleStore((state) => state.locale);
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const signedIn = !!session?.user;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const query = useQuery({
    queryKey: ["watchlists"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/watchlists");
      if (error) throw new Error("Watchlists unavailable");
      return data;
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const lists = useMemo(() => query.data?.data ?? [], [query.data]);

  useEffect(() => {
    if (!selectedId && lists.length > 0) {
      setSelectedId(lists[0]?.id ?? null);
    }
  }, [lists, selectedId]);

  const selected = lists.find((l) => l.id === selectedId) ?? lists[0] ?? null;
  const instruments = selected?.instruments ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["watchlists"] });

  const createList = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await api.POST("/api/watchlists", { body: { name } });
      if (error) throw new Error("create failed");
    },
    onSuccess: async (_data, name) => {
      setCreateModalVisible(false);
      setNameInput("");
      await invalidate();
      const fresh = await queryClient.fetchQuery({
        queryKey: ["watchlists"],
        queryFn: async () => {
          const { data, error } = await api.GET("/api/watchlists");
          if (error) throw new Error("Watchlists unavailable");
          return data;
        },
      });
      const created = fresh.data.find((l) => l.name === name && l.kind === "custom");
      if (created) setSelectedId(created.id);
    },
    onError: () => {
      Alert.alert(t("watchlist.errorTitle"), t("watchlist.signinRequired"));
    },
  });

  const renameList = useMutation({
    mutationFn: async ({ id, name }: { id: string; name: string }) => {
      const numericId = Number(id.replace("custom:", ""));
      const { error } = await api.PATCH("/api/watchlists/{id}", {
        params: { path: { id: numericId } },
        body: { name },
      });
      if (error) throw new Error("rename failed");
    },
    onSuccess: () => {
      setRenameModalVisible(false);
      void invalidate();
    },
    onError: () => {
      Alert.alert(t("watchlist.errorTitle"), t("watchlist.signinRequired"));
    },
  });

  const deleteList = useMutation({
    mutationFn: async (id: string) => {
      const numericId = Number(id.replace("custom:", ""));
      const { error } = await api.DELETE("/api/watchlists/{id}", {
        params: { path: { id: numericId } },
      });
      if (error) throw new Error("delete failed");
    },
    onSuccess: () => {
      setSelectedId(null);
      void invalidate();
    },
    onError: () => {
      Alert.alert(t("watchlist.errorTitle"), t("watchlist.signinRequired"));
    },
  });

  const addItem = useMutation({
    mutationFn: async ({ id, ticker }: { id: string; ticker: string }) => {
      const numericId = Number(id.replace("custom:", ""));
      const { error } = await api.POST("/api/watchlists/{id}/items", {
        params: { path: { id: numericId } },
        body: { ticker },
      });
      if (error) throw new Error("add failed");
    },
    onSuccess: () => {
      setAddModalVisible(false);
      setSearchInput("");
      void invalidate();
    },
    onError: () => {
      Alert.alert(t("watchlist.errorTitle"), t("watchlist.signinRequired"));
    },
  });

  const removeItem = useMutation({
    mutationFn: async ({ id, ticker }: { id: string; ticker: string }) => {
      const numericId = Number(id.replace("custom:", ""));
      const { error } = await api.DELETE("/api/watchlists/{id}/items/{ticker}", {
        params: { path: { id: numericId, ticker } },
      });
      if (error) throw new Error("remove failed");
    },
    onSuccess: () => void invalidate(),
    onError: () => {
      Alert.alert(t("watchlist.errorTitle"), t("watchlist.signinRequired"));
    },
  });

  const searchResults = useQuery({
    queryKey: ["instrument-search", searchInput],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/instruments", {
        params: { query: { q: searchInput, kind: "stock", limit: 10 } },
      });
      if (error) throw new Error("search failed");
      return data;
    },
    enabled: addModalVisible && searchInput.trim().length >= 2,
  });

  const confirmDeleteList = (list: Watchlist) => {
    Alert.alert(t("watchlist.deleteTitle"), t("watchlist.deleteBody", { name: list.name }), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("watchlist.deleteConfirm"),
        style: "destructive",
        onPress: () => deleteList.mutate(list.id),
      },
    ]);
  };

  const renderInstrument = ({ item }: { item: WatchlistInstrument }) => (
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
            {item.sector ? (
              <>
                <Text className="font-body text-[12px] text-text-muted">·</Text>
                <Text className="font-body text-[12px] text-text-muted">{item.sector}</Text>
              </>
            ) : null}
          </View>
        </View>
        <View className="flex-row items-center gap-3">
          <View className="items-end">
            {item.quote ? (
              <>
                <Text
                  className={`font-display text-[22px] leading-7 ${item.quote.changePct !== null && item.quote.changePct > 0 ? "text-up" : item.quote.changePct !== null && item.quote.changePct < 0 ? "text-down" : "text-text"}`}
                >
                  {formatPrice(item.quote.price ?? 0)}
                </Text>
                {item.quote.changePct !== null ? (
                  <Text
                    className={`font-body text-[12px] ${item.quote.changePct > 0 ? "text-up" : item.quote.changePct < 0 ? "text-down" : "text-text-muted"}`}
                  >
                    {formatPercent(item.quote.changePct)}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text className="font-body text-[14px] text-text-muted">{t("watchlist.noQuote")}</Text>
            )}
          </View>
          {selected?.editable ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("watchlist.removeItem")}
              hitSlop={8}
              onPress={() => item.quote !== null && removeItem.mutate({ id: selected.id, ticker: item.ticker })}
              className="h-8 w-8 items-center justify-center rounded-full bg-surface-elevated"
            >
              <Ionicons name="close" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );

  const renderPill = (list: Watchlist) => {
    const active = selected?.id === list.id;
    return (
      <Pressable
        key={list.id}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => setSelectedId(list.id)}
        onLongPress={() => {
          if (list.editable) confirmDeleteList(list);
        }}
        className={`mr-2 rounded-full border px-4 py-2 active:opacity-80 ${active ? "border-gold bg-gold" : "border-border bg-surface"}`}
      >
        <Text className={`font-title text-[14px] ${active ? "text-background" : "text-text"}`}>
          {list.name}
        </Text>
      </Pressable>
    );
  };

  if (query.isPending) {
    return (
      <Screen>
        <Header />
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
        <Header />
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
        data={instruments}
        keyExtractor={(item) => item.ticker}
        renderItem={renderInstrument}
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
          <View>
            <View className="px-5 pb-3 pt-2">
              <Text className="font-display text-[28px] leading-9 text-text">{t("watchlist.title")}</Text>
            </View>
            {/* Telda-style pill tabs */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12, gap: 8 }}
            >
              {lists.map(renderPill)}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("watchlist.create")}
                onPress={() => {
                  if (!signedIn) {
                    Alert.alert(t("watchlist.errorTitle"), t("watchlist.signinRequired"));
                    return;
                  }
                  setNameInput("");
                  setCreateModalVisible(true);
                }}
                className="rounded-full border border-dashed border-border bg-surface px-4 py-2 active:opacity-80"
              >
                <Ionicons name="add" size={16} color={colors.gold} />
              </Pressable>
            </ScrollView>
            {selected ? (
              <View className="flex-row items-center justify-between px-5 pb-2">
                <View className="flex-row items-center gap-2">
                  <Text className="font-body text-[13px] text-text-muted">
                    {t("watchlist.instrumentCount", { count: selected.instrumentCount })}
                  </Text>
                  {selected.editable ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("watchlist.rename")}
                        hitSlop={8}
                        onPress={() => {
                          setNameInput(selected.name);
                          setRenameModalVisible(true);
                        }}
                        className="h-7 w-7 items-center justify-center rounded-full bg-surface-elevated"
                      >
                        <Ionicons name="pencil" size={14} color={colors.textMuted} />
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={t("watchlist.deleteTitle")}
                        hitSlop={8}
                        onPress={() => confirmDeleteList(selected)}
                        className="h-7 w-7 items-center justify-center rounded-full bg-surface-elevated"
                      >
                        <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                      </Pressable>
                    </>
                  ) : null}
                </View>
              </View>
            ) : null}
          </View>
        }
        ListFooterComponent={
          <>
            {selected?.editable ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  setSearchInput("");
                  setAddModalVisible(true);
                }}
                className="mx-5 mt-4 min-h-11 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-surface active:opacity-80"
              >
                <Ionicons name="add-circle-outline" size={18} color={colors.gold} />
                <Text className="font-title text-[14px] text-text">{t("watchlist.addStock")}</Text>
              </Pressable>
            ) : null}
            {instruments.length === 0 ? (
              <View className="pt-10 px-5">
                <Text className="text-center font-body text-[15px] leading-6 text-text-secondary">
                  {selected?.editable ? t("watchlist.emptyCustomList") : t("watchlist.emptyList")}
                </Text>
              </View>
            ) : (
              <View className="pb-10" />
            )}
          </>
        }
      />

      {/* Create list modal */}
      <NameModal
        visible={createModalVisible}
        title={t("watchlist.create")}
        placeholder={t("watchlist.namePlaceholder")}
        value={nameInput}
        onChangeText={setNameInput}
        confirmLabel={t("common.confirm")}
        pending={createList.isPending}
        onClose={() => setCreateModalVisible(false)}
        onConfirm={() => {
          const name = nameInput.trim();
          if (name.length > 0) createList.mutate(name);
        }}
      />

      {/* Rename list modal */}
      <NameModal
        visible={renameModalVisible}
        title={t("watchlist.rename")}
        placeholder={t("watchlist.namePlaceholder")}
        value={nameInput}
        onChangeText={setNameInput}
        confirmLabel={t("common.confirm")}
        pending={renameList.isPending}
        onClose={() => setRenameModalVisible(false)}
        onConfirm={() => {
          const name = nameInput.trim();
          if (name.length > 0 && selected) renameList.mutate({ id: selected.id, name });
        }}
      />

      {/* Add stock modal */}
      <Modal visible={addModalVisible} animationType="slide" onRequestClose={() => setAddModalVisible(false)}>
        <View className="flex-1 bg-background px-5 pt-14">
          <View className="flex-row items-center justify-between pb-4">
            <Text className="font-display text-[22px] text-text">{t("watchlist.addStock")}</Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => setAddModalVisible(false)}
              className="h-9 w-9 items-center justify-center rounded-full bg-surface"
            >
              <Ionicons name="close" size={18} color={colors.text} />
            </Pressable>
          </View>
          <View className="flex-row items-center gap-2 rounded-2xl border border-border bg-surface px-4 py-3">
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={searchInput}
              onChangeText={setSearchInput}
              placeholder={t("watchlist.searchPlaceholder")}
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              className="flex-1 font-body text-[15px] text-text"
            />
          </View>
          <FlatList
            data={(searchResults.data?.data as InstrumentSearchResult[] | undefined) ?? []}
            keyExtractor={(item) => String(item.ticker)}
            className="mt-3"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const instrument = item as InstrumentSearchResult & { nameAr?: string | null; nameEn?: string };
              const alreadyIn = instruments.some((i) => i.ticker === instrument.ticker);
              return (
                <Pressable
                  accessibilityRole="button"
                  disabled={alreadyIn}
                  onPress={() => selected && addItem.mutate({ id: selected.id, ticker: instrument.ticker })}
                  className="flex-row items-center justify-between border-b border-border/60 py-3 active:opacity-70"
                >
                  <View className="flex-1 min-w-0">
                    <Text className="font-title text-[15px] text-text" numberOfLines={1}>
                      {locale === "ar" && instrument.nameAr ? instrument.nameAr : instrument.nameEn}
                    </Text>
                    <Text className="mt-1 font-body text-[12px] text-text-muted">{instrument.ticker}</Text>
                  </View>
                  {alreadyIn ? (
                    <Ionicons name="checkmark" size={18} color={colors.gold} />
                  ) : (
                    <Ionicons name="add" size={18} color={colors.gold} />
                  )}
                </Pressable>
              );
            }}
            ListEmptyComponent={
              searchInput.trim().length >= 2 && !searchResults.isPending ? (
                <Text className="pt-6 text-center font-body text-[14px] text-text-muted">
                  {t("watchlist.noResults")}
                </Text>
              ) : undefined
            }
          />
        </View>
      </Modal>
    </Screen>
  );
}

function Header() {
  const { t } = useTranslation();
  return (
    <View className="px-5 pb-4 pt-2">
      <Text className="font-display text-[28px] leading-9 text-text">{t("watchlist.title")}</Text>
    </View>
  );
}

function NameModal({
  visible,
  title,
  placeholder,
  value,
  onChangeText,
  confirmLabel,
  pending,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  placeholder: string;
  value: string;
  onChangeText: (text: string) => void;
  confirmLabel: string;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 items-center justify-center bg-black/50 px-8">
        <View className="w-full rounded-2xl border border-border bg-surface p-5">
          <Text className="font-title text-[17px] text-text">{title}</Text>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor={colors.textMuted}
            autoFocus
            maxLength={60}
            className="mt-4 rounded-xl border border-border bg-surface-elevated px-4 py-3 font-body text-[15px] text-text"
          />
          <View className="mt-4 flex-row justify-end gap-3">
            <Pressable onPress={onClose} className="min-h-11 justify-center px-4">
              <Text className="font-title text-[14px] text-text-muted">{t("common.cancel")}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              disabled={pending || value.trim().length === 0}
              onPress={onConfirm}
              className="min-h-11 justify-center rounded-xl bg-gold px-5 disabled:opacity-50"
            >
              <Text className="font-title text-[14px] text-background">{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
