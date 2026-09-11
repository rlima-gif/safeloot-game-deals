export type OfficialTrailer = {
  official?: boolean;
  videoId: string;
  publisher: string;
  sourceUrl: string;
};
// IDs verified against the publisher's own announcement/channel; never guessed from a title search.
const trailers: Record<number, OfficialTrailer> = {
  1091500: {
    videoId: 'BO8lX3hDU30',
    publisher: 'CD PROJEKT RED',
    sourceUrl:
      'https://www.cdprojekt.com/en/media/news/gameplay-trailer-for-cyberpunk-2077-released/',
  },
  1145360: {
    videoId: 'Bz8l935Bv0Y',
    publisher: 'Supergiant Games',
    sourceUrl: 'https://www.supergiantgames.com/games/hades/',
  },
};
export function criticUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    if (
      !['metacritic.com', 'www.metacritic.com'].includes(url.hostname) ||
      !['https:', 'http:'].includes(url.protocol) ||
      url.username ||
      url.password
    )
      return undefined;
    url.protocol = 'https:';
    return url.toString();
  } catch {
    return undefined;
  }
}
export function officialTrailer(appId: number): OfficialTrailer | undefined {
  try {
    const configured = JSON.parse(process.env.YOUTUBE_TRAILERS_JSON || '{}');
    const candidate = configured?.[appId];
    if (
      candidate &&
      /^[\w-]{11}$/.test(candidate.videoId) &&
      typeof candidate.publisher === 'string' &&
      candidate.publisher.trim()
    ) {
      const source = new URL(candidate.sourceUrl);
      if (source.protocol === 'https:' && !source.username && !source.password)
        return {
          videoId: candidate.videoId,
          publisher: candidate.publisher,
          sourceUrl: source.toString(),
        };
    }
  } catch {
    /* Invalid optional configuration must not break prices or game details. */
  }
  return trailers[appId];
}
