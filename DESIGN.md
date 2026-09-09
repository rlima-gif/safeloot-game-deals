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
