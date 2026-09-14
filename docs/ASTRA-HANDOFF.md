# SafeLoot — Astra Migration Handoff

Documented from the CURRENT repository state only. No code was changed to create this file.

## 1. Project Goal

SafeLoot is a PC game-deals comparison product for Brazilian players.

Core question answered by the product:

> "Does this news change my purchase decision?"

Every published news article must help a player decide whether a game became more interesting to buy, wait for, or monitor. SafeLoot is NOT a general gaming news website.

## 2. Current Architecture

- Next.js app routes in `app/`
  - Public read API: `app/api/news/route.ts`
  - Protected collection API: `app/api/cron/news/route.ts`
  - Existing price routes remain separate.
- Backend news pipeline in `lib/news/`
  - `lib/news/collector.ts` — multi-source orchestration with `Promise.allSettled`
  - `lib/news/dedupe.ts` — deterministic raw-item deduplication and event grouping
  - `lib/news/normalize.ts` — shared raw-item normalization and hashing
  - `lib/news/news-store.ts` — D1 persistence and published-news reads
  - `lib/news/sources/steam.ts` — official Steam News collection
  - `lib/news/sources/rss.ts` — configurable RSS/Atom collection
  - `lib/news/sources/config.ts` — configured sources
- Editorial AI pipeline in `lib/news/ai/`
  - `lib/news/ai/types.ts` — canonical contracts
  - `lib/news/ai/provider.ts` — provider selection and heuristic fallback
  - `lib/news/ai/cloudflare-provider.ts` — default production Cloudflare provider
  - `lib/news/ai/openai-provider.ts` — optional OpenAI Responses API provider
  - `lib/news/ai/pipeline.ts` — Editor → Writer → Verifier orchestration
  - `lib/news/ai/grounding.ts` — deterministic grounding post-check
- Database migrations in `drizzle/`
  - Price history and news tables are separate.
- Tests in `tests/`
  - `tests/news-pipeline.mjs` — backend news coverage
  - Existing price/connector tests remain unchanged.

## 3. Current Branch and HEAD

- Branch: `main`
- HEAD: `b69b0cd`
- Subject: `fix: enforce deterministic performance grounding guard`
- Working tree at handoff creation: clean

## 4. Completed News Pipeline Work

- Steam News collection using official Steam AppID news.
- Configurable RSS/Atom source collection.
- Raw-item dedupe hash and event grouping.
- Canonical 16-category editorial contract:
  - `release`
  - `delay`
  - `update`
  - `dlc`
  - `expansion`
  - `edition`
  - `sale`
  - `price`
  - `free-game`
  - `subscription`
  - `system-requirements`
  - `drm`
  - `steam-deck`
  - `linux`
  - `announcement`
  - `other`
- Purchase impact contract:
  - `none`
  - `low`
  - `medium`
  - `high`
- Explicit rumor handling:
  - `rumor === true` can never auto-publish.
- Source timeout handling for Steam and RSS.
- Source health fields:
  - `lastCheckedAt`
  - `lastSuccessAt`
  - `lastFailureAt`
  - `lastError`
  - `lastItemCount`
- Public API:
  - `GET /api/news`
  - Supports `?limit=`, `?appId=`, `?category=`
  - Returns only published, non-rumor articles.
- Protected collection API:
  - `POST /api/cron/news`
  - Uses existing admin-token model.
  - Missing token returns 503.
  - Invalid token returns 401.
- Structured Writer/Verifier grounding safeguards.
- Deterministic grounding post-check after the LLM verifier.
- Live smoke-test infrastructure:
  - `scripts/news-ai-live-smoke.mjs`

## 5. Cloudflare Workers AI Configuration

- Default production provider: `cloudflare`
- Provider implementation:
  - `lib/news/ai/cloudflare-provider.ts`
- Default model:
  - `@cf/meta/llama-3.1-8b-instruct-fast`
- Model override:
  - `NEWS_AI_MODEL`
- Timeout override:
  - `NEWS_AI_TIMEOUT_MS`
- Runtime integration:
  - Uses native `env.AI.run()` when available.
  - Smoke test supports an injectable Wrangler-authenticated REST runner for plain Node.
