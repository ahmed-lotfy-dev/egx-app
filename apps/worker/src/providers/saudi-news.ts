import { fetchWithRetry, sleep } from "../lib/http";
import { asRecord, asArray, textValue, canonicalUrl } from "../lib/parse";

export type SaudiNewsSource = {
  id: string;
  name: string;
  nameEn: string;
  url: string;
  lang: "ar" | "en";
  category: string;
  weight: number;
};

export const SAUDI_NEWS_SOURCES: SaudiNewsSource[] = [
  {
    id: "tadawul",
    name: "تداول",
    nameEn: "Tadawul",
    url: "https://www.tadawul.com.sa/rss",
    lang: "ar",
    category: "official",
    weight: 1.0,
  },
  {
    id: "argaam",
    name: "أرقام",
    nameEn: "Argaam",
    url: "https://www.argaam.com/rss",
    lang: "ar",
    category: "news_agency",
    weight: 0.95,
  },
  {
    id: "sahm",
    name: "سهم",
    nameEn: "Sahm",
    url: "https://www.saham.net/rss",
    lang: "ar",
    category: "analyst",
    weight: 0.85,
  },
  {
    id: "saudi_press_agency",
    name: "وكالة الأنباء السعودية",
    nameEn: "Saudi Press Agency",
    url: "https://www.spa.gov.sa/rss",
    lang: "ar",
    category: "official",
    weight: 0.9,
  },
  {
    id: "alkhaleej_online",
    name: "الخليج أونلاين اقتصاد",
    nameEn: "Alkhaleej Online Economy",
    url: "https://alkhaleejonline.net/rss/economy",
    lang: "ar",
    category: "news_agency",
    weight: 0.8,
  },
  {
    id: "alyaum_economy",
    name: "اليوم اقتصاد",
    nameEn: "Alyaum Economy",
    url: "https://www.alyaum.com/rss/economy",
    lang: "ar",
    category: "news_agency",
    weight: 0.75,
  },
  {
    id: "aleqtisadiah",
    name: "الاقتصادية",
    nameEn: "Al Eqtisadiah",
    url: "https://www.aleqt.com/rss/economy.xml",
    lang: "ar",
    category: "news_agency",
    weight: 0.9,
  },
  {
    id: "saudi_gazette_business",
    name: "Saudi Gazette Business",
    nameEn: "Saudi Gazette Business",
    url: "https://saudigazette.com.sa/rss/business",
    lang: "en",
    category: "news_agency",
    weight: 0.8,
  },
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
  sourceRegion: "saudi";
};

const parser = new (await import("fast-xml-parser")).XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export async function fetchSaudiNews(): Promise<RawArticle[]> {
  const articles = new Map<string, RawArticle>();

  for (const source of SAUDI_NEWS_SOURCES) {
    try {
      const sourceArticles = await fetchRSSSource(source);
      for (const article of sourceArticles) {
        const existing = articles.get(article.url);
        if (!existing || (article.sourceWeight ?? 0) > (existing.sourceWeight ?? 0)) {
          articles.set(article.url, article);
        }
      }
    } catch (error) {
      console.warn(`Saudi news source failed: ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(200);
  }

  return [...articles.values()];
}

async function fetchRSSSource(source: SaudiNewsSource): Promise<RawArticle[]> {
  const response = await fetchWithRetry(
    source.url,
    { headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" } },
    { retries: 2, timeoutMs: 30_000 },
  );

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const text = await response.text();
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
      sourceCategory: source.category,
      sourceRegion: "saudi",
    });
  }

  return articles;
}