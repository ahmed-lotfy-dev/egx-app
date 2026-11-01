import type { TextStyle } from "react-native";

export const colors = {
  canvas: "#0F1115",
  surface: "#161A20",
  surfaceElevated: "#1D222B",
  surfaceHover: "#222833",
  border: "#2A303B",
  borderSoft: "#21262F",
  gold: "#C9A227",
  goldSoft: "#E0B84A",
  warning: "#F59E0B",
  up: "#22C55E",
  down: "#EF4444",
  text: "#F5F1E8",
  textSecondary: "#A8ADB8",
  textMuted: "#6E7480",
  overlay: "rgba(15,17,21,0.7)",
} as const;

export const fonts = {
  body: "IBMPlexSansArabic_400Regular",
  title: "IBMPlexSansArabic_600SemiBold",
  display: "IBMPlexSansArabic_700Bold",
  label: "Inter_600SemiBold",
} as const;

/** Corner radii — tighter on inner chips, softer on containers. */
export const radii = {
  chip: 10,
  card: 16,
  panel: 20,
  hero: 26,
  pill: 999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

/**
 * Tabular figures — numbers stop wobbling as prices tick. Applied to every
 * price, percentage, and volume in the app.
 */
export const tabular: TextStyle = { fontVariant: ["tabular-nums"] };

/**
 * Single light source, tinted to the canvas hue (never flat black), so cards
 * lift off the dark surface consistently.
 */
export const shadow = {
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 6,
  },
  floating: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 12,
  },
} as const;
