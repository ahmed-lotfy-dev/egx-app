import { Redirect } from "expo-router";

import { authClient } from "@/lib/auth-client";

export default function Index() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return null;
  }

  return <Redirect href={session ? "/(app)/(tabs)" : "/(auth)/sign-in"} />;
}