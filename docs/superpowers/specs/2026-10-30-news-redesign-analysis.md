# News System Redesign - Test & Architecture Analysis

Date: 2026-10-30
Status: Analysis Phase

## Current State Assessment

### What Exists Now
- **Sources**: Arab Finance RSS (10 categories × AR/EN = 20 feeds) + Google News RSS (6 queries)
- **Worker**: `apps/worker/src/jobs/news.ts` - runs `syncNews()` + `syncGoogleNews()`
- **Providers**: `arabfinance` + `google-news` in `apps/worker/src/providers/`
- **API**: `GET /api/news?feed=market|economy&limit&cursor&lang`
- **Schema**: `news_items` + `news_instrument_links` (partition by EXISTS/NOT EXISTS)
- **Mobile**: News tab with market/economy segmented control

### What Needs to Change (Per Requirements)

| Area | Current | Target |
|------|---------|--------|
| **Sources** | Arab Finance + Google News | Multiple Egyptian (EGX-focused), Saudi, Global/Universal |
| **Languages** | AR/EN stored separately | Translate on-demand based on app locale |
| **AI Processing** | None | NVIDIA NIM models for summarization + relevance scoring |
| **Relevance** | Binary (linked/unlinked) | Multi-dimensional: trading impact, sentiment, entity extraction |
| **UI Filters** | market/economy only | Source, region, impact level, sentiment, entities, time |
| **Schedule** | Manual `worker news` | Daily at Fajr + 3x/day + continuous during market hours |
| **Architecture** | Monolithic job | Modular pipeline: fetch → translate → analyze → score → store |

---

## NVIDIA NIM Integration Analysis

### Available from SelfTracker
```typescript
// From selfTracker/backend/src/config/nim.ts
{
  baseUrl: "https://integrate.api.nvidia.com/v1",
  apiKey: process.env.NVIDIA_API_KEY,  // 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
  chatModel: "meta/llama-3.3-70b-instruct",
  embeddingModel: "nvidia/nv-embedqa-e5-v5",
  embeddingDimensions: 1024,
  timeout: 120_000,
}
```

### Models Available via NVIDIA NIM (Tested 2026-10-30)

**Working with current API key:**
| Model | Purpose | Notes |
|-------|---------|-------|
| `nvidia/nemotron-3-ultra-550b-a55b` | **All NLP tasks** | 550B params - summarization, entity extraction, sentiment, translation, impact scoring, trading signal detection |

**EOL / Not Available (as of 2026-10-30):**
- `meta/llama-3.3-70b-instruct` (EOL 2026-08-26)
- `meta/llama-3.1-70b/8b-instruct` (EOL 2026-08-26)
- `meta/llama-3.2-3b/1b-instruct` (EOL 2026-08-26)
- `nvidia/nv-embedqa-e5-v5` (EOL 2026-08-25)
- `nvidia/nv-embed-v1` (EOL 2026-08-25)
- `google/gemma-2-9b-it`, `microsoft/phi-3.5-mini-instruct`, `mistralai/mistral-large` - not available on this key

**Implication for Architecture:**
- Single-model pipeline: Nemotron 3 Ultra handles all NLP tasks
- No separate embedding model → use content-hash + title similarity for deduplication
- Translation: Nemotron can translate AR↔EN↔FA with high quality
- Structured output: Use JSON mode / strict prompting for entity extraction, sentiment, impact scoring

### API Pattern (from selfTracker)
```typescript
// Base URL: https://integrate.api.nvidia.com/v1/chat/completions
// Headers: Authorization: Bearer ${NVIDIA_API_KEY}, Content-Type: application/json
// OpenAI-compatible format
```

---

## Required Architecture Changes

### 1. Database Schema Extensions

```sql
-- Enhanced news_items
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS 
  original_lang text,           -- 'ar', 'en', 'fa', etc.
  translated_title text,        -- translated to app locale
  translated_summary text,      -- translated to app locale
  ai_summary text,              -- NVIDIA-generated summary
  ai_key_points jsonb,          -- bullet points
  sentiment text,               -- 'bullish', 'bearish', 'neutral', 'mixed'
  impact_score integer,         -- 0-100 trading relevance
  impact_level text,            -- 'critical', 'high', 'medium', 'low'
  entities jsonb,               -- {tickers: [], sectors: [], countries: [], people: []}
  source_region text,           -- 'egypt', 'saudi', 'gcc', 'global'
  source_category text,         -- 'official', 'analyst', 'news_agency', 'social'
  processed_at timestamptz,     -- when AI processing completed
  processing_version text;      -- model version for reprocessing

-- Index for filtering
CREATE INDEX IF NOT EXISTS news_items_impact_idx ON news_items (impact_score DESC, published_at DESC);
CREATE INDEX IF NOT EXISTS news_items_region_idx ON news_items (source_region);
CREATE INDEX IF NOT EXISTS news_items_sentiment_idx ON news_items (sentiment);
CREATE INDEX IF NOT EXISTS news_items_entities_gin ON news_items USING GIN (entities);

-- Processing queue for async AI work
CREATE TABLE IF NOT EXISTS news_processing_queue (
  id bigserial PRIMARY KEY,
  news_id bigint NOT NULL REFERENCES news_items(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
  priority integer DEFAULT 0,
  attempts integer DEFAULT 0,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);
CREATE INDEX ON news_processing_queue (status, priority DESC, created_at);
```

