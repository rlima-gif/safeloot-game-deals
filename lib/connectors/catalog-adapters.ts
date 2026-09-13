import {
  fetchGamersGateCatalog,
  parseGamersGateOffers,
} from '../regional-prices';
import { getGogOffers, getHypeOffers } from '../store-connectors';
import type { ConnectorInput, StoreResult } from './types';

function offerResult(
  store: string,
  offers: Awaited<ReturnType<typeof getGogOffers>>,
  diagnostic: string,
): StoreResult {
  const offer = offers[0];
  if (!offer) return { store, status: 'no-offer', diagnostic };
  return {
    store,
    status: 'confirmed',
    productId: offer.id,
    offer: {
      price: offer.finalPrice,
      originalPrice: offer.originalPrice,
      currency: offer.currency,
      discount: offer.discount,
      productUrl: offer.url,
      region: offer.region,
      launcher: offer.launcher,
      edition: 'Standard',
      available: true,
      verifiedAt: new Date().toISOString(),
    },
  };
}

export async function getGogResult(
  input: ConnectorInput,
): Promise<StoreResult> {
  return offerResult(
    'GOG',
    await getGogOffers(input.canonicalTitle),
    'GOG respondeu, mas não confirmou o produto correto em BRL.',
  );
}

export async function getHypeResult(
  input: ConnectorInput,
): Promise<StoreResult> {
  return offerResult(
    'Hype Games',
    await getHypeOffers(input.canonicalTitle),
    'Hype respondeu, mas não confirmou o produto correto em BRL.',
  );
}

export async function getGamersGateResult(
  input: ConnectorInput,
): Promise<StoreResult> {
  const catalog = await fetchGamersGateCatalog(input.canonicalTitle);
  return offerResult(
    'GamersGate',
    parseGamersGateOffers(catalog, input.canonicalTitle),
    'GamersGate respondeu, mas não confirmou preço regional em BRL.',
  );
}

export async function getEpicResult(
  _input: ConnectorInput,
): Promise<StoreResult> {
  return {
    store: 'Epic Games',
    status: 'not-integrated',
    diagnostic:
      'A integração ativa da Epic cobre jogos grátis; preço por jogo ainda não está homologado.',
  };
}
