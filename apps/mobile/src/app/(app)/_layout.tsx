import { Redirect, Stack } from "expo-router";

import { colors } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";

export default function AppLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}