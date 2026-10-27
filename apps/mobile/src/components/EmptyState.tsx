import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { colors } from "@/constants/theme";

type EmptyStateProps = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  badge?: string;
};

export function EmptyState({ icon, title, body, badge }: EmptyStateProps) {
  return (
    <View className="flex-1 items-center justify-center px-8">
      <View className="h-16 w-16 items-center justify-center rounded-2xl border border-border bg-surface">
        <Ionicons name={icon} size={28} color={colors.gold} />
      </View>
      <Text className="mt-5 text-center font-title text-[19px] text-text">{title}</Text>
      <Text className="mt-2 max-w-[300px] text-center font-body text-[15px] leading-6 text-text-secondary">
        {body}
      </Text>
      {badge ? (
        <View className="mt-6 rounded-full border border-border bg-surface px-4 py-2">
          <Text className="font-label text-[10px] uppercase tracking-[0.08em] text-text-muted">
            {badge}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
