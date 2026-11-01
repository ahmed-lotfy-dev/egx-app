import type { ReactNode } from "react";
import { Text, View } from "react-native";

/**
 * Shared screen title block — one typographic rhythm across every tab:
 * an optional gold kicker over a heavy display title, with a right-hand
 * action slot. Keeps the app's headers from drifting screen to screen.
 */
export function ScreenHeader({
  title,
  kicker,
  right,
}: {
  title: string;
  kicker?: string;
  right?: ReactNode;
}) {
  return (
    <View className="flex-row items-start justify-between px-5 pb-4 pt-2">
      <View className="flex-1">
        {kicker ? (
          <Text className="font-label text-[10px] uppercase tracking-[0.18em] text-gold">
            {kicker}
          </Text>
        ) : null}
        <Text
          className={`font-display text-[28px] leading-9 text-text ${
            kicker ? "mt-1" : ""
          }`}
        >
          {title}
        </Text>
      </View>

      {right ? <View className="mt-1">{right}</View> : null}
    </View>
  );
}
