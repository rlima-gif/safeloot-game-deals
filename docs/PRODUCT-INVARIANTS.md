# SafeLoot Product Invariants

> **READ THIS BEFORE MODIFYING CORE PRODUCT LOGIC**
>
> Future developers and agents: review these invariants before changing game identity, pricing, discovery, structured data, news editorial, or outbound commerce.
> These invariants exist because past defects were catastrophic to user trust (e.g. wrong game metadata, fake discount claims, unverified stock in structured data, or broken button hover layouts).
> Do not blindly trust assumptions or past prompts: current code and automated tests remain authoritative.

---

## 1. Game Identity

The foundational equation of SafeLoot is:

$$\text{requested canonical ID} = \text{game} = \text{metadata} = \text{artwork} = \text{offers} = \text{history} = \text{SEO/JSON-LD}$$

* **Missing game is acceptable; wrong game is catastrophic:** If an external store connector or discovery scraper returns an ambiguous title match, the product MUST reject the offer rather than display mismatched data. A user seeing "Offer unavailable" is acceptable; a user seeing *Sonic* metadata on a *Cyberpunk* card destroys product credibility.
* **Canonical Steam AppID pivot:** Whenever a game is indexed on Steam, its numeric Steam AppID is the immutable primary key (`games.app_id`). All store connectors (`getSteamResult`, `getNuuvemResult`, `getEpicResult`, etc. in [`lib/game-api.ts`](file:///C:/Users/PC/safeloot-game-deals/lib/game-api.ts)) receive the canonical title and AppID to resolve store-specific SKUs.
* **Edition preservation:** Standard, Deluxe, and GOTY editions are tracked distinctly (`extractEdition`). Distinct editions for the same AppID do NOT overwrite each other; identical editions are deduplicated by lowest confirmed price.
* **Title hygiene:** No member game title may ever leak into shared or generic UI elements (e.g. category tile alt text must say `"Coleção Roguelikes"`, never leaking an arbitrary member game title like `"Megabonk"`).

---

## 2. Price Truth

**Price data is integration.** A retailer logo, promotional card, search link, or affiliate redirect is NOT price integration.

* **Unknown price participation ban:** An unconfirmed price NEVER participates in:
  * Best price calculations
  * Price history observations (`price_history` table)
  * Target-price Radar alerts
  * Homepage deal claims / discount badges
  * Schema.org `Offer` structured data
* **Unconfirmed price UI rendering:** When a price cannot be confirmed directly from an integrated retailer API/feed (`priceStatus === 'unconfirmed'` or `price === null`), the UI MUST display `<strong>Consultar loja</strong>` with a direct outbound link. It must NEVER invent a numeric price, estimate a conversion, or render a fake discount percentage.
* **Unintegrated keyshop boundaries:** Keyshops without verified, tax-inclusive consumer checkout quotes (e.g. Eneba, Kinguin) are displayed in a compact link-only list ([`components/game-editorial.tsx`](file:///C:/Users/PC/safeloot-game-deals/components/game-editorial.tsx)). They are explicitly labeled with the transparent disclosure *"Preços não monitorados"* and use the honest CTA *"Buscar na loja"*. They are barred from price comparison tables and price history graphs.
* **Integer cents in BRL:** All price history in D1 (`price_history.price_cents`, `price_history.original_cents`) is stored as integer Brazilian Real cents to eliminate IEEE 754 floating-point rounding errors. Repeated identical prices extend `last_seen_at`; returning to an earlier price creates a new observation event.

---

## 3. Structured Data (SEO & Availability Truth)

**Confirmed numeric price != Confirmed stock availability.**

The invariant enforced across [`lib/structured-data.ts`](file:///C:/Users/PC/safeloot-game-deals/lib/structured-data.ts) is:

$$\text{confirmed numeric price} \ne \text{confirmed availability}$$

* **Rule:** A confirmed price proves PRICE TRUTH, not STOCK / AVAILABILITY TRUTH.
* **Prohibition:** Do NOT infer availability from:
  * Numeric price existence
  * `priceStatus === 'confirmed'`
  * Existence of an offer URL
  * Retailer presence in the catalogue
  * Successful price HTTP fetch
* **Implementation rule:**
  * IF an explicit, trustworthy stock signal exists from a provider that actually supplies inventory data: emit `availability: 'https://schema.org/InStock'` ONLY when that signal explicitly confirms it.
  * IF no separate trustworthy availability signal exists: SafeLoot strictly OMITS the `availability` property from `Offer` and `AggregateOffer` schemas while preserving price truth (`lowPrice`, `highPrice`, `priceCurrency: 'BRL'`).
  * Do NOT invent `OutOfStock` unless explicit absence of stock is confirmed.

---

## 4. Discovery Engine

**Discovery eligibility != Offer eligibility.**

A canonical game may be discoverable without having a live confirmed deal.

* **Store filtering:** The five primary store filters (`Todas as lojas`, `Steam`, `Nuuvem`, `Green Man Gaming`, `Epic · grátis`) must strictly scope shelves to the selected store without rendering empty or broken layouts. If a store has zero active deals (e.g. GMG), it renders a graceful Portuguese empty-state panel with direct store recovery links ([`StoreExternalLink`](file:///C:/Users/PC/safeloot-game-deals/components/discovery-shelves.tsx#L68-L98)).
* **Artwork fallback cascade:** All discovery cards and category tiles must handle broken remote CDNs via [`getGameArtworkFallback`](file:///C:/Users/PC/safeloot-game-deals/lib/game-images.ts#L44-L63):
  $$\text{capsule\_616x353.jpg} \longrightarrow \text{header.jpg} \longrightarrow \text{library\_hero.jpg} \longrightarrow \text{SAFE\_LOOT\_GAME\_PLACEHOLDER}$$
  Image tags must never render broken image icons or collapse layouts.
* **Deterministic rotation (↻ / "Mostrar outros jogos"):**
  * Semantics: *"Show me different games within my current context."*
  * Advances local offset window: $\text{offset} = (\text{rotationIndex} \times 8) \pmod{\text{games.length}}$.
  * Purely client-side state. Zero network requests; 0ms latency.
  * Preserves active store filter completely.
  * Wraps around smoothly when the pool ends.
  * Accessible PT-BR label: `aria-label="Mostrar outros jogos"` and `title="Mostrar outros jogos"`.
* **Descobrir action:**
  * Compact secondary action button ($44\text{px} \times 44\text{px}$ touch target) beside ↻.
  * Semantics: *"Surprise me with an intentionally diverse mix across the whole catalogue."*
  * Switches store view to all stores and renders the dedicated *"Seleção Descobrir"* showcase.
  * Evaluates 8 distinct intent buckets via [`getCuratedDiscoverySelection`](file:///C:/Users/PC/safeloot-game-deals/lib/discovery-curation.ts#L3-L93):
    1. *Epic Games Free Giveaway* (`price === 0` / 100% OFF)
    2. *High-signal Indie* ($\ge 80\%$ positive sentiment)
    3. *Roguelike / Deckbuilder / Metroidvania*
    4. *Steep Bargain* ($\le \text{R\$} 10$ or $\le \text{R\$} 30$)
    5. *Brazilian Store Deal* (Nuuvem BRL)
    6. *Co-op / Multiplayer Gem*
    7. *Deep RPG or Rich Action*
    8. *Highly-Acclaimed* ($90\%+$ positive reviews)
* **Deterministic curation & anti-shovelware:**
  * Candidates pre-filtered by [`isHighSignalDiscoveryGame`](file:///C:/Users/PC/safeloot-game-deals/lib/discovery.ts#L48-L70): excludes demos, prologues, playtests, soundtracks, artbooks, and asset flips with $< 100$ reviews or $< 70\%$ positive score.
  * Scored by [`calculateRelevanceScore`](file:///C:/Users/PC/safeloot-game-deals/lib/discovery.ts#L72-L100) using log review volume, release recency bonuses, and top-seller momentum.
  * Deduplication: A `Set<string | number>` of canonical AppIDs ensures zero duplicate games in the visible shelf slice or discovery set.
* **Privacy & simplicity guarantee:**
  * No questionnaire
  * No user account requirement
  * No profiling or behavioral tracking
  * No `localStorage` or `sessionStorage` tracking
  * No runtime LLM invocation during user browsing

---

## 5. EVA-01 Visual Identity

SafeLoot's aesthetic direction is an intentional product decision:

* **Color palette:** Deep violet / near-black backgrounds (`#0c0914`, `#130f1e`, `#1c152b`), bordered by muted purple borders (`rgba(255, 255, 255, 0.08)` to `0.15`), accented with high-contrast acid neon green (`#39ff14`, `--loot-green`, `--eva-neon-green`), tactical orange warnings, and angled clip-path badges.
* **System light-theme override:** SafeLoot is an immersion-focused dark experience. The application enforces `color-scheme: dark`. Never purge the EVA-01 palette or introduce light mode CSS that breaks WCAG contrast ratios.
* **Copyright boundary:** EVA-01-inspired tactical color balance only. Do NOT copy copyrighted Evangelion characters, logos (NERV, SEELE), typography marks, or anime artwork.

---

## 6. Button Containment & Hover Safety

* **Layout invariant:** Hover, focus, or active states must NEVER change a button's external layout dimensions or cause its parent container to overflow.
* **Card containment:** Action buttons on game detail purchase panels and discovery cards must remain strictly inside their parent cards across all viewports (Desktop 1280px, Mobile 390px, Mobile 360px).
* **Safe styling properties:** Visual feedback on hover must use safe contained properties: `background-color`, `border-color`, `color`, `opacity`, `box-shadow`, or contained pseudo-elements (`::before`, `::after`) scoped with `overflow: hidden` and `position: relative` on the button itself. Never use unconstrained horizontal scale or negative margins.
* **Touch targets:** All interactive buttons must have a minimum touch target size of $44\text{px} \times 44\text{px}$.

---

## 7. News Editorial & Grounding

SafeLoot News is an authentic gaming journalism portal answering one core question:

> *"Does this news change my purchase decision?"*

$$\text{Source} \longrightarrow \text{Cleaned text} \longrightarrow \text{Grounded facts} \longrightarrow \text{Original SafeLoot PT-BR prose} \longrightarrow \text{Validation} \longrightarrow \text{Publish}$$

* **Source-proportional length (no 7-paragraph shape bias):** Article length must scale organically with the richness of facts in the ingested sources. Never force articles into a fixed 7-paragraph or ~2,500-character mold. A short factual update may be 2–3 paragraphs; an expansive announcement may be 4–6 paragraphs.
* **Strict factual grounding:** Every factual claim (patch numbers, dates, discounts, studio names, system requirements, engine details) must derive directly from the ingested source items.
* **Zero hallucinations:** Never invent quotes, executive deliberations, corporate politics, or causes and effects not present in the source text.
* **Deterministic quality gates:** [`checkDeterministicGrounding`](file:///C:/Users/PC/safeloot-game-deals/lib/news/ai/grounding.ts#L45-L132) verifies that claims of performance, FPS improvements, optimization, or stutter fixes are strictly supported by source text before publication.
* **Rumors:** Articles flagged with `rumor: true` or containing leak keywords must NEVER auto-publish.
* **Purchase impact rules:** If a story is purely institutional, cultural, or an event showcase with no commercial hook, `purchaseImpact` must be `'none'` and `purchaseAdvice` must be `null`. Never invent forced commercial advice.
