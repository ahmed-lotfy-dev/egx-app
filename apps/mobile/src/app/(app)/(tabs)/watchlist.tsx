import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";

export default function WatchlistScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <View className="px-5 pb-4 pt-2">
        <Text className="font-display text-[28px] leading-9 text-text">
          {t("stocks.title")}
        </Text>
      </View>
      <EmptyState
        icon="bookmark-outline"
        title={t("stocks.emptyTitle")}
        body={t("stocks.emptyBody")}
        badge={t("common.comingSoon")}
      />
    </Screen>
  );
}
