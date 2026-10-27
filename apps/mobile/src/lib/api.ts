import createClient from "openapi-fetch";

import { authClient } from "@/lib/auth-client";
import type { paths } from "@/types/api";

const rawBaseUrl = process.env.EXPO_PUBLIC_API_URL ?? "http://10.0.2.2:3000";
export const apiBaseUrl = rawBaseUrl;

export const api = createClient<paths>({
  baseUrl: apiBaseUrl,
});

api.use({
  async onRequest({ request }) {
    const cookie = await authClient.getCookie();

    if (cookie) {
      request.headers.set("Cookie", cookie);
    }

    return request;
  },
});
