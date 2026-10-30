import { eq, sql, and, desc, inArray, isNull, lt, gt } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";

import { db } from "@egx/api/db";
import {
  instruments,
  newsInstrumentLinks,
  newsItems,
  newsProcessingQueue,
} from "@egx/api/schema";
import { normalizeArabic, normalizeEnglish } from "@egx/api/text";

import { fetchWithRetry, sleep } from "../lib/http";
import {
  asArray,
  asRecord,
  canonicalUrl,
  hash,
  textValue,
} from "../lib/parse";
import { withIngestRun } from "../lib/runs";
import { analyzeNews, chat, translateText, type NewsAnalysisResult } from "../lib/nim";
import { fetchEgyptNews, EGYPT_NEWS_SOURCES } from "../providers/egypt-news";
import { fetchSaudiNews, SAUDI_NEWS_SOURCES } from "../providers/saudi-news";
import { fetchGlobalNews, GLOBAL_NEWS_SOURCES } from "../providers/global-news";

const NEWS_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CATEGORIES = [
  { id: 1, en: "Macroeconomy", ar: "اقتصاد" },
  { id: 2, en: "Finance and Banking", ar: "مال وبنوك" },
  { id: 3, en: "Real Estate and Tourism", ar: "العقارات والسياحة" },
  { id: 4, en: "Healthcare", ar: "الصحة" },
  { id: 5, en: "Energy", ar: "طاقة" },
  { id: 6, en: "Technology and Telecom", ar: "اتصالات وتكنولوجيا المعلومات" },
  { id: 7, en: "Automotive and Transportation", ar: "النقل والسيارات" },
  { id: 8, en: "Industries", ar: "صناعات" },
  { id: 9, en: "Retail and Consumables", ar: "تجزئة وسلع استهلاكية" },
  { id: 10, en: "Education", ar: "تعليم" },
] as const;

export type NewsLang = "ar" | "en";

export type Feed = {
  lang: NewsLang;
  category: string;
  url: string;
};

export type Article = {
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
  lang: NewsLang;
  category: string;
  sourceId: string;
  sourceName: string;
  sourceWeight: number;
  sourceCategory: string;
  sourceRegion: "egypt" | "saudi" | "global" | "mena" | "gcc";
  matchText?: string;
};

type MatchType = "ticker" | "name";

type Alias = {
  value: string;
  type: MatchType;
  score: number;
};

type InstrumentAliases = {
  id: number;
  ticker: string;
  aliases: Alias[];
};

type Match = {
  instrumentId: number;
  matchType: MatchType;
  score: number;
};

type IngestResult = {
  itemsOk: number;
  itemsFailed: number;
  linked: number;
  instrumentsWithNews: number;
  queuedForAnalysis: number;
};

const FEEDS: Feed[] = CATEGORIES.flatMap((category) => [
  {
    lang: "en" as const,
    category: category.en,
    url: `https://www.arabfinance.com/en/rss/rssbycat/${category.id}`,
  },
  {
    lang: "ar" as const,
    category: category.ar,
    url: `https://www.arabfinance.com/ar/rss/rssbycat/${category.id}`,
  },
]);

const LEGAL_EN = [
  "s a e", "sae", "plc", "ltd", "limited", "company", "co", "inc", "incorporated",
];
const LEGAL_AR = ["ش م م", "شركه", "مساهمه"];

const GENERIC_TOKENS = new Set([
  "arab", "bank", "canal", "co", "company", "development", "egypt", "egyptian",
  "estate", "financial", "for", "general", "group", "holding", "holdings", "in",
  "international", "investment", "investments", "national", "of", "real",
  "suez", "the", "tourism", "united",
]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLegal(name: string, lang: NewsLang): string {
  let normalized = lang === "ar" ? normalizeArabic(name) : normalizeEnglish(name);

  for (const token of lang === "ar" ? LEGAL_AR : LEGAL_EN) {
    normalized = normalized.replace(
      new RegExp(`(?:^|\\s)${escapeRegExp(token)}(?=\\s|$)`, "g"),
      " ",
    );
  }

  return normalized.replace(/\s+/g, " ").trim();
}

function isGeneric(alias: string): boolean {
  const tokens = alias.split(" ").filter((token) => token.length >= 3);
  return tokens.length > 0 && tokens.every((token) => GENERIC_TOKENS.has(token));
}

function aliasesFor(
  name: string | null,
  lang: NewsLang,
  ticker: string,
): Alias[] {
  const aliases = new Map<string, Alias>();

  const add = (value: string, type: MatchType) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const score = trimmed.length;
    if (!aliases.has(trimmed) || aliases.get(trimmed)!.score < score) {
      aliases.set(trimmed, { value: trimmed, type, score });
    }
  };

  add(ticker, "ticker");

  if (name) {
    const full = stripLegal(name, lang);
    if (full.length >= 8 && full.split(" ").length >= 2 && !isGeneric(full)) {
      add(full, "name");
    }

    const beforeDash = name.split(" - ")[0];
    if (beforeDash && beforeDash !== name) {
      const short = stripLegal(beforeDash, lang);
      if (short.length >= 8 && short.split(" ").length >= 2 && !isGeneric(short)) {
        add(short, "name");
      }
    }

    for (const match of name.matchAll(/\(([^)]+)\)/g)) {
      const alias = stripLegal(match[1] ?? "", lang);
      if (alias.length >= 3 && alias.length <= 12 && alias.split(" ").length <= 3 && !isGeneric(alias)) {
        add(alias, "name");
      }
    }
  }

  return [...aliases.values()];
}

