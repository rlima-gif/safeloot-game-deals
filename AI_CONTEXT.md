# AI_CONTEXT.md — SafeLoot / Ludo Preço Project Handoff

> **Purpose:** Preserve project continuity across AI models and sessions.
> **Last updated:** 2026-09-16
> **Repository:** `C:\Users\PC\safeloot-game-deals` (correct checkout)
> **Remote:** `https://github.com/rlima-gif/safeloot-game-deals.git`

---

## 1. Project Overview

**Product:** SafeLoot / Ludo Preço — price monitoring + game news for PC gamers in Brazil.
**Stack:** Next.js (ViNext) on Cloudflare Workers + Cloudflare D1 + Cloudflare Workers AI + GitHub Actions.
**Core value:** "Notícias que mudam a compra" — news that affect purchase decisions, not general gaming news.

---

## 2. User Workflow and Preferences

- **Autonomous implementation:** Proceed through inspect → implement → test → build → deploy → validate without asking for routine approval.
- **Stop conditions:** Destructive DB ops, missing secrets, irreversible migrations, genuine business ambiguity.
- **No over-engineering:** No queues, vector DBs, distributed caches, message brokers, extra AI providers unless strictly required.
- **Clean git:** No secrets, no `execute-prod-test.mjs`, no temp files, coherent commits.
- **Production safety:** Never reset D1, drop tables, delete production data, rotate secrets, expose credentials.

---

## 3. Architecture

```
Cloudflare Worker (Next.js via ViNext)
    │
    ├─ D1 (SQLite) — news_runs, news_raw_items, news_events, news_articles, news_sources, games
    ├─ Workers AI (binding) — native env.AI.run with REST fallback
    ├─ GitHub Actions — `.github/workflows/news.yml` (uses SAFELOOT_ADMIN_TOKEN secret)
    ├─ /api/news — public read endpoint
    ├─ /api/cron/news — authenticated cron (Bearer SAFELOOT_ADMIN_TOKEN)
    ├─ /api/cron/news/status — public status endpoint
    └─ Home: NewsSection + RunDashboard
```

---

## 4. Current Git State

- **HEAD (local):** `ecdfc21` — `feat: simplify news ai pipeline with fallback`
- **HEAD (origin/main):** `ecdfc21` (pushed)
- **Working tree:** Clean except `execute-prod-test.mjs` (untracked, excluded)
- **Previous baseline:** `f7f8416` — `feat: finalize news observability and cron pipeline`

---

## 5. Cloudflare Infrastructure

| Resource | Status | Details |
|----------|--------|---------|
| Worker (`safeloot`) | **DEPLOY BLOCKED** | Duplicate D1 binding in generated `dist/server/wrangler.json` |
| D1 Database (`safeloot`) | **CONFIRMED** | `database_id: b307427a-bfdd-4f9d-9ebf-da0fc47ec67b` |
| Workers AI | **CONFIRMED** | Binding `AI`, model `@cf/meta/llama-3.1-8b-instruct-fast` |
| KV / R2 / Queues | **NOT USED** | — |
| SAFELOOT_ADMIN_TOKEN | **CONFIRMED** | GitHub Actions secret, not in repo |

**Deploy blocker:** `dist/server/wrangler.json` contains two `DB` bindings (`site-creator-d1` + `safeloot`). Must fix before deploy.

---

## 6. Database

**Tables (confirmed existing):**
- `games` — `app_id`, `title`, `monitored`, `checked_at`, `created_at`
- `news_sources` — `id`, `name`, `type`, `enabled`, `priority`, `url`, health fields
- `news_raw_items` — `id`, `source_id`, `article_id`, `article_url`, `title`, `snippet`, `published_at`, `collected_at`, `app_id`, `hash`
- `news_events` — `id`, `app_id`, `title`, `category`, `importance`, `confidence`, `purchase_impact`, `rumor`, `safe_to_publish`, `created_at`
- `news_articles` — `id`, `event_id`, `app_id`, `title`, `summary`, `why_it_matters`, `purchase_advice`, `category`, `purchase_impact`, `rumor`, `provider_type`, `published_at`, `created_at`
- `news_article_sources` — `id`, `article_id`, `raw_item_id`, `source_name`, `article_url`
- `news_runs` — `id`, `started_at`, `updated_at`, `finished_at`, `status`, `error`, `summary`