### 2. New Source Definitions

```typescript
// apps/worker/src/providers/egypt-news.ts
export const EGYPT_NEWS_SOURCES = {
  // Official EGX
  egx_disclosures: {
    name: "EGX Disclosures",
    url: "https://www.egx.com.eg/Disclosures/AllDisclosures.aspx", // RSS or scrape
    lang: "ar",
    region: "egypt",
    category: "official",
    weight: 1.0,
  },
  // Financial portals
  mubasher: { name: "مباشر", url: "https://www.mubasher.info/rss.xml", lang: "ar", region: "egypt", category: "news_agency", weight: 0.9 },
  egypt_today: { name: "Egypt Today Business", url: "https://www.egypttoday.com/rss/business", lang: "en", region: "egypt", category: "news_agency", weight: 0.8 },
  al_mal: { name: "جريدة المال", url: "https://almalnews.com/feed", lang: "ar", region: "egypt", category: "news_agency", weight: 0.9 },
  // Arab Finance (existing)
  arabfinance: { ... },
  // New: Direct company IR pages
  company_ir: { ... },
};

// apps/worker/src/providers/saudi-news.ts
export const SAUDI_NEWS_SOURCES = {
  tadawul: { name: "Tadawul", url: "https://www.tadawul.com.sa/rss", lang: "ar", region: "saudi", category: "official", weight: 1.0 },
  argaam: { name: "أرقام", url: "https://www.argaam.com/rss", lang: "ar", region: "saudi", category: "news_agency", weight: 0.95 },
  sahm: { name: "سهم", url: "https://www.saham.net/rss", lang: "ar", region: "saudi", category: "analyst", weight: 0.8 },
  saudi_press_agency: { name: "SPA", url: "https://www.spa.gov.sa/rss", lang: "ar", region: "saudi", category: "official", weight: 0.9 },
};

// apps/worker/src/providers/global-news.ts
export const GLOBAL_NEWS_SOURCES = {
  reuters_business: { name: "Reuters Business", url: "https://feeds.reuters.com/reuters/businessNews", lang: "en", region: "global", category: "news_agency", weight: 0.95 },
  bloomberg_markets: { name: "Bloomberg Markets", url: "https://feeds.bloomberg.com/markets/news.rss", lang: "en", region: "global", category: "news_agency", weight: 0.95 },
  cnbc_markets: { name: "CNBC Markets", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", lang: "en", region: "global", category: "news_agency", weight: 0.9 },
  investing_com: { name: "Investing.com", url: "https://www.investing.com/rss/news_25.rss", lang: "en", region: "global", category: "news_agency", weight: 0.85 },
  // Arabic global
  reuters_ar: { name: "Reuters Arabic", url: "https://www.reuters.com/rssFeed/arabicBusinessNews", lang: "ar", region: "global", category: "news_agency", weight: 0.95 },
  sky_news_arabia: { name: "Sky News Arabia Economy", url: "https://www.skynewsarabia.com/rss/economy", lang: "ar", region: "global", category: "news_agency", weight: 0.9 },
};
```

