import { moduleUrl } from '../tests/load-ts.mjs';

const { getGameOffers } = await import(moduleUrl('lib/game-api.ts'));

const CANONICAL_GAMES = [
  { appId: 1091500, title: 'Cyberpunk 2077' },
  { appId: 1245620, title: 'ELDEN RING' },
  { appId: 1086940, title: "Baldur's Gate 3" },
  { appId: 1174180, title: 'Red Dead Redemption 2' },
  { appId: 292030, title: 'The Witcher 3: Wild Hunt' },
  { appId: 271590, title: 'Grand Theft Auto V' },
  { appId: 413150, title: 'Stardew Valley' },
  { appId: 367520, title: 'Hollow Knight' },
  { appId: 220, title: 'Half-Life 2' },
  { appId: 883710, title: 'Resident Evil 2' },
  { appId: 553850, title: 'HELLDIVERS 2' },
  { appId: 1817070, title: "Marvel's Spider-Man Remastered" },
  { appId: 1817190, title: "Marvel's Spider-Man: Miles Morales" },
  { appId: 2050650, title: 'Resident Evil 4' },
  { appId: 1778820, title: 'TEKKEN 8' },
  { appId: 1659040, title: 'HITMAN World of Assassination' },
  { appId: 268910, title: 'Cuphead' },
  { appId: 242050, title: "Assassin's Creed IV Black Flag" },
  { appId: 632360, title: 'Risk of Rain 2' },
  { appId: 105600, title: 'Terraria' },
];

console.log(`Benchmarking current price coverage on ${CANONICAL_GAMES.length} canonical games...`);

const results = [];

for (const game of CANONICAL_GAMES) {
  try {
    const payload = await getGameOffers(game.appId, game.title);
    const brlOffers = payload.offers.filter((o) => o.currency === 'BRL' && o.finalPrice !== null);
    const usdOffers = payload.offers.filter((o) => o.currency === 'USD' && o.finalPrice !== null);
    const brlStores = [...new Set(brlOffers.map((o) => o.store))];
    const usdStores = [...new Set(usdOffers.map((o) => o.store))];
    results.push({
      appId: game.appId,
      title: game.title,
      brlCount: brlStores.length,
      brlStores,
      usdCount: usdStores.length,
      usdStores,
    });
    console.log(`[${game.appId}] ${game.title}: ${brlStores.length} BRL stores (${brlStores.join(', ') || 'none'}) | ${usdStores.length} USD stores`);
  } catch (err) {
    console.error(`[${game.appId}] ${game.title} failed:`, err.message);
    results.push({
      appId: game.appId,
      title: game.title,
      brlCount: 0,
      brlStores: [],
      usdCount: 0,
      usdStores: [],
      error: err.message,
    });
  }
}

const total = results.length;
const gte1 = results.filter((r) => r.brlCount >= 1).length;
const gte2 = results.filter((r) => r.brlCount >= 2).length;
const gte3 = results.filter((r) => r.brlCount >= 3).length;
const gte4 = results.filter((r) => r.brlCount >= 4).length;

console.log('\n=== CURRENT CANONICAL CATALOG BENCHMARK SUMMARY ===');
console.log(`Total sample games: ${total}`);
console.log(`Games with >= 1 confirmed BRL retailer: ${gte1} (${Math.round((gte1 / total) * 100)}%)`);
console.log(`Games with >= 2 confirmed BRL retailers: ${gte2} (${Math.round((gte2 / total) * 100)}%)`);
console.log(`Games with >= 3 confirmed BRL retailers: ${gte3} (${Math.round((gte3 / total) * 100)}%)`);
console.log(`Games with >= 4 confirmed BRL retailers: ${gte4} (${Math.round((gte4 / total) * 100)}%)`);

const allBrlRetailers = new Set();
for (const r of results) {
  for (const s of r.brlStores) allBrlRetailers.add(s);
}
console.log('Confirmed BRL Retailers observed:', [...allBrlRetailers].join(', '));
