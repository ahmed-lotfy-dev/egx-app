# News AI Analysis Feature

## Overview

**Feature Name:** News AI Analysis (M4 Milestone)
**Status:** ✅ Implemented & Deployed
**Branch:** `feat/m3-stock-detail`
**Completion Date:** 2026-10-30
**Related PR/Commits:** `1114c87` (mobile), `5757257` (worker/api), earlier commits for analysis pipeline

---

## 1. Feature Summary

The News AI Analysis feature replaces the placeholder "Coming Soon" news tab with a production-grade, AI-powered financial news aggregator covering Egyptian, Saudi, and global markets. It ingests from 50+ sources, analyzes every article using NVIDIA Nemotron 3 Ultra (550B params), and presents actionable intelligence with sentiment, impact scoring, entity extraction, and trading signals — all filterable and translatable in real-time.

### Key Capabilities
- **50+ news sources** across Egypt, Saudi Arabia, and global markets
- **AI analysis per article**: summary, key points, sentiment, impact score, entities, trading signals
- **Real-time filters**: region, sentiment, impact level, AI-only toggle
- **Arabic-first UI** with full English translation
- **Translated content** for Arabic users (titles, summaries, AI analysis)
- **Trading signal badges**: earnings, dividends, mergers, regulatory, analyst ratings, etc.
- **Processing queue** for async AI analysis with priority handling

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           NEWS SYSTEM ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │   SOURCES    │──▶│   FETCHER    │──▶│  DEDUPE &    │──▶│  DATABASE  │  │
│  │  (RSS/HTML)  │   │  (parallel)  │   │  INGEST      │   │  (news_    │  │
│  └──────────────┘   └──────────────┘   │  (URL +      │   │  items,    │  │
│         │              │              │   content     │   │  queue)    │  │
│         ▼              ▼              │   hash +      │   └─────┬──────┘  │
│  ┌──────────────────────────────┐     │   title sim)  │         │        │
│  │      NEWS PROCESSING         │     └───────┬───────┘         ▼        │
│  │   QUEUE (async, priority)    │────────────▶│  NVIDIA NIM  │           │
│  │  (news_processing_queue)     │             │  (Nemotron   │           │
│  └──────────────────────────────┘             │   3 Ultra)   │           │
│         │                                     └──────┬───────┘           │
│         ▼                                           │                   │
│  ┌──────────────────────────────────────────────────▼─────────────────┐  │
│  │                        AI ANALYSIS PIPELINE                          │  │
│  │  • Summary (2-3 sentences)          • Sentiment (bullish/bearish)  │  │
│  │  • Key Points (3-5 bullets)         • Impact Score (0-100)         │  │
│  │  • Entity Extraction (tickers,      • Impact Level (crit/high/med)  │  │
│  │    sectors, countries, people)      • Trading Signals              │  │
│  │  • Translation (AR↔EN)              • Translated Title/Summary     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│         │                                                                    │
│         ▼                                                                    │
│  ┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐     │
│  │   API LAYER      │    │   MOBILE APP     │    │   SCHEDULER      │     │
│  │  /api/news       │◀───│  NewsScreen      │    │  (cron + market  │     │
│  │  • filters       │    │  • filters       │    │   hours)         │     │
│  │  • pagination    │    │  • AI badges     │    │  • Fajr daily    │     │
│  │  • AI fields     │    │  • translations  │    │  • 3x/day        │     │
│  └──────────────────┘    └──────────────────┘    │  • continuous    │     │
│                                                  │    in-session    │     │
│                                                  └──────────────────┘     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Backend Implementation

### 3.1 Worker Jobs (`apps/worker/src/jobs/news.ts`)

**Entry Points:**
- `syncNews()` — Full ingestion from all sources, queues for AI analysis
- `syncNewsWithAnalysis()` — Ingestion + processes 5 batches (20 items each)
- `processAnalysisQueue(batchSize)` — Consumes queue, calls NIM, updates DB

**Key Functions:**
```typescript
// Ingest articles with deduplication
async function ingestArticles(
  articles: Map<string, Article>,
  source: string,
  instrumentsWithAliases: InstrumentAliases[]
): Promise<IngestResult>

// Process AI analysis queue
async function processAnalysisQueue(batchSize = 20): Promise<{ processed, failed }>

// Analyze single article via NIM
async function analyzeNews(
  title: string,
  summary: string | null,
  lang: "ar" | "en",
  sourceRegion: string,
  sourceCategory: string
): Promise<NewsAnalysisResult>
```

