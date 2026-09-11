---
name: SafeLoot
colors:
  background: "#0f0518"
  surface: "#170b25"
  primary: "#39ff14"
  border: "#8a2be2"
  warning: "#ff4500"
  foreground: "#f6f7fb"
typography:
  heading:
    fontFamily: "Space Grotesk, Arial, sans-serif"
  utility:
    fontFamily: "ui-monospace, Cascadia Code, Courier New, monospace"
rounded:
  default: "0px"
spacing:
  default: "16px"
---

# SafeLoot

## Product and authority
The user's September 2026 brief replaces Ludopreço with SafeLoot and approves
Evangelion Unit-01 / tactical-mecha styling. This is a Brazilian PC game price
comparison tool, not a mock storefront. Preserve real prices, BRL-first comparisons,
price filters, search, favorites and Epic giveaways. No invented deadlines,
discounts or security certifications. SYS.OP.01 and SECURE_LINK are decorative
brand typography, hidden from assistive technology.

## Visual system
Nearly black purple armor panels with 18px chamfered corners, purple borders,
toxic green prices and primary actions, restrained orange deadline strips.
Use existing Space Grotesk for large uppercase game names and system monospace
for SafeLoot, prices and countdowns. No rounded pills or fake Cyberpunk content.

## Canonical ownership and mapping
Model B: app/globals.css owns runtime values; this document mirrors them.
background → --background; surface → --card; primary → --primary;
border → --tactical-purple; warning → --tactical-alert;
foreground → --foreground. Tailwind's @theme adapter maps semantic variables.
System monospace → --font-tactical; Space Grotesk remains the layout font.
Global scrollbars and responsive geometry belong to app/globals.css.
Shared Button, Tabs, ToggleGroup and Collapsible remain the interaction owners.
OfferDeadline owns real-deadline presentation for both deal and giveaway cards.

## Layout and behavior
Responsive 3/2/1 card columns; fluid widths, natural vertical scrolling, 44px
minimum primary targets, 56px card CTA. Compact desktop landscape styles at
900px minimum width and 850px maximum height support 1280×800 handheld screens.
Use visible keyboard focus, native links/buttons and reduced-motion support.
Retain the previous favorites storage key to preserve saved games after rebrand.
Countdowns update every 30 seconds, never reset on reload, disappear without a
source deadline, and show an expired state instead of false urgency.
International offers remain collapsed by default; BRL comparisons stay primary.

## Selected direction — Violeta (September 10, 2026)
User selected the third displayed Product Design concept, then requested that
subsequent work keep this structure and add no dependencies. This section
supersedes the earlier tactical-mecha visual description; legacy CSS remains
untouched with a scoped Violeta override section at the end of app/globals.css.

Runtime token owner remains app/globals.css (Model B): --background #100d17,
--card #1b1526, --primary #ac7bea, --primary-foreground #160c24,
--foreground #f2eff8, --muted-foreground #b0a6bf, --border #372d45,
--loot-green #b8f36a. Main UI uses the existing Space Grotesk on body, with an
explicit Arial sans-serif fallback. Monospace owns wordmark and prices.

Selected reference: exec-ead65ea4-5067-4495-9eb2-1bf6b1d6524c.png in the
thread generated_images directory. Desktop: compact search header, asymmetric
three-cover shelf, budget controls, two columns of horizontal game rows.
Detail: content and store table left, purchase and historical context right.
Mobile: compact rows, stacked purchase/comparison/history and bottom navigation.

components/safeloot.tsx owns shared home/detail/store/wishlist UI. Existing
Button/Input primitives retain their ownership. PriceHistory owns API-backed
history, never synthetic points. Covers come from store APIs; existing Layers2
icon provides the brand mark, not a newly drawn SVG or new dependency.
No asserted historic low without records. No invented promotions or countdowns.
Brazilian price sources: Steam, GOG, Hype, GamersGate, subject to exact product
and BRL checks. Epic powers active paid-game giveaways. Nuuvem has direct BRL
product and catalog readers. GMG catalog prices require confirmed BRL and a
successful response; otherwise it remains an external lookup destination.
Fanatical and Humble remain external lookups unless a configured source quotes them.


## Incremental comparison expansion — 2026-09-10
The approved Violeta shell, navigation, layout grid and existing dependencies remain. New editorial, planning and availability panels reuse the purple panels/lavender links/lime confirmed prices. Main game content order: critic, regional comparison, history/verdict, official trailer. Official/key filters share the store registry. Do not populate missing cloud/subscription/Deck data. Do not make source-dependent rankings visible with invented observations. Affiliate badges must accompany monetized offer links, including mobile purchase controls.

## Homepage discovery — 2026-09-11
Preserve the hero and shared filters. Add compact cover-led shelves for Steam bargains below R$10, roguelikes, indies, Nuuvem, GMG and Epic giveaways. Eight cards initially, expandable in groups of eight. Store tabs compose with the existing budget and sorting controls. Desktop uses four columns, mobile two; purchase controls stay at least 44px. Steam recommendations require at least 80% positive reviews and 50 reviews. Missing prices remain empty with a clear availability message; never fill shelves with sample prices.

## Automatic game profile — 2026-09-11
The existing game layout keeps prices/history before editorial content. `GameProfilePanel` owns the fetched synopsis/facts, screenshots, languages, system requirements and source attribution. Reuse `GameTrailer` for both automatic and configured videos; do not label general YouTube search results official. Gallery uses inline image selection with native buttons, an original-image link, horizontal thumbnail scrolling, and44px targets; no modal or new dependencies. New panels inherit Violeta CSS variables. Missing fields are omitted, request failures offer retry, and stale metadata is labeled explicitly.
