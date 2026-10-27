import { Stack } from "expo-router";

import { colors } from "@/constants/theme";

export default function AiLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}
