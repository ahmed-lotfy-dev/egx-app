const DEV_API_URL = "http://10.0.2.2:3000";
const PRODUCTION_API_URL = "https://egx-api.alotfy.site";

/**
 * A release build must never fall back to localhost: a missing
 * EXPO_PUBLIC_API_URL in an EAS build would silently send every request to the
 * device itself. Development keeps the Android emulator loopback, and the env
 * var still overrides both.
 */
export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  (__DEV__ ? DEV_API_URL : PRODUCTION_API_URL);

/**
 * The Google button is opt-out in release builds and opt-in in development, so
 * a missing EAS env var cannot hide it from shipped builds.
 */
export const googleAuthEnabled =
  process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED === "true" ||
  (!__DEV__ && process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED !== "false");
