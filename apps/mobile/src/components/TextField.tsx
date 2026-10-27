import { Text, TextInput, View, type TextInputProps } from "react-native";

import { colors } from "@/constants/theme";

type TextFieldProps = TextInputProps & {
  label: string;
  error?: string;
};

export function TextField({ label, error, ...props }: TextFieldProps) {
  return (
    <View className="gap-2">
      <Text className="font-title text-[13px] text-text-secondary">{label}</Text>
      <TextInput
        className={`min-h-12 rounded-2xl border bg-surface px-4 font-body text-[16px] text-text ${error ? "border-warning" : "border-border"}`}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.gold}
        {...props}
      />
      {error ? <Text className="font-body text-[12px] text-warning">{error}</Text> : null}
    </View>
  );
}
