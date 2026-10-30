# News AI Analysis Feature - Redesigned (v2)

## Overview

**Feature Name:** News AI Analysis (M4 Milestone) - Redesigned per user vision
**Status:** 🔄 In Progress - Redesign Phase
**Branch:** `feat/m3-stock-detail`
**Related PR/Commits:** Latest: `896547e`

---

## 1. Feature Summary (User Vision)

### Core Requirements
- **Three tabs**: **EGX** (Egypt) | **السعودية** (Saudi) | **دولي** (International)
- **In-app article view** - no external browser, show AI summary + trading advice inside app
- **AI Advice per article**: How this news affects buy/sell/hold decisions for traders/investors
- **Source attribution**: Clearly show source, don't take credit for content
- **Arabic-first UI** with English translation

### User Flow
```
News Tab → [EGX] [السعودية] [دولي] → Article List → Tap → In-App Detail View
                                                                      ↓
                                                        AI Summary + Trading Advice
                                                        Source Attribution
                                                        "افتح المصدر" button (optional)
```

---

## 2. Architecture Changes

### 2.1 Database Schema Updates

```sql
-- news_items: Add advice field
ALTER TABLE news_items ADD COLUMN IF NOT EXISTS ai_advice text;

-- Add source_region enum constraint for tab filtering
-- 'egypt' → EGX tab, 'saudi' → Saudi tab, 'global'/'mena'/'gcc' → International tab
```

### 2.2 AI Analysis Prompt Update

**Enhanced NIM Prompt:**
```json
{
  "summary": "2-3 sentence Arabic summary",
  "keyPoints": ["bullet1", "bullet2", ...],
  "sentiment": "bullish|bearish|neutral|mixed",
  "impactScore": 0-100,
  "impactLevel": "critical|high|medium|low",
  "entities": { "tickers": [], "sectors": [], "countries": [], "people": [], "companies": [] },
  "tradingSignals": ["earnings", "dividend", "merger", ...],
  "advice": "نصيحة تداول محددة: بناءً على هذا الخبر، يُنصح بـ [شراء/بيع/انتظار] لأسهم [COMI, EAST] لأن [السبب المحدد]. للمستثمرين طويلي الأجل: [نصيحة]. للمضاربين: [نصيحة].",
  "translatedTitle": "AR/EN",
  "translatedSummary": "AR/EN"
}
```

**Key Addition:** `advice` field - specific, actionable trading advice in Arabic.

---

## 3. API Changes

### 3.1 New Endpoint Structure

```typescript
// Keep /api/news but change feed parameter
GET /api/news?region=egypt|saudi|international&limit=20&cursor=&impactMin=50&hasAI=true

// Region mapping:
// region=egypt      → source_region='egypt'      (EGX tab)
// region=saudi      → source_region='saudi'      (Saudi tab)  
// region=international → source_region IN ('global','mena','gcc') (International tab)
```

### 3.2 Response Schema (Updated)

```typescript
type FeedNewsItem = {
  id: number;
  source: string;
  sourceRegion: "egypt" | "saudi" | "global" | "mena" | "gcc";
  sourceCategory: string;
  lang: "ar" | "en";
  title: string;
  summary: string | null;
  url: string;
  publishedAt: ISODateTime;
  category: string | null;
  // AI fields
  aiSummary: string | null;
  aiKeyPoints: string[];
  sentiment: "bullish" | "bearish" | "neutral" | "mixed";
  impactScore: number | null;
  impactLevel: "critical" | "high" | "medium" | "low" | null;
  entities: { tickers: string[], sectors: string[], countries: string[], people: string[], companies: string[] } | null;
  tradingSignals: string[];
  advice: string | null;           // NEW: AI trading advice
  translatedTitle: string | null;
  translatedSummary: string | null;
  sourceRegion: string | null;
  sourceCategory: string | null;
}
```

---

## 4. Mobile UI Redesign

### 4.1 News Tab - Three Tabs Layout

