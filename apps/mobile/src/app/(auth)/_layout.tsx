import { Redirect, Stack } from "expo-router";

import { colors } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";

export default function AuthLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return null;
  }

  if (session) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    />
  );
}