**Deduplication Strategy:**
1. Canonical URL (strip query/hash, lowercase host)
2. Content hash: `SHA256(url + normalized(title))`
3. Upsert on `news_items.url` (unique constraint)

**Entity Linking (Conservative):**
- Ticker: exact word boundary match (`\bTICKER\b`)
- Company name: ≥8 chars, ≥2 tokens, strip legal suffixes
- Aliases: full name, pre-dash name, parenthetical (e.g., `CIB`)
- Reject generic single words (bank, egypt, group, etc.)

### 3.2 News Providers (`apps/worker/src/providers/`)

| Provider | File | Sources | Region | Lang |
|----------|------|---------|--------|------|
| Egypt | `egypt-news.ts` | 29 (EGX, Mubasher, Al Mal, Youm7, Ahram, Masrawy, Shorouk, Dostor, Arab Finance 20) | Egypt | AR/EN |
| Saudi | `saudi-news.ts` | 8 (Tadawul, Argaam, Sahm, SPA, Alkhaleej, Alyaum, Al Eqtisadiah, Saudi Gazette) | Saudi | AR/EN |
| Global | `global-news.ts` | 13 (Reuters, Bloomberg, CNBC, Investing.com, MarketWatch, FT, WSJ + 6 Arabic) | Global/MENA/GCC | AR/EN |

**Source Config:**
```typescript
type Source = {
  id: string;
  name: string;
  url: string;
  lang: "ar" | "en";
  category: "official" | "news_agency" | "analyst";
  weight: number;  // 0.7-1.0 for impact scoring
  parser: "rss" | "html";
}
```

**Parser:**
- RSS: `fast-xml-parser` with attribute support
- HTML: Regex-based (EGX disclosures table)

### 3.3 NVIDIA NIM Integration (`apps/worker/src/lib/nim.ts`)

**Model:** `nvidia/nemotron-3-ultra-550b-a55b` (550B params)

**Available Models (tested 2026-10-30):**
| Model | Status |
|-------|--------|
| `nvidia/nemotron-3-ultra-550b-a55b` | ✅ Working |
| `meta/llama-3.3-70b-instruct` | ❌ EOL 2026-08-26 |
| `meta/llama-3.1-70b/8b` | ❌ EOL 2026-08-26 |
| `nvidia/nv-embedqa-e5-v5` | ❌ EOL 2026-08-25 |

**API Pattern (OpenAI-compatible):**
```typescript
POST https://integrate.api.nvidia.com/v1/chat/completions
Headers: Authorization: Bearer ${NVIDIA_API_KEY}, Content-Type: application/json
Body: { model, messages, max_tokens, temperature, response_format: { type: "json_object" } }
```

**Analysis Prompt Structure:**
```json
{
  "summary": "2-3 sentence Arabic summary",
  "keyPoints": ["bullet1", "bullet2", ...],
  "sentiment": "bullish|bearish|neutral|mixed",
  "impactScore": 0-100,
  "impactLevel": "critical|high|medium|low",
  "entities": { tickers, sectors, countries, people, companies },
  "tradingSignals": ["earnings", "dividend", "merger", ...],
  "translatedTitle": "AR/EN",
  "translatedSummary": "AR/EN"
}
```

**Rate Limiting:** 500ms delay between requests, max 20 per batch, 5 batches per run.

### 3.4 Database Schema (`apps/api/src/db/schema/market.ts`)

**`news_items` table (new columns):**
```sql
-- AI fields
original_lang          text,
translated_title       text,
translated_summary     text,
ai_summary             text,
ai_key_points          jsonb,
sentiment              text,        -- 'bullish'|'bearish'|'neutral'|'mixed'
impact_score           integer,     -- 0-100
impact_level           text,        -- 'critical'|'high'|'medium'|'low'
entities               jsonb,       -- {tickers:[], sectors:[], countries:[], people:[], companies:[]}
source_region          text,        -- 'egypt'|'saudi'|'global'|'mena'|'gcc'
source_category        text,        -- 'official'|'news_agency'|'analyst'
processed_at           timestamptz,
processing_version     text,        -- 'nemotron-3-ultra-v1'
trading_signals        jsonb        -- ['earnings','dividend','merger',...]
```

