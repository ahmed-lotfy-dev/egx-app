import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import { EmptyState } from "@/components/EmptyState";
import { Screen } from "@/components/Screen";
import { ScreenHeader } from "@/components/ScreenHeader";

export default function AiScreen() {
  const { t } = useTranslation();

  return (
    <Screen>
      <ScreenHeader title={t("ai.title")} />
      <EmptyState
        icon="sparkles-outline"
        title={t("ai.emptyTitle")}
        body={t("ai.emptyBody")}
        badge={t("common.comingSoon")}
      />
    </Screen>
  );
}
