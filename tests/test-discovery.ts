import { getDiscovery } from '../lib/discovery';

async function test() {
  console.log('Testing getDiscovery() directly...');
  const t0 = Date.now();
  try {
    const res = await getDiscovery();
    console.log(`Finished in ${Date.now() - t0}ms!`);
    for (const shelf of res.shelves) {
      console.log(`Shelf "${shelf.title}" (${shelf.id}): ${shelf.games.length} games (status: ${shelf.status})`);
    }
  } catch (e: any) {
    console.error(`Failed in ${Date.now() - t0}ms:`, e.message, e.stack);
  }
}

void test();
