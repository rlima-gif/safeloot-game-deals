# SafeLoot operations

## D1
`.openai/hosting.json` declares the logical binding `DB`. Sites provisions the real
D1 instance and applies the generated schema-only `drizzle/` migrations at deployment.
Do not paste invented database UUIDs into this manifest. Runtime uses raw prepared
statements; table definitions live in `db/schema.ts`. Applied migrations are immutable.

`games` is the monitored set, rotated by last check. `store_products` persists the
Steam AppID/store product mapping. `price_history` stores integer BRL cents; identical
consecutive prices extend `last_seen_at` rather than inserting duplicate events. Returning
to an earlier price creates a new event. `source_health` records latest source checks.
`collection_runs` records completed runs and a ten-minute lease preventing overlap.

## Protected collection
Both `/api/cron/prices` (POST) and `/api/integrations/health` (GET) require a backend-only
`SAFELOOT_ADMIN_TOKEN`. Missing configuration returns 503; missing/wrong bearer returns
401. No token in frontend, URL, or hosting manifest. `/lojas` exposes only public source
status without administrative diagnostics.

The collector reads monitored games from D1, initially seeding from a live Steam BRL
highlight selection if empty. Up to two games run concurrently; source failures are
isolated. Database failures return non-success and are never reported as recorded prices.

## Scheduler: configuration alone is not activation
`.github/workflows/prices.yml` schedules a request every six hours at minute 17 UTC.
It requires `SAFELOOT_ADMIN_TOKEN` as a GitHub Actions repository secret matching the
Sites runtime secret. The GitHub connection used in this task cannot write repository
secrets. Until that secret is set and an actual workflow run succeeds, do not describe
collection as scheduled and operational. Never commit the secret to the private repo.
Validate the workflow's HTTP response and a matching completed `collection_runs` row.
A manually successful route invocation proves collection, not the scheduler.

Sites does not expose Cron Trigger management in its current connector. An external
Cloudflare Worker Cron Trigger can call the same authenticated route if connected and
configured in the user's account. No external Worker or schedule is implied by this file.

## Integration evidence
Eneba's documented GraphQL API manages merchant sales and reports:
https://api.eneba.com/documentation/
https://api.eneba.com/documentation/guide/getting-started/
Kinguin documents merchant OAuth and eCommerce distribution:
https://www.kinguin.net/dev-portal/api-access
https://www.kinguin.net/news/marketplace/how-does-api-work
Neither establishes a tax-inclusive, regional consumer checkout quote. Affiliate feed
availability and redistribution rights require the provider's approval. No retail-price
connector is enabled merely by adding a merchant API credential. Credentials remain
optional backend settings until a supported consumer quote is validated.

`STORE_AFFILIATES_JSON` follows `lib/affiliate.ts`: per-store tracking_parameters,
affiliate_id and optional HTTPS affiliate_url containing `{url}`. `/go/keyshop/:store`
is a non-price external lookup, explicitly disclosed on the game page. It never enters
ranking or price_history. No affiliation or commissioned link is asserted unless configured.

## Validation
Run `pnpm lint`, `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm build`.
Tests apply actual migrations to SQLite through a D1-shaped prepared-statement adapter,
close/reopen the file, and verify persistence, deduplication, health and collection.
Production D1 still requires deployment verification against the real binding.

## Local verification on 2026-09-13
- 40 deterministic checks pass: Nuuvem identity/edition/platform/currency/expiry,
  malformed layout, unsafe redirect rejection before following, timeout, database
  restart, deduplication, returning prices, health, admin guard, collector writes.
- SQLite migrations also executed successfully through local Wrangler D1.
- Browser: carousel next/previous work using explicitly identified test fixtures;
  360 px embedded viewport opens the canonical filter drawer and retains R$20 selection.
  The temporary fixture page was removed before packaging. No fixture offers are shipped.
- External store requests timed out in the local environment. This is not evidence
  that production connectors work or that the stores themselves are unavailable.
- Production binding, anonymous smoke test, source coverage and CI run must be
  verified separately after deployment. No scheduled run is asserted here.
