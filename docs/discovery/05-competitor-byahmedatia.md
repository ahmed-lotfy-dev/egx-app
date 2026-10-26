# 00.05 — Competitor Teardown: byahmedatia.com

Inspected 2026-09-22 by direct HTTP analysis of the live site (browser automation was
unavailable; every claim below was pulled from the actual served HTML/JS and from live
probes of the third-party endpoints they call).

## 0. Read this first — they are not a news portal

The brief was "our competitor". They are a competitor for **EGX retail attention**, but not
for a news portal. `byahmedatia.com` is **"البوصلة NextGen"**, Ahmed Atia's paid
trading-signals and education business with a free stock analyzer bolted on. Evidence:

- Total content: **10 blog posts**, ever. The homepage is a sales/landing page.
- Their "آخر التحليلات" (latest analysis) news ticker is populated from **their own
  Blogger posts**, not aggregated news:
  `/feeds/posts/default?alt=json-in-script&callback=renderAtiaPremiumTicker&max-results=8`
- Monetisation is subscriptions: البوصلة VIP, متوسط المدى, الحصان الأسود, الأكاديمية, plus
  a free Telegram channel and a WhatsApp number (201095300126) as the sales funnel.
- Heavy ad-conversion plumbing: Google Ads conversion tag (`AW-18028157810`), GTM
  (`G-718W6BD6PG`), Webpushr push notifications.

**The news-and-screening portal space is unoccupied by them.** Their value to us is
purely as a **technical reference**: they have already solved EGX market data in a
browser, and their approach is documented below in full.

## 1. Tech stack — no server, no database of their own

| Layer | What they use |
|---|---|
| Host / CMS | **Blogger (Blogspot)** on a custom domain — `xmlns:b='http://www.google.com/2005/gml/b'`, `blogger.googleusercontent.com` for assets |
| Pages | 20 Blogger *pages*, each a hand-written HTML/JS/CSS document |
| CSS | `cdn.tailwindcss.com` (Tailwind CDN) + custom `<style>` blocks + Font Awesome 6.4/6.5 |
| Fonts | Cairo, IBM Plex Sans Arabic |
| JS | Plain vanilla JS, no framework, no build step |
| Auth + user data | **Firebase** — project `login-dd9b9`: Firebase Auth (Google sign-in), **Firestore**, plus Realtime DB `login-dd9b9-default-rtdb.firebaseio.com` |
| Backend logic | **Google Apps Script** web apps (two separate deployments) |
| Media | SoundCloud embeds (his podcast), YouTube, WhatsApp deep links |
| PWA | Client-injected manifest, splash screen, dark mode, install prompt |

There is **no application server**. Everything is client-side JavaScript, Blogger's own
feeds, Firebase for accounts, and Apps Script as a proxy/compute layer. That is a
remarkably cheap architecture for what it delivers — and it is also their ceiling.

## 2. Where the market data actually comes from

Three sources, all free, all called from the visitor's browser.

### 2.1 Yahoo Finance, behind a Google Apps Script CORS proxy

This is the core of it. Exact code recovered from `/p/stockanalysis.html`:

```js
const MY_GOOGLE_PROXY = "https://script.google.com/macros/s/AKfycbwn3UVAO-LWe9DgW0a9u8aP6bjh0tdkspOrh2Bc3eyvdhKhS9HSNf4odBMKC-bm2Bpm3A/exec";

function fetchOnce(sym){
  const target = encodeURIComponent(
    'https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '.CA?interval=1d&range=60d');
  // ...
  return fetch(MY_GOOGLE_PROXY + '?url=' + target, opts);
}
```

- `fetchSymbol(sym, tries=3)` retries 3 times with backoff (`350 * (tries-n+1)` ms).
- An `AbortController` aborts each attempt after **9 seconds**.
- Results are written to a **localStorage cache** (`cacheWrite` / `cacheRead`), so repeated
  views of the same symbol do not re-hit the proxy.
- Only `data.chart.result[0]` (the `meta` block) is used.
- **60 days of daily candles** per symbol — that is their entire price history.
- `{TICKER}.CA` suffix confirms the EGX symbol convention I verified independently.
- `/p/fairvalue.html` additionally calls `query1.finance.yahoo.com/v6/finance/quote`.

I probed that exact proxy endpoint myself with `?url=<yahoo COMI.CA>` → **200**, returned
the real Yahoo chart JSON for CIB. The proxy is live and open. With no `url` parameter it
returns `{"error":"Exception: الصفة المقدمة لا تحتوي على قيمة: url"}`.

