import type { ReactNode } from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: colors.canvas }}>
      <View style={{ flex: 1 }}>{children}</View>
    </SafeAreaView>
  );
}