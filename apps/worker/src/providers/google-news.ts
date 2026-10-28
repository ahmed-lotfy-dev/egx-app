import type { NewsLang } from "../jobs/news";
import { asRecord, canonicalUrl, textValue } from "../lib/parse";

export type GoogleNewsQuery = {
  lang: NewsLang;
  query: string;
  hl: string;
  ceid: string;
  category: string;
};

export type ParsedGoogleNewsItem = {
  title: string;
  link: string;
  publishedRaw: string;
  publisherName: string | null;
  publisherHref: string | null;
};

export const GOOGLE_NEWS_QUERIES: GoogleNewsQuery[] = [
  {
    lang: "ar",
    query: "مصر اقتصاد",
    hl: "ar",
    ceid: "EG:ar",
    category: "اقتصاد",
  },
  {
    lang: "ar",
    query: "البورصة المصرية",
    hl: "ar",
    ceid: "EG:ar",
    category: "اقتصاد",
  },
  {
    lang: "ar",
    query: "أسعار النفط",
    hl: "ar",
    ceid: "EG:ar",
    category: "اقتصاد",
  },
  {
    lang: "en",
    query: "Egypt economy",
    hl: "en",
    ceid: "EG:en",
    category: "Economy",
  },
  {
    lang: "en",
    query: "Egypt stock market",
    hl: "en",
    ceid: "EG:en",
    category: "Economy",
  },
  {
    lang: "en",
    query: "oil prices",
    hl: "en",
    ceid: "EG:en",
    category: "Economy",
  },
];

export function buildGoogleNewsUrl(queryConfig: GoogleNewsQuery): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(queryConfig.query)}&hl=${queryConfig.hl}&gl=EG&ceid=${queryConfig.ceid}`;
}

export function publisherUrl(descriptionHtml: string | null): string | null {
  if (!descriptionHtml) {
    return null;
  }

  const match = descriptionHtml.match(/href=["']([^"']+)["']/i);
  const href = match?.[1]?.trim();

  if (!href) {
    return null;
  }

  const decoded = decodeEntities(href);

  // Current Google News feeds embed a news.google.com redirect in the
  // description anchor, not the publisher URL. Only a real publisher host
  // counts as recoverable.
  try {
    const host = new URL(decoded).hostname.toLowerCase();

    if (host === "news.google.com" || host.endsWith(".news.google.com")) {
      return null;
    }
  } catch {
    return null;
  }

  return canonicalUrl(decoded);
}

export function parseGoogleNewsItem(
  node: Record<string, unknown>,
): ParsedGoogleNewsItem | null {
  const title = textValue(node.title);
  const link = textValue(node.link);
  const publishedRaw = textValue(node.pubDate);

  if (!title || !link || !publishedRaw) {
    return null;
  }

  const publisherName = textValue(node.source);
  const sourceRecord = asRecord(node.source);
  const publisherHref =
    sourceRecord && typeof sourceRecord["@_url"] === "string"
      ? (sourceRecord["@_url"] as string)
      : null;

  return {
    title,
    link,
    publishedRaw,
    publisherName,
    publisherHref,
  };
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&#0?38;/g, "&")
    .replace(/&#x0?26;/gi, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