**Indexes:**
```sql
CREATE INDEX news_items_impact_idx ON news_items (impact_score DESC, published_at DESC);
CREATE INDEX news_items_region_idx ON news_items (source_region);
CREATE INDEX news_items_sentiment_idx ON news_items (sentiment);
CREATE INDEX news_items_entities_gin ON news_items USING GIN (entities);
```

**`news_processing_queue` table:**
```sql
CREATE TABLE news_processing_queue (
  id            bigserial PRIMARY KEY,
  news_id       bigint REFERENCES news_items(id) ON DELETE CASCADE,
  status        text DEFAULT 'pending',  -- 'pending'|'processing'|'completed'|'failed'
  priority      integer DEFAULT 0,        -- higher = first
  attempts      integer DEFAULT 0,
  error         text,
  created_at    timestamptz DEFAULT now(),
  started_at    timestamptz,
  completed_at  timestamptz
);
CREATE INDEX news_processing_queue_status_priority_idx 
  ON news_processing_queue (status, priority DESC, created_at);
```

### 3.5 API Routes (`apps/api/src/routes/news.ts`)

**Endpoint:** `GET /api/news`

**Query Parameters:**
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `feed` | `market`\|`economy` | required | Partition: market=has instrument links, economy=no links |
| `limit` | integer | 20 | 1-30 |
| `cursor` | string | - | Opaque base64url of `publishedAt|id` |
| `lang` | `ar`\|`en` | - | Filter by article language |
| `region` | enum | - | `egypt`\|`saudi`\|`global`\|`mena`\|`gcc` |
| `sentiment` | enum | - | `bullish`\|`bearish`\|`neutral`\|`mixed` |
| `impactMin` | int 0-100 | - | Minimum impact score |
| `impactLevel` | enum | - | `critical`\|`high`\|`medium`\|`low` |
| `sourceCategory` | string | - | `official`\|`news_agency`\|`analyst` |
| `hasAI` | boolean | - | Filter by AI analysis presence |
| `entities` | string | - | Comma-separated tickers/sectors |

**Response:**
```json
{
  "data": [
    {
      "id": 123,
      "source": "mubasher",
      "lang": "ar",
      "title": "عنوان الخبر",
      "summary": "ملخص...",
      "url": "https://...",
      "publishedAt": "2026-10-30T10:30:00Z",
      "category": "Finance and Banking",
      "aiSummary": "ملخص ذكي...",
      "aiKeyPoints": ["نقطة 1", "نقطة 2"],
      "sentiment": "bullish",
      "impactScore": 85,
      "impactLevel": "high",
      "entities": { "tickers": ["COMI"], "sectors": ["banking"], ... },
      "translatedTitle": "English Title",
      "translatedSummary": "English summary...",
      "sourceRegion": "egypt",
      "sourceCategory": "news_agency",
      "tradingSignals": ["earnings", "dividend"]
    }
  ],
  "meta": { "nextCursor": "...", "limit": 20, "feed": "market", "asOf": "..." }
}
```

---

## 4. Frontend Implementation (Mobile)

### 4.1 News Screen (`apps/mobile/src/app/(app)/(tabs)/news.tsx`)

**Component Structure:**
```
NewsScreen
├── ListHeaderComponent
│   ├── Title: "الأخبار"
│   ├── Segmented Control: [السوق | الاقتصاد]
│   ├── Filter Button (funnel icon) → expands FilterChips
│   │   ├── Region Chips (Egypt, Saudi, Global, MENA, GCC)
│   │   ├── Sentiment Chips (Bullish🟢, Bearish🔴, Neutral⚪, Mixed🟡)
│   │   ├── Impact Chips (Critical🔴, High🔴, Medium🟡, Low⚪)
│   │   └── AI Toggle (✨ AI Analysis)
│   └── Clear Filters (when active)
├── FlatList (data + infinite scroll)
│   └── NewsCard (per item)
├── RefreshControl (pull-to-refresh)
└── ListFooterComponent (skeletons, error, empty, end-of-list)
```

