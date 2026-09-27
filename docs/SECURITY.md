# SafeLoot — Security Model & Invariants Reference

This document outlines SafeLoot's security posture, defensive controls, and operational invariants designed to withstand realistic web attacks, abuse, and resource amplification.

---

## 1. Threat Model & Key Assets

SafeLoot is a high-availability game deal and price intelligence aggregator running on Cloudflare Workers (V8 edge isolates) backed by Cloudflare D1 (SQLite) and Workers AI.

Key threats addressed:
1. **Administrative Abuse & Cost Amplification:** Unauthorized invocation of cron endpoints (`/api/cron/news`, `/api/cron/prices`) triggering LLM synthesis or bulk network requests.
2. **Upstream Flooding / Denial of Service:** High-frequency querying of price comparison routes (`/api/offers`) exhausting external API rate limits or Cloudflare CPU time.
3. **Open Redirect & Phishing Exploitation:** Outbound affiliate routes (`/go/...`) abused by attackers to mask phishing destinations.
4. **Server-Side Request Forgery (SSRF):** Crawling or DNS resolution abusing internal microservices or cloud metadata endpoints (`169.254.169.254`).
5. **Cross-Site Scripting (XSS):** Injecting HTML or breaking out of JSON-LD structured data blocks via unescaped game titles or news summaries.
6. **SQL Injection:** Tampering with query parameters to exfiltrate or modify D1 records.
7. **Clickjacking & Frame Embedding:** Embedding SafeLoot in malicious frames to deceive users.

---

## 2. Implemented Defense Controls

### 2.1 Global Security Headers (`worker.mjs` & `next.config.ts`)
All HTTP responses passing through the Cloudflare Worker entry point receive strict security headers:

* **Content-Security-Policy (CSP):**
  - `default-src 'self'`: Restricts default resource origin to same-origin.
  - `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com`: Allows necessary ViNext RSC/hydration chunks and Cloudflare analytics.
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`: Permits styling and font declarations.
  - `img-src 'self' data: blob: https:`: Restricts images to HTTPS CDNs (Steam, Epic, Nuuvem, GOG, etc.).
  - `font-src 'self' data: https://fonts.gstatic.com`: Allows web fonts.
  - `connect-src 'self' https://cloudflare-dns.com https://*.cloudflareinsights.com`: Blocks unapproved outbound client-side requests.
  - `frame-ancestors 'none'`: Completely blocks framing/clickjacking.
  - `base-uri 'self'`: Prevents base-tag hijacking.
  - `form-action 'self'`: Restricts form target destinations.
  - `object-src 'none'`: Prohibits plugins (Flash, Java, ActiveX).
  - `upgrade-insecure-requests`: Enforces HTTPS transport.
* **Strict-Transport-Security (HSTS):** `max-age=31536000; includeSubDomains; preload`.
* **X-Content-Type-Options:** `nosniff` (mitigates MIME-sniffing attacks).
* **X-Frame-Options:** `DENY` (legacy frame blocking for older user agents).
* **Referrer-Policy:** `strict-origin-when-cross-origin` (prevents referrer leak on external redirects).
* **Permissions-Policy:** `camera=(), microphone=(), geolocation=(), payment=()` (disables unnecessary browser device APIs).
* **X-Permitted-Cross-Domain-Policies:** `none`.

### 2.2 Administrative Authentication & Timing Immunity (`lib/admin-auth.ts`)
* Privileged endpoints (`POST /api/cron/news`, `POST /api/cron/prices`, `GET /api/integrations/health`) require a valid Bearer token matching `process.env.SAFELOOT_ADMIN_TOKEN`.
* The comparison uses a constant-time XOR loop over the entire expected token length to prevent timing side-channel attacks.
* Payloads are bounded (tokens $> 512$ bytes are rejected immediately).
* If `SAFELOOT_ADMIN_TOKEN` is not configured, endpoints fail closed with `503 Service Unavailable` and `Cache-Control: no-store`.

### 2.3 Outbound Commerce & Open Redirect Protection (`lib/affiliate.ts`)
* Outbound redirect routes (`/go/[store]/[offer]`, `/go/discovery/[id]`, `/go/keyshop/[store]`) pass destination URLs through `affiliateDestination`.
* Invariants enforced:
  - Destination protocol must be strictly `https:`.
  - Credentials in URLs (`username:password@`) are strictly rejected.
  - Hostnames must match or be a valid subdomain of `ALLOWED_OUTBOUND_DOMAINS` (stores, verified keyshops, approved affiliate networks like Awin, Impact, CJ).
* Commerce Privacy Invariant:
  - Clicks logged via `logOutboundClick` never log client IP addresses, session cookies, or user identifiers.

### 2.4 Server-Side Request Forgery (SSRF) Defense (`lib/game-profile.ts`)
* When resolving official developer websites:
  - DNS is resolved via Cloudflare DNS-over-HTTPS (`cloudflare-dns.com`).
  - Resolved IP addresses are checked against private, loopback, and link-local ranges: `/^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./`.
  - Redirects are set to `redirect: 'manual'` (does not follow upstream 3xx redirects to internal IPs).
  - Fetches are bounded by a 5-second timeout and a strict 1,000,000-byte (1MB) response stream limit.

### 2.5 Structured Data & XSS Immunity (`lib/structured-data.ts`)
* All JSON-LD structured data blocks rendered on pages (`/`, `/jogo/[id]`, `/noticia/[id]`) are serialized through `safeJsonLdStringify`.
* Any `<` character is transformed into the unicode escape `\u003c`, making it impossible for untrusted game titles, news summaries, or RSS feed contents to close the `<script>` tag or inject HTML.
* Content in React components is rendered without `dangerouslySetInnerHTML` (news bodies render as structured paragraph and heading components).

### 2.6 SQL Injection Prevention
* All queries against the Cloudflare D1 database (`lib/db.ts`, `lib/history.ts`, `lib/news/news-store.ts`, `lib/source-health.ts`) use prepared statements with bound parameters (`?`). Dynamic SQL string interpolation is strictly prohibited.

### 2.7 Upstream Flooding & Request Coalescing (`lib/game-api.ts`)
* `/api/offers` aggregates prices from 8+ external connectors.
* To prevent denial of service and IP rate-limiting from external stores:
  - In-memory short-term TTL cache (60 seconds) caches responses per `appId`.
  - In-flight request coalescing (`offersPending` Map) ensures that multiple concurrent requests for the same game await the exact same promise rather than spawning duplicate upstream requests.
  - Cache size is bounded to 100 entries using FIFO eviction to avoid memory leaks.
  - `appId` is validated to be a positive safe integer ($\le 2 \times 10^9$).

### 2.8 Availability Semantics Invariant
* **Price Truth != Stock Truth**: A confirmed numeric price only proves price truth, not availability.
* Schema.org `availability: 'https://schema.org/InStock'` is emitted **only** when an explicit, trustworthy stock signal exists (`explicitAvailability === true`).
* In all other cases, `availability` is completely omitted from JSON-LD to prevent false search engine indexing.

---

## 3. Automated Security Verification

SafeLoot maintains automated security regression tests in `tests/security-regression.mjs`, integrated into `pnpm test`:
- Verification of admin auth denial, timing safety, and oversized header rejection.
- Open redirect and allowlist boundary testing.
- JSON-LD breakout resistance testing.
- Availability invariant verification.
- SSRF IP block list validation.
- Parameter range and bounds enforcement.
- Security headers consistency verification.
