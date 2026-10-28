import { expoClient } from "@better-auth/expo/client";
import { createAuthClient } from "better-auth/react";
import { emailOTPClient } from "better-auth/client/plugins";
import * as SecureStore from "expo-secure-store";

import { apiBaseUrl } from "@/lib/config";

export const authClient = createAuthClient({
  baseURL: `${apiBaseUrl}/api/auth`,
  plugins: [
    expoClient({
      scheme: "ahmedlotfy-egx-app",
      storage: SecureStore,
      storagePrefix: "egx",
    }),
    emailOTPClient(),
  ],
});
