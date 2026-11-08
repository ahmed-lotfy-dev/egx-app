import { Redirect, Stack } from "expo-router";

import { colors } from "@/constants/theme";
import { authClient } from "@/lib/auth-client";

/**
 * Defence in depth: the API already answers 403 for non-admins, but a deep link
 * must not even render the admin screens. The Profile button is hidden for
 * everyone else, so this only fires for manually typed routes.
 */
export default function AdminLayout() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) {
    return null;
  }

  // `isAdmin` is a Better Auth additional field not present in the client types.
  const isAdmin = Boolean(
    (session?.user as { isAdmin?: boolean } | undefined)?.isAdmin,
  );

  if (!isAdmin) {
    return <Redirect href="/profile" />;
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
