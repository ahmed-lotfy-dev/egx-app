import { fetchWithRetry, sleep } from "../lib/http";
import { asRecord, asArray, textValue, canonicalUrl } from "../lib/parse";

export type GlobalNewsSource = {
  id: string;
  name: string;
  nameEn: string;
  url: string;
  lang: "ar" | "en";
  category: string;
  weight: number;
  region: "global" | "gcc" | "mena";
};

export const GLOBAL_NEWS_SOURCES: GlobalNewsSource[] = [
  // English global
  {
    id: "reuters_business",
    name: "Reuters Business",
    nameEn: "Reuters Business",
    url: "https://feeds.reuters.com/reuters/businessNews",
    lang: "en",
    category: "news_agency",
    weight: 0.95,
    region: "global",
  },
  {
    id: "reuters_markets",
    name: "Reuters Markets",
    nameEn: "Reuters Markets",
    url: "https://feeds.reuters.com/reuters/marketsNews",
    lang: "en",
    category: "news_agency",
    weight: 0.95,
    region: "global",
  },
  {
    id: "bloomberg_markets",
    name: "Bloomberg Markets",
    nameEn: "Bloomberg Markets",
    url: "https://feeds.bloomberg.com/markets/news.rss",
    lang: "en",
    category: "news_agency",
    weight: 0.95,
    region: "global",
  },
  {
    id: "cnbc_markets",
    name: "CNBC Markets",
    nameEn: "CNBC Markets",
    url: "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    lang: "en",
    category: "news_agency",
    weight: 0.9,
    region: "global",
  },
  {
    id: "investing_com",
    name: "Investing.com",
    nameEn: "Investing.com",
    url: "https://www.investing.com/rss/news_25.rss",
    lang: "en",
    category: "news_agency",
    weight: 0.85,
    region: "global",
  },
  {
    id: "marketwatch",
    name: "MarketWatch",
    nameEn: "MarketWatch",
    url: "https://feeds.marketwatch.com/marketwatch/topstories/",
    lang: "en",
    category: "news_agency",
    weight: 0.85,
    region: "global",
  },
  {
    id: "ft_markets",
    name: "Financial Times Markets",
    nameEn: "Financial Times Markets",
    url: "https://www.ft.com/markets?format=rss",
    lang: "en",
    category: "news_agency",
    weight: 0.9,
    region: "global",
  },
  {
    id: "wsj_markets",
    name: "WSJ Markets",
    nameEn: "WSJ Markets",
    url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml",
    lang: "en",
    category: "news_agency",
    weight: 0.9,
    region: "global",
  },
  // Arabic global
  {
    id: "reuters_ar_business",
    name: "Reuters Arabic Business",
    nameEn: "Reuters Arabic Business",
    url: "https://www.reuters.com/rssFeed/arabicBusinessNews",
    lang: "ar",
    category: "news_agency",
    weight: 0.95,
    region: "global",
  },
  {
    id: "sky_news_arabia_economy",
    name: "Sky News Arabia Economy",
    nameEn: "Sky News Arabia Economy",
    url: "https://www.skynewsarabia.com/rss/economy",
    lang: "ar",
    category: "news_agency",
    weight: 0.9,
    region: "mena",
  },
  {
    id: "alarabiya_economy",
    name: "العربية اقتصاد",
    nameEn: "Al Arabiya Economy",
    url: "https://www.alarabiya.net/rss/economy.xml",
    lang: "ar",
    category: "news_agency",
    weight: 0.9,
    region: "mena",
  },
  {
    id: "aljazeera_economy",
    name: "الجزيرة اقتصاد",
    nameEn: "Al Jazeera Economy",
    url: "https://www.aljazeera.net/rss/economy",
    lang: "ar",
    category: "news_agency",
    weight: 0.85,
    region: "mena",
  },
  {
    id: "cnn_arabic_economy",
    name: "CNN Arabic Economy",
    nameEn: "CNN Arabic Economy",
    url: "https://arabic.cnn.com/rss/economy.xml",
    lang: "ar",
    category: "news_agency",
    weight: 0.85,
    region: "mena",
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
  sourceRegion: "global" | "gcc" | "mena";
};

const parser = new (await import("fast-xml-parser")).XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export async function fetchGlobalNews(): Promise<RawArticle[]> {
  const articles = new Map<string, RawArticle>();

  for (const source of GLOBAL_NEWS_SOURCES) {
    try {
      const sourceArticles = await fetchRSSSource(source);
      for (const article of sourceArticles) {
        const existing = articles.get(article.url);
        if (!existing || (article.sourceWeight ?? 0) > (existing.sourceWeight ?? 0)) {
          articles.set(article.url, article);
        }
      }
    } catch (error) {
      console.warn(`Global news source failed: ${source.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(200);
  }

  return [...articles.values()];
}

async function fetchRSSSource(source: GlobalNewsSource): Promise<RawArticle[]> {
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
      sourceRegion: source.region,
    });
  }

  return articles;
}