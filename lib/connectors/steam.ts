import { getSteamData } from '../steam-data';
import { regionalAmount } from '../regional-prices';
import type { ConnectorInput, StoreResult } from './types';

type JsonRecord = Record<string, unknown>;

export async function getSteamResult(
  input: ConnectorInput,
): Promise<{ result: StoreResult; data?: JsonRecord }> {
  const data = (await getSteamData(input.appId)) as JsonRecord;
  const price =
    typeof data.price_overview === 'object' && data.price_overview !== null
      ? (data.price_overview as JsonRecord)
      : null;
  const final = regionalAmount(price?.final, price?.currency);
  if (final !== null) {
    const initial = regionalAmount(price?.initial, price?.currency) ?? final;
    return {
      data,
      result: {
        store: 'Steam',
        status: 'confirmed',
        productId: String(input.appId),
        offer: {
          price: final,
          originalPrice: initial,
          currency: 'BRL',
          discount: Number(price?.discount_percent) || 0,
          productUrl: `https://store.steampowered.com/app/${input.appId}/?cc=br&l=brazilian`,
          region: 'Brasil',
          launcher: 'Steam',
          edition: 'Standard',
          available: true,
          verifiedAt:
            typeof data._safelootVerifiedAt === 'string'
              ? data._safelootVerifiedAt
              : new Date().toISOString(),
        },
      },
    };
  }
  if (data.is_free === true) {
    return {
      data,
      result: {
        store: 'Steam',
        status: 'confirmed',
        productId: String(input.appId),
        offer: {
          price: 0,
          originalPrice: 0,
          currency: 'BRL',
          discount: 0,
          productUrl: `https://store.steampowered.com/app/${input.appId}/?cc=br&l=brazilian`,
          region: 'Brasil',
          launcher: 'Steam',
          edition: 'Standard',
          available: true,
          verifiedAt:
            typeof data._safelootVerifiedAt === 'string'
              ? data._safelootVerifiedAt
              : new Date().toISOString(),
        },
      },
    };
  }
  return {
    data,
    result: {
      store: 'Steam',
      status: 'no-offer',
      diagnostic: 'Steam não retornou preço BRL para este jogo.',
    },
  };
}