**NewsCard Features:**
- **Header row:** Source + relative time + region flag + AI sparkles badge
- **Title:** Translated (AR/EN) based on app locale
- **AI Summary Card** (gold border): Summary + key points (✨ icon)
- **Original Summary** (if no AI)
- **Badge Row:**
  - Sentiment: 📈 bullish / 📉 bearish / ➖ neutral / 🔄 mixed
  - Impact: 🔴 critical/high / 🟡 medium / ⚪ low
  - Tickers: from `entities.tickers`
  - Trading Signals: 📊 earnings, 💰 dividend, 🤝 merger, etc.
- **Category chip** at bottom
- **Tap →** Opens in `expo-web-browser` (custom tab)

**Filters State:**
```typescript
type FilterState = {
  region: "all" | "egypt" | "saudi" | "global" | "mena" | "gcc";
  sentiment: "all" | "bullish" | "bearish" | "neutral" | "mixed";
  impactLevel: "all" | "critical" | "high" | "medium" | "low";
  hasAI: boolean;
};
```

**Data Fetching:**
```typescript
useInfiniteQuery({
  queryKey: ["news", feed, filters],
  queryFn: async ({ pageParam }) => api.GET("/api/news", {
    params: { query: { feed, limit: 20, cursor: pageParam, ...filters } }
  }),
  getNextPageParam: (lastPage) => lastPage.meta.nextCursor
});
```

### 4.2 Locale Strings (`apps/mobile/src/locales/ar.json`, `en.json`)

**New keys under `newsTab`:**
```json
{
  "filterAllRegions": "كل المناطق",
  "filterEgypt": "مصر",
  "filterSaudi": "السعودية",
  "filterGlobal": "عالمي",
  "filterMena": "الشرق الأوسط وشمال أفريقيا",
  "filterGcc": "الخليج",
  "filterAllSentiments": "كل المشاعر",
  "filterBullish": "إيجابي",
  "filterBearish": "سلبي",
  "filterNeutral": "محايد",
  "filterMixed": "مختلط",
  "filterAllImpact": "كل التأثير",
  "filterCritical": "حرج",
  "filterHigh": "عالي",
  "filterMedium": "متوسط",
  "filterLow": "منخفض",
  "filterHasAI": "بتحليل ذكي",
  "filterHasAIOn": "نعم",
  "filterHasAIOff": "لا",
  "clearFilters": "مسح الفلاتر",
  "aiBadge": "ذكي",
  "aiSummary": "ملخص ذكي",
  "sentiment": { "bullish": "إيجابي", "bearish": "سلبي", "neutral": "محايد", "mixed": "مختلط" },
  "impact": { "critical": "حرج", "high": "عالي", "medium": "متوسط", "low": "منخفض" },
  "signal": { "earnings": "أرباح", "dividend": "توزيعات", "merger": "اندماج", ... }
}
```

---

## 5. Scheduling & Cron

### 5.1 Worker Container Schedule (`apps/worker/src/scheduler.ts` — planned)

```typescript
export const NEWS_SCHEDULE = {
  // Daily at Fajr (~04:30 Cairo = 02:30 UTC)
  daily_fajr: {
    cron: "30 2 * * *",
    jobs: ["fetch_all_sources", "process_queue"],
  },
  // 3x per day outside market hours
  three_times_daily: {
    cron: "0 2,10,18 * * *",  // 04:00, 12:00, 20:00 Cairo
    jobs: ["fetch_incremental", "process_queue"],
  },
  // Continuous during market hours (10:00-15:00 Cairo = 08:00-13:00 UTC)
  market_hours: {
    intervalMinutes: 5,
    activeHours: { start: 8, end: 13, timezone: "UTC" },
    jobs: ["fetch_breaking", "process_queue_high_priority"],
  },
};
```

### 5.2 Current Manual Triggers
```bash
# Full sync + analysis (dev)
bun --env-file=.env apps/worker/src/cli.ts news:full

# Just analysis queue
bun --env-file=.env apps/worker/src/cli.ts news:analyze

# Ingestion only
bun --env-file=.env apps/worker/src/cli.ts news
```

---

## 6. Contracts (`packages/contracts/src/market.ts`)

