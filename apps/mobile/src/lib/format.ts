const numberFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Wrap signed values in a left-to-right isolate so the sign stays attached to
// the number in Arabic (RTL) paragraphs instead of jumping to the other end.
const LRI = "\u2066";
const PDI = "\u2069";

const timeFormatters = {
  ar: new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Cairo",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Africa/Cairo",
  }),
} as const;

/** Formats a price with two decimals and Latin digits in both locales. */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return numberFormatter.format(value);
}

/** Formats a signed absolute change, for example +1,410.30. */
export function formatSigned(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${LRI}${value > 0 ? "+" : ""}${numberFormatter.format(value)}${PDI}`;
}

/** Formats a signed percentage, for example +2.91%. */
export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "—";
  }

  return `${LRI}${value > 0 ? "+" : ""}${value.toFixed(2)}%${PDI}`;
}

/** Formats an ISO timestamp as Cairo wall-clock time. */
export function formatCairoTime(
  iso: string | null | undefined,
  locale: "ar" | "en",
): string {
  if (!iso) {
    return "—";
  }

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return timeFormatters[locale].format(date);
  } catch {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}