Why they do it: Yahoo's endpoint sends no CORS headers, so a browser cannot call it
directly. Apps Script is a free server-side relay that also hides the upstream URL.

### 2.2 TradingView scanner — their market-wide screener

Found in `/p/radar.html`, `/p/tag.html`, `/p/compassm.html`:

```
https://scanner.tradingview.com/egypt/scan
https://scanner.tradingview.com/global/scan
```

I called it myself. **It works with no API key and no authentication.** A POST with a
column list returns the whole EGX market. Response for Egypt:

```
totalCount: 296
[{"s":"EGX:COMI","d":["COMI","البنك التجاري الدولي",131.5,-1.23,7168416,
                      "commercial-international-bank-egypt","EGP",453360128190]}, ...]
```

Columns available include ticker, **Arabic company name**, close, change %, volume,
**logoid**, currency, market cap, sector and instrument type. All **296 EGX instruments**
came back in a single request, sorted by market cap.

This is the single most valuable thing learned from this teardown. `[VERIFIED]`

### 2.3 TradingView embed widgets

Embedded from `s3.tradingview.com/external-embedding/`:
`embed-widget-advanced-chart.js`, `embed-widget-symbol-info.js`,
`embed-widget-technical-analysis.js` — configured with `locale:'ar_AE'`,
`timezone:'Africa/Cairo'`, `theme` tied to their dark mode. Charts are drawn by
TradingView, not by them.

## 3. How the symbol icons are actually shown

This was the specific question. There are **two different kinds of "icon"** on the site,
and neither is a per-stock image they host:

**a) Sector / category icons — Font Awesome.** From `SECTOR_DEFS`: the Shariah sector is
`fas fa-moon` (green), EGX 30 leaders `fas fa-crown` (blue), EGX 70 `fas fa-rocket`
(purple), banks `fas fa-university`, real estate `fas fa-building`, resources `fas fa-flask`,
construction `fas fa-hammer`, food `fas fa-utensils`, healthcare `fas fa-heartbeat`,
telecom `fas fa-broadcast-tower`, industrials `fas fa-cogs`, textiles `fas fa-shirt`,
logistics `fas fa-ship`, tourism `fas fa-umbrella-beach`, education
`fas fa-graduation-cap`. Every sector chip is an `<i class="...">` glyph, colour-coded.

**b) Per-company logos — rendered inside the TradingView widgets.** I grepped all their
pages for logo references: **zero** uses of any per-stock logo URL. Company logos appear
only where a TradingView embed draws them (symbol-info and advanced-chart widgets fetch
the logo internally).

However, because they use the TradingView scanner, the **logoid** field is available to
them — and I verified the CDN URL pattern works directly:

```
https://s3-symbol-logo.tradingview.com/commercial-international-bank-egypt.svg
   -> 200, image/svg+xml, 707 bytes
https://s3-symbol-logo.tradingview.com/commercial-international-bank-egypt--big.svg
   -> 200, image/svg+xml, 1,294 bytes
https://s3-symbol-logo.tradingview.com/country/EG.svg
   -> 200, image/svg+xml, 534 bytes   (Egypt flag)
--original.svg -> 403
```

So the logo mechanism is: **`logoid` from the scanner → `s3-symbol-logo.tradingview.com/{logoid}.svg`**.
We can serve per-company logos the same way, in `<img>` tags, without embedding any widget.

## 4. Their stock registry — hand-maintained, 113 symbols

From `/p/stockanalysis.html`, a hardcoded array with this shape:

```js
{s:'COMI', n:'التجاري الدولي', g:['banks'], f:['egx30','watchlist']},
{s:'EKHO', n:'القابضة المصرية الكويتية', c:'USD', g:['finance'], f:['egx30']},
{s:'FHEC', n:'فيصل الإسلامي للاستثمار', g:['finance'], f:['egx70'], v:1, nd:1},
```

| Key | Meaning |
|---|---|
| `s` | EGX ticker (looked up as `s + '.CA'` on Yahoo) |
| `n` | Arabic display name |
| `g` | Sector group(s) — 13 groups defined |
| `f` | Flags: `egx30`, `egx70`, `watchlist`, **`shariah`** |
| `c` | Currency if not EGP (`USD` for EKHO, TRTO) |
| `v` | Flagged for a symbol check ("فحص الأكواد") |
| `nd` | Marked as no-data |