**FeedNewsItemSchema** (extended):
```typescript
{
  id: number,
  source: string,
  lang: "ar" | "en",
  title: string,
  summary: string | null,
  url: string,
  publishedAt: ISODateTime,
  category: string | null,
  // AI fields
  aiSummary: string | null,
  aiKeyPoints: string[],
  sentiment: "bullish" | "bearish" | "neutral" | "mixed",
  impactScore: number | null,
  impactLevel: "critical" | "high" | "medium" | "low" | null,
  entities: {
    tickers: string[],
    sectors: string[],
    countries: string[],
    people: string[],
    companies: string[]
  } | null,
  translatedTitle: string | null,
  translatedSummary: string | null,
  sourceRegion: string | null,
  sourceCategory: string | null,
  tradingSignals: string[]
}
```

**Transform:** Ensures `aiKeyPoints: string[]` and `entities` default to empty arrays.

---

## 7. Environment Variables

**Root `.env`:**
```bash
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxx
NVIDIA_NIM_MODEL=nvidia/nemotron-3-ultra-550b-a55b
```

**Worker `.env`:** Inherits from root via `bun --env-file=../../.env`

---

## 8. Testing & Verification

### 8.1 Local Testing
```bash
# 1. Clear existing news
psql $DATABASE_URL -c "TRUNCATE news_items, news_instrument_links, news_processing_queue RESTART IDENTITY CASCADE;"

# 2. Run full sync with analysis
bun --env-file=.env apps/worker/src/cli.ts news:full

# 3. Verify DB
psql $DATABASE_URL -c "SELECT count(*) FROM news_items WHERE ai_summary IS NOT NULL;"
psql $DATABASE_URL -c "SELECT impact_level, count(*) FROM news_items GROUP BY impact_level;"

# 4. Test API
curl "http://localhost:3000/api/news?feed=market&limit=5&hasAI=true&impactMin=70"
```

### 8.2 Production Verification
```bash
# Deploy API (CI/CD auto-deploys on push)
# Run worker on server
ssh ubuntu@139.185.55.63 "docker exec egx-api bun src/cli.ts news:full"

# Verify production endpoint
curl "https://egx-api.alotfy.site/api/news?feed=market&limit=5&hasAI=true"
```

### 8.3 Sample Production Results (2026-10-30)
| Metric | Value |
|--------|-------|
| Total articles | 1,158 |
| Egypt sources | 993 |
| Saudi sources | 50 |
| Global sources | 115 |
| AI analyzed | 34+ (ongoing) |
| Instruments linked | 52 |
| Impact distribution | critical: 0, high: 4, medium: 20, low: 10 |

---

## 9. Deployment Notes

### 9.1 API Deployment (Vercel/OCI)
- Auto-deploys on push to `feat/m3-stock-detail` via GitHub Actions
- Docker image built with `apps/api/Dockerfile`
- Runs `docker compose up -d` on OCI micro VM

### 9.2 Worker Deployment
**Option A: Same container (current)**
```bash
# On OCI server
docker exec egx-api bun src/cli.ts news:full
```

**Option B: Dedicated worker service (planned)**
```yaml
# docker-compose.yml
egx-worker:
  image: ghcr.io/ahmed-lotfy-dev/egx-api:latest
  command: bun src/scheduler.ts
  depends_on: [db]
  environment: *env
```

### 9.3 Mobile Deployment
```bash
cd apps/mobile
eas update --branch preview --environment preview \
  --message "News tab: AI analysis, filters, multi-source"
```
- Update ID: `b8807a04-ee77-4b8d-a920-f22b5ab4eb48`
- Available on Expo Go immediately

---

## 10. Performance & Cost

### 9.1 API Performance
- First request (cold): 15-48s (Caddy 502 past 40s)
- Warm requests: ~225ms
- Pagination: keyset cursor, no offset

### 9.2 NVIDIA NIM Costs
- Model: Nemotron 3 Ultra (550B)
- ~200-400 tokens per analysis
- ~1158 articles → ~400K tokens/day
- Negligible on free tier / pay-per-use

### 9.3 Database
- ~1158 new items per full sync
- Processing queue: ~1000 pending after first sync
- Indexes on `impact_score`, `source_region`, `sentiment`, `entities` (GIN)

---

## 11. Known Issues & Limitations

| Issue | Severity | Mitigation |
|-------|----------|------------|
| Some RSS feeds return 404/401 | Medium | Graceful degradation, log warnings |
| EGX disclosures HTML parsing fragile | Medium | Add more robust selectors |
| Nemotron 3 Ultra only working model | Low | Single-model pipeline, no embeddings |
| No scheduled cron in production | High | Deploy scheduler container |
| Translation quality not validated | Medium | Manual spot-check, user feedback |
| Duplicate detection: syndicated copies | Low | Acceptable for v1 |

