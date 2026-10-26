# 00.02 — News Sources & Free News API Comparison

Probed live: 2026-09-22. Each feed below was fetched and parsed; item counts are real.

## Summary

| Source | Lang | Free | Auth | Items/feed | Status |
|---|---|---|---|---|---|
| Arab Finance | EN + AR | Yes | No | 50 | `[VERIFIED]` 10 category feeds |
| Enterprise Egypt | EN | Yes | No | 10 | `[VERIFIED]` |
| Aswat Masriya | AR | Yes | No | 20 | `[VERIFIED]` |
| Hapi Journal | AR | Yes | No | 10 | `[VERIFIED]` |
| Daily News Egypt | EN | Yes | No | 10 | `[VERIFIED]` |
| CNN Arabic | AR | Yes | No | 20 | `[VERIFIED]` |
| Currents API | multi | 250 req/day | Yes | — | `[DOCUMENTED]` |
| NewsData.io | multi | 200 credits/day | Yes | — | `[DOCUMENTED]` |
| GNews | multi | 100 req/day | Yes | — | `[DOCUMENTED]` |
| NewsAPI.org | multi | 100 req/day, dev only | Yes | — | `[DOCUMENTED]` not usable in production |

---

## 1. Publisher RSS — `[VERIFIED]` (the primary free source)

### Arab Finance — the strongest find

`https://www.arabfinance.com/en/rss/rssbycat/{1..10}` and the `ar` equivalents.
**All 10 have been fetched and parsed: 50 items each, valid RSS, both languages.**

Category ID → section (from the RSS list page, EN and AR agree):

| ID | English | Arabic |
|----|---------|--------|
| 1 | Macroeconomy | اقتصاد |
| 2 | Finance and Banking | مال وبنوك |
| 3 | Real Estate and Tourism | العقارات والسياحة |
| 4 | Healthcare | الصحة |
| 5 | Energy | طاقة |
| 6 | Technology and Telecom | اتصالات وتكنولوجيا المعلومات |
| 7 | Automotive and Transportation | النقل والسيارات |
| 8 | Industries | صناعات |
| 9 | Retail and Consumables | تجزئة وسلع استهلاكية |
| 10 | Education | تعليم |

Sample headline from category 1 (EN): *"Egypt's stronger buffers helped contain fallout
from Middle East war"* — real, current, Egypt-specific financial coverage.

Why this matters: **500 items per language, sector-mapped, no key, no quota, Arabic
included.** This alone can carry the news section.

### Other working feeds

| Source | URL | Items | Notes |
|---|---|---|---|
| Enterprise Egypt | `https://enterprise.news/feed` | 10 | Best English business + regulation + policy analysis in Egypt. `https://enterprise.news/rss/` also works. |
| Aswat Masriya | `https://aswatmasriya.com/rss` | 20 | Arabic news agency. |
| Hapi Journal | `https://hapijournal.com/feed/` | 10 | Arabic economy/finance. |
| Daily News Egypt | `https://www.dailynewsegypt.com/feed/` | 10 | English, economy + business. |
| CNN Arabic | `https://arabic.cnn.com/api/v1/rss/rss.xml` | 20 | Regional/macro context. |

### Tried and NOT working `[VERIFIED]`

| Attempted | Result |
|---|---|
| `english.mubasher.info/rss`, `/rss/news`, `/rss/all`, `/rss/latest`, `/rss/markets`, `/api/rss` | 404 / connection failure |
| `www.mubasher.info/rss/news`, `/rss/latest` | 404 |
| `alborsanews.com/feed/`, `www.alborsanews.com/rss` | connection reset by peer / network unreachable |
| `amwalalghad.com/feed/`, `www.amwalalghad.com/rss` | 200 but returns HTML (2.9 MB page), not a feed |
| `www.shorouknews.com/upload/rss/economy.xml`, `/rss` | 200 but HTML |
| `almalnews.com/feed/`, `almalnews.com/rss` | 404 |
| `arabic.reuters.com` style feeds | dead (Reuters retired public RSS) |
| `asharqbusiness.com/rss/` | 202/403 — WAF blocks |
| `skynewsarabia.com/web/rss/95.xml` | 404 |
| `youm7.com/rss/SectionRss?SectionID=297`, `=298` | connection failure; `=297` returned malformed XML earlier |
| `egx.com.eg/en/rss.aspx` | 200 but HTML (no feed) |
| `zawya.com/en/rss`, `/en/rss.xml`, `/en/rss/projects` | 404 / HTML |
| `egypttoday.com/Rss` | 404 |

`[GAP]` Mubasher, Al Borsa, Al Mal and Youm7 do carry substantial EGX disclosure news.
Their feed paths need a second pass (inspect the live site for the real URLs, or fall back
to scraping their section pages). Mubasher also has an Islamic finance section worth having.

## 2. Free news APIs — `[DOCUMENTED]`

| Provider | Free tier | Delay | Full text | Arabic | Commercial on free |
|---|---|---|---|---|---|
| **Currents API** | 250 req/day, no card | none claimed | metadata only | Yes (20+ langs) | not stated |
| **NewsData.io** | 200 credits/day (≈2,000 articles), 30 credits/15 min | 12 h | No | Yes (89 langs) | allowed per their blog |
| **GNews** | 100 req/day, 10 per request | 12 h | No (paid) | Yes (22 langs) | **dev/testing only** |
| **NewsAPI.org** | 100 req/day | 24 h | No | Yes | **dev only, no production** |
| APITube | free tier, email signup | — | — | — | unstated |
| NewsAPI.ai | sandbox only | — | — | — | paid |
| Firecrawl | 1,000 credits/mo | — | scraped markdown | — | — |
| Exa | 1,000 req/mo | — | highlights | — | — |

Currents is the only one that explicitly lists **Egypt** in its country directory and
supports Arabic and English filtering on the free tier.

## 3. Legal / licensing position `[GAP]`

- Publisher RSS is intended for syndication: aggregate, attribute, link out to the source.
  Republishing full article text requires a licence — assume **headline + summary + link**
  is the safe model, which is also the standard for news portals.
- Google News RSS is free but Google's terms restrict automated reuse; treat as a
  discovery layer at most, never as a content source. `[UNVERIFIED]` — needs legal review.
- The commercial news APIs above may not permit production use on free tiers (NewsAPI.org
  and GNews explicitly do not). Any free-tier reliance must be checked against the terms
  before launch.
- Store only headliners/summaries plus the canonical URL, and always display the source.

## 4. Conclusion for news

The free stack is genuinely strong and needs **no** paid API for launch:

```
Primary   : Arab Finance RSS (10 sectors x 2 languages) + Enterprise Egypt
Arabic    : Aswat Masriya + Hapi Journal + CNN Arabic + Arab Finance AR
English   : Arab Finance EN + Enterprise Egypt + Daily News Egypt
Fill-ins  : Currents API free tier (250/day) for keyword search and gap-filling
```

An ingestion worker polls every 15–30 minutes, deduplicates by URL/headline hash, maps
each item to a sector using the Arab Finance category it came from, and stores it. The
site then reads from our own database — third-party feeds are never hit at page render.
