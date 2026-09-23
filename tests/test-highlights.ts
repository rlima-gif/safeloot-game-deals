import { getHighlights } from '../lib/game-api';

async function main() {
  console.log('Testing getHighlights()...');
  const t0 = Date.now();
  try {
    const res = await getHighlights();
    console.log(`Success in ${Date.now() - t0}ms! Featured: ${res.featured.length}, Trending: ${res.trending.length}`);
  } catch (e: any) {
    console.error(`Failed in ${Date.now() - t0}ms:`, e.message, e.stack);
  }
}

void main();
