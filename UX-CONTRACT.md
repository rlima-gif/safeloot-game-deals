# SafeLoot interaction contract

Source: user-approved Violeta concept and existing BRL-first product contract.
No new dependencies; preserve the existing React/Vinext/UI stack and source APIs.

| Capability | Canonical owner | Contract |
|---|---|---|
| Navigation | components/safeloot.tsx + app/jogo/[id]/page.tsx | Native document links preserve direct URLs; home view/q/price/sort in URL. Full navigation intentionally resets transient requests. |
| Search | SafeLoot header form | Explicit Enter/button submission, IME guarded, prior request aborted, clear immediate and focus returned. No search-as-you-type. |
| Select/Listbox | Native select | OS-owned popup accepted for sort and history period; labels pt-BR. |
| Form | Existing Input/Button | Native form with noValidate, inline error, explicit labels. |
| Wishlist | SafeLoot shared toggle | Preserve ludopreco-favorites IDs; store snapshot metadata separately. No login or remote notifications. Stored prices are snapshots; open detail to refresh. |
| Scrollbar | app/globals.css | Global inherited colors and forced-colors fallback. |
| Feedback | SafeLoot status-toast | Polite live status with dismiss; persistent errors inline. |
| Prices | lib/game-api.ts + store-connectors.ts | Native BRL primary, USD separate; exact title/edition/currency required. Missing activation explicitly asks to confirm at store. |
| History | lib/history.ts + PriceHistory | ITAD_API_KEY server only. Steam shop 61 + country BR + BRL. Lowest is limited to selected period/store. Missing key has honest empty state and SteamDB link. |

Base-game and DLC IDs come from Steam metadata; related search results are
filtered against those IDs. No invented Ultimate Edition or fake store match.
External store links do not claim automatic price coverage. GOG direct BRL and
Hype public card formats may change; failure/absent match produces no price.

Verification: typecheck, production build, strict premium audit, monetary parser
checks in outputs/verification/violet-checks.mjs, browser desktop/mobile flows.
Whole-repository oxlint currently flags legacy UI and preferences for native
roles, Next Image/Link, and synchronous effect loading states. Preserve the
existing component structure per user's latest constraint; do not change
unrelated shared primitives to satisfy stylistic preferences.

Game editorial owner: `components/game-profile.tsx`, `/api/game-profile`, `lib/game-profile.ts`. Native gallery buttons/fieldset, output loading feedback, inline retry and details/summary for requirements/languages. Gallery selection is transient and resets by game ID. Requests abort on navigation, and profile caching stays separate from five-minute prices. Unknown fields never become inferred platform or hardware claims.
