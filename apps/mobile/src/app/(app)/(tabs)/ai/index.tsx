import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";
import { colors } from "@/constants/theme";

const CAPABILITIES = [
  { icon: "search-outline", key: "ai.capSearch" },
  { icon: "newspaper-outline", key: "ai.capNews" },
  { icon: "stats-chart-outline", key: "ai.capFundamentals" },
] as const;

export default function AiScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <ScreenHeader title={t("ai.title")} />

      <View className="flex-1 px-5">
        <View className="mt-2 rounded-3xl border border-gold/25 bg-surface p-5">
          <View className="flex-row items-center gap-2">
            <Ionicons name="sparkles" size={16} color={colors.gold} />
            <Text className="font-title text-[15px] text-gold">
              {t("ai.capTitle")}
            </Text>
          </View>

          <Text className="mt-2 font-body text-[13px] leading-6 text-text-secondary">
            {t("ai.emptyBody")}
          </Text>

          <View className="mt-4 gap-3">
            {CAPABILITIES.map((capability) => (
              <View key={capability.key} className="flex-row items-center gap-3">
                <View className="h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface-elevated">
                  <Ionicons
                    name={capability.icon}
                    size={15}
                    color={colors.textSecondary}
                  />
                </View>
                <Text className="flex-1 font-body text-[13px] text-text">
                  {t(capability.key)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View className="flex-1 items-center justify-center gap-4 py-10">
          <View className="h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface">
            <Ionicons name="sparkles-outline" size={24} color={colors.gold} />
          </View>
          <Text className="font-title text-[17px] text-text">
            {t("ai.emptyTitle")}
          </Text>
          <View className="rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5">
            <Text className="font-label text-[11px] text-gold">
              {t("common.comingSoon")}
            </Text>
          </View>
        </View>
      </View>
    </Screen>
  );
}