```
┌─────────────────────────────────────┐
│  الأخبار        🔍  🔧              │
├─────────────────────────────────────┤
│  [EGX] [السعودية] [دولي]            │  ← Three tabs, EGX default
├─────────────────────────────────────┤
│  📰 Article Card                    │
│  ┌────────────────────────────────┐ │
│  │ 🇪🇬 مصر · مباشر · منذ ساعتين    │ │
│  │ ✨ ذكي                          │ │
│  │                                │ │
│  │ القناة للتوكيلات تقرر توزيع   │ │
│  │ كوبون نقدي على المساهمين       │ │
│  │                                │ │
│  │ 📈 إيجابي · 🟡 متوسط · 📊 COMI │ │
│  │ 💡 نصيحة: يُنصح بشراء COMI...  │ │
│  │ 📰 المصدر: مباشر               │ │
│  └────────────────────────────────┘ │
├─────────────────────────────────────┤
```

### 4.2 Article Detail View (In-App)

```
┌─────────────────────────────────────┐
│ ←  القناة للتوكيلات الملاحية       │
├─────────────────────────────────────┤
│ 🇪🇬 مصر · مباشر · منذ 3 ساعات       │
│ ✨ تحليل ذكي                        │
├─────────────────────────────────────┤
│ 📋 ملخص ذكي                         │
│ قررت شركة القناة للتوكيلات الملاحية│
│ توزيع كوبون نقدي بقيمة 2 جنيه...    │
│                                     │
│ 🔑 النقاط الرئيسية:                │
│ • توزيع أرباح نقدية للمساهمين      │
│ • العائد على السهم 8%               │
│                                     │
│ 💡 نصيحة تداول                      │
│ ┌─────────────────────────────────┐ │
│ │ بناءً على هذا الخبر، يُنصح بـ    │ │
│ │ شراء سهم COMI للمضاربة قصيرة   │ │
│ │ الأجل لأن توزيع الكوبون سيجذب    │ │
│ │ سيولة للسهم. للمستثمرين طويلي  │ │
│ │ الأجل، الاحتفاظ مناسب لأن       │ │
│ │ التوزيع يعكس قوة مالية.         │ │
│ └─────────────────────────────────┘ │
│                                     │
│ 📊 المشاعر: 📈 إيجابي              │
│ 🎯 التأثير: 🟡 متوسط (65/100)       │
│ 📈 إشارات: أرباح، توزيعات          │
│ 🏷️ أسهم: COMI, CANA                │
│                                     │
│ 📰 المصدر: مباشر                    │
│ [افتح المصدر الأصلي ↗]             │
└─────────────────────────────────────┘
```

### 4.3 Tab Configuration

```typescript
const NEWS_TABS = [
  { id: "egypt", labelKey: "newsTab.tabEgypt", flag: "🇪🇬", region: "egypt" },
  { id: "saudi", labelKey: "newsTab.tabSaudi", flag: "🇸🇦", region: "saudi" },
  { id: "international", labelKey: "newsTab.tabInternational", flag: "🌍", region: "international" },
] as const;
```

---

## 5. Implementation Plan

### Phase 1: Backend (1-2 days)
- [ ] Add `ai_advice` column to `news_items`
- [ ] Update NIM prompt to include `advice` field
- [ ] Update `/api/news` to accept `region` parameter (egypt|saudi|international)
- [ ] Update contracts with `advice` field
- [ ] Re-run analysis on existing items to generate advice

### Phase 2: Mobile UI (1-2 days)
- [ ] Redesign NewsScreen with 3 tabs (EGX | السعودية | دولي)
- [ ] Create `NewsDetailScreen` for in-app article view
- [ ] Update `NewsCard` to show AI advice preview
- [ ] Add "المصدر" attribution + "افتح المصدر" button
- [ ] Update locales (AR/EN) for new keys

### Phase 3: Analysis & Deploy (1 day)
- [ ] Re-run analysis on all items to generate `advice`
- [ ] Deploy API
- [ ] EAS update mobile app
- [ ] Test on device

---

## 6. AI Advice Prompt Details

