# Design QA — SafeLoot Violeta

final result: passed

## Visual target and evidence
Selected third displayed concept:
C:/Users/rlima/.codex/generated_images/01a086ea-60af-78b2-9ec5-4122cf421998/exec-ead65ea4-5067-4495-9eb2-1bf6b1d6524c.png

Implementation captures under:
C:/Users/rlima/Documents/Codex/2026-09-09/ludopre-o-sites-project-appgprj-6aa0da318d4c81918b1e43b15b7912d1-6/outputs/design-references/
- violet-home-desktop.png: initial desktop 1280x720 class viewport.
- violet-home-desktop-final.png: home at portable desktop size; visible input focus.
- violet-game-desktop-final.png: Cyberpunk detail, 1440x900 CSS viewport.
- violet-home-mobile.png: home, 390x844 CSS viewport.
- violet-game-mobile.png: initial detail, 390x844.
- violet-game-mobile-final.png: revised detail, 390x844; captured after viewport settled.

Source board and implementation images were opened together in the same tool
comparison input. Source board embeds multiple differently scaled viewports;
its labels do not provide pixel-exact frames. Comparison is at layout and
component hierarchy level, not a claimed pixel-diff. Browser screenshots include
scrollbar allocation (e.g. mobile content scrollWidth 380 at innerWidth 390).
No manual resampling or image modification was used. Focused mobile capture
provides readable type, CTA and table evidence alongside the full source board.

## Findings and iteration
- P2 initial mobile detail used unnecessary header/cover/purchase spacing.
  Reduced cover 108 to 90px, title 23 to 21px, panel padding 17 to 14px and
  related gaps without changing DOM structure. Final mobile screenshot was
  compared again against the selected board. CTA remains 44px high.
- Earlier serif fallback was fixed by applying existing Space Grotesk on body
  with explicit Arial/sans-serif fallback. Computed font checked in browser.
- Price store identity in saved detail snapshots now follows the actual best
  offer instead of always showing Steam.
- No remaining actionable P0/P1/P2 visual issue in tested states.

## Required fidelity surfaces
- Typography: retained existing Space Grotesk; monospace price/brand roles,
  clear display-to-body hierarchy, readable Portuguese, no clipped main titles.
- Layout: asymmetric cover shelf, compact two-column desktop rows; detail
  purchase/history right, comparison/content left; mobile stacked naturally.
  Mobile is intentionally larger than the tiny board text for usable targets.
- Color/tokens: near-black purple, violet action, lime price/discount, restrained
  borders. No blanket neon glow. Runtime Violeta overrides own current values.
- Images: actual Steam/GOG-compatible product art instead of generated fake
  catalogue screenshots. Existing Layers2 mark is a documented minor brand
  variation under the constraint not to add dependencies or redraw assets.
- Content: real source prices replace illustrative R$79.90. No Nuuvem price or
  fictitious lowest-ever claim. History empty state is intentional while key
  is absent. Steam-declared DLCs only, no invented Ultimate edition.

## Behavior and engineering evidence
- Build: pnpm run build passed; routes include /jogo/:id and /api/history.
- TypeScript: tsc --noEmit --incremental false passed.
- Money/API checks: 21 checks passed (BRL, editions, ambiguous matching,
  availability/platform, URL validation, history currency/store, no-key state,
  invalid API inputs). Script: outputs/verification/violet-checks.mjs.
- Premium strict audit: 0 findings; premium-audit.json.
- Browser: budget R$20 gives only matching list rows; Cyberpunk search; open
  game; Steam + GOG BRL comparison; DLC listing; save, navigate to wishlist,
  verify persistence and remove; empty wishlist; no-result search and clear
  restores input focus; Epic active paid-game giveaway; 1280x800 no overflow;
  390x844 no overflow, main CTA 44px. Loading states observed naturally.
- Package and lockfile diff unchanged. No dependencies added.
- Whole-repository oxlint not clean: legacy UI findings plus preferences
  against native anchor/img/ARIA roles and loading state in effects. Recorded
  rather than restructuring components against the user's latest instruction.
- Dedicated console log capture, authenticated ITAD data, service outage
  simulation and exhaustive accessibility automation were not performed.