**Steam persistence fix (CONFIRMED working):**
- 50 Steam raws → 50 persisted
- 9 `games` stubs created with `monitored=0`
- Real `monitored=1` games untouched
- FK integrity preserved

---

## 7. News System

### Sources
- **Steam** (type: `steam`) — monitored apps: 1091500, 2207440, 570, 730, 271590
- **RSS** (type: `rss`) — PC Gamer, others (config in `lib/news/sources/config.ts`)

### Pipeline (NEW — after refactor)
```
collect → dedupe → deterministic prefilter → generateArticle (1 AI call)
    → deterministic validation → deterministic grounding → save article
```

### Fallback (NEW)
- Configured via `NEWS_AI_MODEL_FALLBACKS` (comma-separated model IDs)
- Max 3 attempts, never retry same model
- Only for **technical failures**: timeout, rate_limit, http_5xx, malformed_json, fetch_error, model_unavailable
- **NOT** for editorial rejection (`decision: "reject"`)

### Observability
- `news_runs` table with heartbeat/checkpoints
- `GET /api/cron/news/status` — public, no auth
- Editorial breakdown: `ai`, `validation`, `grounding`, `errors`, `persistence`, `pipeline` counters

---

## 8. AI Provider Architecture (NEW)

### Interface (`lib/news/ai/types.ts`)
```typescript
interface NewsAIProvider {
  readonly providerType: 'cloudflare' | 'openai' | 'heuristic';
  generateArticle(eventTitle: string, items: RawNewsItem[], appId?: number): Promise<GenerateArticleResult>;
}
```

### GenerateArticleResult (compact)
```typescript
{
  decision: 'publish' | 'reject',
  category: NewsCategory,
  confidence: number,
  game: string | null,
  appId: number | null,
  title: string | null,
  summary: string | null,
  body: string | null,
  whyItMatters: string | null,
  purchaseImpact: PurchaseImpact | null,
  purchaseAdvice: string | null,
  facts: string[],
  claims: { text: string; basis: string[] }[]
}
```

### Providers
| Provider | File | Model (default) |
|----------|------|-----------------|
| Cloudflare (native + REST) | `cloudflare-provider.ts` | `@cf/meta/llama-3.1-8b-instruct-fast` |
| OpenAI (Responses API) | `openai-provider.ts` | `gpt-4o-2024-08-06` |
| Heuristic (no-AI) | `provider.ts` | — |

### Prompt (CONFIRMED)
Single unified prompt covering: relevance, purchase impact, article generation, claim grounding, anti-sensationalism, structured JSON only.

---

## 9. Confirmed Bugs and Fixes

| Bug | Status | Fix |
|-----|--------|-----|
| Steam raws lost (FK to missing games) | **FIXED** | Auto-create `games` stubs with `monitored=0` |
| Writer mass failure (13/15) | **FIXED BY REFACTOR** | Removed separate writer stage |
| 3 AI calls per event | **FIXED BY REFACTOR** | Now 1 AI call (`generateArticle`) |
| Malformed JSON not explicit | **FIXED BY REFACTOR** | `malformed_json` error code, triggers fallback |
| Silent failures | **FIXED** | Explicit error codes, observability |
| No fallback for technical failures | **FIXED BY REFACTOR** | `generateArticleWithFallback` with up to 3 attempts |

---

## 10. Current Production State

