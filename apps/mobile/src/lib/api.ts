import createClient from "openapi-fetch";

import { authClient } from "@/lib/auth-client";
import { apiBaseUrl } from "@/lib/config";
import type { paths } from "@/types/api";

export { apiBaseUrl };

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