- Local Vite binding:
  - `vite.config.ts` includes `ai: { binding: 'AI' }`.

## 6. Zero-Cost AI Requirement

The news pipeline must run with zero mandatory paid AI cost.

Rules currently enforced:

- Default provider is Cloudflare Workers AI.
- No automatic OpenAI fallback.
- No automatic paid-provider fallback.
- No heuristic-generated news may be published as production output.
- Quota, timeout, binding, capacity, or provider failures return:
  - `{ status: 'retryable_error', error: '...' }`
- Raw items and event data must remain preserved/retryable.
- Existing published news continues to work during provider outages.

Publication requires all of the following:

- Editor accepted the event.
- `safeToPublish === true`
- `rumor === false`
- `category !== 'other'`
- Writer succeeded.
- Verifier approved with zero unsupported claims.
- Deterministic grounding guard approved.

Any AI infrastructure error fails closed and remains retryable.

## 7. OpenAI Optional-Only Status

OpenAI is optional and disabled by default.

- Implementation:
  - `lib/news/ai/openai-provider.ts`
- Endpoint:
  - `POST https://api.openai.com/v1/responses`
- Structured output:
  - `text.format.type === 'json_schema'`
  - `strict: true`
- Selection:
  - Only when `NEWS_AI_PROVIDER=openai`
  - Presence of `OPENAI_API_KEY` alone never selects OpenAI.
- Missing configuration fails explicitly and never falls back silently.
- API keys are never exposed to the frontend and are redacted from thrown errors.
- No live paid OpenAI call is required for repository tests.

## 8. Real Live Tests Already Performed

- Live Steam API verification was performed for AppID `1091500`.
- Live RSS parsing was verified for configured PC Gamer and IGN feeds.
- A real Cloudflare Workers AI inference path was exercised from an authenticated user environment using:
  - `@cf/meta/llama-3.1-8b-instruct-fast`
- A real 3-stage Editor → Writer → Verifier execution was performed.
- The live test exposed and then documented the following behavior:
  - The LLM verifier can approve unsupported technical interpretations.
  - The deterministic grounding guard exists specifically to catch those cases.
- Repository automated tests use deterministic fixtures and mocks.
  - They do not require paid OpenAI access.
  - They do not require live Cloudflare credentials.

## 9. Current Grounding/Verifier Safeguards

- Writer contract distinguishes:
  - Factual copy:
    - `title`
    - `summary`
    - `whyItMatters`
  - Purchase judgment:
    - `purchaseAdvice`
- Factual fields may use only:
  - Approved facts
  - Game identity
  - Approved category
- `purchaseAdvice` may additionally use approved `purchaseImpact`.
- Writer output includes internal claim grounding metadata:
  - `claims[]`
  - Each claim declares one or more bases:
    - `fact:N`
    - `category`
    - `purchaseImpact`
    - `gameIdentity`
- Verifier receives the same approved editorial context as Writer:
  - Facts
  - Category
  - Purchase impact
  - Game identity
  - Generated Writer text
  - Claim metadata
- Verifier checks entailment, not merely the presence of a claim reference.
- Deterministic grounding guard runs after the LLM verifier.
- Technology names alone do not prove a consequence:
  - `FSR`
  - `XeSS`
  - `DLSS`
  - `frame generation`
- Unsupported performance, experience, optimization, FPS, stutter, or quality consequences are rejected when absent from approved facts.
- Neutral `purchaseImpact=none` language remains allowed.
- Unauthorized purchase-value language remains rejected.

## 10. Latest Relevant Commits

Most recent news-pipeline commits at handoff time:

