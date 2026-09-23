import { strictEqual, deepStrictEqual, ok } from 'assert';
import { validateWishlistBackup, createWishlistExport } from '../lib/wishlist-backup.ts';

console.log('--- Running Wishlist Backup & Security Tests ---');

// 1. Rejects non-objects and null
const nonObj1 = validateWishlistBackup(null);
strictEqual(nonObj1.success, false);
ok(nonObj1.error.includes('objeto JSON'));

const nonObj2 = validateWishlistBackup('invalid string');
strictEqual(nonObj2.success, false);

const nonObj3 = validateWishlistBackup([1, 2, 3]);
strictEqual(nonObj3.success, false);

// 2. Rejects oversized item arrays (>200)
const bigFavs = Array.from({ length: 250 }, (_, i) => i + 1);
const oversized = validateWishlistBackup({ favorites: bigFavs });
strictEqual(oversized.success, false);
ok(oversized.error.includes('limite máximo'));

// 3. Sanitizes HTML tags and XSS from titles and stores
const xssPayload = {
  favorites: [100],
  savedGames: [
    {
      id: 100,
      title: '<script>alert("xss")</script><b>Hollow Knight</b>',
      store: '<img src=x onerror=alert(1)>Nuuvem',
      headerImage: 'javascript:alert(1)',
    },
  ],
  targets: { '100': 15.5 },
};
const xssResult = validateWishlistBackup(xssPayload);
strictEqual(xssResult.success, true);
strictEqual(xssResult.data.savedGames[0].title, 'alert("xss")Hollow Knight');
strictEqual(xssResult.data.savedGames[0].store, 'Nuuvem');
strictEqual(xssResult.data.savedGames[0].headerImage, undefined); // Discarded dangerous URL scheme!

// 4. Validates target prices and rejects negative/infinite/invalid targets
const invalidTargets = {
  favorites: [101, 102, 103, 104],
  targets: {
    '101': -25.0,
    '102': 'Infinity',
    '103': 'not-a-number',
    '104': 29.99,
  },
};
const targetsResult = validateWishlistBackup(invalidTargets);
strictEqual(targetsResult.success, true);
deepStrictEqual(targetsResult.data.targets, { 104: 29.99 });

// 5. Deduplicates IDs and merges favorites
const dupPayload = {
  favorites: [10, 10, 20],
  savedGames: [
    { id: 20, title: 'Game 20' },
    { id: 20, title: 'Game 20 Dup' },
    { id: 30, title: 'Game 30' },
  ],
};
const dupResult = validateWishlistBackup(dupPayload);
strictEqual(dupResult.success, true);
deepStrictEqual(dupResult.data.favorites, [10, 20, 30]);
strictEqual(dupResult.data.savedGames.length, 2);

// 6. createWishlistExport produces sanitized and privacy-preserving object
const exported = createWishlistExport(
  [10, 20],
  [
    { id: 10, title: 'Game 10', store: 'Steam', internalSecret: 'token123' },
    { id: 99, title: 'Unsaved Game', store: 'Epic' }, // Not in favorites
  ],
  { 10: 19.9, 99: 50.0 },
);
strictEqual(exported.app, 'safeloot');
strictEqual(exported.version, 1);
deepStrictEqual(exported.favorites, [10, 20]);
strictEqual(exported.savedGames.length, 1);
strictEqual(exported.savedGames[0].id, 10);
strictEqual(exported.savedGames[0].internalSecret, undefined);
deepStrictEqual(exported.targets, { 10: 19.9 }); // 99 excluded because not favorited

console.log('Wishlist Backup & Security Tests: ALL 18 CHECKS PASSED ✅');
