import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SafeLoot } from '@/components/safeloot';
import { getSteamResult } from '@/lib/connectors/steam';
import { getSteamData } from '@/lib/steam-data';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://safeloot.safeloot.workers.dev';

export async function generateMetadata({
  params,
  searchParams: _searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ titulo?: string; title?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    return { title: 'Jogo não encontrado | SafeLoot' };
  }

  let authoritativeTitle = `Jogo #${gameId}`;
  try {
    const data = await getSteamData(gameId);
    if (typeof data.name === 'string' && data.name.trim()) {
      authoritativeTitle = data.name.trim();
    }
  } catch {}

  const title = `${authoritativeTitle} — Menor Preço e Ofertas no Brasil | SafeLoot`;
  const description = `Compare preços de ${authoritativeTitle} para PC em reais na Steam, Nuuvem e lojas autorizadas. Histórico observado e radar de meta no Brasil.`;
  const canonicalUrl = `${SITE_URL.replace(/\/$/, '')}/jogo/${gameId}`;
  const imageUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${gameId}/header.jpg`;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      siteName: 'SafeLoot',
      locale: 'pt_BR',
      type: 'website',
      images: [
        {
          url: imageUrl,
          width: 460,
          height: 215,
          alt: authoritativeTitle,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function GamePage({
  params,
  searchParams: _searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ titulo?: string; title?: string }>;
}) {
  const { id } = await params;
  const gameId = Number(id);
  if (!Number.isInteger(gameId) || gameId <= 0) {
    notFound();
  }

  let authoritativeTitle = `Jogo #${gameId}`;
  let confirmedPrice: number | null = null;
  let regularPrice: number | null = null;

  try {
    const steamData = await Promise.race([
      getSteamResult({ appId: gameId, title: '', canonicalTitle: '' }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    if (steamData?.data && typeof steamData.data.name === 'string' && steamData.data.name.trim()) {
      authoritativeTitle = steamData.data.name.trim();
    }
    if (steamData?.result?.status === 'confirmed' && typeof steamData.result.offer?.price === 'number') {
      confirmedPrice = steamData.result.offer.price;
      regularPrice = steamData.result.offer.originalPrice || confirmedPrice;
    }
  } catch {}

  const canonicalUrl = `${SITE_URL.replace(/\/$/, '')}/jogo/${gameId}`;
  const imageUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${gameId}/header.jpg`;

  const offersSchema: Record<string, unknown> = {
    '@type': 'AggregateOffer',
    priceCurrency: 'BRL',
    url: canonicalUrl,
    availability: 'https://schema.org/InStock',
  };

  if (confirmedPrice !== null) {
    offersSchema.lowPrice = confirmedPrice;
    offersSchema.highPrice = regularPrice ?? confirmedPrice;
    offersSchema.offerCount = 1;
  }

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: authoritativeTitle,
    image: imageUrl,
    description: `Ofertas e comparação de preço de ${authoritativeTitle} para PC no Brasil.`,
    sku: String(gameId),
    offers: offersSchema,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SafeLoot initialId={gameId} initialTitle={authoritativeTitle} />
    </>
  );
}

