import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

export const authClient = createAuthClient({
  baseURL: `${process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000"}/api/auth`,
  plugins: [
    expoClient({
      scheme: "egx",
      storage: SecureStore,
      storagePrefix: "egx",
    }),
    emailOTPClient(),
  ],
});