### Prompt Template (Arabic)
```
أنت محلل مالي محترف للبورصة المصرية (EGX) والأسواق الخليجية. 
حلل هذا الخبر وقدم نصيحة تداول عملية ومحددة.

الخبر: {title} - {summary}
المنطقة: {sourceRegion}
المصدر: {sourceName} ({sourceCategory})
اللغة: {lang}

أخرج JSON فقط بالهيكل التالي:
{
  "summary": "ملخص 2-3 جمل بالعربية",
  "keyPoints": ["نقطة1", "نقطة2"],
  "sentiment": "bullish|bearish|neutral|mixed",
  "impactScore": 0-100,
  "impactLevel": "critical|high|medium|low",
  "entities": {"tickers":[], "sectors":[], "countries":[], "people":[], "companies":[]},
  "tradingSignals": ["earnings","dividend","merger",...],
  "advice": "بناءً على هذا الخبر، يُنصح بـ [شراء/بيع/احتفاظ/انتظار] لأسهم [COMI, EAST] لأن [السبب المحدد والمقنع]. للمستثمرين طويلي الأجل: [نصيحة محددة]. للمضاربين: [نصيحة محددة]. مستوى الثقة: [عالي/متوسط/منخفض].",
  "translatedTitle": "AR/EN",
  "translatedSummary": "AR/EN"
}

قواعد النصيحة:
- كن محدداً: اذكر أسماء الأسهم (COMI, EAST, CIB...)
- ميز بين المضاربة قصيرة الأجل والاستثمار طويل الأجل
- اذكر مستوى المخاطرة
- لا تعطِ نصيحة مطلقة - استخدم "يُنصح بـ" وليس "يجب"
- إذا كان الخبر سلبياً: نصح بالبيع أو التحوط
- إذا كان إيجابياً: نصح بالشراء أو الاحتفاظ
- إذا كان غامضاً: نصح بالانتظار والمراقبة
```

---

## 7. Locale Keys (New)

```json
// AR
"newsTab": {
  "tabEgypt": "EGX",
  "tabSaudi": "السعودية", 
  "tabInternational": "دولي",
  "aiAdvice": "نصيحة ذكية",
  "sourceLabel": "المصدر",
  "openSource": "افتح المصدر",
  "advicePrefix": "بناءً على هذا الخبر، يُنصح بـ",
  "forTraders": "للمضاربين",
  "forInvestors": "للمستثمرين طويلي الأجل",
  "confidence": "مستوى الثقة"
}

// EN
"newsTab": {
  "tabEgypt": "EGX",
  "tabSaudi": "Saudi",
  "tabInternational": "International",
  "aiAdvice": "AI Advice",
  "sourceLabel": "Source",
  "openSource": "Open Source",
  "advicePrefix": "Based on this news, we advise to",
  "forTraders": "For traders",
  "forInvestors": "For long-term investors",
  "confidence": "Confidence"
}
```

---

## 8. Files to Modify

| File | Change |
|------|--------|
| `apps/api/src/db/schema/market.ts` | Add `ai_advice`, `trading_signals` columns |
| `apps/api/src/db/migrations/0005_*.sql` | Migration for advice column |
| `apps/worker/src/lib/nim.ts` | Update prompt with `advice` field |
| `apps/worker/src/jobs/news.ts` | Store `advice` in DB |
| `apps/api/src/routes/news.ts` | Add `region` param, return `advice` |
| `packages/contracts/src/market.ts` | Add `advice` to schema |
| `apps/mobile/src/app/(app)/(tabs)/news.tsx` | 3 tabs, in-app detail view |
| `apps/mobile/src/app/(app)/news/[id].tsx` | New: Article detail screen |
| `apps/mobile/src/locales/ar.json` + `en.json` | New locale keys |
| `apps/api/src/db/migrations/0005_*.sql` | Migration |

---

## 9. Testing Checklist

- [ ] Three tabs switch correctly (EGX/Saudi/International)
- [ ] Article list filters by region correctly
- [ ] Tap article → opens in-app detail (not browser)
- [ ] AI summary + advice displayed in Arabic
- [ ] Trading advice mentions specific tickers
- [ ] Source attribution visible ("المصدر: مباشر")
- [ ] "افتح المصدر" button opens external link
- [ ] Back navigation works
- [ ] Pull-to-refresh works per tab
- [ ] Arabic/EN locale switching works

---

## 10. Rollout

1. Deploy migration + API
2. Run `news:full` on production to generate advice for all items
3. Deploy mobile EAS update
4. Verify on device

---

*Document updated: 2026-10-30 | Version: 2.0 (Redesigned per user vision)*