import { useEffect, useMemo, useState } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Text,
  View,
} from "react-native";
import Svg, { G, Line, Rect, Text as SvgText } from "react-native-svg";

import { colors, fonts } from "@/constants/theme";
import {
  formatDateShort,
  formatDateWithYear,
  formatPrice,
  formatVolume,
} from "@/lib/format";

type ChartBar = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

type ChartLevels = {
  pivot: number;
  r1: number;
  s1: number;
} | null;

type PriceChartProps = {
  bars: ChartBar[];
  levels: ChartLevels;
  locale: "ar" | "en";
};

type NormalizedBar = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
};

const HEIGHT = 236;
const PADDING = { top: 12, right: 48, bottom: 22, left: 4 };

function normalize(bars: ChartBar[]): NormalizedBar[] {
  return bars.flatMap((bar) => {
    if (bar.close === null || !Number.isFinite(bar.close)) {
      return [];
    }

    const open = bar.open ?? bar.close;
    const high = bar.high ?? Math.max(open, bar.close);
    const low = bar.low ?? Math.min(open, bar.close);

    return [
      {
        date: bar.date,
        open,
        high: Math.max(high, open, bar.close),
        low: Math.min(low, open, bar.close),
        close: bar.close,
        volume: bar.volume,
      },
    ];
  });
}

