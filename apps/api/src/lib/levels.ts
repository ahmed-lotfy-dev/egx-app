import type {
  HistoryStats,
  SupportResistance,
} from "@egx/contracts";

export type BarForLevels = {
  date: string;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
};

function finite(value: number | null): value is number {
  return value !== null && Number.isFinite(value);
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Builds the 20-day and 52-week ranges from the stored daily bars. */
export function computeHistoryStats(
  allBars: BarForLevels[],
  rangeBarCount: number,
): HistoryStats {
  const last20 = allBars.slice(-20);
  const last250 = allBars.slice(-250);
  const highs20 = last20.map((bar) => bar.high).filter(finite);
  const lows20 = last20.map((bar) => bar.low).filter(finite);
  const highs250 = last250.map((bar) => bar.high).filter(finite);
  const lows250 = last250.map((bar) => bar.low).filter(finite);
  const volumes20 = last20.map((bar) => bar.volume).filter(finite);
  const avgVolume = average(volumes20);

  return {
    barCount: allBars.length,
    rangeBarCount,
    firstDate: allBars[0]?.date ?? null,
    lastDate: allBars[allBars.length - 1]?.date ?? null,
    high20: highs20.length > 0 ? Math.max(...highs20) : null,
    low20: lows20.length > 0 ? Math.min(...lows20) : null,
    high52w: highs250.length > 0 ? Math.max(...highs250) : null,
    low52w: lows250.length > 0 ? Math.min(...lows250) : null,
    avgVolume20: avgVolume === null ? null : Math.round(avgVolume),
  };
}

/**
 * Classic floor-trader pivot points from the latest usable session. These are
 * descriptive levels, not predictions or recommendations.
 */
export function computeSupportResistance(
  bars: BarForLevels[],
): SupportResistance | null {
  const last = [...bars]
    .reverse()
    .find(
      (bar) =>
        finite(bar.high) &&
        finite(bar.low) &&
        finite(bar.close) &&
        bar.high >= bar.low,
    );

  if (!last || !finite(last.high) || !finite(last.low) || !finite(last.close)) {
    return null;
  }

  const high = last.high;
  const low = last.low;
  const close = last.close;
  const pivot = (high + low + close) / 3;

  return {
    pivot,
    r1: 2 * pivot - low,
    r2: pivot + (high - low),
    r3: high + 2 * (pivot - low),
    s1: 2 * pivot - high,
    s2: pivot - (high - low),
    s3: low - 2 * (high - pivot),
    asOf: last.date,
    basis: "raw",
  };
}
