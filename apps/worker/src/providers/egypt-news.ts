import { createHash } from "node:crypto";
import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry, sleep } from "../lib/http";
import { asRecord, asArray, textValue, canonicalUrl, hash } from "../lib/parse";

export type EgyptNewsSource = {
  id: string;
  name: string;
  nameEn: string;
  url: string;
  lang: "ar" | "en";
  category: string;
  weight: number;
  parser: "rss" | "html";
  selector?: {
    items: string;
    title: string;
    link: string;
    description?: string;
    pubDate?: string;
  };
};

export const EGYPT_NEWS_SOURCES: EgyptNewsSource[] = [
  // Official EGX
  {
    id: "egx_disclosures",
    name: "إفصاحات البورصة المصرية",
    nameEn: "EGX Disclosures",
    url: "https://www.egx.com.eg/Disclosures/AllDisclosures.aspx",
    lang: "ar",
    category: "official",
    weight: 1.0,
    parser: "html",
    selector: {
      items: "table.disclosures-table tbody tr",
      title: "td:nth-child(2)",
      link: "td:nth-child(2) a",
      description: "td:nth-child(3)",
      pubDate: "td:nth-child(1)",
    },
  },
  // Major financial portals
  {
    id: "mubasher",
    name: "مباشر",
    nameEn: "Mubasher",
    url: "https://www.mubasher.info/rss.xml",
    lang: "ar",
    category: "news_agency",
    weight: 0.95,
    parser: "rss",
  },
  {
    id: "egypt_today_business",
    name: "Egypt Today Business",
    nameEn: "Egypt Today Business",
    url: "https://www.egypttoday.com/rss/business",
    lang: "en",
    category: "news_agency",
    weight: 0.85,
    parser: "rss",
  },
  {
    id: "al_mal",
    name: "جريدة المال",
    nameEn: "Al Mal News",
    url: "https://almalnews.com/feed",
    lang: "ar",
    category: "news_agency",
    weight: 0.9,
    parser: "rss",
  },
  {
    id: "masrawy_economy",
    name: "مصراوي اقتصاد",
    nameEn: "Masrawy Economy",
    url: "https://www.masrawy.com/rss/economy",
    lang: "ar",
    category: "news_agency",
    weight: 0.8,
    parser: "rss",
  },
  {
    id: "youm7_economy",
    name: "اليوم السابع اقتصاد",
    nameEn: "Youm7 Economy",
    url: "https://www.youm7.com/rss/Section/7/%D8%A7%D9%82%D8%AA%D8%B5%D8%A7%D8%AF",
    lang: "ar",
    category: "news_agency",
    weight: 0.8,
    parser: "rss",
  },
  {
    id: "ahram_economy",
    name: "الأهرام اقتصاد",
    nameEn: "Al Ahram Economy",
    url: "https://www.ahram.org.eg/rss/economy.xml",
    lang: "ar",
    category: "news_agency",
    weight: 0.85,
    parser: "rss",
  },
  {
    id: "shorouk_economy",
    name: "الشروق اقتصاد",
    nameEn: "Shorouk Economy",
    url: "https://www.shorouknews.com/rss/economy",
    lang: "ar",
    category: "news_agency",
    weight: 0.8,
    parser: "rss",
  },
  {
    id: "dostor_economy",
    name: "الدستور اقتصاد",
    nameEn: "Dostor Economy",
    url: "https://www.dostor.org/rss/economy",
    lang: "ar",
    category: "news_agency",
    weight: 0.75,
    parser: "rss",
  },
  // Arab Finance (existing)
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((catId) => [
    {
      id: `arabfinance_ar_${catId}`,
      name: "Arab Finance",
      nameEn: "Arab Finance",
      url: `https://www.arabfinance.com/ar/rss/rssbycat/${catId}`,
      lang: "ar" as const,
      category: "news_agency",
      weight: 0.7,
      parser: "rss" as const,
    },
    {
      id: `arabfinance_en_${catId}`,
      name: "Arab Finance",
      nameEn: "Arab Finance",
      url: `https://www.arabfinance.com/en/rss/rssbycat/${catId}`,
      lang: "en" as const,
      category: "news_agency",
      weight: 0.7,
      parser: "rss" as const,
    },
  ]),
];

