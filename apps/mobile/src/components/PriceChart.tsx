import { useEffect, useMemo, useState } from "react";
import {
  type GestureResponderEvent,
  type LayoutChangeEvent,
  Text,
  View,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from "react-native-svg";

import { colors, fonts } from "@/constants/theme";
import {
  formatCairoTime,
  formatDateShort,
  formatDateWithYear,
  formatPrice,
  formatVolume,
} from "@/lib/format";

export type ChartMode = "line" | "candles";

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
  /** "line" (default) or "candles" — candlestick bars using OHLC. */
  mode?: ChartMode;
  /** Intraday bars: x-axis labels become Cairo clock times. */
  intraday?: boolean;
};

type NormalizedBar = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number | null;
};

const HEIGHT = 264;
const PADDING = { top: 14, right: 12, bottom: 26, left: 12 };
const VOLUME_SHARE = 0.16;

function normalize(bars: ChartBar[]): NormalizedBar[] {
  return bars.flatMap((bar) => {
    if (bar.close === null || !Number.isFinite(bar.close)) {
      return [];
    }

    return [
      {
        date: bar.date,
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
        volume: bar.volume,
      },
    ];
  });
}

/**
 * Catmull-Rom spline through the points, emitted as cubic beziers. Keeps the
 * Telda-style smooth curve without adding a charting dependency.
 */