Counts, all measured: **113 symbols total** — 32 flagged `egx30`, 81 `egx70`,
12 `watchlist`, and **66 flagged `shariah`**. Sector distribution: finance 17,
real estate 15, food 14, resources 12, construction 11, banks 10, health 9,
telecom 8, textiles 5, industrial 5, tourism 5, logistics 4, education 2.

Five symbols are marked `v:1, nd:1` (verify + no data): FHEC, AIVC, CEMX, DCRC, LONI —
carried in the list but known to have no working price feed.

## 5. Their "halal stocks" feature — hand-curated, with a disclaimer

The `shariah` flag is **manually maintained**, not computed. 66 of 113 symbols carry it.
Two things worth noting, both from their own code:

1. Their sector hint states the position plainly:
   *"قائمة استرشادية فقط. الفرز الشرعي يعتمد على نسب مالية تتغير كل ربع سنة، راجع جهة
   إفتاء معتمدة قبل القرار."*
   — Indicative list only. Shariah screening depends on financial ratios that change every
   quarter; consult a certified fatwa body before deciding.
   Same disclaimer pattern on `egx30` (*"القائمة استرشادية وليست نسخة رسمية من المؤشر"* —
   indicative, not an official index replica) and `egx70`.
2. They mark **Islamic banks** as compliant (ADIB مصرف أبوظبي الإسلامي, FAIT بنك فيصل
   الإسلامي, SAUD بنك البركة مصر) while all conventional banks are unflagged — consistent
   with a business-screen-then-ratios model.

See section 9 for the full 66-name list.

## 6. Their product surface — 20 pages

`main`, `start` (onboarding hub), `learn` (14-lesson course + 3 quizzes + glossary),
`academyoffer`, `premium`, `stockanalysis` (the free analyzer), `radar`, `tag`,
`compassm` (the compass), `fibo` (Fibonacci tool), `fairvalue` (valuation),
`darkhorse`, `myvision`, `articles`, `mywallet`, `reminder`, `PMD`, `newbot`,
`telegadmin`, `volt-admin`.

The free analyzer alone does: sector browsing, watchlist, per-symbol technical indicators,
entry/stop/target levels, a portfolio scanner with a 5-point signal score
(*"إشارة فنية قوية (4/5) والسعر فوق تكلفتك"*), a symbol-health check that reports broken
tickers, and a staged progress UI (*"جلب البيانات من السوق" → "حساب المؤشرات الفنية" →
"تحديد نقاط الدخول والأهداف"*).

## 7. Direct comparison with what we have planned

| Dimension | byahmedatia.com | Our opportunity |
|---|---|---|
| Universe | 113 hand-listed symbols | **296** full EGX via TradingView scanner, Arabic names + logos included |
| Price history | 60 days, fetched live per symbol per visitor | Our own DB, full history, fetched once on a schedule |
| Shariah | 66 hand-flagged names, no ratios, no dates | Computed AAOIFI ratios, per-standard verdict, **as-of date and source citation** |
| News | None — their own 10 posts in a ticker | Real aggregation: Arab Finance 10×2 sectors + Enterprise + others, 500+ items per language |
| Content depth | 10 posts | SEO-driven landing pages per ticker, sector, and ratio — Blogger cannot compete here |
| Architecture | Blogger pages, no server, no DB | Real backend, real database, real API — and no dependency on a personal Apps Script |
| Risk | Yahoo + a personal Apps Script proxy; a Blogger theme update can break everything | Under our control; provider swap is a config change |

## 8. Lessons worth taking, and traps worth avoiding

**Take:**
- Yahoo's `.CA` endpoint is proven to work in production for EGX — it is a legitimate
  interop fallback, and 60 days of daily candles is enough for the indicator set they run.
- **TradingView scanner + symbol-logo CDN** gives the full EGX universe with Arabic names
  and free company logos in two unauthenticated GETs. This is the fastest path to a
  populated instrument master.
- The local-cache-then-render pattern (cache in the client, only fetch what is missing)
  is the right UX shape; we do the same thing but server-side.
- The disclaimer wording is exactly the register a Shariah feature needs — indicative,
  dated, with a certified-authority caveat.

**Avoid:**
- **Relying on a personal Google Apps Script as the data proxy.** It is a single point of
  failure owned by one person's Google account, with invisible quotas, and it exposes the
  upstream source. Any serious product must proxy from its own server.
- **Client-side fetching of market data on every visit.** It is slow, it leaks the data
  source, it cannot be cached or rate-limited, and it makes SEO useless because the price
  is not in the HTML. (Their prices are not indexable. Ours will be.)
