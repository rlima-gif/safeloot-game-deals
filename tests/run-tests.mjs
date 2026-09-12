import { spawnSync } from 'node:child_process';

const files = ['tests/connectors-history.mjs'];

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
