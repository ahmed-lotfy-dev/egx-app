import { View } from "react-native";

import { colors } from "@/constants/theme";

type SparklineProps = {
  values: number[];
  height?: number;
};

/**
 * A dependency-free micro bar chart for the index card. It intentionally uses
 * bars instead of SVG so the Markets screen adds no native dependencies.
 */
export function Sparkline({ values, height = 44 }: SparklineProps) {
  if (values.length < 2) {
    return null;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      className="mt-5 flex-row items-end gap-[3px]"
      style={{ height }}
    >
      {values.map((value, index) => {
        const barHeight = Math.max(3, ((value - min) / range) * height);
        const isLatest = index === values.length - 1;

        return (
          <View
            key={`${index}-${value}`}
            style={{
              flex: 1,
              height: barHeight,
              borderRadius: 2,
              backgroundColor: isLatest ? colors.goldSoft : colors.gold,
              opacity: isLatest ? 1 : 0.5,
            }}
          />
        );
      })}
    </View>
  );
}
