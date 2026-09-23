import type { HistoryPoint } from './history';
const day = 86400000;
export function priceInsights(
  points: HistoryPoint[],
  current: number,
  discount: number,
  now = Date.now(),
) {
  const sorted = points
    .filter(
      (point) =>
        Number.isFinite(point.date) &&
        point.date <= now &&
        Number.isFinite(point.price) &&
        point.price >= 0,
    )
    .sort((a, b) => a.date - b.date);
  const start = now - 90 * day;
  // Price changes are events, not daily samples. Require coverage from the window's start.
  if (
    !Number.isFinite(current) ||
    current < 0 ||
    sorted.length < 3 ||
    sorted[0].date > start
  )
    return null;
  function average(days: number) {
    const from = now - days * day;
    const baseline = sorted.filter((point) => point.date <= from).at(-1);
    if (!baseline) return null;
    let price = baseline.price,
      time = from,
      area = 0;
    for (const point of sorted.filter((point) => point.date > from)) {
      area += price * (point.date - time);
      time = point.date;
      price = point.price;
    }
    return (area + price * (now - time)) / (days * day);
  }
  const recent = sorted.filter((point) => point.date >= start);
  const baseline = sorted.filter((point) => point.date <= start).at(-1)!;
  const series = [baseline, ...recent];
  if (series.length < 3) return null;
  const low = Math.min(...series.map((point) => point.price), current),
    avg90 = average(90)!,
    avg30 = average(30)!;
  const aboveLow =
    low > 0 ? (current / low - 1) * 100 : current === 0 ? 0 : null;
  let drops = 0;
  for (let i = 1; i < series.length; i++)
    if (series[i].price < series[i - 1].price) drops++;
  // Transparent heuristic: low proximity (60%), time-weighted average (25%), discount (15%).
  const proximity = aboveLow === null ? 0 : Math.max(0, 10 - aboveLow / 10);
  const relative =
    avg90 > 0
      ? Math.max(0, Math.min(10, 5 + (1 - current / avg90) * 10))
      : current === 0
        ? 10
        : 0;
  const score =
    Math.round(
      Math.max(
        0,
        Math.min(
          10,
          proximity * 0.6 +
            relative * 0.25 +
            Math.max(0, Math.min(100, discount)) * 0.015 -
            (drops >= 3 && current > low * 1.1 ? 0.5 : 0),
        ),
      ) * 10,
    ) / 10;
  return {
    low,
    avg30,
    avg90,
    aboveLow,
    difference: current - low,
    drops,
    score,
    label:
      score >= 8.5
        ? 'Excelente preço'
        : score >= 7
          ? 'Bom preço'
          : score >= 5
            ? 'Preço normal'
            : 'Melhor esperar',
  };
}

export type SafeLootObservation = {
  price: number;
  date: number;
  store: string;
};

export type SafeLootPriceDrop = {
  previousPrice: number;
  dropBrl: number;
  dropPercent: number;
  droppedAt: number;
  store: string;
};

export type SafeLootPriceIntelligence = {
  lowestRecorded: SafeLootObservation | null;
  monitoredSince: number | null;
  totalObservations: number;
  isLowestRecorded: boolean;
  isNewLowestRecorded: boolean;
  recentPriceDrop: SafeLootPriceDrop | null;
  differenceFromLowest: number | null;
  percentageAboveLowest: number | null;
  bestOfferToday: {
    store: string;
    price: number;
    discount: number;
    isOfficial: boolean;
    url?: string;
  } | null;
  storeSpreadBrl: number;
  cheaperStoreThanSteam: {
    store: string;
    savingsBrl: number;
    price: number;
  } | null;
  saleExpiresAt: string | null;
  hoursUntilExpiration: number | null;
  advice: {
    badge: 'lowest_ever' | 'great_deal' | 'good_deal' | 'regular_price' | 'better_store' | 'wait' | 'price_dropped';
    label: string;
    explanation: string;
    score: number;
  };
};

