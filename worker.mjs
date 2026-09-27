import app from './dist/server/index.js';

const SECURITY_HEADERS = {
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://cloudflare-dns.com https://*.cloudflareinsights.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join('; '),
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

function applySecurityHeaders(res) {
  if (!res) return res;
  try {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!res.headers.has(key)) {
        res.headers.set(key, value);
      }
    }
    return res;
  } catch {
    const headers = new Headers(res.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(key)) {
        headers.set(key, value);
      }
    }
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  }
}

const worker = {
  async fetch(request, env, ctx) {
    const res = await app.fetch(request, env, ctx);
    return applySecurityHeaders(res);
  },
  async scheduled(event, env, ctx) {
    console.log(`[SafeLoot Cron] Triggered cron: ${event.cron} at ${new Date().toISOString()}`);
    const adminToken = env.SAFELOOT_ADMIN_TOKEN;
    if (!adminToken) {
      console.warn('[SafeLoot Cron] SAFELOOT_ADMIN_TOKEN is not configured; skipping scheduled run.');
      return;
    }
    const origin = 'https://safeloot.safeloot.workers.dev';
    ctx.waitUntil(
      Promise.allSettled([
        app.fetch(
          new Request(`${origin}/api/cron/news`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
          }),
          env,
          ctx,
        ),
        app.fetch(
          new Request(`${origin}/api/cron/prices`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${adminToken}` },
          }),
          env,
          ctx,
        ),
      ]).then((results) => {
        for (const [idx, res] of results.entries()) {
          const task = idx === 0 ? 'news' : 'prices';
          if (res.status === 'fulfilled') {
            console.log(`[SafeLoot Cron] ${task} finished with status ${res.value.status}`);
          } else {
            console.error(`[SafeLoot Cron] ${task} failed:`, res.reason);
          }
        }
      }),
    );
  },
};

export default worker;