---

## 12. Future Enhancements

### 12.1 Short-term (v1.1)
- [ ] Deploy scheduler container with cron
- [ ] Add "breaking news" push notifications
- [ ] Improve EGX disclosures HTML parser
- [ ] Add source credibility weight to impact score

### 12.2 Medium-term (v2)
- [ ] MuslimXchange integration for Sharia compliance news
- [ ] Historical sentiment trends per stock
- [ ] "Daily Brief" AI-generated market summary card
- [ ] Watchlist-filtered news (أسهمي tab)

### 12.3 Long-term (v3)
- [ ] Custom fine-tuned model for EGX terminology
- [ ] Real-time WebSocket feed for market hours
- [ ] Analyst report ingestion (PDF parsing)
- [ ] Social sentiment (Twitter/X integration)

---

## 13. Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-10-28 | Use EGX33 official list for Sharia v1 | Free, official, immediate; MuslimXchange for v2 |
| 2026-10-28 | Nemotron 3 Ultra as single model | Only working model on key; handles all NLP tasks |
| 2026-10-28 | Content-hash + URL dedupe | No embedding model available; sufficient for v1 |
| 2026-10-29 | EGX33 placeholder in watchlist | Real data when sharia_status table populated |
| 2026-10-30 | 50+ sources across 3 regions | Comprehensive coverage, source diversity |
| 2026-10-30 | Processing queue with priority | Breaking news first, batch for batch |
| 2026-10-30 | Arabic-first with translation | Primary user base is Arabic-speaking |
| 2026-10-30 | Trading signals as separate array | Actionable for buy/sell decisions |

---

## 14. File Inventory

### Backend
| File | Purpose |
|------|---------|
| `apps/worker/src/jobs/news.ts` | Main ingestion + analysis orchestration |
| `apps/worker/src/lib/nim.ts` | NIM client wrapper + analysis prompts |
| `apps/worker/src/providers/egypt-news.ts` | 29 Egypt sources |
| `apps/worker/src/providers/saudi-news.ts` | 8 Saudi sources |
| `apps/worker/src/providers/global-news.ts` | 13 Global sources |
| `apps/worker/src/lib/parse.ts` | Shared XML/URL utilities |
| `apps/worker/src/config/env.ts` | Worker env validation |
| `apps/worker/src/cli.ts` | CLI commands (news, news:analyze, news:full) |
| `apps/api/src/routes/news.ts` | `/api/news` endpoint with filters |
| `apps/api/src/db/schema/market.ts` | DB schema (news_items, queue) |
| `apps/api/src/db/migrations/0004_*.sql` | trading_signals column |

### Frontend
| File | Purpose |
|------|---------|
| `apps/mobile/src/app/(app)/(tabs)/news.tsx` | NewsScreen + NewsCard + Filters |
| `apps/mobile/src/locales/ar.json` | Arabic strings (24 new keys) |
| `apps/mobile/src/locales/en.json` | English strings (24 new keys) |

### Contracts & Config
| File | Purpose |
|------|---------|
| `packages/contracts/src/market.ts` | FeedNewsItemSchema + tradingSignals |
| `.env` / `.env.example` | NVIDIA_API_KEY, NIM_MODEL |

---

## 15. Changelog

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-10-28 | Spec approved, placeholder News tab |
| 1.1.0 | 2026-10-29 | Worker refactor, Google News provider |
| 1.2.0 | 2026-10-30 | **Full redesign**: multi-source, NIM AI, filters, mobile UI, queue |
| 1.2.1 | 2026-10-30 | trading_signals column, mobile filter chips, locale keys |

---

## 16. Contact & Ownership

- **Owner:** Ahmed Lotfy
- **Repository:** `github.com/ahmed-lotfy-dev/egx-app`
- **Branch:** `feat/m3-stock-detail` (latest: `1114c87`)
- **Deployed API:** `https://egx-api.alotfy.site`
- **Mobile Preview:** Expo `preview` branch, update `b8807a04-ee77-4b8d-a920-f22b5ab4eb48`

---

*Document generated: 2026-10-30 | Last updated: 2026-10-30*