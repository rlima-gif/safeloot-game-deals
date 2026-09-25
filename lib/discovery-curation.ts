import type { DiscoveryDeal, DiscoveryShelf } from './discovery';

export function getCuratedDiscoverySelection(
  shelves: DiscoveryShelf[],
  step = 0
): DiscoveryDeal[] {
  const allGames: DiscoveryDeal[] = [];
  const seenAll = new Set<string>();

  for (const shelf of shelves) {
    for (const game of shelf.games) {
      const key = String(game.appId || game.id);
      if (!seenAll.has(key)) {
        seenAll.add(key);
        allGames.push(game);
      }
    }
  }

  if (allGames.length === 0) return [];

  const buckets: { name: string; filter: (g: DiscoveryDeal) => boolean }[] = [
    {
      name: 'Grátis',
      filter: (g) => (g.price === 0 || g.discount === 100) && (g.store === 'Epic Games' || g.storeId === 'epic'),
    },
    {
      name: 'Indie Destaque',
      filter: (g) => g.tags.some((t) => /indie/i.test(t)) && (g.positive ?? 0) >= 80,
    },
    {
      name: 'Roguelike',
      filter: (g) => g.tags.some((t) => /rogue|deckbuilder|metroidvania/i.test(t)) || g.id.includes('roguelike'),
    },
    {
      name: 'Super Oferta',
      filter: (g) => g.price !== null && g.price > 0 && g.price <= 30 && g.discount >= 50,
    },
    {
      name: 'Loja Nacional',
      filter: (g) => g.storeId === 'nuuvem' || /nuuvem/i.test(g.store),
    },
    {
      name: 'Co-op / Multiplayer',
      filter: (g) => g.tags.some((t) => /co-op|multijogador|multiplayer/i.test(t)) || g.discount >= 70,
    },
    {
      name: 'RPG & Ação',
      filter: (g) => g.tags.some((t) => /rpg|ação|action|aventura|adventure/i.test(t)),
    },
    {
      name: 'Aclamação 90%+',
      filter: (g) => (g.positive ?? 0) >= 90,
    },
  ];

  const selected: DiscoveryDeal[] = [];
  const chosenAppIds = new Set<string | number>();

  for (let b = 0; b < buckets.length && selected.length < 8; b++) {
    const bucket = buckets[b];
    const candidates = allGames.filter(bucket.filter);
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[(step + i) % candidates.length];
      const key = candidate.appId ?? candidate.id;
      if (!chosenAppIds.has(key)) {
        chosenAppIds.add(key);
        selected.push({
          ...candidate,
          badge: candidate.badge || bucket.name,
        });
        break;
      }
    }
  }

  // Backfill if fewer than 8 games were selected
  if (selected.length < 8) {
    const sorted = [...allGames].sort((a, b) => (b.positive ?? 70) - (a.positive ?? 70));
    for (let i = 0; i < sorted.length && selected.length < 8; i++) {
      const candidate = sorted[(step + i) % sorted.length];
      const key = candidate.appId ?? candidate.id;
      if (!chosenAppIds.has(key)) {
        chosenAppIds.add(key);
        selected.push(candidate);
      }
    }
  }

  return selected;
}

export function resolveCategoryRepresentatives(
  categoryShelves: DiscoveryShelf[],
  rotationIndex = 0
): Map<string, DiscoveryDeal> {
  const chosenKeys = new Set<string | number>();
  const representatives = new Map<string, DiscoveryDeal>();

  for (const shelf of categoryShelves) {
    if (!shelf.games || shelf.games.length === 0) continue;

    let chosen: DiscoveryDeal | null = null;
    const len = shelf.games.length;

    for (let i = 0; i < len; i++) {
      const candidate = shelf.games[(rotationIndex + i) % len];
      const key = candidate.appId ?? candidate.id;
      if (!chosenKeys.has(key)) {
        chosen = candidate;
        chosenKeys.add(key);
        break;
      }
    }

    if (!chosen) {
      chosen = shelf.games[rotationIndex % len];
    }

    representatives.set(shelf.id, chosen);
  }

  return representatives;
}