function Readout({
  bar,
  dateText,
  locale,
}: {
  bar: NormalizedBar;
  dateText: string;
  locale: "ar" | "en";
}) {
  const volume = formatVolume(bar.volume, locale);
  const fields = [
    { label: "O", value: bar.open },
    { label: "H", value: bar.high },
    { label: "L", value: bar.low },
    { label: "C", value: bar.close },
  ];

  return (
    <View className="mb-2" style={{ direction: "ltr" }}>
      <View className="flex-row items-center justify-between">
        <Text className="font-title text-[12px] text-text">
          {dateText}
        </Text>
        <Text className="font-body text-[10px] text-text-muted">
          {volume === null ? "" : `V ${volume}`}
        </Text>
      </View>
      <View className="mt-1 flex-row items-center gap-3">
        {fields.map((field) => (
          <Text
            key={field.label}
            className="font-label text-[10px] text-text-secondary"
          >
            {field.label}{" "}
            <Text className="text-text">{formatPrice(field.value)}</Text>
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Dependency-light candlestick chart. The plot always runs left to right, so
 * the SVG container opts out of the app's RTL direction. Dragging horizontally
 * selects the nearest session and shows its OHLC readout.
 */
export function PriceChart({ bars, levels, locale }: PriceChartProps) {
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const normalized = useMemo(() => normalize(bars), [bars]);

  useEffect(() => {
    setSelectedIndex(null);
  }, [bars]);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;

  const domain = useMemo(() => {
    if (normalized.length === 0) {
      return null;
    }

    let min = Math.min(...normalized.map((bar) => bar.low));
    let max = Math.max(...normalized.map((bar) => bar.high));

    if (max === min) {
      max = min + 1;
    }

    // Include nearby support/resistance lines so they are not clipped, but skip
    // levels far outside the price action.
    const band = (max - min) * 0.1;
    const candidates = levels
      ? [levels.s1, levels.pivot, levels.r1].filter(
          (level) => level >= min - band && level <= max + band,
        )
      : [];

    if (candidates.length > 0) {
      min = Math.min(min, ...candidates);
      max = Math.max(max, ...candidates);
    }

    const pad = (max - min) * 0.04;

    return { min: min - pad, max: max + pad };
  }, [normalized, levels]);

  if (normalized.length < 2 || !domain) {
    return null;
  }

  const slot = plotWidth / normalized.length;
  const bodyWidth = Math.max(1, Math.min(9, slot * 0.62));
  const x = (index: number) =>
    PADDING.left + (index + 0.5) * slot;
  const y = (price: number) =>
    PADDING.top +
    ((domain.max - price) / (domain.max - domain.min)) * plotHeight;

  const lastIndex = normalized.length - 1;
  const activeIndex =
    selectedIndex === null ? lastIndex : Math.min(selectedIndex, lastIndex);
  const selected = normalized[activeIndex] ?? normalized[0];
  const firstBar = normalized[0];
  const lastBar = normalized[lastIndex];
  const selectedX = x(activeIndex);
  const spansYears =
    firstBar !== undefined &&
    lastBar !== undefined &&
    firstBar.date.slice(0, 4) !== lastBar.date.slice(0, 4);
  const dateLabel = (date: string) =>
    spansYears ? formatDateWithYear(date, locale) : formatDateShort(date, locale);

  const handleTouch = (event: GestureResponderEvent) => {
    if (plotWidth <= 0) {
      return;
    }

    const localX = event.nativeEvent.locationX - PADDING.left;
    const index = Math.floor(localX / slot);

    if (index < 0) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex(Math.min(normalized.length - 1, index));
  };

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const gridValues = [
    domain.max,
    (domain.max + domain.min) / 2,
    domain.min,
  ];

  const levelLines = levels
    ? [
        { key: "R1", value: levels.r1, color: colors.up },
        { key: "P", value: levels.pivot, color: colors.gold },
        { key: "S1", value: levels.s1, color: colors.down },
      ].filter(
        (level) =>
          level.value >= domain.min && level.value <= domain.max,
      )
    : [];

  if (!selected || !firstBar || !lastBar) {
    return null;
  }

  return (
    <View>
      <Readout
        bar={selected}
        dateText={dateLabel(selected.date)}
        locale={locale}
      />

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${locale === "ar" ? "رسم شموع" : "Candlestick chart"} ${dateLabel(
          firstBar.date,
        )} — ${dateLabel(lastBar.date)}`}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleTouch}
        onResponderMove={handleTouch}
        onResponderTerminate={() => setSelectedIndex(null)}
        style={{ height: HEIGHT, direction: "ltr" }}
      >
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {gridValues.map((value) => (
              <Line
                key={`grid-${value}`}
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={y(value)}
                y2={y(value)}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="2 4"
              />
            ))}

            {gridValues.map((value) => (
              <SvgText
                key={`grid-label-${value}`}
                x={width - PADDING.right + 6}
                y={y(value) + 3}
                fill={colors.textMuted}
                fontFamily={fonts.label}
                fontSize={9}
              >
                {formatPrice(value)}
              </SvgText>
            ))}

            {levelLines.map((level) => (
              <Line
                key={`level-${level.key}`}
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={y(level.value)}
                y2={y(level.value)}
                stroke={level.color}
                strokeWidth={1}
                strokeDasharray="4 3"
                opacity={0.65}
              />
            ))}

            {levelLines.map((level) => (
              <SvgText
                key={`level-label-${level.key}`}
                x={PADDING.left + 2}
                y={y(level.value) - 3}
                fill={level.color}
                fontFamily={fonts.label}
                fontSize={8}
              >
                {level.key}
              </SvgText>
            ))}

            {normalized.map((bar, index) => {
              const up = bar.close >= bar.open;
              const color = up ? colors.up : colors.down;
              const bodyTop = y(Math.max(bar.open, bar.close));
              const bodyHeight = Math.max(
                1,
                y(Math.min(bar.open, bar.close)) - bodyTop,
              );
              const centerX = x(index);

              return (
                <G key={`${bar.date}-${index}`}>
                  <Line
                    x1={centerX}
                    x2={centerX}
                    y1={y(bar.high)}
                    y2={y(bar.low)}
                    stroke={color}
                    strokeWidth={1}
                  />
                  <Rect
                    x={centerX - bodyWidth / 2}
                    y={bodyTop}
                    width={bodyWidth}
                    height={bodyHeight}
                    fill={color}
                    rx={bodyWidth > 3 ? 1 : 0}
                  />
                </G>
              );
            })}

            {selectedIndex !== null ? (
              <>
                <Line
                  x1={selectedX}
                  x2={selectedX}
                  y1={PADDING.top}
                  y2={PADDING.top + plotHeight}
                  stroke={colors.textSecondary}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.7}
                />
                <Line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y(selected.close)}
                  y2={y(selected.close)}
                  stroke={colors.textSecondary}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.5}
                />
              </>
            ) : null}

            <SvgText
              x={PADDING.left}
              y={HEIGHT - 6}
              fill={colors.textMuted}
              fontFamily={fonts.body}
              fontSize={9}
            >
              {dateLabel(firstBar.date)}
            </SvgText>
            <SvgText
              x={width - PADDING.right}
              y={HEIGHT - 6}
              fill={colors.textMuted}
              fontFamily={fonts.body}
              fontSize={9}
              textAnchor="end"
            >
              {dateLabel(lastBar.date)}
            </SvgText>
          </Svg>
        ) : null}
      </View>
    </View>
  );
}
