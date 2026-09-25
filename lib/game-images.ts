/**
 * SafeLoot Game Image Quality & Asset Resolution Pipeline
 * Enforces image source priority, prevents blurry thumbnail upscaling,
 * and maintains intentional aspect ratios across cards and hero spotlights.
 *
 * IMAGE SOURCE PRIORITY:
 * 1. Validated canonical game artwork (Steam CDN high-res capsule/header for confirmed AppID)
 * 2. Secondary CDN assets (header.jpg -> library_hero.jpg) for the SAME canonical AppID
 * 3. Legitimate metadata source image when identity is proven
 * 4. SafeLoot branded game placeholder (/placeholder-game.svg)
 *
 * NEVER fuzzy-match artwork by title. NEVER show another game's artwork (WRONG_GAME_IMAGES = 0).
 */

export type GameImageSurface = 'hero' | 'card' | 'row' | 'cover';

export const SAFE_LOOT_GAME_PLACEHOLDER = '/placeholder-game.svg';

/**
 * Returns the highest-resolution legitimate artwork for a given game and display surface.
 */
export function resolveGameArtwork(
  game: {
    id?: number | string;
    appId?: number;
    image?: string;
    headerImage?: string;
  },
  surface: GameImageSurface = 'card',
): string {
  const rawId = typeof game.id === 'number' ? game.id : (game.id && /^\d+$/.test(game.id) ? Number(game.id) : undefined);
  const appId = game.appId || (rawId && rawId > 0 ? rawId : undefined);

  // If valid Steam appId is available, construct the canonical high-res CDN assets
  if (appId) {
    const cdnBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`;

    if (surface === 'hero' || surface === 'card') {
      // 616x353 is the official high-resolution store capsule (sharp, clean, 16:9 aspect)
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
    // Try to extract appId from the URL itself: /apps/(\d+)/
    const match = candidate.match(/\/apps\/(\d+)\//);
    if (match?.[1]) {
      return `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${match[1]}/capsule_616x353.jpg`;
    }
  }

  if (candidate) {
    return candidate;
  }

  return SAFE_LOOT_GAME_PLACEHOLDER;
}

/**
 * Fallback image URL when preferred image fails to load.
 * Cascades through legitimate assets for the SAME game, ultimately
 * defaulting to the SafeLoot branded game placeholder.
 */
export function getGameArtworkFallback(
  currentSrc: string,
  appId?: number | null,
): string {
  if (appId && appId > 0) {
    const cdnBase = `https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${appId}`;

    // If store capsule failed, fallback to canonical header.jpg
    if (currentSrc.includes('capsule_616x353') || currentSrc.includes('capsule_231x87') || currentSrc.includes('capsule_sm_120')) {
      return `${cdnBase}/header.jpg`;
    }

    // If header.jpg failed, fallback to library_hero.jpg
    if (currentSrc.includes('header.jpg')) {
      return `${cdnBase}/library_hero.jpg`;
    }
  }

  return SAFE_LOOT_GAME_PLACEHOLDER;
}
