/**
 * SafeLoot Game Image Quality & Asset Resolution Pipeline
 * Enforces image source priority, prevents blurry thumbnail upscaling,
 * and maintains intentional aspect ratios across cards and hero spotlights.
 */

export type GameImageSurface = 'hero' | 'card' | 'row' | 'cover';

/**
 * Returns the highest-resolution legitimate artwork for a given game and display surface.
 */
export function resolveGameArtwork(
  game: {
    id?: number;
    appId?: number;
    image?: string;
    headerImage?: string;
  },
  surface: GameImageSurface = 'card',
): string {
  const appId = game.appId || (game.id && game.id > 0 ? game.id : undefined);

  // If valid Steam appId is available, construct the canonical high-res CDN assets
  if (appId) {
    const cdnBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`;

    if (surface === 'hero') {
      // 616x353 is the official high-resolution store capsule (sharp, clean, 16:9 aspect)
      return `${cdnBase}/capsule_616x353.jpg`;
    }

    if (surface === 'card') {
      return `${cdnBase}/capsule_616x353.jpg`;
    }

    if (surface === 'row' || surface === 'cover') {
      return `${cdnBase}/header.jpg`;
    }
  }

  // Fallback to provided URLs with automatic thumbnail upgrade guard
  const candidate = game.headerImage || game.image || '';

  // Thumbnail upgrade guard: if asset is a tiny 231x87 or 120px search capsule, upgrade to 616x353
  if (candidate.includes('capsule_231x87') || candidate.includes('capsule_sm_120')) {
    if (appId) {
      return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}/capsule_616x353.jpg`;
    }
    // Try to extract appId from the URL itself: /apps/([0-9]+)/
    const match = candidate.match(/\/apps\/(\d+)\//);
    if (match?.[1]) {
      return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${match[1]}/capsule_616x353.jpg`;
    }
  }

  return candidate;
}

/**
 * Fallback image URL when preferred image fails to load.
 */
export function getGameArtworkFallback(
  currentSrc: string,
  appId?: number | null,
): string | null {
  if (!appId || appId <= 0) return null;

  const cdnBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`;

  // If capsule_616x353 failed, fallback to header.jpg
  if (currentSrc.includes('capsule_616x353')) {
    return `${cdnBase}/header.jpg`;
  }

  // If header.jpg failed, fallback to library_hero.jpg
  if (currentSrc.includes('header.jpg')) {
    return `${cdnBase}/library_hero.jpg`;
  }

  return null;
}
