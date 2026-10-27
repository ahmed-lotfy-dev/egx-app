import { Ionicons } from "@expo/vector-icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Constants from "expo-constants";
import { Alert, I18nManager, Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/Screen";
import { colors } from "@/constants/theme";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import type { Locale } from "@/lib/i18n";
import { useLocaleStore } from "@/stores/locale";

export default function ProfileScreen() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);

  const status = useQuery({
    queryKey: ["status"],
    queryFn: async () => {
      const { data, error } = await api.GET("/api/status");
      if (error) {
        throw new Error("Service unavailable");
      }
      return data;
    },
    refetchInterval: 30_000,
  });

  const email = session?.user.email ?? "";
  const displayName = session?.user.name?.trim() || email.split("@")[0] || "EGX";
  const initial = displayName.charAt(0).toUpperCase();
  const online = status.data?.database === "up";
  const statusLabel = status.isPending
    ? t("profile.checking")
    : online
      ? t("profile.connected")
      : t("profile.disconnected");

  async function changeLocale(next: Locale) {
    if (next === locale) {
      return;
    }

    await setLocale(next);

    const wantsRtl = next === "ar";
    if (!__DEV__ && wantsRtl !== I18nManager.isRTL) {
      Alert.alert(t("profile.restartTitle"), t("profile.restartBody"));
    }
  }

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
  }

  function confirmSignOut() {
    Alert.alert(t("profile.signOutTitle"), t("profile.signOutBody"), [
      { text: t("common.cancel"), style: "cancel" },
      { text: t("profile.signOut"), onPress: () => void signOut() },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
        <View className="px-5 pb-6 pt-2">
          <Text className="font-display text-[28px] leading-9 text-text">
            {t("profile.title")}
          </Text>
        </View>

        <View className="mx-5 rounded-3xl border border-border bg-surface p-5">
          <View className="flex-row items-center gap-4">
            <View className="h-14 w-14 items-center justify-center rounded-2xl border border-gold/40 bg-surface-elevated">
              <Text className="font-display text-[22px] text-gold">{initial}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-title text-[17px] text-text">{displayName}</Text>
              <Text className="mt-1 font-body text-[13px] text-text-secondary">{email}</Text>
            </View>
          </View>
        </View>

        <View className="mt-6 px-5">
          <Text className="font-label text-[10px] uppercase tracking-[0.08em] text-text-muted">
            {t("profile.language")}
          </Text>

          <View className="mt-3 flex-row rounded-2xl border border-border bg-surface p-1">
            {(["ar", "en"] as const).map((value) => {
              const selected = locale === value;

              return (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => void changeLocale(value)}
                  className={`flex-1 items-center rounded-xl py-3 active:opacity-80 ${selected ? "bg-surface-elevated" : ""}`}
                >
                  <Text
                    className={`font-title text-[14px] ${selected ? "text-gold" : "text-text-secondary"}`}
                  >
                    {value === "ar" ? t("profile.arabic") : t("profile.english")}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text className="mt-2 font-body text-[12px] text-text-muted">
            {t("profile.languageNote")}
          </Text>
        </View>

        <View className="mt-6 px-5">
          <Text className="font-label text-[10px] uppercase tracking-[0.08em] text-text-muted">
            {t("profile.service")}
          </Text>

          <View className="mt-3 flex-row items-center justify-between rounded-2xl border border-border bg-surface px-4 py-4">
            <View className="flex-row items-center gap-3">
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: online ? colors.gold : colors.warning }}
              />
              <Text className="font-body text-[14px] text-text">{statusLabel}</Text>
            </View>
            <Ionicons name="server-outline" size={18} color={colors.textMuted} />
          </View>
        </View>

        <View className="mt-8 px-5">
          <Pressable
            accessibilityRole="button"
            onPress={confirmSignOut}
            className="min-h-12 flex-row items-center justify-center gap-2 rounded-2xl border border-border bg-surface active:opacity-80"
          >
            <Ionicons name="log-out-outline" size={18} color={colors.textSecondary} />
            <Text className="font-title text-[14px] text-text-secondary">
              {t("profile.signOut")}
            </Text>
          </Pressable>

          <Text className="mt-6 text-center font-body text-[12px] text-text-muted">
            {t("profile.version", { version: Constants.expoConfig?.version ?? "0.1.0" })}
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}
