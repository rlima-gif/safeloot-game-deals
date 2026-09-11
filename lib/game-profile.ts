import { getSteamData } from './steam-data';
import { decodeEntities } from './regional-prices';
import { officialTrailer, type OfficialTrailer } from './game-media';

export type GameProfile = {
  id: number;
  title: string;
  description: string;
  image: string;
  developers: string[];
  publishers: string[];
  releaseDate: string;
  comingSoon: boolean;
  genres: string[];
  categories: string[];
  modes: string[];
  platforms: string[];
  languages: string;
  screenshots: { thumbnail: string; full: string }[];
  requirements: { platform: string; minimum: string; recommended: string }[];
  trailer?: OfficialTrailer;
  website?: string;
  sources: { name: string; url: string }[];
  updatedAt: string;
  stale?: boolean;
};
type Row = Record<string, unknown>;
const row = (v: unknown): Row =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {};
const rows = (v: unknown) => (Array.isArray(v) ? v.map(row) : []);
export const cleanText = (v: unknown): string =>
  typeof v === 'string'
    ? decodeEntities(
        v
          .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<br\s*\/?\s*>|<\/li>|<\/p>/gi, '\n')
          .replace(/<[^>]*>/g, ''),
      )
        .replace(/[ \t]+/g, ' ')
        .replace(/\n\s*\n/g, '\n')
        .trim()
        .slice(0, 12000)
    : '';
const strings = (v: unknown) =>
  Array.isArray(v) ? v.map(cleanText).filter(Boolean) : [];
const requirementText = (v: unknown) =>
  cleanText(v)
    .replace(/^(mínimos|recomendados|minimum|recommended)\s*:\s*/i, '')
    .trim();
export function publicUrl(v: unknown): string | undefined {
  if (typeof v !== 'string') return;
  try {
    const u = new URL(v);
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(u.hostname) ||
      /(^|\.)(localhost|local|internal|test|invalid)$/i.test(u.hostname)
    )
      return;
    return u.toString();
  } catch {
    return;
  }
}
function steamImage(v: unknown) {
  const url = publicUrl(v);
  return url &&
    /\.(steamstatic\.com|steamcdn-a\.akamaihd\.net)$/.test(
      new URL(url).hostname,
    )
    ? url
    : '';
}
export function parseProfile(id: number, data: Row): GameProfile {
  const categories = rows(data.categories);
  const modeIds = [1, 2, 9, 24, 27, 36, 37, 38, 39, 47, 48, 49];
  const platforms = row(data.platforms);
  const source = `https://store.steampowered.com/app/${id}/?cc=br&l=brazilian`;
  return {
    id,
    title: cleanText(data.name),
    description:
      cleanText(data.short_description) ||
      cleanText(data.about_the_game).slice(0, 1500),
    image: steamImage(data.header_image),
    developers: strings(data.developers),
    publishers: strings(data.publishers),
    releaseDate: cleanText(row(data.release_date).date),
    comingSoon: row(data.release_date).coming_soon === true,
    genres: rows(data.genres)
      .map((g) => cleanText(g.description))
      .filter(Boolean),
    categories: categories.map((c) => cleanText(c.description)).filter(Boolean),
    modes: categories
      .filter((c) => modeIds.includes(Number(c.id)))
      .map((c) => cleanText(c.description))
      .filter(Boolean),
    platforms: [
      ['windows', 'Windows'],
      ['mac', 'macOS'],
      ['linux', 'Linux'],
    ]
      .filter(([key]) => platforms[key] === true)
      .map(([, name]) => name),
    languages: cleanText(data.supported_languages),
    screenshots: rows(data.screenshots)
      .map((s) => ({
        thumbnail: steamImage(s.path_thumbnail),
        full: steamImage(s.path_full),
      }))
      .filter((s) => s.full && s.thumbnail)
      .slice(0, 20),
    requirements: [
      ['pc_requirements', 'Windows'],
      ['mac_requirements', 'macOS'],
      ['linux_requirements', 'Linux'],
    ]
      .map(([key, platform]) => ({
        platform,
        minimum: requirementText(row(data[key]).minimum),
        recommended: requirementText(row(data[key]).recommended),
      }))
      .filter((r) => r.minimum || r.recommended),
    website: publicUrl(data.website),
    sources: [{ name: 'Steam · informações da desenvolvedora', url: source }],
    updatedAt: new Date().toISOString(),
  };
}
export function youtubeIds(text: string): string[] {
  return [
    ...new Set(
      [
        ...text.matchAll(
          /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/|previewyoutube=["\s]*)([\w-]{11})(?![\w-])/gi,
        ),
      ].map((m) => m[1]),
    ),
  ];
}
const normalized = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
export function matchesTrailer(title: string, game: string) {
  const name = normalized(game),
    video = normalized(title);
  const after = (` ${video} `.split(` ${name} `)[1] || '').trim();
  return (
    !!name &&
    ` ${video} `.includes(` ${name} `) &&
    !/^(\d+|ii|iii|iv|v|vi|vii|viii|ix|x|remaster(?:ed)?|remake|vr|dlc)\b/.test(
      after,
    ) &&
    /trailer|teaser|gameplay|announcement|reveal/i.test(title)
  );
}
async function json(url: string, headers?: HeadersInit) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(5000),
    headers,
  });
  if (!response.ok) throw new Error('Fonte indisponível');
  return row(await response.json());
}
// Only the website supplied by Steam, no user-supplied URLs or redirect traversal.
async function officialPage(url: string): Promise<string> {
  const hostname = new URL(url).hostname;
  const dns = (await json(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
    { Accept: 'application/dns-json' },
  )) as { Answer?: { type: number; data: string }[] };
  const ips = (dns.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
  if (
    !ips.length ||
    ips.some((ip) =>
      /^(0|10|127|169\.254|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(ip),
    )
  )
    throw new Error('Endereço não público');
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(5000),
    headers: { Accept: 'text/html' },
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('text/html')
  )
    throw new Error('Site indisponível');
  const reader = response.body?.getReader();
  if (!reader) return '';
  const decoder = new TextDecoder();
  let content = '',
    bytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.length;
      if (bytes > 1000000) throw new Error('Página muito grande');
      content += decoder.decode(result.value, { stream: true });
    }
  } finally {
    await reader.cancel();
  }
  return content;
}
async function resolveTrailer(
  profile: GameProfile,
  raw: Row,
): Promise<OfficialTrailer | undefined> {
  const configured = officialTrailer(profile.id);
  if (configured) return configured;
  const candidates: { id: string; source: string; official: boolean }[] = [];
  const add = (text: string, source: string) =>
    youtubeIds(text).forEach((id) =>
      candidates.push({ id, source, official: true }),
    );
  add(
    typeof raw.about_the_game === 'string' ? raw.about_the_game : '',
    profile.sources[0].url,
  );
  // Official site first: its game trailer is more relevant than cross-promoted news.
  if (profile.website)
    try {
      add(await officialPage(profile.website), profile.website);
    } catch {}
  try {
    const news = await json(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${profile.id}&count=100&maxlength=0&feeds=steam_community_announcements`,
    );
    for (const item of rows(row(news.appnews).newsitems)) {
      const source = publicUrl(item.url);
      if (source && item.feedname === 'steam_community_announcements')
        add(typeof item.contents === 'string' ? item.contents : '', source);
    }
  } catch {}
  const verified = await Promise.allSettled(
    [...new Map(candidates.map((c) => [c.id, c])).values()]
      .slice(0, 8)
      .map(async (candidate) => {
        const meta = await json(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${candidate.id}`)}&format=json`,
        );
        if (!matchesTrailer(cleanText(meta.title), profile.title)) return;
        return {
          videoId: candidate.id,
          publisher: cleanText(meta.author_name),
          sourceUrl: candidate.source,
          official: true,
        };
      }),
  );
  for (const result of verified)
    if (result.status === 'fulfilled' && result.value) return result.value;
  // Optional broader search. Credentials remain server-side; no scraping of YouTube search.
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return;
  try {
    const params = new URLSearchParams({
      key,
      part: 'snippet',
      q: `${profile.title} official trailer`,
      type: 'video',
      videoEmbeddable: 'true',
      videoSyndicated: 'true',
      maxResults: '5',
    });
    const data = await json(
      `https://www.googleapis.com/youtube/v3/search?${params}`,
    );
    for (const item of rows(data.items)) {
      const snippet = row(item.snippet),
        id = cleanText(row(item.id).videoId);
      if (
        !/^[\w-]{11}$/.test(id) ||
        !matchesTrailer(cleanText(snippet.title), profile.title)
      )
        continue;
      return {
        videoId: id,
        publisher: cleanText(snippet.channelTitle),
        sourceUrl: `https://www.youtube.com/watch?v=${id}`,
        official: false,
      };
    }
  } catch {}
}
type Entry = { profile: GameProfile; expires: number; staleUntil: number };
const memory = new Map<number, Entry>(),
  pending = new Map<number, Promise<GameProfile>>();
