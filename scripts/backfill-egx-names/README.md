# EGX official Arabic-name backfill

Fills `instruments.name_ar` / `search_name_ar` for EGX listings where
TradingView has no Arabic name (~29% of the universe).

- `names.json` — ticker → official Arabic name.
- `backfill.sql` — generated UPDATEs (only fills `name_ar IS NULL`).

Source: `https://www.egx.com.eg/ar/listedstocks.aspx` (official listed
securities table, Arabic). The site is geo/bot-walled (TSPD challenge), so
the table was captured with a real headless Chrome session and matched to
tickers via TradingView's `isin` scanner column.

Regenerate: `python3 -c` steps in the PR description / commit message.

Run on prod:

    scp scripts/backfill-egx-names/backfill.sql ubuntu@SERVER:/tmp/
    ssh ubuntu@SERVER "docker exec -i \$(docker ps -q -f name=postgres | head -1) \
      psql -U egx -d egx < /tmp/backfill.sql"
