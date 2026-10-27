import { ActivityIndicator, Pressable, Text, type PressableProps } from "react-native";

import { colors } from "@/constants/theme";

type Variant = "primary" | "secondary" | "ghost";

type ButtonProps = PressableProps & {
  label: string;
  variant?: Variant;
  loading?: boolean;
};

const container: Record<Variant, string> = {
  primary: "bg-gold",
  secondary: "border border-border bg-surface",
  ghost: "bg-transparent",
};

const label: Record<Variant, string> = {
  primary: "text-canvas",
  secondary: "text-text",
  ghost: "text-text-secondary",
};

export function Button({
  label: title,
  variant = "primary",
  loading = false,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      className={`min-h-12 flex-row items-center justify-center rounded-2xl px-5 active:opacity-80 ${container[variant]} ${isDisabled ? "opacity-50" : ""}`}
      disabled={isDisabled}
      {...props}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.canvas : colors.text} />
      ) : (
        <Text className={`font-title text-[15px] ${label[variant]}`}>{title}</Text>
      )}
    </Pressable>
  );
}
