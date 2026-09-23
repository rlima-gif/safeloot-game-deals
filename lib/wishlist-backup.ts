export type SanitizedWishlistBackup = {
  app: 'safeloot';
  version: 1;
  exportedAt?: string;
  favorites: number[];
  savedGames: Array<{
    id: number;
    title: string;
    store?: string;
    headerImage?: string;
  }>;
  targets: Record<number, number>;
};

export function validateWishlistBackup(raw: unknown): {
  success: boolean;
  error?: string;
  data?: SanitizedWishlistBackup;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { success: false, error: 'Formato de backup inválido: esperado um objeto JSON.' };
  }

  const obj = raw as Record<string, unknown>;

  const rawFavs = Array.isArray(obj.favorites) ? obj.favorites : [];
  const rawGames = Array.isArray(obj.savedGames) ? obj.savedGames : [];
  const rawTargets =
    obj.targets && typeof obj.targets === 'object' && !Array.isArray(obj.targets)
      ? (obj.targets as Record<string, unknown>)
      : {};

  if (rawFavs.length > 200 || rawGames.length > 200 || Object.keys(rawTargets).length > 200) {
    return { success: false, error: 'Backup excede o limite máximo permitido de 200 itens.' };
  }

  const sanitizedFavs: number[] = [];
  for (const item of rawFavs) {
    if (typeof item === 'number' && Number.isInteger(item) && item > 0 && item <= 100_000_000) {
      if (!sanitizedFavs.includes(item)) {
        sanitizedFavs.push(item);
      }
    }
  }

  const sanitizedGames: SanitizedWishlistBackup['savedGames'] = [];
  const seenIds = new Set<number>();
  for (const item of rawGames) {
    if (!item || typeof item !== 'object') continue;
    const g = item as Record<string, unknown>;
    const id =
      typeof g.id === 'number' && Number.isInteger(g.id) && g.id > 0 && g.id <= 100_000_000
        ? g.id
        : null;
    if (!id || seenIds.has(id)) continue;

    const rawTitle = typeof g.title === 'string' ? g.title : '';
    // Strip HTML tags and control characters
    const cleanTitle = rawTitle.replace(/<[^>]*>/g, '').trim().slice(0, 150);
    if (!cleanTitle) continue;

    const rawStore = typeof g.store === 'string' ? g.store : 'Steam';
    const cleanStore = rawStore.replace(/<[^>]*>/g, '').trim().slice(0, 50);

    let cleanImage: string | undefined = undefined;
    if (typeof g.headerImage === 'string') {
      const img = g.headerImage.trim();
      if (/^https?:\/\/[a-zA-Z0-9_.\-/:~%#?&=]+$/.test(img)) {
        cleanImage = img.slice(0, 300);
      }
    }

    seenIds.add(id);
    sanitizedGames.push({
      id,
      title: cleanTitle,
      store: cleanStore,
      headerImage: cleanImage,
    });
    if (!sanitizedFavs.includes(id)) {
      sanitizedFavs.push(id);
    }
  }

  const sanitizedTargets: Record<number, number> = {};
  for (const [key, val] of Object.entries(rawTargets)) {
    const id = Number(key);
    const targetVal = typeof val === 'number' ? val : Number(val);
    if (
      Number.isInteger(id) &&
      id > 0 &&
      id <= 100_000_000 &&
      Number.isFinite(targetVal) &&
      targetVal >= 0.01 &&
      targetVal <= 100_000
    ) {
      sanitizedTargets[id] = Math.round(targetVal * 100) / 100;
    }
  }

  if (sanitizedFavs.length === 0 && Object.keys(sanitizedTargets).length === 0) {
    return { success: false, error: 'Nenhum item válido encontrado no backup.' };
  }

  return {
    success: true,
    data: {
      app: 'safeloot',
      version: 1,
      favorites: sanitizedFavs,
      savedGames: sanitizedGames,
      targets: sanitizedTargets,
    },
  };
}

export function createWishlistExport(
  favorites: number[],
  savedGames: Array<{ id: number; title: string; store?: string; headerImage?: string; image?: string }>,
  targets: Record<number, number>,
): SanitizedWishlistBackup {
  const cleanSaved = savedGames
    .filter((g) => favorites.includes(g.id))
    .map((g) => ({
      id: g.id,
      title: (g.title || '').replace(/<[^>]*>/g, '').trim().slice(0, 150),
      store: (g.store || 'Steam').replace(/<[^>]*>/g, '').trim().slice(0, 50),
      headerImage: g.headerImage || g.image || undefined,
    }));

  const cleanTargets: Record<number, number> = {};
  for (const [k, v] of Object.entries(targets)) {
    const id = Number(k);
    if (favorites.includes(id) && typeof v === 'number' && Number.isFinite(v) && v > 0) {
      cleanTargets[id] = Math.round(v * 100) / 100;
    }
  }

  return {
    app: 'safeloot',
    version: 1,
    exportedAt: new Date().toISOString(),
    favorites: [...favorites],
    savedGames: cleanSaved,
    targets: cleanTargets,
  };
}