export type RawArticle = {
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
  lang: "ar" | "en";
  category: string;
  sourceId: string;
  sourceName: string;
  sourceWeight: number;
  sourceCategory: string;
  sourceRegion: "egypt";
};

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function fetchEgyptNews(): Promise<RawArticle[]> {
  const articles = new Map<string, RawArticle>();

  for (const source of EGYPT_NEWS_SOURCES) {
    try {
      const sourceArticles = await fetchSource(source);
      for (const article of sourceArticles) {
        const existing = articles.get(article.url);
        if (!existing || (article.sourceWeight ?? 0) > (existing.sourceWeight ?? 0)) {
          articles.set(article.url, article);
        }
      }
    } catch (error) {
      console.warn(`Egypt news source failed: ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(200);
  }

  return [...articles.values()];
}

async function fetchSource(source: EgyptNewsSource): Promise<RawArticle[]> {
  const response = await fetchWithRetry(
    source.url,
    { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" } },
    { retries: 2, timeoutMs: 30_000 },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();

  if (source.parser === "rss" || contentType.includes("xml") || contentType.includes("rss")) {
    return parseRSS(text, source);
  } else {
    return parseHTML(text, source);
  }
}

function parseRSS(text: string, source: EgyptNewsSource): RawArticle[] {
  const document = parser.parse(text) as unknown;
  const channel = asRecord(asRecord(asRecord(document)?.rss)?.channel);
  const items = asArray(channel?.item);

  const articles: RawArticle[] = [];

  for (const item of items) {
    const node = asRecord(item);
    if (!node) continue;

    const title = textValue(node.title);
    const link = textValue(node.link);
    const publishedRaw = textValue(node.updated) ?? textValue(node.pubDate);
    const description = textValue(node.description);

    if (!title || !link || !publishedRaw) continue;

    const url = canonicalUrl(link);
    const publishedAt = new Date(publishedRaw);

    if (!url || Number.isNaN(publishedAt.getTime())) continue;

    articles.push({
      title: title.trim(),
      summary: description?.trim() || null,
      url,
      publishedAt,
      lang: source.lang,
      category: source.category,
      sourceId: source.id,
      sourceName: source.name,
      sourceWeight: source.weight,
      sourceCategory: "news_agency",
      sourceRegion: "egypt",
    });
  }

  return articles;
}

function parseHTML(text: string, source: EgyptNewsSource): RawArticle[] {
  const articles: RawArticle[] = [];

  // Simple HTML parsing for EGX disclosures
  if (source.id === "egx_disclosures") {
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;

    for (const rowMatch of text.matchAll(rowRegex)) {
      const rowContent = rowMatch[1];
      if (!rowContent) continue;
      
      const cells = [...rowContent.matchAll(cellRegex)].map((m) => m[1]?.replace(/<[^>]+>/g, "").trim() ?? "");
      if (cells.length >= 3) {
        const dateStr = cells[0] ?? "";
        const title = cells[1] ?? "";
        const desc = cells[2] ?? "";
        const linkMatch = rowContent.match(/<a[^>]+href=["']([^"']+)["']/i);
        const link = linkMatch ? `https://www.egx.com.eg${linkMatch[1]}` : "";

        if (title && link) {
          const url = canonicalUrl(link);
          const publishedAt = parseEgyptDate(dateStr);

          if (url && publishedAt) {
            articles.push({
              title: title.trim(),
              summary: desc || null,
              url,
              publishedAt,
              lang: "ar",
              category: "official",
              sourceId: source.id,
              sourceName: source.name,
              sourceWeight: source.weight,
              sourceCategory: "official",
              sourceRegion: "egypt",
            });
          }
        }
      }
    }
  }

  return articles;
}

function parseEgyptDate(dateStr: string): Date | null {
  // Try various Egyptian date formats
  const formats = [
    /(\d{1,2})\/(\d{1,2})\/(\d{4})/, // DD/MM/YYYY
    /(\d{4})-(\d{1,2})-(\d{1,2})/, // YYYY-MM-DD
    /(\d{1,2})-(\d{1,2})-(\d{4})/, // DD-MM-YYYY
  ];

  for (const fmt of formats) {
    const match = dateStr.match(fmt);
    if (match && match[1] && match[2] && match[3]) {
      const d = match[1];
      const m = match[2];
      const y = match[3];
      const date = new Date(`${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return null;
}