## Remaining limits
History requires server-only ITAD_API_KEY; no authenticated production-history
success claim. Nuuvem/GMG/Fanatical/Humble links are manual lookup destinations.
Hype/GamersGate catalogue parsers can return no exact match or fail as source
formats change. Store coverage is shown per query. This is local preview;
no production deployment performed.


## Incremental integrations and user document — 2026-09-10
- 56 executable checks in `tests/integrations.mjs`: BRL filtering, missing/invalid/expired deals, original affiliate URL preservation, official/key categorization, history coverage and weighted averages, missing-key behavior, invalid API requests, real Steam redirect resolution.
- TypeScript passed. Production build passed with `/go/:store/:offer` registered. Dependency manifest/lockfile unchanged.
- Browser: Cyberpunk Steam/GOG regional offers and sourced Metacritic score loaded. Official/Keys switching, empty Keys state, add/remove basket, subtotal, alert save/reload/remove were verified. Test basket and alert were removed through the UI.
- Responsive widths: 1280x800, 1440x900, 390x844, no horizontal document overflow. Desktop screenshot compared with previous approved 1440x900 game screen; same shell/typography/purchase panel, deliberate additive panels below intro.
- Mobile headings verified in order: critic, comparison, history, trailer. Sticky purchase remains visible. Screenshots: `outputs/design-references/integration-desktop-final.png`, `integration-mobile.png` (paths relative to task root).
- YouTube iframe mounted on click with verified publisher video ID. Actual playback remained blank in the in-app preview; a persistent direct YouTube link and fallback instruction are provided. Playback is not claimed verified.
- Live ITAD/keyshop calls and populated live-history chart were not verified: provider access is absent. Parser/insight behavior was verified with test fixtures only, never shown as production offers. Alert delivery, cloud subscription membership and Deck verification are intentionally not inferred.
- Existing repo-wide lint findings from earlier work remain outside this incremental scope; no broad rewrite performed.


## Nuuvem correction and third-party options — 2026-09-10

## Discovery shelves — 2026-09-11
- Live shelves verified in the browser: Steam cheap/roguelike/indie, Nuuvem and Epic. GMG returned406; no speculative prices rendered.
- Nuuvem + R$10 filter shows three eligible offers; expansion increases a Steam shelf from8 to16; ascending price sorting verified. Real redirects return302; unknown discovery IDs return404.
- Desktop and390x844 mobile inspected: no horizontal overflow, two mobile columns and44x44 purchase controls. Screenshot: outputs/design-references/discovery-mobile.png in the task root. Violeta tokens and existing hero retained.
- TypeScript, production build,67 existing integration checks and new discovery checks pass. No new dependencies or deployment.
- Direct Nuuvem product HTML connector enabled independently of ITAD. Live Resident Evil 4 quote: BRL32.99, original169, Steam activation. Internal redirect returned302 to the exact Nuuvem PC remake product.
- 67 integration checks pass, including unavailable stock, wrong edition, currency mismatch, metadata/price disagreement, console-only platform and invalid destination rejection. TypeScript and production build pass; dependencies unchanged.
- Browser verified Nuuvem in sorted offers, lowest-price panel and all-store selector. Keys filter exposes all ten requested third-party shops; selecting Kinguin correctly reports no confirmed quote instead of fabricating one. 390x844 has no horizontal overflow; screenshot at task outputs/design-references/nuuvem-options-mobile.png.
- Coverage limit: public product URLs need to match the title-derived slug or explicit identifier mapping. Unavailable products remain unpriced. The public search route returned403 during research; no access-control bypass was implemented.

## Automatic profile — 2026-09-11
- LOK Digital live:6 screenshots, developers/publisher, OS, modes, genres, release, description and automatically resolved official YouTube trailer. Gallery next/thumbnail selection and iframe activation exercised. Correct iframe URL verified; actual playback remained blank in the embedded browser, with direct fallback link visible.
- Mobile390x844: fixed gallery min-content overflow; document no longer overflows and gallery is348px wide, previous/next controls44x44px. Existing cover, comparison and planning panels preserved.
- New module lint, TypeScript, production build, profile checks and67 existing integration checks passed. Strict premium audit returned zero findings. Earlier duplicate-key issue fixed with distinct gallery/trailer keys; no new equivalent console errors after reload.
- No deployment and no new packages. Optional broader YouTube API search has no configured key and is not claimed as live-tested. Platforms reflect Steam OS support, not an exhaustive console catalog.
