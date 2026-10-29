# Watchlists — Design (M5)

Date: 2026-10-29
Status: Approved
Branch: `feat/m3-stock-detail`

## 1. Summary

Add a Watchlist tab with two sections:
- **جاهزة** — predefined reference lists (EGX30, EGX70, EWI, EGX33 Sharia, Sectors). Read-only, auto-refreshed from universe.
- **مخصصة** — user-created lists (later milestone, needs auth).

v1 ships **جاهزة only**: instant market browser, zero auth, zero user data.

## 2. Scope

In scope:
- Predefined lists derived from existing `instruments` data:
  - EGX30 (top 30 by market cap / official index)
  - EGX70 (next 70)
  - EWI (EGX100 = EGX30 + EGX70)
  - EGX33 Sharia (from `sharia_status` when available, else placeholder)
  - Sectors (grouped by `sector` field, one list per sector)
- `GET /api/watchlists/predefined` — returns all lists with instrument tickers + latest quotes
- Watchlist tab UI: segmented control (جاهزة), horizontal list cards, tap row → stock screen
- Reuse existing quote data, sector strip pattern

Out of scope (v2):
- User custom lists (CRUD, persistence, auth)
- List sharing, export, alerts
- Reordering within predefined lists

## 3. Predefined list definitions

| List ID | Name (AR) | Name (EN) | Source logic |
|---------|-----------|-----------|--------------|
| `egx30` | EGX30 | EGX30 | Top 30 by `market_cap` from `latest_quotes` (or official index if we get it) |
| `egx70` | EGX70 | EGX70 | Next 70 by market cap |
| `ewi` | EGX100 | EGX100 | Union of EGX30 + EGX70 |
| `egx33_sharia` | مؤشر الشريعة EGX33 | EGX33 Sharia | `sharia_status` where `status = 'compliant'` |
| `sector:{slug}` | قطاع {name} | {Sector} Sector | `instruments.sector = slug` |

## 4. API

### `GET /api/watchlists/predefined`

Response:
```json
{
  "data": [
    {
      "id": "egx30",
      "nameAr": "EGX30",
      "nameEn": "EGX30",
      "type": "index",
      "instrumentCount": 30,
      "instruments": [
        { "ticker": "COMI", "nameAr": "...", "nameEn": "...", "quote": { "price": 85.50, "changePct": 1.2 } },
        ...
      ]
    },
    {
      "id": "sector:banking",
      "nameAr": "قطاع البنوك",
      "nameEn": "Banking Sector",
      "type": "sector",
      "instrumentCount": 12,
      "instruments": [...]
    },
    ...
  ],
  "meta": { "asOf": "...", "source": "universe+quotes" }
}
```

- `type`: `index` | `sector` | `sharia`
- Each list includes full instrument snapshot (ticker, names, latest quote)
- Quotes from `latest_quotes` joined on instrument_id

## 5. Mobile UI

### Watchlist tab (`/(app)/(tabs)/watchlist.tsx`)

```
Header: "القوائم"
Segmented: [ جاهزة ] (مخصصة disabled v1, gray)

List of PredefinedListCard:
  - Icon + Name + Count
  - Tap → PredefinedListScreen
```

### PredefinedListScreen (`/(app)/watchlist/[listId].tsx`)

```
Header: List name + count
FlatList of InstrumentRow (reuse MoverRow style):
  - Name (AR/EN), Ticker, Price, Change% (colored), Sector chip
  - Tap → Stock screen
  - Pull-to-refresh refetches quotes
```

## 6. Implementation steps

1. **API route** `apps/api/src/routes/watchlist.ts` with `GET /api/watchlists/predefined`
2. **Contracts** for response schema
3. **Mobile** Watchlist tab + list screen + types
4. **Locales** AR/EN keys
5. **Verify** on emulator + production API

No schema changes, no worker changes, no auth — pure read from existing tables.