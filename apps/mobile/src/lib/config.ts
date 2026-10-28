/**
 * The app always talks to the deployed backend. There is deliberately no
 * localhost or emulator fallback: a missing or stale env var must never point
 * a build at a developer machine.
 */
export const apiBaseUrl = "https://egx-api.alotfy.site";

/**
 * Google sign-in is on by default everywhere. Set
 * EXPO_PUBLIC_GOOGLE_AUTH_ENABLED=false only to hide the button deliberately.
 */
export const googleAuthEnabled =
  process.env.EXPO_PUBLIC_GOOGLE_AUTH_ENABLED !== "false";
