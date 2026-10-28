import { eq, sql } from "drizzle-orm";
import { XMLParser } from "fast-xml-parser";

import { db } from "@egx/api/db";
import {
  instruments,
  newsInstrumentLinks,
  newsItems,
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
import {
  buildGoogleNewsUrl,
  GOOGLE_NEWS_QUERIES,
  parseGoogleNewsItem,
  publisherUrl,
} from "../providers/google-news";

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

type Feed = {
  lang: NewsLang;
  category: string;
  url: string;
};

type Article = {
  title: string;
  summary: string | null;
  url: string;
  publishedAt: Date;
  lang: NewsLang;
  category: string;
  /**
   * Optional extra text included when matching aliases. Google News titles
   * lose the publisher suffix, so the publisher name is passed here.
   */
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
  linked: number;
  instrumentsWithNews: number;
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
  "s a e",
  "sae",
  "plc",
  "ltd",
  "limited",
  "company",
  "co",
  "inc",
  "incorporated",
];

const LEGAL_AR = ["ش م م", "شركه", "مساهمه"];

const GENERIC_TOKENS = new Set([
  "arab",
  "bank",
  "canal",
  "co",
  "company",
  "development",
  "egypt",
  "egyptian",
  "estate",
  "financial",
  "for",
  "general",
  "group",
  "holding",
  "holdings",
  "in",
  "international",
  "investment",
  "investments",
  "national",
  "of",
  "real",
  "suez",
  "the",
  "tourism",
  "united",
]);

const parser = new XMLParser({
  ignoreAttributes: false,
  removeNSPrefix: true,
  trimValues: true,
});

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripLegal(name: string, lang: NewsLang): string {
  let normalized =
    lang === "ar" ? normalizeArabic(name) : normalizeEnglish(name);

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

  return (
    tokens.length > 0 && tokens.every((token) => GENERIC_TOKENS.has(token))
  );
}

function aliasesFor(
  name: string | null,
  lang: NewsLang,
  ticker: string,
): Alias[] {
  const aliases = new Map<string, Alias>();

  const add = (value: string, type: MatchType) => {
    const trimmed = value.trim();

    if (!trimmed) {
      return;
    }

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

      if (
        short.length >= 8 &&
        short.split(" ").length >= 2 &&
        !isGeneric(short)
      ) {
        add(short, "name");
      }
    }

    for (const match of name.matchAll(/\(([^)]+)\)/g)) {
      const alias = stripLegal(match[1] ?? "", lang);

      if (
        alias.length >= 3 &&
        alias.length <= 12 &&
        alias.split(" ").length <= 3 &&
        !isGeneric(alias)
      ) {
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
          ? new RegExp(
              `(?<![A-Za-z0-9])${escapeRegExp(alias.value)}(?![A-Za-z0-9])`,
            ).test(originalText)
          : new RegExp(
              `(?:^|\\s)${escapeRegExp(alias.value)}(?=\\s|$)`,
              "u",
            ).test(normalizedText);

      if (!matched) {
        continue;
      }

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

  return [...best.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }

  return result;
}

export async function loadInstrumentAliases(): Promise<InstrumentAliases[]> {
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

export async function ingestArticles(
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

    if (!newsId) {
      continue;
    }

    const originalText = `${
      article.matchText ?? article.title
    } ${article.summary ?? ""}`;
    const normalizedText = normalizeArabic(normalizeEnglish(originalText));
    const matches = matchesFor(
      originalText,
      normalizedText,
      instrumentsWithAliases,
    );

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

  return {
    itemsOk: values.length,
    linked: links.length,
    instrumentsWithNews: new Set(links.map((link) => link.instrumentId)).size,
  };
}

export async function syncNews() {
  return withIngestRun("news", "arabfinance", async () => {
    const instrumentsWithAliases = await loadInstrumentAliases();

    const articles = new Map<string, Article>();
    let failedFeeds = 0;

    for (const feed of FEEDS) {
      try {
        const response = await fetchWithRetry(
          feed.url,
          { headers: { "User-Agent": NEWS_USER_AGENT } },
          { retries: 2, timeoutMs: 20_000 },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const document = parser.parse(await response.text()) as unknown;
        const channel = asRecord(asRecord(asRecord(document)?.rss)?.channel);
        const items = asArray(channel?.item);

        for (const item of items) {
          const node = asRecord(item);

          if (!node) {
            continue;
          }

          const title = textValue(node.title);
          const link = textValue(node.link);
          const publishedRaw =
            textValue(node.updated) ?? textValue(node.pubDate);

          if (!title || !link || !publishedRaw) {
            continue;
          }

          const url = canonicalUrl(link);
          const publishedAt = new Date(publishedRaw);

          if (!url || Number.isNaN(publishedAt.getTime())) {
            continue;
          }

          if (!articles.has(url)) {
            articles.set(url, {
              title,
              summary: textValue(node.description),
              url,
              publishedAt,
              lang: feed.lang,
              category: feed.category,
            });
          }
        }
      } catch (error) {
        failedFeeds += 1;
        console.warn(
          `news feed failed: ${feed.url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      await sleep(250);
    }

    if (articles.size === 0) {
      throw new Error("No news items parsed from Arab Finance");
    }

    const result = await ingestArticles(
      articles,
      "arabfinance",
      instrumentsWithAliases,
    );

    return {
      itemsOk: result.itemsOk,
      itemsFailed: failedFeeds,
      metadata: {
        feeds: FEEDS.length,
        parsed: result.itemsOk,
        linked: result.linked,
        instrumentsWithNews: result.instrumentsWithNews,
      },
    };
  });
}

export async function syncGoogleNews() {
  return withIngestRun("news", "google-news", async () => {
    const instrumentsWithAliases = await loadInstrumentAliases();
    const articles = new Map<string, Article>();
    let failedFeeds = 0;
    const parsedByQuery = new Map<string, number>();

    for (const queryConfig of GOOGLE_NEWS_QUERIES) {
      const url = buildGoogleNewsUrl(queryConfig);

      try {
        const response = await fetchWithRetry(
          url,
          { headers: { "User-Agent": NEWS_USER_AGENT } },
          { retries: 2, timeoutMs: 20_000 },
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const document = parser.parse(await response.text()) as unknown;
        const channel = asRecord(asRecord(asRecord(document)?.rss)?.channel);
        const items = asArray(channel?.item);
        let parsed = 0;

        for (const item of items) {
          const node = asRecord(item);

          if (!node) {
            continue;
          }

          const source = parseGoogleNewsItem(node);

          if (!source) {
            continue;
          }

          const canonical = publisherUrl(answerDescription(node));
          const publishedAt = new Date(source.publishedRaw);

          if (Number.isNaN(publishedAt.getTime())) {
            continue;
          }

          const target = canonical ?? canonicalUrl(source.link);

          if (!target) {
            continue;
          }

          if (!articles.has(target)) {
            parsed += 1;
            articles.set(target, {
              title: stripPublisherSuffix(
                source.title,
                source.publisherName,
              ),
              summary: null,
              url: target,
              publishedAt,
              lang: queryConfig.lang,
              category: queryConfig.category,
              matchText: source.publisherName ?? undefined,
            });
          }
        }

        parsedByQuery.set(queryConfig.query, parsed);
      } catch (error) {
        failedFeeds += 1;
        console.warn(
          `news feed failed: ${url}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }

      await sleep(250);
    }

    if (articles.size === 0) {
      throw new Error("No news items parsed from Google News");
    }

    const result = await ingestArticles(
      articles,
      "google-news",
      instrumentsWithAliases,
    );

    return {
      itemsOk: result.itemsOk,
      itemsFailed: failedFeeds,
      metadata: {
        queries: GOOGLE_NEWS_QUERIES.length,
        parsedByQuery: Object.fromEntries(parsedByQuery),
        parsed: result.itemsOk,
        linked: result.linked,
        instrumentsWithNews: result.instrumentsWithNews,
      },
    };
  });
}

function answerDescription(node: Record<string, unknown>): string | null {
  const value = node.description;

  return typeof value === "string" ? value : null;
}

function stripPublisherSuffix(
  title: string,
  publisherName: string | null,
): string {
  if (!publisherName) {
    return title;
  }

  const suffix = ` - ${publisherName}`;

  return title.toLowerCase().endsWith(suffix.toLowerCase())
    ? title.slice(0, title.length - suffix.length).trim()
    : title;
}
