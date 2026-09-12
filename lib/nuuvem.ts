import { getNuuvemResult, parseNuuvemCandidates, parseNuuvemResult } from './connectors/nuuvem';
import { resultToOffer } from './connectors/types';

export { parseNuuvemCandidates, parseNuuvemResult };

export async function getNuuvemOffers(appId: number, title: string) {
  const result = await getNuuvemResult({ appId, title, canonicalTitle: title });
  const offer = resultToOffer(result);
  return offer ? [offer] : [];
}
