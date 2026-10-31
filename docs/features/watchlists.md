# Watchlists Feature

**Feature Name:** Watchlists (M5 Milestone)
**Status:** ✅ v2 Shipped — Telda-style tabs + custom user lists
**Branch:** `feat/m3-stock-detail`
**Commits:** `2395dac` (v1), `fd8688c` (v1 fixes), watchlist v2 (this change)
**Docs convention:** this file is the single source of truth for the feature.

---

## 1. What (User Vision — v2 redesign)

The watchlists tab is now a **single screen with Telda-style pill tabs** at the top:

- **Pill tabs**: `EGX30` | `الشريعة` | user's custom lists… | `+` (new list)
- Tap a pill → that list's stocks appear **below** the tabs.
- **No sectors** (removed — clutter, per user), **no EGX70/EGX100** (removed — they overlapped EGX30 and confused users: the same stock appeared in multiple lists).
- **Defaults ready from the start**: EGX30 (top 30 by market cap) and الشريعة (sharia stocks).
- **Custom lists**: signed-in users can create, rename, delete lists and add/remove stocks (search by ticker/name).

### Why the old design was replaced

| Old problem | Cause | v2 fix |
|---|---|---|
| Same stock in EGX30 + EGX100/sharia | EGX100 contains EGX30 by definition; sharia list was an empty placeholder | Only EGX30 + sharia remain; sharia is now populated |
| Sector lists useless | Auto-derived filler, not user-relevant | Removed entirely |
| Flat list of lists | No direct navigation | Pill tabs: tap → list appears below |

## 2. Architecture

### 2.1 Database (migration `0006`)

```sql
watchlists       (id, user_id, name, kind 'custom', created_at, updated_at)  -- index on user_id
watchlist_items  (id, watchlist_id FK→cascade, instrument_id FK→cascade,
                  position, created_at)  -- unique (watchlist_id, instrument_id)
```

Defaults (EGX30, sharia) are **computed, not stored** — see 2.2.

### 2.2 API — `apps/api/src/routes/watchlist.ts`

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/watchlists` | optional | Defaults (EGX30 + الشريعة) + user's custom lists. Guests get defaults only. |
| `POST /api/watchlists` | required | Create custom list `{name}` (max 60 chars) |
| `PATCH /api/watchlists/{id}` | owner | Rename |
| `DELETE /api/watchlists/{id}` | owner | Delete (items cascade) |
| `POST /api/watchlists/{id}/items` | owner | Add stock `{ticker}` (dedup via unique constraint) |
| `DELETE /api/watchlists/{id}/items/{ticker}` | owner | Remove stock |

- **EGX30**: top 30 active instruments by `latest_quotes.market_cap` (nulls excluded).
- **الشريعة**: static curated ticker list (`apps/api/src/lib/sharia-tickers.ts`, 14 tickers, banks excluded) intersected with instruments, ordered by market cap. 12/14 matched the local universe; unknown tickers degrade gracefully.
- **TODO**: replace curated sharia list with official EGX33 constituents when a source is available (user refused paying MuslimXchange and refused scraping kasheif.com).
- Response item: `{ id: "default:egx30" | "default:sharia" | "custom:<n>", kind, name, editable, instrumentCount, instruments[] }` — `editable` drives the mobile UI (rename/delete/remove buttons only on custom lists).
- Auth: better-auth session via `auth.api.getSession({ headers })`; ownership enforced per request.
- `meta.asOf` = newest `latest_quotes.as_of` (real data freshness).

### 2.3 Mobile — `apps/mobile/src/app/(app)/(tabs)/watchlist.tsx`

- Horizontal pill tab row (`ScrollView`): defaults + custom lists + dashed `+` pill.
- Selected list rendered below: name (locale-aware), ticker, price + change% (up/down colors), tap → stock detail.
- Custom-list actions: rename ✏️, delete 🗑 (confirm dialog), remove stock ✕ per row, "+ إضافة سهم" → full-screen search modal (`/api/instruments?q=&kind=stock`, already-added stocks show ✓ and are disabled).
- Guests tapping create/edit get a sign-in prompt (no forced auth wall on the tab).
- Old `/watchlist/[listId]` screen removed (everything is on one screen now).
- Pull-to-refresh + 60s refetch; loading/error/empty states localized.

### 2.4 Data flow

```
ingest (worker) → latest_quotes (price, market_cap, as_of)
                        ↓
GET /api/watchlists → EGX30 (computed) + الشريعة (computed) + custom lists (DB)
                        ↓
Mobile pill tabs → stock rows → stock detail
```

## 3. Testing (verified locally end-to-end)

- [x] `GET /api/watchlists` guest → EGX30 (30) + الشريعة (12)
- [x] Unauthenticated `POST /api/watchlists` → 401
- [x] Real OTP sign-in (dev log OTP) → session cookie
- [x] Create list (Arabic name) → 201, appears in GET as `editable: true`
- [x] Add COMI → 201; rename → 200; remove item → 200; delete list → 200
- [x] Owner-only enforcement (list lookup scoped by `user_id`)
- [x] `bun run typecheck` (api + worker + mobile) green; `contracts:check` green

## 4. v2.1 — Drag-and-drop reorder + multi-add (shipped `087add4`)

**API** — `PUT /api/watchlists/{id}/items/order`
- Body: `{ tickers: [...] }` — the full ordered ticker list.
- Owner-only; validates the tickers exactly match the list contents (400 `INVALID_ORDER` otherwise); updates all `position` values in one transaction.

**Mobile**
- Custom lists render with `react-native-draggable-flatlist` (default export; `ScaleDecorator` decorator) — long-press & drag to reorder, optimistic cache update with rollback on failure.
- Add-stock modal is now **multi-select**: tap stocks to toggle, confirm bar adds all in picked order (sequential POSTs so server-side `position` follows the pick order).
- Modal theme fix: `bg-background`/`text-background` classes don't exist in the theme (white modal) → `bg-canvas`/`text-canvas`, `statusBarTranslucent` on modals.

**Testing (verified locally end-to-end)**
- [x] Reorder persisted (`COMI,EAST,ABUK` → `ABUK,EAST,COMI`), foreign ticker → 400
- [x] Multi-add 3 tickers → positions follow pick order

## 5. Known Limitations / Next

| Item | Status |
|---|---|
| Sharia list = curated static seed (12 matched) | replace with official EGX33 data when available |
| EGX30 = market-cap proxy | replace with official constituents when available |
| Add-to-list from stock detail screen | future enhancement (API already supports it) |
| ~~Reorder items in custom list~~ | ✅ shipped in v2.1 (drag-and-drop) |
