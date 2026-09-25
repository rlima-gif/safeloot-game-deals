# SafeLoot Project Milestone Changelog

This document records the major architectural, product, and stabilization milestones across SafeLoot's engineering history. It serves as an audit trail of why critical invariants were introduced and prevents regression of closed engineering decisions.

---

### Milestone 1: Discovery Rotation & Cross-Retailer "Descobrir" Action
* **Date:** 2026-09-25
* **Commit:** `07fc17c`
* **Problem:** The ↻ refresh button on the homepage discovery section did not cycle visible games (reloading the same cards or doing nothing without network requests), and there was no mechanism to explore a curated cross-retailer mix.
* **Decision / Fix:** Implemented client-side window rotation `(rotationIndex * 8) % length` without network calls. Added a compact secondary action button (`Descobrir`) beside ↻ evaluating 8 distinct curated intent buckets across stores (Epic free, indie, roguelike, bargain, Nuuvem BRL, co-op, RPG/action, acclaimed 90%+). Created client-safe [`lib/discovery-curation.ts`](file:///C:/Users/PC/safeloot-game-deals/lib/discovery-curation.ts) to avoid bundling server-side packages into client bundles.
* **Invariant Introduced:** ↻ advances visible slices within the active store filter with 0ms latency and 0 network requests; `Descobrir` surfaces 8 distinct cross-retailer candidates with zero duplicate AppIDs; unconfirmed prices remain `"Consultar loja"`.

---

### Milestone 2: Discovery Steam Filter Repair & Category Tile Artwork Fallback
* **Date:** 2026-09-25
* **Commit:** `3dde6a2`
* **Problem:** Selecting the "Steam" filter on the homepage discovery section rendered an empty state because Steam shelves lacked explicit `storeId: 'steam'` metadata; category tiles broke when remote Steam CDNs returned 404; tile alt text leaked member game title (`"Megabonk"`).
* **Decision / Fix:** Mapped Steam shelf IDs (`cheap`, `roguelike`, `indie`) to store `'steam'`; implemented multi-tier artwork fallback cascade (`capsule_616x353.jpg` $\to$ `header.jpg` $\to$ `library_hero.jpg` $\to$ `SAFE_LOOT_GAME_PLACEHOLDER`); sanitized category tile alt text to descriptive collection names (`"Coleção Roguelikes"`).
* **Invariant Introduced:** Store filters must never produce false empty states; broken artwork must cascade gracefully to safe placeholders; generic UI elements must never leak member game titles.

---

### Milestone 3: Structured Data Availability Truth Semantics
* **Date:** 2026-09-24
* **Commit:** `2c2563f`
* **Problem:** Schema.org JSON-LD emitted `availability: 'https://schema.org/InStock'` based on `priceStatus === 'confirmed'`, falsely asserting inventory/stock truth when only price truth was known.
* **Decision / Fix:** Updated [`lib/structured-data.ts`](file:///C:/Users/PC/safeloot-game-deals/lib/structured-data.ts) to strictly omit `availability` from `Offer` and `AggregateOffer` schemas unless an explicit, trustworthy stock signal is supplied by a provider that genuinely tracks stock.
* **Invariant Introduced:** `confirmed numeric price != confirmed availability`. Confirmed numeric price proves price truth, not stock availability truth.

---

### Milestone 4: Purchase Card Button Hover Containment & Layout Scoping
* **Date:** 2026-09-24
* **Commit:** `9edd43f`
* **Problem:** Hovering over action buttons (especially "Adicionar à lista de desejos") on game detail purchase panels caused them to expand and paint outside their parent cards horizontally.
* **Decision / Fix:** Scoped primary button hover and pseudo-element rules in CSS; enforced `position: relative`, `overflow: hidden`, and contained box-shadow/color transitions without altering button layout geometry.
* **Invariant Introduced:** Button hover, focus, and active states must NEVER change external layout dimensions or trigger container overflow across any viewport.

---

### Milestone 5: News Editorial Quality Gates & PT-BR Factual Grounding
* **Date:** 2026-09-24
* **Commit:** `3f4cfb0`
* **Problem:** News articles contained ungrounded generalizations, false performance claims (e.g. claiming FPS or optimization improvements not in source), and forced Brazilian angles on international stories.
* **Decision / Fix:** Added deterministic grounding validation in [`lib/news/ai/grounding.ts`](file:///C:/Users/PC/safeloot-game-deals/lib/news/ai/grounding.ts) that verifies performance, FPS, or purchase value claims against source facts before publication.
* **Invariant Introduced:** All news claims must derive directly from source facts. No ungrounded performance claims or forced commercial advice.

---

### Milestone 6: News Editorial Shape-Bias Removal & Source-Proportional Length
* **Date:** 2026-09-24
* **Commit:** `7e749c3`
* **Problem:** Generated news articles unnaturally converged on a rigid 7-paragraph shape and ~2,500 characters, leading to artificial expansion and repetitive filler.
* **Decision / Fix:** Removed fixed shape constraints from AI prompts and pipeline; enforced source-proportional length (2–6 paragraphs depending on source richness) and banned opening clichés.
* **Invariant Introduced:** Article length must scale organically with factual depth; every paragraph must advance the story with concrete facts.

---

### Milestone 7: Restoration of EVA-01 Visual Identity & Light-Theme Purge
* **Date:** 2026-09-24
* **Commit:** `92b2912`
* **Problem:** Unintended light theme styles were leaking into controls and cards, overriding the signature dark purple and acid green aesthetic.
* **Decision / Fix:** Restored intentional EVA-01 tactical dark palette (`#0c0914`, `#130f1e`, `#39ff14`); enforced `color-scheme: dark`; verified WCAG AA contrast on all interactive controls.
* **Invariant Introduced:** SafeLoot maintains an intentional EVA-01 dark tactical identity; never override with system light themes or generic white backgrounds.

---

### Milestone 8: Canonical Game Identity Repair & Multi-Store Pricing (Master Pass)
* **Date:** 2026-09-23
* **Commit:** `2cc0960`
* **Problem:** Game detail pages failed when Steam API responses were incomplete or malformed; store connectors lacked isolation; cross-game metadata mismatches occurred.
* **Decision / Fix:** Unified game detail resolution around canonical Steam AppID; isolated connectors with `Promise.allSettled`; implemented edition-safe price comparison and store health tracking.
* **Invariant Introduced:** `requested canonical ID = game = metadata = artwork = offers = history`. Missing game is acceptable; wrong game is catastrophic.

---

### Milestone 9: Non-Overlapping Price Bands & Attractiveness Scoring
* **Date:** 2026-09-23
* **Commit:** `9edfb9e`
* **Problem:** Price band filters had overlapping boundaries (e.g. R$ 10 matching both "Até R$ 10" and "R$ 10–20"), confusing budget exploration; discovery surfaced ancient clearance games over acclaimed fresh indies.
* **Decision / Fix:** Enforced strict non-overlapping mathematical intervals in `lib/price-bands.ts`; implemented multi-factor relevance scoring in `lib/discovery.ts` factoring in recency and logarithmic review volume.
* **Invariant Introduced:** Every price point matches exactly one price band; discovery ranking balances discount, review sentiment, and release recency.

---

### Milestone 10: Keyshop Link-Only Lists & Anti-Shovelware Scoring
* **Date:** 2026-09-23
* **Commit:** `6abb8fa`
* **Problem:** Unintegrated keyshops (Eneba, Kinguin) were presented misleadingly without live consumer quotes; shovelware asset flips appeared in discovery.
* **Decision / Fix:** Replaced keyshop price claims with compact link-only lists labeled "Preços não monitorados" and CTA "Buscar na loja"; introduced `isHighSignalDiscoveryGame` filtering out asset flips, demos, and soundtracks.
* **Invariant Introduced:** Price data is integration. Retailers without live consumer quotes are link-only and never participate in price comparison or price history.

---

### Milestone 11: Production Hardening & Wishlist Security
* **Date:** 2026-09-23
* **Commit:** `dc8176f`
* **Problem:** Horizontal layout overflow on narrow mobile devices (360px); wishlist backup lacked cryptographic tamper protection.
* **Decision / Fix:** Added responsive containment CSS rules; implemented HMAC signature verification for wishlist import/export.
* **Invariant Introduced:** Zero horizontal overflow across all mobile viewports; client wishlist exports are cryptographically verifiable.

---

### Milestone 12: Truthful Price Intelligence & Target-Price Radar
* **Date:** 2026-09-23
* **Commit:** `3867e4c`
* **Problem:** Price drops lacked historical context; users had no way to track price drops against target budgets.
* **Decision / Fix:** Built integer-cent D1 price history tracking with atomic observation updates; created Target-Price Radar form and initial JSON-LD structured data generators.
* **Invariant Introduced:** Price history observations must be verified BRL integer cents from confirmed store feeds.

---

### Milestone 13: Deterministic News AI Grounding Guard
* **Date:** 2026-09-13
* **Commit:** `b69b0cd`
* **Problem:** News AI provider generated speculative claims about game performance and frame rates.
* **Decision / Fix:** Created deterministic regex-based grounding guard in `lib/news/ai/grounding.ts` blocking unverified performance claims.
* **Invariant Introduced:** Generative AI outputs must pass deterministic post-generation guards before publication.

---

### Milestone 14: D1 Database Integration & News Persistence
* **Date:** 2026-09-14
* **Commit:** `4791b78`
* **Problem:** News background cron runs were in-memory and lost state between worker executions.
* **Decision / Fix:** Wired news collector and AI pipeline directly to D1 tables (`news_sources`, `news_raw_items`, `news_events`, `news_articles`, `news_runs`).
* **Invariant Introduced:** All background collection runs and published news articles must be durably persisted in D1 with atomic status updates.

---

### Milestone 15: Baseline Architecture & Astra Migration Handoff
* **Date:** 2026-09-13
* **Commit:** `ea04eab`
* **Problem:** Initial project handoff and system inventory.
* **Decision / Fix:** Established baseline documentation for Next.js app routes, news collector, Cloudflare Workers AI integration, and D1 migrations.
* **Invariant Introduced:** Core question: *"Does this news change my purchase decision?"* SafeLoot is a PC game deals and purchase-impact intelligence portal.
