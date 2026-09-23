import { spawnSync } from 'node:child_process';

const files = ['tests/connectors-history.mjs','tests/nuuvem-edge-cases.mjs','tests/news-pipeline.mjs','tests/news-ai-transport.mjs','tests/stabilization-pass.mjs','tests/release-pass.mjs','tests/price-intelligence.mjs','tests/wishlist-security.mjs','tests/identity-and-commerce.mjs','tests/discovery-quality.mjs'];

if (process.env.SAFELOOT_LIVE_TESTS === 'true') {
  files.push(
    'tests/integrations.mjs',
    'tests/discovery-check.mjs',
    'tests/game-profile.mjs',
  );
}

for (const file of files) {
  const result = spawnSync(process.execPath, [file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