- **Hand-maintained compliance flags with no dates or ratios.** That is the one thing in
  their product that is genuinely unsafe to imitate — a stale Shariah verdict presented as
  current is the biggest credibility risk in this category, and they carry the risk
  without the data behind it.
- **Blogger as a platform.** It caps the information architecture, the URL scheme and the
  SEO ceiling, and they have painted themselves into it.


---

## 9. Appendix — their full hand-curated Shariah list (66 names)

Extracted verbatim from the `shariah` flag in their hardcoded registry. 
No ratios, no methodology, no as-of date is published for any of these.

| # | Ticker | Arabic name | Yahoo symbol | Sector group(s) | Also flagged |
|---|--------|-------------|--------------|-----------------|--------------|
| 1 | `ADIB` | مصرف أبوظبي الإسلامي | `ADIB.CA` | banks | egx30 |
| 2 | `FAIT` | بنك فيصل الإسلامي | `FAIT.CA` | banks | egx70 |
| 3 | `SAUD` | بنك البركة مصر | `SAUD.CA` | banks | egx70 |
| 4 | `FWRY` | فوري للمدفوعات | `FWRY.CA` | finance, telecom | egx30, watchlist |
| 5 | `EFIH` | إي فاينانس للاستثمارات المالية والرقمية | `EFIH.CA` | finance, telecom | egx30 |
| 6 | `CNFN` | كونتكت المالية القابضة | `CNFN.CA` | finance | egx30 |
| 7 | `TMGH` | طلعت مصطفى القابضة | `TMGH.CA` | realestate | egx30, watchlist |
| 8 | `MASR` | مدينة مصر للإسكان والتعمير | `MASR.CA` | realestate | egx30, watchlist |
| 9 | `PHDC` | بالم هيلز للتعمير | `PHDC.CA` | realestate | egx30 |
| 10 | `HELI` | مصر الجديدة للإسكان والتعمير | `HELI.CA` | realestate | egx30 |
| 11 | `ORHD` | أوراسكوم للتنمية مصر | `ORHD.CA` | realestate | egx30 |
| 12 | `OCDI` | سوديك | `OCDI.CA` | realestate | egx70 |
| 13 | `EMFD` | إعمار مصر للتنمية | `EMFD.CA` | realestate | egx70 |
| 14 | `ARAB` | المطورون العرب القابضة | `ARAB.CA` | realestate | egx70 |
| 15 | `ELSH` | الشمس للإسكان والتعمير | `ELSH.CA` | realestate | egx70 |
| 16 | `ZMID` | زهراء المعادي للاستثمار والتعمير | `ZMID.CA` | realestate | egx70 |
| 17 | `UNIT` | المتحدة للإسكان والتعمير | `UNIT.CA` | realestate | egx70 |
| 18 | `ABUK` | أبو قير للأسمدة | `ABUK.CA` | resources | egx30, watchlist |
| 19 | `MFPC` | موبكو للأسمدة | `MFPC.CA` | resources | egx30, watchlist |
| 20 | `ESRS` | حديد عز | `ESRS.CA` | resources | egx30, watchlist |
| 21 | `SKPC` | سيدي كرير للبتروكيماويات | `SKPC.CA` | resources | egx30 |
| 22 | `AMOC` | أموك للزيوت المعدنية | `AMOC.CA` | resources | egx30 |
| 23 | `EGAL` | مصر للألومنيوم | `EGAL.CA` | resources | egx30 |
| 24 | `MICH` | مصر للصناعات الكيماوية | `MICH.CA` | resources | egx30 |
| 25 | `SMFR` | سماد مصر (إيچيفرت) | `SMFR.CA` | resources | egx70 |
| 26 | `PACH` | باكين للدهانات | `PACH.CA` | resources | egx70 |
| 27 | `SWDY` | السويدي إليكتريك | `SWDY.CA` | construction | egx30, watchlist |
| 28 | `ORAS` | أوراسكوم كونستراكشون | `ORAS.CA` | construction | egx30, watchlist |
| 29 | `ELEC` | إليكتروكابل مصر | `ELEC.CA` | construction | egx70 |
| 30 | `SCEM` | أسمنت سيناء | `SCEM.CA` | construction | egx70 |
| 31 | `MCQE` | مصر للأسمنت قنا | `MCQE.CA` | construction | egx70 |
| 32 | `ARCC` | أسمنت المنطقة العربية | `ARCC.CA` | construction | egx70 |
| 33 | `SVCE` | جنوب الوادي للأسمنت | `SVCE.CA` | construction | egx70 |
| 34 | `DCRC` | الدلتا للإنشاء والتعمير | `DCRC.CA` | construction | egx70 |
| 35 | `JUFO` | جهينة للصناعات الغذائية | `JUFO.CA` | food | egx30 |
| 36 | `EFID` | إيديتا للصناعات الغذائية | `EFID.CA` | food | egx70 |
| 37 | `DOMT` | دومتي للأغذية | `DOMT.CA` | food | egx70 |
| 38 | `OLFI` | عبور لاند للأغذية | `OLFI.CA` | food | egx70 |
| 39 | `SUGR` | الدلتا للسكر | `SUGR.CA` | food | egx70 |
| 40 | `MILS` | المصريين للمطاحن | `MILS.CA` | food | egx70 |
| 41 | `POUL` | القاهرة للدواجن | `POUL.CA` | food | egx70 |
| 42 | `MPCO` | المنصورة للدواجن | `MPCO.CA` | food | egx70 |
| 43 | `ISMA` | الإسماعيلية مصر للدواجن | `ISMA.CA` | food | egx70 |
| 44 | `ADCI` | عرب دايري (باندا) | `ADCI.CA` | food | egx70 |
| 45 | `AJWA` | أجواء للصناعات الغذائية | `AJWA.CA` | food | egx70 |
| 46 | `ZEOT` | المستخلصات الطبيعية والزيوت | `ZEOT.CA` | food | egx70 |
| 47 | `ISPH` | ابن سينا فارما | `ISPH.CA` | health | egx30 |
| 48 | `CLHO` | مستشفيات كليوباترا | `CLHO.CA` | health | egx30, watchlist |
| 49 | `RMDA` | راميدا للأدوية | `RMDA.CA` | health | egx30 |
| 50 | `PHAR` | إيبيكو للأدوية | `PHAR.CA` | health | egx70 |
| 51 | `NIPH` | النيل للأدوية | `NIPH.CA` | health | egx70 |
| 52 | `MIPH` | مينا فارم للأدوية | `MIPH.CA` | health | egx70 |
| 53 | `MCRO` | ماكرو جروب للأدوية | `MCRO.CA` | health | egx70 |
| 54 | `BIOC` | جلاكسو سميثكلاين | `BIOC.CA` | health | egx70 |
| 55 | `SPMD` | سبيد ميديكال | `SPMD.CA` | health | egx70 |
| 56 | `MTIE` | إم إم چروب | `MTIE.CA` | telecom | egx70 |
| 57 | `RAYA` | راية القابضة | `RAYA.CA` | telecom | egx70 |
| 58 | `GBCO` | جي بي كورب (جي بي أوتو سابقا&#1611;) | `GBCO.CA` | industrial | egx30 |
| 59 | `ORWE` | النساجون الشرقيون | `ORWE.CA` | textiles | egx70 |
| 60 | `DSCW` | دايس للملابس الجاهزة | `DSCW.CA` | textiles | egx70 |
| 61 | `KABO` | كابو للملابس | `KABO.CA` | textiles | egx70 |
| 62 | `ALCN` | الإسكندرية لتداول الحاويات | `ALCN.CA` | logistics | egx70 |
| 63 | `CSAG` | القناة للتوكيلات الملاحية | `CSAG.CA` | logistics | egx70 |
| 64 | `UASG` | العربية للشحن والتفريغ | `UASG.CA` | logistics | egx70 |
| 65 | `CIRA` | سيرا للتعليم | `CIRA.CA` | education | egx70 |
| 66 | `TALM` | تعليم لخدمات الإدارة | `TALM.CA` | education | egx70 |

### Counts by sector group (all 113 listed symbols)

| Sector group | Symbols |
|---|---|
| finance | 17 |
| realestate | 15 |
| food | 14 |
| resources | 12 |
| construction | 11 |
| banks | 10 |
| health | 9 |
| telecom | 8 |
| tourism | 5 |
| industrial | 5 |
| textiles | 5 |
| logistics | 4 |
| education | 2 |

### Their coverage vs the full market

- Symbols they list: **113**
- EGX instruments TradingView returns: **296**
- So they cover roughly **38%** of the market by count, weighted toward large and mid caps — and 66 of their 113 are marked halal, i.e. **58% of their universe**, which is a much higher pass rate than a strict AAOIFI screen on a bank-heavy market would produce.
