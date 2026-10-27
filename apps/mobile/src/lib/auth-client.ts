import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: `${process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000"}/api/auth`,
  plugins: [
    expoClient({
      scheme: "ahmedlotfy-egx-app",
      storage: SecureStore,
      storagePrefix: "egx",
    }),
    emailOTPClient(),
  ],
});
