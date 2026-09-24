// Shared by pricing and editorial: never return stale price data.
type RecordData = Record<string, unknown>;
const cache = new Map<number, { expires: number; data: RecordData }>();
const pending = new Map<number, Promise<RecordData>>();
export async function getSteamData(id: number): Promise<RecordData> {
  const saved = cache.get(id);
  if (saved && saved.expires > Date.now()) return saved.data;
  if (pending.has(id)) return pending.get(id)!;
  const request = (async () => {
    const response = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${id}&cc=BR&l=brazilian`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!response.ok) throw new Error('Steam indisponível');
    const result = (await response.json()) as Record<
      string,
      { success?: boolean; data?: RecordData }
    >;
    const data =
      result[String(id)] ??
      Object.values(result).find(
        (entry) =>
          entry?.data &&
          (entry.data.steam_appid === id ||
            Number(entry.data.steam_appid) === id),
      ) ??
      Object.values(result)[0];
    if (!data?.success || !data.data)
      throw new Error('Jogo não encontrado');
    if (
      data.data.steam_appid &&
      Number(data.data.steam_appid) !== id &&
      result[String(id)] === undefined
    ) {
      throw new Error('Jogo não encontrado');
    }
    if (cache.size >= 200) cache.delete(cache.keys().next().value!);
    data.data._safelootVerifiedAt = new Date().toISOString();
    cache.set(id, { expires: Date.now() + 300000, data: data.data });
    return data.data;
  })();
  pending.set(id, request);
  try {
    return await request;
  } finally {
    pending.delete(id);
  }
}