const failures = new Map<number, number>();
const disk = () =>
  typeof caches !== 'undefined'
    ? (caches as unknown as { default?: Cache }).default
    : undefined;
export async function getGameProfile(id: number): Promise<GameProfile> {
  if (pending.has(id)) return pending.get(id)!;
  const request = (async () => {
    const cacheKey = `https://safeloot.invalid/editorial-v5/${id}`;
    let saved = memory.get(id);
    if (!saved)
      try {
        const hit = await disk()?.match(cacheKey);
        if (hit) saved = (await hit.json()) as Entry;
      } catch {}
    if (saved && saved.expires > Date.now()) return saved.profile;
    if ((failures.get(id) || 0) > Date.now())
      throw new Error('Fonte temporariamente indisponível');
    try {
      const raw = await getSteamData(id),
        profile = parseProfile(id, raw);
      profile.trailer = await resolveTrailer(profile, raw);
      if (profile.website)
        profile.sources.push({ name: 'Site oficial', url: profile.website });
      if (profile.trailer)
        profile.sources.push({
          name: 'Origem do trailer',
          url: profile.trailer.sourceUrl,
        });
      const entry = {
        profile,
        expires: Date.now() + 86400000,
        staleUntil: Date.now() + 604800000,
      };
      if (memory.size >= 200) memory.delete(memory.keys().next().value!);
      memory.set(id, entry);
      failures.delete(id);
      try {
        await disk()?.put(
          cacheKey,
          Response.json(entry, {
            headers: { 'Cache-Control': 'public, max-age=604800' },
          }),
        );
      } catch {}
      return profile;
    } catch (error) {
      if (saved && saved.staleUntil > Date.now()) {
        const stale = { ...saved.profile, stale: true };
        memory.set(id, {
          ...saved,
          profile: stale,
          expires: Date.now() + 300000,
        });
        return stale;
      }
      if (failures.size >= 200) failures.delete(failures.keys().next().value!);
      failures.set(id, Date.now() + 300000);
      throw error;
    }
  })();
  pending.set(id, request);
  try {
    return await request;
  } finally {
    pending.delete(id);
  }
}
