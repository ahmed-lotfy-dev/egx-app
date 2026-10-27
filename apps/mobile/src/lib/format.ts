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

const compactFormatters = {
  ar: new Intl.NumberFormat("ar-EG-u-nu-latn", {
    notation: "compact",
    maximumFractionDigits: 2,
  }),
  en: new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }),
} as const;

const dateFormatters = {
  ar: new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Cairo",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Cairo",
  }),
} as const;

const longDateFormatters = {
  ar: new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Cairo",
  }),
  en: new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Africa/Cairo",
  }),
} as const;


/** Formats a ratio with a fixed number of decimals, or null when missing. */
export function formatRatio(
  value: number | null | undefined,
  digits = 2,
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return value.toFixed(digits);
}

/** Formats an unsigned percentage such as 4.99%, or null when missing. */
export function formatPercentValue(
  value: number | null | undefined,
): string | null {
  const formatted = formatRatio(value);

  return formatted === null ? null : `${formatted}%`;
}

/** Formats large amounts with a compact suffix, isolated for RTL. */
export function formatCompact(
  value: number | null | undefined,
  locale: "ar" | "en",
): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }

  return `${LRI}${compactFormatters[locale].format(value)}${PDI}`;
}

/** Formats a share count or traded volume with a compact suffix. */
export function formatVolume(
  value: number | null | undefined,
  locale: "ar" | "en",
): string | null {
  return formatCompact(value, locale);
}

/** Formats a date (YYYY-MM-DD or ISO) as a short Cairo date. */
export function formatDateShort(
  value: string | null | undefined,
  locale: "ar" | "en",
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return dateFormatters[locale].format(date);
  } catch {
    return value.slice(0, 10);
  }
}

/** Formats a date with its year, for spans that cross a calendar year. */
export function formatDateWithYear(
  value: string | null | undefined,
  locale: "ar" | "en",
): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  try {
    return longDateFormatters[locale].format(date);
  } catch {
    return value.slice(0, 10);
  }
}

/** Formats an ISO timestamp as a relative time such as "3h ago". */
export function formatRelativeTime(
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

  const diffMs = Date.now() - date.getTime();

  // Hermes does not implement Intl.RelativeTimeFormat, so relative labels are
  // assembled here for the two supported locales.
  if (diffMs < 60_000) {
    return locale === "ar" ? "الآن" : "just now";
  }

  const minutes = Math.round(diffMs / 60_000);

  if (minutes < 60) {
    return relativeLabel(minutes, "minute", locale);
  }

  const hours = Math.round(minutes / 60);

  if (hours < 24) {
    return relativeLabel(hours, "hour", locale);
  }

  const days = Math.round(hours / 24);

  if (days < 30) {
    return relativeLabel(days, "day", locale);
  }

  return longDateFormatters[locale].format(date);
}

const RELATIVE_UNITS = {
  ar: {
    minute: { one: "دقيقة", two: "دقيقتين", few: "دقايق", other: "دقيقة" },
    hour: { one: "ساعة", two: "ساعتين", few: "ساعات", other: "ساعة" },
    day: { one: "يوم", two: "يومين", few: "أيام", other: "يوم" },
  },
  en: {
    minute: { one: "minute", two: "minutes", few: "minutes", other: "minutes" },
    hour: { one: "hour", two: "hours", few: "hours", other: "hours" },
    day: { one: "day", two: "days", few: "days", other: "days" },
  },
} as const;

type RelativeUnit = keyof (typeof RELATIVE_UNITS)["en"];

function relativeLabel(
  count: number,
  unit: RelativeUnit,
  locale: "ar" | "en",
): string {
  const labels = RELATIVE_UNITS[locale][unit];

  if (locale === "en") {
    return `${count}${unit === "minute" ? "m" : unit === "hour" ? "h" : "d"} ago`;
  }

  if (count === 1) {
    return `قبل ${labels.one}`;
  }

  if (count === 2) {
    return `قبل ${labels.two}`;
  }

  if (count >= 3 && count <= 10) {
    return `قبل ${count} ${labels.few}`;
  }

  return `قبل ${count} ${labels.other}`;
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