function matchesFor(
  originalText: string,
  normalizedText: string,
  instrumentsWithAliases: InstrumentAliases[],
): Match[] {
  const best = new Map<number, Match>();

  for (const instrument of instrumentsWithAliases) {
    for (const alias of instrument.aliases) {
      const matched =
        alias.type === "ticker"
          ? new RegExp(`(?<![A-Za-z0-9])${escapeRegExp(alias.value)}(?![A-Za-z0-9])`).test(originalText)
          : new RegExp(`(?:^|\\s)${escapeRegExp(alias.value)}(?=\\s|$)`, "u").test(normalizedText);

      if (!matched) continue;

      const current = best.get(instrument.id);
      if (!current || alias.score > current.score) {
        best.set(instrument.id, {
          instrumentId: instrument.id,
          matchType: alias.type,
          score: alias.score,
        });
      }
    }
  }

  return [...best.values()].sort((left, right) => right.score - left.score).slice(0, 3);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function loadInstrumentAliases(): Promise<InstrumentAliases[]> {
  const instrumentRows = await db
    .select({
      id: instruments.id,
      ticker: instruments.ticker,
      nameEn: instruments.nameEn,
      nameAr: instruments.nameAr,
    })
    .from(instruments)
    .where(eq(instruments.kind, "stock"));

  if (instrumentRows.length === 0) {
    throw new Error("No stocks; run the universe sync first");
  }

  return instrumentRows.map((instrument) => ({
    id: instrument.id,
    ticker: instrument.ticker,
    aliases: [
      ...aliasesFor(instrument.nameEn, "en", instrument.ticker),
      ...aliasesFor(instrument.nameAr, "ar", instrument.ticker),
    ],
  }));
}

async function ingestArticles(
  articles: Map<string, Article>,
  source: string,
  instrumentsWithAliases: InstrumentAliases[],
): Promise<IngestResult> {
  const fetchedAt = new Date();
  const values = [...articles.values()].map((article) => ({
    source,
    lang: article.lang,
    title: article.title,
    summary: article.summary,
    url: article.url,
    publishedAt: article.publishedAt,
    category: article.category,
    contentHash: hash(
      `${article.url}\n${normalizeArabic(normalizeEnglish(article.title))}`,
    ),
    fetchedAt,
    // New AI fields (will be populated by analysis job)
    originalLang: article.lang,
    sourceRegion: article.sourceRegion,
    sourceCategory: article.sourceCategory,
  }));

  const idsByUrl = new Map<string, number>();

  for (const chunk of chunks(values, 100)) {
    const inserted = await db
      .insert(newsItems)
      .values(chunk)
      .onConflictDoUpdate({
        target: newsItems.url,
        set: {
          title: sql`excluded.title`,
          summary: sql`excluded.summary`,
          publishedAt: sql`excluded.published_at`,
          category: sql`excluded.category`,
          contentHash: sql`excluded.content_hash`,
          fetchedAt: sql`excluded.fetched_at`,
          originalLang: sql`excluded.original_lang`,
          sourceRegion: sql`excluded.source_region`,
          sourceCategory: sql`excluded.source_category`,
        },
      })
      .returning({ id: newsItems.id, url: newsItems.url });

    for (const row of inserted) {
      idsByUrl.set(row.url, row.id);
    }
  }

  const links: {
    newsId: number;
    instrumentId: number;
    matchType: MatchType;
    matchScore: number;
  }[] = [];

  for (const article of articles.values()) {
    const newsId = idsByUrl.get(article.url);
    if (!newsId) continue;

    const originalText = `${article.matchText ?? article.title} ${article.summary ?? ""}`;
    const normalizedText = normalizeArabic(normalizeEnglish(originalText));
    const matches = matchesFor(originalText, normalizedText, instrumentsWithAliases);

    for (const match of matches) {
      links.push({
        newsId,
        instrumentId: match.instrumentId,
        matchType: match.matchType,
        matchScore: match.score,
      });
    }
  }

  for (const chunk of chunks(links, 200)) {
    await db.insert(newsInstrumentLinks).values(chunk).onConflictDoNothing();
  }

  // Queue for AI analysis (only new/updated items that haven't been processed)
  const unprocessedIds = [...idsByUrl.values()];
  let queuedForAnalysis = 0;

  for (const chunk of chunks(unprocessedIds, 50)) {
    const queueEntries = chunk.map((newsId) => ({
      newsId,
      status: "pending" as const,
      priority: 10,
    }));
    await db.insert(newsProcessingQueue).values(queueEntries).onConflictDoNothing();
    queuedForAnalysis += queueEntries.length;
  }

  return {
    itemsOk: values.length,
    itemsFailed: 0,
    linked: links.length,
    instrumentsWithNews: new Set(links.map((link) => link.instrumentId)).size,
    queuedForAnalysis,
  };
}

async function fetchAllSources(): Promise<Article[]> {
  const allArticles = new Map<string, Article>();

  // 1. Egypt sources
  console.log("[news] Fetching Egypt sources...");
  const egyptArticles = await fetchEgyptNews();
  for (const a of egyptArticles) allArticles.set(a.url, a);
  console.log(`[news] Egypt: ${egyptArticles.length} articles`);

  // 2. Saudi sources
  console.log("[news] Fetching Saudi sources...");
  const saudiArticles = await fetchSaudiNews();
  for (const a of saudiArticles) allArticles.set(a.url, a);
  console.log(`[news] Saudi: ${saudiArticles.length} articles`);

  // 3. Global sources
  console.log("[news] Fetching Global sources...");
  const globalArticles = await fetchGlobalNews();
  for (const a of globalArticles) allArticles.set(a.url, a);
  console.log(`[news] Global: ${globalArticles.length} articles`);

  // 4. Arab Finance (legacy - keep for backward compat)
  console.log("[news] Fetching Arab Finance...");
  const afArticles = await fetchArabFinance();
  for (const a of afArticles) allArticles.set(a.url, a);
  console.log(`[news] Arab Finance: ${afArticles.length} articles`);

  return [...allArticles.values()];
}

async function fetchArabFinance(): Promise<Article[]> {
  const articles = new Map<string, Article>();
  let failedFeeds = 0;

  for (const feed of FEEDS) {
    try {
      const response = await fetchWithRetry(
        feed.url,
        { headers: { "User-Agent": NEWS_USER_AGENT } },
        { retries: 2, timeoutMs: 20_000 },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const document = parser.parse(await response.text()) as unknown;
      const channel = asRecord(asRecord(asRecord(document)?.rss)?.channel);
      const items = asArray(channel?.item);

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

        if (!articles.has(url)) {
          articles.set(url, {
            title,
            summary: description,
            url,
            publishedAt,
            lang: feed.lang,
            category: feed.category,
            sourceId: "arabfinance",
            sourceName: "Arab Finance",
            sourceWeight: 0.7,
            sourceCategory: "news_agency",
            sourceRegion: "egypt",
          });
        }
      }
    } catch (error) {
      failedFeeds += 1;
      console.warn(`news feed failed: ${feed.url}: ${error instanceof Error ? error.message : String(error)}`);
    }
    await sleep(250);
  }

  return [...articles.values()];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

export async function syncNews() {
  return withIngestRun("news", "multi-source", async () => {
    const instrumentsWithAliases = await loadInstrumentAliases();

    const allArticlesArray = await fetchAllSources();

    if (allArticlesArray.length === 0) {
      throw new Error("No news items parsed from any source");
    }

    // Convert to Map for deduplication by URL
    const allArticles = new Map<string, Article>();
    for (const article of allArticlesArray) {
      const existing = allArticles.get(article.url);
      if (!existing || (article.sourceWeight ?? 0) > (existing.sourceWeight ?? 0)) {
        allArticles.set(article.url, article);
      }
    }

    const result = await ingestArticles(allArticles, "multi-source", instrumentsWithAliases);

    return {
      itemsOk: result.itemsOk,
      itemsFailed: 0,
      metadata: {
        sources: {
          egypt: EGYPT_NEWS_SOURCES.length,
          saudi: SAUDI_NEWS_SOURCES.length,
          global: GLOBAL_NEWS_SOURCES.length,
          arabfinance: FEEDS.length,
        },
        parsed: result.itemsOk,
        linked: result.linked,
        queuedForAnalysis: result.queuedForAnalysis,
        instrumentsWithNews: result.instrumentsWithNews,
      },
    };
  });
}

export async function processAnalysisQueue(batchSize = 20): Promise<{ processed: number; failed: number }> {
  // Get pending items
  const pending = await db
    .select({ newsId: newsProcessingQueue.newsId })
    .from(newsProcessingQueue)
    .where(eq(newsProcessingQueue.status, "pending"))
    .orderBy(desc(newsProcessingQueue.priority), newsProcessingQueue.createdAt)
    .limit(batchSize);

  if (pending.length === 0) {
    return { processed: 0, failed: 0 };
  }

  const newsIds = pending.map((p) => p.newsId);

  // Mark as processing
  await db
    .update(newsProcessingQueue)
    .set({ status: "processing", startedAt: new Date() })
    .where(inArray(newsProcessingQueue.newsId, newsIds));

  // Fetch full articles
  const articles = await db
    .select({
      id: newsItems.id,
      title: newsItems.title,
      summary: newsItems.summary,
      lang: newsItems.lang,
      originalLang: newsItems.originalLang,
      sourceRegion: newsItems.sourceRegion,
      sourceCategory: newsItems.sourceCategory,
    })
    .from(newsItems)
    .where(inArray(newsItems.id, newsIds));

  let processed = 0;
  let failed = 0;

  for (const article of articles) {
    try {
      const analysis = await analyzeNews(
        article.title,
        article.summary,
        (article.lang as "ar" | "en") ?? "ar",
        article.sourceRegion ?? "egypt",
        article.sourceCategory ?? "news_agency",
      );

      // Update news item with analysis
      await db
        .update(newsItems)
        .set({
          aiSummary: analysis.summary,
          aiKeyPoints: analysis.keyPoints,
          sentiment: analysis.sentiment,
          impactScore: analysis.impactScore,
          impactLevel: analysis.impactLevel,
          entities: analysis.entities,
          translatedTitle: analysis.translatedTitle,
          translatedSummary: analysis.translatedSummary,
          aiAdvice: analysis.advice,
          processedAt: new Date(),
          processingVersion: "nemotron-3-ultra-v1",
        })
        .where(eq(newsItems.id, article.id));

      // Mark queue item completed
      await db
        .update(newsProcessingQueue)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(newsProcessingQueue.newsId, article.id));

      processed++;
      console.log(`[news] Analyzed: ${article.id} - ${analysis.impactLevel} (${analysis.impactScore})`);

      // Small delay to avoid rate limits
      await sleep(500);
    } catch (error) {
      failed++;
      console.error(`[news] Analysis failed for ${article.id}:`, error);

      await db
        .update(newsProcessingQueue)
        .set({
          status: "failed",
          attempts: sql`${newsProcessingQueue.attempts} + 1`,
          error: error instanceof Error ? error.message : String(error),
        })
        .where(eq(newsProcessingQueue.newsId, article.id));
    }
  }

  return { processed, failed };
}

export async function syncNewsWithAnalysis() {
  console.log("[news] Starting full sync with AI analysis...");

  // 1. Fetch and ingest
  const syncResult = await syncNews();
  const metadata = syncResult.metadata as {
    sources: { egypt: number; saudi: number; global: number; arabfinance: number };
    parsed: number;
    linked: number;
    queuedForAnalysis: number;
    instrumentsWithNews: number;
  };
  console.log(`[news] Ingested: ${syncResult.itemsOk} items, linked: ${metadata.linked}, queued: ${metadata.queuedForAnalysis}`);

  // 2. Process analysis queue (run a few batches)
  let totalProcessed = 0;
  let totalFailed = 0;
  for (let i = 0; i < 5; i++) {
    const { processed, failed } = await processAnalysisQueue(20);
    totalProcessed += processed;
    totalFailed += failed;
    if (processed === 0) break;
  }

  console.log(`[news] AI Analysis: processed ${totalProcessed}, failed ${totalFailed}`);

  return {
    itemsOk: syncResult.itemsOk,
    itemsFailed: syncResult.itemsFailed ?? 0,
    metadata: {
      ...metadata,
      aiProcessed: totalProcessed,
      aiFailed: totalFailed,
    },
  };
}