function smoothLinePath(
  points: Array<{ x: number; y: number }>,
): string {
  if (points.length === 0) {
    return "";
  }

  const first = points[0] as { x: number; y: number };

  if (points.length === 1) {
    return `M ${first.x} ${first.y}`;
  }

  let d = `M ${first.x} ${first.y}`;

  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)] as { x: number; y: number };
    const p1 = points[i] as { x: number; y: number };
    const p2 = points[i + 1] as { x: number; y: number };
    const p3 = points[Math.min(points.length - 1, i + 2)] as {
      x: number;
      y: number;
    };
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y} ${c2x} ${c2y} ${p2.x} ${p2.y}`;
  }

  return d;
}

function Bubble({
  x,
  y,
  text,
  color,
  width,
}: {
  x: number;
  y: number;
  text: string;
  color: string;
  width: number;
}) {
  const clampedX = Math.max(2, x - width / 2);

  return (
    <G>
      <Rect
        x={clampedX}
        y={y}
        width={width}
        height={18}
        rx={5}
        fill={color}
      />
      <SvgText
        x={clampedX + width / 2}
        y={y + 12.5}
        fill={colors.canvas}
        fontFamily={fonts.label}
        fontSize={10}
        fontWeight="600"
        textAnchor="middle"
      >
        {text}
      </SvgText>
    </G>
  );
}

/**
 * Telda-style price chart: smooth gradient line or candlestick bars colored by
 * bar direction, touch crosshair with price/date bubbles, subtle volume bars,
 * and optional pivot/support/resistance level lines. The plot always runs
 * left to right, so the SVG container opts out of the app's RTL direction.
 */
export function PriceChart({
  bars,
  levels,
  locale,
  mode = "line",
  intraday = false,
}: PriceChartProps) {
  const [width, setWidth] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const normalized = useMemo(() => normalize(bars), [bars]);

  useEffect(() => {
    setSelectedIndex(null);
  }, [bars]);

  const plotWidth = Math.max(0, width - PADDING.left - PADDING.right);
  const volumeHeight = (HEIGHT - PADDING.top - PADDING.bottom) * VOLUME_SHARE;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom - volumeHeight;

  const domain = useMemo(() => {
    if (normalized.length === 0) {
      return null;
    }

    // Candles span the full high/low range; the line only needs closes.
    const values =
      mode === "candles"
        ? normalized.flatMap((bar) =>
            [bar.high, bar.low].filter(
              (value): value is number =>
                value !== null && Number.isFinite(value),
            ),
          )
        : normalized.map((bar) => bar.close);

    if (values.length === 0) {
      return null;
    }

    let min = Math.min(...values);
    let max = Math.max(...values);

    if (max === min) {
      max = min + 1;
    }

    // Include nearby support/resistance lines so they are not clipped, but
    // skip levels far outside the price action.
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

    const pad = (max - min) * 0.08;

    return { min: min - pad, max: max + pad };
  }, [normalized, levels, mode]);

  const maxVolume = useMemo(
    () => Math.max(0, ...normalized.map((bar) => bar.volume ?? 0)),
    [normalized],
  );

  if (normalized.length === 0 || !domain) {
    return null;
  }

  const slot =
    normalized.length > 1 ? plotWidth / (normalized.length - 1) : plotWidth;
  const x = (index: number) => PADDING.left + index * slot;
  const y = (price: number) =>
    PADDING.top +
    ((domain.max - price) / (domain.max - domain.min)) * plotHeight;

  const points = normalized.map((bar, index) => ({
    x: x(index),
    y: y(bar.close),
  }));
  const linePath = smoothLinePath(points);
  const baseY = PADDING.top + plotHeight;
  const areaPath = `${linePath} L ${x(normalized.length - 1)} ${baseY} L ${x(0)} ${baseY} Z`;

  // Candle geometry: wick spans high→low, body spans open→close. Bars with a
  // missing open fall back to the previous close for direction coloring.
  const candleWidth = Math.max(1.5, Math.min(9, slot * 0.6));
  const candleFor = (bar: NormalizedBar, index: number) => {
    const open = bar.open ?? (index > 0 ? normalized[index - 1]?.close ?? null : null);
    const high = bar.high ?? bar.close;
    const low = bar.low ?? bar.close;
    const risingCandle = open === null || bar.close >= open;

    return { open, high, low, risingCandle };
  };

  const lastIndex = normalized.length - 1;
  const activeIndex =
    selectedIndex === null ? lastIndex : Math.min(selectedIndex, lastIndex);
  const selected = normalized[activeIndex] ?? normalized[0];
  const firstBar = normalized[0];
  const lastBar = normalized[lastIndex];
  const rising = (lastBar as NormalizedBar).close >= (firstBar as NormalizedBar).close;
  const trendColor = rising ? colors.up : colors.down;
  const selectedX = x(activeIndex);
  const spansYears =
    !intraday &&
    firstBar !== undefined &&
    lastBar !== undefined &&
    firstBar.date.slice(0, 4) !== lastBar.date.slice(0, 4);
  const dateLabel = (date: string) => {
    if (intraday) {
      return formatCairoTime(date, locale);
    }

    return spansYears
      ? formatDateWithYear(date, locale)
      : formatDateShort(date, locale);
  };

  const handleTouch = (event: GestureResponderEvent) => {
    if (plotWidth <= 0) {
      return;
    }

    const localX = event.nativeEvent.locationX - PADDING.left;
    const index = Math.round(localX / slot);

    if (index < 0) {
      setSelectedIndex(0);
      return;
    }

    setSelectedIndex(Math.min(normalized.length - 1, index));
  };

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const levelLines = levels
    ? [
        { key: "R1", value: levels.r1, color: colors.up },
        { key: "P", value: levels.pivot, color: colors.gold },
        { key: "S1", value: levels.s1, color: colors.down },
      ].filter((level) => level.value >= domain.min && level.value <= domain.max)
    : [];

  if (!selected || !firstBar || !lastBar) {
    return null;
  }

  const previous =
    activeIndex > 0 ? (normalized[activeIndex - 1] as NormalizedBar) : null;
  const selectedChange =
    previous === null ? null : selected.close - (previous as NormalizedBar).close;
  const priceBubbleWidth = formatPrice(selected.close).length * 6.6 + 14;

  return (
    <View>
      {selectedIndex !== null ? (
        <View className="mb-2" style={{ direction: "ltr" }}>
          <View className="flex-row items-center justify-between">
            <Text className="font-title text-[12px] text-text">
              {dateLabel(selected.date)}
            </Text>
            <View className="flex-row items-center gap-2">
              {selectedChange !== null ? (
                <Text
                  className="font-label text-[11px]"
                  style={{ color: selectedChange >= 0 ? colors.up : colors.down }}
                >
                  {selectedChange >= 0 ? "+" : ""}
                  {formatPrice(selectedChange)}
                </Text>
              ) : null}
              <Text className="font-title text-[13px] text-text">
                {formatPrice(selected.close)}
              </Text>
              <Text className="font-body text-[10px] text-text-muted">
                {formatVolume(selected.volume, locale) ?? ""}
              </Text>
            </View>
          </View>
        </View>
      ) : null}

      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`${locale === "ar" ? "رسم بياني للسعر" : "Price chart"} ${dateLabel(
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
            <Defs>
              <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={trendColor} stopOpacity={0.22} />
                <Stop offset="1" stopColor={trendColor} stopOpacity={0.02} />
              </LinearGradient>
            </Defs>

            {/* Baseline at the period's opening close */}
            <Line
              x1={PADDING.left}
              x2={width - PADDING.right}
              y1={y(firstBar.close)}
              y2={y(firstBar.close)}
              stroke={colors.border}
              strokeWidth={1}
              strokeDasharray="2 5"
            />

            {mode === "candles" ? (
              normalized.map((bar, index) => {
                const candle = candleFor(bar, index);
                const candleColor = candle.risingCandle
                  ? colors.up
                  : colors.down;
                const cx = x(index);
                const bodyTop = y(
                  Math.max(bar.close, candle.open ?? bar.close),
                );
                const bodyBottom = y(
                  Math.min(bar.close, candle.open ?? bar.close),
                );
                const bodyHeight = Math.max(1, bodyBottom - bodyTop);

                return (
                  <G key={`candle-${bar.date}-${index}`}>
                    <Line
                      x1={cx}
                      x2={cx}
                      y1={y(candle.high)}
                      y2={y(candle.low)}
                      stroke={candleColor}
                      strokeWidth={1}
                    />
                    <Rect
                      x={cx - candleWidth / 2}
                      y={bodyTop}
                      width={candleWidth}
                      height={bodyHeight}
                      rx={1}
                      fill={candleColor}
                    />
                  </G>
                );
              })
            ) : (
              <>
                <Path d={areaPath} fill="url(#areaFill)" />
                <Path
                  d={linePath}
                  stroke={trendColor}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </>
            )}

            {/* Volume bars */}
            {maxVolume > 0
              ? normalized.map((bar, index) => {
                  const volume = bar.volume ?? 0;

                  if (volume <= 0) {
                    return null;
                  }

                  const barWidth = Math.max(1, Math.min(6, slot * 0.55));
                  const barHeight = Math.max(
                    1,
                    (volume / maxVolume) * (volumeHeight - 4),
                  );

                  return (
                    <Rect
                      key={`vol-${bar.date}-${index}`}
                      x={x(index) - barWidth / 2}
                      y={baseY + 4 + (volumeHeight - 4 - barHeight)}
                      width={barWidth}
                      height={barHeight}
                      rx={1}
                      fill={
                        mode === "candles"
                          ? candleFor(bar, index).risingCandle
                            ? colors.up
                            : colors.down
                          : trendColor
                      }
                      opacity={0.18}
                    />
                  );
                })
              : null}

            {/* Pivot / support / resistance */}
            {levelLines.map((level) => (
              <G key={`level-${level.key}`}>
                <Line
                  x1={PADDING.left}
                  x2={width - PADDING.right}
                  y1={y(level.value)}
                  y2={y(level.value)}
                  stroke={level.color}
                  strokeWidth={1}
                  strokeDasharray="5 4"
                  opacity={0.5}
                />
                <SvgText
                  x={PADDING.left + 2}
                  y={y(level.value) - 3}
                  fill={level.color}
                  fontFamily={fonts.label}
                  fontSize={8}
                  opacity={0.9}
                >
                  {level.key}
                </SvgText>
              </G>
            ))}

            {selectedIndex !== null ? (
              <G>
                <Line
                  x1={selectedX}
                  x2={selectedX}
                  y1={PADDING.top}
                  y2={baseY + volumeHeight}
                  stroke={colors.textSecondary}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={0.6}
                />
                <Circle
                  cx={selectedX}
                  cy={y(selected.close)}
                  r={4}
                  fill={trendColor}
                  stroke={colors.canvas}
                  strokeWidth={2}
                />
                <Bubble
                  x={Math.min(
                    Math.max(selectedX, PADDING.left + priceBubbleWidth / 2),
                    width - PADDING.right - priceBubbleWidth / 2,
                  )}
                  y={PADDING.top - 6}
                  text={formatPrice(selected.close)}
                  color={colors.text}
                  width={priceBubbleWidth}
                />
              </G>
            ) : (
              <Circle
                cx={x(lastIndex)}
                cy={y(lastBar.close)}
                r={3.5}
                fill={trendColor}
              />
            )}

            <SvgText
              x={PADDING.left}
              y={HEIGHT - 8}
              fill={colors.textMuted}
              fontFamily={fonts.body}
              fontSize={9}
            >
              {dateLabel(firstBar.date)}
            </SvgText>
            <SvgText
              x={width - PADDING.right}
              y={HEIGHT - 8}
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
