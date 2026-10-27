import { Ionicons } from "@expo/vector-icons";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/theme";

export default function MarketsScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
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

      <EmptyState
        icon="stats-chart-outline"
        title={t("markets.emptyTitle")}
        body={t("markets.emptyBody")}
        badge={t("markets.emptyBadge")}
      />
    </Screen>
  );
}
