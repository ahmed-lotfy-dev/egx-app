import { Text, View } from "react-native";

import { colors } from "@/constants/theme";

export function BrandMark() {
  return (
    <View className="flex-row items-center gap-3">
      <View className="h-9 w-9 items-center justify-center rounded-xl border border-gold/40 bg-surface">
        <Text className="font-label text-[11px] tracking-[0.08em] text-gold">EGX</Text>
      </View>
      <View className="h-6 w-px" style={{ backgroundColor: colors.border }} />
      <Text className="font-label text-[10px] uppercase tracking-[0.18em] text-text-muted">
        Egyptian Exchange
      </Text>
    </View>
  );
}
