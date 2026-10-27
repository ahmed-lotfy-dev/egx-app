import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";

export default function AiScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <View className="px-5 pb-4 pt-2">
        <Text className="font-display text-[28px] leading-9 text-text">{t("ai.title")}</Text>
      </View>
      <EmptyState
        icon="sparkles-outline"
        title={t("ai.emptyTitle")}
        body={t("ai.emptyBody")}
        badge={t("common.comingSoon")}
      />
    </Screen>
  );
}
