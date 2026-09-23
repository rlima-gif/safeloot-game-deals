import app from './dist/server/index.js';

export default {
  async fetch(request, env, ctx) {
    return app.fetch(request, env, ctx);
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