### 3. Pipeline Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  FETCH      │────▶│  DEDUPE     │────▶│  TRANSLATE  │────▶│  ANALYZE    │────▶│  STORE      │
│  (parallel  │     │  (URL +     │     │  (NVIDIA    │     │  (NVIDIA    │     │  (DB +      │
│   per src)  │     │   content   │     │  embed)     │     │  llama-3.3) │     │   queue)    │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
      │                   │                   │                   │                   │
  - RSS/HTML          - canonical URL      - detect lang      - summary          - upsert
  - API endpoints     - content hash       - translate to     - key points       - link entities
  - rate limiting     - title similarity   - AR/EN            - sentiment        - queue AI
  - auth headers                                            - impact score      - record run
                                                          - entities
                                                          - trading signals
```

### 4. Scheduler Configuration

```typescript
// apps/worker/src/scheduler.ts
export const NEWS_SCHEDULE = {
  // Daily at Fajr (approx 04:30 Cairo = 02:30 UTC, adjust seasonally)
  daily_fajr: {
    cron: "30 2 * * *",  // UTC - adjust for Cairo timezone
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
    activeHours: { start: 8, end: 13, timezone: "UTC" },  // Cairo 10-15
    jobs: ["fetch_breaking", "process_queue_high_priority"],
  },
};
```

---

## Implementation Test Plan

### Phase 1: Foundation (Week 1)
- [ ] Add NVIDIA_API_KEY to .env and deploy
- [ ] Extend schema with new columns + processing queue
- [ ] Create NIM client wrapper in `apps/worker/src/lib/nim.ts`
- [ ] Unit test NIM connection with llama-3.3-70b

### Phase 2: Sources (Week 1-2)
- [ ] Implement Egypt sources (EGX disclosures, Mubasher, Al Mal, Egypt Today)
- [ ] Implement Saudi sources (Tadawul, Argaam, Sahm, SPA)
- [ ] Implement Global sources (Reuters, Bloomberg, CNBC, Investing.com + Arabic)
- [ ] Add source config with region/category/weight
- [ ] Test each source fetch + parse

### Phase 3: AI Pipeline (Week 2)
- [ ] Translation: detect lang → translate to AR/EN using NIM embeddings + llama
- [ ] Summarization: llama-3.3-70b with structured prompt
- [ ] Entity extraction: tickers, sectors, countries, people
- [ ] Sentiment: bullish/bearish/neutral/mixed
- [ ] Impact scoring: 0-100 based on source weight, entity relevance, recency
- [ ] Trading signals: "buy_catalyst", "sell_risk", "earnings", "dividend", "merger", "regulatory"

### Phase 4: Scheduler & Worker (Week 2-3)
- [ ] Build scheduler service with cron + market-hours logic
- [ ] Implement processing queue consumer
- [ ] Add priority: breaking news > market hours > batch
- [ ] Idempotent reprocessing with version tracking

### Phase 5: API & Mobile (Week 3)
- [ ] Extend `/api/news` with filters: region, impact_min, sentiment, entities, source_category
- [ ] Add `/api/news/:id/analysis` for full AI output
- [ ] Mobile: Filter chips (region, impact, sentiment), sort options
- [ ] Mobile: AI summary card with key points, sentiment badge
- [ ] Mobile: "Trading Impact" section per article

### Phase 6: Cleanup & Migration (Week 3)
- [ ] Archive old news_items (or truncate if truly clean slate)
- [ ] Backfill translations for recent items
- [ ] Run AI analysis on recent 1000 items
- [ ] Verify pipeline end-to-end

---

## Breaking Changes Checklist

| Component | Change Type | Migration Needed |
|-----------|-------------|------------------|
| `news_items` table | ADD columns | ALTER TABLE (non-breaking) |
| `news_instrument_links` | UNCHANGED | - |
| `news_processing_queue` | NEW table | CREATE TABLE |
| `/api/news` query params | ADD filters | Optional params (non-breaking) |
| `/api/news` response | ADD fields | Additive (non-breaking) |
| Worker `syncNews()` | REWRITE | New entry point |
| Worker providers | REPLACE | New provider modules |
| Scheduler | NEW | New service |
| Mobile NewsScreen | REWRITE | New component |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| NVIDIA API rate limits | High | Medium | Implement retry/backoff, queue with priority, cache embeddings |
| Source RSS changes | Medium | High | Robust parsing, fallback selectors, monitoring alerts |
| Translation quality | Medium | Medium | Use NIM embeddings for semantic translation, fallback to original |
| Duplicate detection | High | High | Multi-layer: URL canonical + content hash + title similarity + embedding similarity |
| Market hours scheduling | Medium | Medium | Use Cairo timezone, handle DST, test with cronitor |
| Processing queue backlog | Medium | High | Priority queue, horizontal scaling, dead letter queue |
| Cost (NVIDIA API) | Low | Low | Monitor usage, cache summaries, batch requests |

---

## Next Steps

1. **Approve this analysis** → I'll create the formal spec document
2. **Add NVIDIA_API_KEY to EGX project .env** → test connectivity
3. **Start Phase 1 implementation** → schema + NIM client + test
4. **Parallel: Research Egypt/Saudi RSS endpoints** → some may need scraping

---

## Questions for You

1. **Clean slate**: Should I `TRUNCATE news_items, news_instrument_links` or archive first?
2. **Market hours**: Cairo session is 10:00-15:00 (08:00-13:00 UTC). Confirm?
3. **Fajr time**: Calculate dynamically (varies by season) or fixed ~04:30?
4. **Impact scoring weights**: Source weight (0.4) + Entity relevance (0.3) + Recency (0.2) + Sentiment strength (0.1)?
5. **Trading signals**: Which specific signals? (earnings, dividend, merger, regulatory, analyst_rating, guidance, buyback, split, default_risk, geopolitical)
6. **Mobile filters priority**: Region > Impact > Sentiment > Source > Time?