### Last Real Production Run (baseline `f7f8416`)
| Metric | Value |
|--------|-------|
| Collected | 120 |
| Events | 69 |
| Raw persisted | 120 |
| Raw dropped | 0 |
| Editor processed | 69 |
| Editor approved | 15 |
| Editor rejected | 3 |
| Writer processed | 15 |
| Writer failed | 13 |
| Verifier processed | 2 |
| Grounding processed | 2 |
| Grounding rejected | 1 |
| Events completed | 2 |
| Articles published | 0 |
| Errors: timeout | 13 |
| Errors: malformedJson | 8 |
| Errors: unknown | 43 |
| Errors: retryable | 64 |

### Post-Refactor Target (PENDING validation)
- Normal event: 1 AI call
- Events completed → much closer to events received
- Writer mass failure eliminated
- Articles published > 0 (if valid source material exists)

---

## 11. Pending Issues

| Issue | Status | Priority |
|-------|--------|----------|
| Deploy blocked: duplicate D1 binding | **PENDING** | High — fix `dist/server/wrangler.json` generation |
| Single production cron run | **PENDING** | High — validate new pipeline |
| Oxlint warnings (49 matches) | **PENDING** | Low — style only, no errors |
| `execute-prod-test.mjs` untracked | **PENDING** | Low — delete or .gitignore |

---

## 12. Current Task

**Deploy the refactored News AI pipeline and run exactly one production validation cron.**

Steps:
1. Fix D1 binding conflict in generated wrangler config
2. `npx wrangler deploy`
3. Verify: homepage 200, `/api/news` 200, `/api/cron/news/status` 200
4. Trigger GitHub Actions workflow `.github/workflows/news.yml` **once**
5. Poll `/api/cron/news/status` for completion
6. Read `/api/news` for published articles
7. If defect found → fix → redeploy → one more run max

---

## 13. Rules for OpenCode

- **Do NOT** modify application code outside scope
- **Do NOT** commit without explicit instruction
- **Do NOT** deploy without explicit instruction
- **Do NOT** run production cron without explicit instruction
- **Do NOT** reset D1, delete data, rotate secrets
- **Do NOT** lower editorial thresholds to force articles
- **Do NOT** create demo/fake content
- **Distinguish clearly:** CONFIRMED vs PENDING vs HYPOTHESIS
- **Preserve:** Steam fix, news_runs, status endpoint, Home/API contracts

---

## 14. Important URLs

| Purpose | URL |
|---------|-----|
| Repository | `https://github.com/rlima-gif/safeloot-game-deals` |
| Worker (prod) | `https://safeloot.workers.dev` (or custom domain) |
| News API | `https://safeloot.workers.dev/api/news` |
| Cron status | `https://safeloot.workers.dev/api/cron/news/status` |
| GitHub Actions | `https://github.com/rlima-gif/safeloot-game-deals/actions` |

---

## 15. Important Commands

| Task | Command |
|------|---------|
| Test | `npm test` |
| Typecheck | `npx tsc --noEmit` |
| Lint | `npx oxlint lib/news/ai/** lib/news/collector.ts` |
| Build | `npm run build` |
| Deploy | `npx wrangler deploy` |
| Cron status | `curl https://safeloot.workers.dev/api/cron/news/status` |
| News feed | `curl https://safeloot.workers.dev/api/news?limit=6` |

---

## 16. Change Log

| Date | Change | Commit |
|------|--------|--------|
| 2026-09-15 | Baseline `f7f8416` — news observability, cron pipeline | `f7f8416` |
| 2026-09-15 | Steam persistence fix (games stubs monitored=0) | included above |
| 2026-09-16 | **One-AI refactor**: `generateArticle` + fallback | `ecdfc21` |
| 2026-09-16 | Tests updated for new architecture | `ecdfc21` |
| 2026-09-16 | Build passes, tests pass, tsc clean | — |
| 2026-09-16 | Deploy blocked by duplicate D1 binding | — |

---

**END OF AI_CONTEXT.md**