- `b69b0cd` — `fix: enforce deterministic performance grounding guard`
- `c6938cf` — `fix: enforce claim-level grounding in news copy`
- `2d93c9f` — `fix: align writer and verifier grounding context`
- `1f840a6` — `fix: correctly detect Wrangler OAuth in live smoke test`
- `603ca8f` — `fix: use authenticated remote runner for Workers AI smoke test`
- `d976e15` — `test: add live Workers AI news pipeline smoke test`
- `04090fb` — `chore: configure local AI binding for Cloudflare plugin`
- `0b0f865` — `fix: use active Workers AI model for news`
- `02f2a7f` — `test: verify zero-cost AI provider behavior`
- `2114d8e` — `fix: make news AI retryable without paid fallback`
- `cf3aa48` — `feat: add Cloudflare Workers AI news provider`
- `42613c4` — `fix: align news AI with Responses API schema`
- `48981c7` — `fix: use Responses API structured outputs for news AI`
- `df936fd` — `test: harden external news AI pipeline`
- `ad38597` — `fix: enforce structured editorial validation`
- `012952a` — `feat: add real OpenAI news provider`
- `908c689` — `fix: add news source timeout and health tracking`
- `54f9b63` — `fix: harden news deduplication and rumor handling`
- `a3d4918` — `fix: align news editorial contract`
- `a71dfb6` — `feat: expose curated news API`

## 11. Known Limitations

- Production Cloudflare AI binding behavior still depends on deployment/runtime authentication.
- Local Miniflare/Workers AI simulation may require remote execution and valid Wrangler authentication.
- Live model output remains probabilistic; deterministic safeguards are required and intentionally strict.
- Production D1 migration/deployment status is not claimed by this handoff.
- Frontend news presentation has not been implemented in this phase.
- No embeddings or additional model stages were added.
- Maximum remains:
  - Editor
  - Writer
  - Verifier

## 12. Exact Next Recommended Task

Implement Phase 2 frontend presentation only.

Do not change the editorial pipeline unless a frontend integration requirement exposes a concrete backend gap.

Recommended scope:

1. Create a read-only news presentation surface.
2. Consume only already-published output from `GET /api/news`.
3. Display:
   - Title
   - Summary
   - `whyItMatters`
   - `purchaseAdvice`
   - Category
   - Purchase impact
   - Published date
   - Sources
4. Preserve all existing price, search, filter, and Nuuvem behavior.
5. Do not introduce automatic paid AI calls.
6. Do not bypass rumor, category, verifier, or grounding safeguards.

## 13. Commands to Test/Build

From the SafeLoot project directory:

```powershell
npm test
npx tsc --noEmit
npm run build
```

Live Workers AI smoke test from an authenticated Windows PowerShell session:

```powershell
node scripts/news-ai-live-smoke.mjs
```

Wrangler authentication check:

```powershell
npx wrangler@latest whoami --json
```

## 14. Important Files/Directories

- `app/api/news/route.ts`
- `app/api/cron/news/route.ts`
- `lib/news/collector.ts`
- `lib/news/dedupe.ts`
- `lib/news/normalize.ts`
- `lib/news/news-store.ts`
- `lib/news/sources/config.ts`
- `lib/news/sources/steam.ts`
- `lib/news/sources/rss.ts`
- `lib/news/ai/types.ts`
- `lib/news/ai/provider.ts`
- `lib/news/ai/cloudflare-provider.ts`
- `lib/news/ai/openai-provider.ts`
- `lib/news/ai/pipeline.ts`
- `lib/news/ai/grounding.ts`
- `db/schema.ts`
- `drizzle/`
- `scripts/news-ai-live-smoke.mjs`
- `tests/news-pipeline.mjs`
- `tests/fixtures/steam-news.json`
- `tests/fixtures/sample-rss.xml`
- `vite.config.ts`

## 15. Things That Must NOT Be Reverted or Rebuilt

- Canonical 16-category editorial contract.
- `purchaseImpact` contract and neutral-purchase language rules.
- Rumor hard rule:
  - `rumor === true` never auto-publishes.
- Cloudflare Workers AI as default zero-cost provider.
- OpenAI optional-only status and explicit configuration errors.
- No automatic paid fallback.
- No automatic heuristic production fallback.
- Temporary AI failures remain retryable instead of discarding events.
- Shared Writer/Verifier grounding context.
- Claim-level grounding metadata.
- Deterministic grounding post-check after LLM verification.
- Source timeout isolation and source-health preservation behavior.
- Separation between price-history storage and news storage.
- Existing Steam/RSS collector behavior.
- Existing price filters, search, cards, homepage, game pages, Nuuvem logic, and CSS.
