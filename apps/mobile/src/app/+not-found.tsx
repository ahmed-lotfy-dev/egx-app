import { useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Screen } from "@/components/Screen";

export default function NotFoundScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <Screen>
      <View className="flex-1 items-center justify-center gap-6 px-6">
        <Text className="font-display text-[48px] leading-[56px] text-text">
          404
        </Text>
        <Text className="max-w-[300px] text-center font-body text-[17px] leading-7 text-text-secondary">
          {t("common.notFound")}
        </Text>
        <Button label={t("common.goHome")} onPress={() => router.replace("/")} />
      </View>
    </Screen>
  );
}