export function getSafeLootPriceIntelligence(
  points: HistoryPoint[],
  currentOffer?: { finalPrice: number; discount: number; store?: string; expiresAt?: number | null; url?: string },
  allOffers: Array<{ finalPrice: number; discount: number; store: string; currency?: string; available?: boolean; region?: string; expiresAt?: number | null; url?: string; kind?: string }> = [],
  now = Date.now(),
): SafeLootPriceIntelligence {
  const validPoints = points
    .filter(
      (p) =>
        Number.isFinite(p.date) &&
        p.date <= now &&
        Number.isFinite(p.price) &&
        p.price >= 0,
    )
    .sort((a, b) => a.date - b.date);

  let lowestRecorded: SafeLootObservation | null = null;
  if (validPoints.length > 0) {
    const minPrice = Math.min(...validPoints.map((p) => p.price));
    const point = validPoints.find((p) => p.price === minPrice);
    if (point) {
      lowestRecorded = {
        price: point.price,
        date: point.date,
        store: point.store || 'Loja oficial',
      };
    }
  }

  const monitoredSince = validPoints.length > 0 ? validPoints[0].date : null;
  const currentPrice = currentOffer ? currentOffer.finalPrice : null;
  const currentDiscount = currentOffer ? (currentOffer.discount || 0) : 0;

  let isLowestRecorded = false;
  let isNewLowestRecorded = false;
  let differenceFromLowest: number | null = null;
  let percentageAboveLowest: number | null = null;

  if (currentPrice !== null && Number.isFinite(currentPrice)) {
    if (!lowestRecorded) {
      // If no past history, current offer is the first recorded benchmark
      isLowestRecorded = true;
      differenceFromLowest = 0;
      percentageAboveLowest = 0;
    } else {
      if (currentPrice < lowestRecorded.price - 0.05) {
        isLowestRecorded = true;
        isNewLowestRecorded = true;
        differenceFromLowest = 0;
        percentageAboveLowest = 0;
      } else if (currentPrice <= lowestRecorded.price + 0.05) {
        isLowestRecorded = true;
        differenceFromLowest = 0;
        percentageAboveLowest = 0;
      } else {
        differenceFromLowest = Math.max(0, currentPrice - lowestRecorded.price);
        percentageAboveLowest =
          lowestRecorded.price > 0
            ? Math.round(((currentPrice / lowestRecorded.price) - 1) * 1000) / 10
            : null;
      }
    }
  }

  // Detect recent price drop compared to preceding historical point
  let recentPriceDrop: SafeLootPriceDrop | null = null;
  if (currentPrice !== null && Number.isFinite(currentPrice) && validPoints.length > 0) {
    const distinctPoints = [...validPoints].reverse().filter((p) => Math.abs(p.price - currentPrice) > 0.05);
    if (distinctPoints.length > 0) {
      const prev = distinctPoints[0];
      if (prev.price > currentPrice + 0.05) {
        const dropBrl = Math.round((prev.price - currentPrice) * 100) / 100;
        const dropPercent = Math.round(((prev.price - currentPrice) / prev.price) * 100);
        recentPriceDrop = {
          previousPrice: prev.price,
          dropBrl,
          dropPercent,
          droppedAt: prev.date,
          store: prev.store || currentOffer?.store || 'Loja oficial',
        };
      }
    }
  }

  // Cross-store comparison today
  const validOffers = allOffers.filter(
    (o) =>
      (!o.currency || o.currency === 'BRL') &&
      o.available !== false &&
      Number.isFinite(o.finalPrice) &&
      o.finalPrice >= 0,
  );

  let bestOfferToday: SafeLootPriceIntelligence['bestOfferToday'] = null;
  let storeSpreadBrl = 0;
  let cheaperStoreThanSteam: SafeLootPriceIntelligence['cheaperStoreThanSteam'] = null;

  if (validOffers.length > 0) {
    const sortedOffers = [...validOffers].sort((a, b) => a.finalPrice - b.finalPrice);
    const best = sortedOffers[0];
    const highest = sortedOffers[sortedOffers.length - 1];
    storeSpreadBrl = Math.max(0, Math.round((highest.finalPrice - best.finalPrice) * 100) / 100);

    bestOfferToday = {
      store: best.store,
      price: best.finalPrice,
      discount: best.discount || 0,
      isOfficial: best.kind !== 'key',
      url: best.url,
    };

    const steamOffer = validOffers.find(
      (o) => o.store.toLowerCase().includes('steam'),
    );
    if (steamOffer && best.store !== steamOffer.store && steamOffer.finalPrice > best.finalPrice + 0.5) {
      cheaperStoreThanSteam = {
        store: best.store,
        savingsBrl: Math.round((steamOffer.finalPrice - best.finalPrice) * 100) / 100,
        price: best.finalPrice,
      };
    }
  }

  // Expiration
  let saleExpiresAt: string | null = null;
  let hoursUntilExpiration: number | null = null;
  const expiringOffer = [currentOffer, ...validOffers].find(
    (o) => o?.expiresAt && o.expiresAt > now,
  );
  if (expiringOffer?.expiresAt) {
    saleExpiresAt = new Date(expiringOffer.expiresAt).toISOString();
    hoursUntilExpiration = Math.max(1, Math.round((expiringOffer.expiresAt - now) / 3600000));
  }

  // Honest advice calculation
  let advice: SafeLootPriceIntelligence['advice'];

  if (currentPrice === 0) {
    advice = {
      badge: 'great_deal',
      label: 'Jogo 100% Grátis',
      explanation: 'Resgate gratuito confirmado para manter na sua biblioteca.',
      score: 10,
    };
  } else if (cheaperStoreThanSteam && cheaperStoreThanSteam.savingsBrl >= 1) {
    advice = {
      badge: 'better_store',
      label: `Mais barato na ${cheaperStoreThanSteam.store}`,
      explanation: `Economize R$ ${cheaperStoreThanSteam.savingsBrl.toFixed(2).replace('.', ',')} comprando na ${cheaperStoreThanSteam.store} em vez da Steam. Chave oficial de ativação.`,
      score: 9.0,
    };
  } else if (isNewLowestRecorded) {
    advice = {
      badge: 'lowest_ever',
      label: 'Novo menor preço histórico no SafeLoot',
      explanation: 'Preço atual superou a menor cotação registrada anteriormente no histórico do SafeLoot. Novo recorde observado.',
      score: 9.8,
    };
  } else if (isLowestRecorded && currentDiscount >= 50) {
    advice = {
      badge: 'lowest_ever',
      label: 'Menor preço registrado no SafeLoot',
      explanation: `Preço no menor patamar já monitorado pelo SafeLoot no Brasil, com excelente desconto de ${currentDiscount}%.`,
      score: 9.5,
    };
  } else if (isLowestRecorded && lowestRecorded !== null) {
    advice = {
      badge: 'lowest_ever',
      label: 'Menor preço no SafeLoot',
      explanation: 'Menor valor em reais observado pelo SafeLoot até hoje para este jogo.',
      score: 8.5,
    };
  } else if (recentPriceDrop && recentPriceDrop.dropPercent >= 20) {
    advice = {
      badge: 'price_dropped',
      label: `Queda recente de R$ ${recentPriceDrop.dropBrl.toFixed(2).replace('.', ',')} (-${recentPriceDrop.dropPercent}%)`,
      explanation: `Preço recuou recentemente de R$ ${recentPriceDrop.previousPrice.toFixed(2).replace('.', ',')} para R$ ${currentPrice!.toFixed(2).replace('.', ',')}.`,
      score: 8.4,
    };
  } else if (isLowestRecorded && lowestRecorded === null && currentDiscount > 0) {
    advice = {
      badge: 'good_deal',
      label: 'Primeiro registro monitorado',
      explanation: `Primeira verificação do SafeLoot com ${currentDiscount}% de desconto. O SafeLoot acompanhará novas variações.`,
      score: 7.0,
    };
  } else if (currentDiscount >= 70) {
    advice = {
      badge: 'great_deal',
      label: 'Desconto excelente',
      explanation: `Desconto expressivo de ${currentDiscount}%. Excelente oportunidade para começar a jogar agora.`,
      score: 8.2,
    };
  } else if (currentDiscount >= 40) {
    advice = {
      badge: 'good_deal',
      label: 'Bom desconto',
      explanation: `Desconto de ${currentDiscount}% em loja oficial. Bom momento para compra imediata.`,
      score: 7.2,
    };
  } else if (differenceFromLowest && differenceFromLowest > 2 && percentageAboveLowest && percentageAboveLowest > 15) {
    advice = {
      badge: 'wait',
      label: 'Melhor esperar promoção',
      explanation: `O preço atual está R$ ${differenceFromLowest.toFixed(2).replace('.', ',')} (${percentageAboveLowest.toFixed(0)}%) acima do menor valor já registrado pelo SafeLoot. Se não estiver com pressa, aguarde a próxima promoção.`,
      score: 4.5,
    };
  } else {
    advice = {
      badge: 'regular_price',
      label: currentDiscount > 0 ? 'Desconto modesto' : 'Preço padrão',
      explanation: currentDiscount > 0
        ? `Desconto de ${currentDiscount}%. O jogo já teve condições similares no histórico do SafeLoot.`
        : 'Jogo sem promoção ativa no momento. Recomendamos salvar no radar e esperar um desconto.',
      score: 5.5,
    };
  }

  return {
    lowestRecorded,
    monitoredSince,
    totalObservations: validPoints.length,
    isLowestRecorded,
    isNewLowestRecorded,
    recentPriceDrop,
    differenceFromLowest,
    percentageAboveLowest,
    bestOfferToday,
    storeSpreadBrl,
    cheaperStoreThanSteam,
    saleExpiresAt,
    hoursUntilExpiration,
    advice,
  };
}
