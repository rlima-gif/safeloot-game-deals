import type { Metadata } from 'next';
import { SafeLoot } from '@/components/safeloot';
import { getSteamResult } from '@/lib/connectors/steam';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://safeloot.safeloot.workers.dev';

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ titulo?: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { titulo } = await searchParams;
  const gameId = Number(id);
  const cleanTitle = titulo ? decodeURIComponent(titulo).trim() : `Jogo #${id}`;

  const title = `${cleanTitle} — Menor Preço e Ofertas no Brasil | SafeLoot`;
  const description = `Compare preços de ${cleanTitle} para PC em reais na Steam, Nuuvem e lojas autorizadas. Histórico observado e radar de meta no Brasil.`;
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
          alt: cleanTitle,
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
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ titulo?: string }>;
}) {
  const { id } = await params;
  const { titulo } = await searchParams;
  const gameId = Number(id);
  const cleanTitle = titulo ? decodeURIComponent(titulo).trim() : `Jogo #${id}`;
  const canonicalUrl = `${SITE_URL.replace(/\/$/, '')}/jogo/${gameId}`;
  const imageUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${gameId}/header.jpg`;

  let confirmedPrice: number | null = null;
  let regularPrice: number | null = null;

  try {
    const steamData = await Promise.race([
      getSteamResult({ appId: gameId, title: cleanTitle, canonicalTitle: cleanTitle }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
    ]);
    if (steamData?.result?.status === 'confirmed' && typeof steamData.result.offer?.price === 'number') {
      confirmedPrice = steamData.result.offer.price;
      regularPrice = steamData.result.offer.originalPrice || confirmedPrice;
    }
  } catch {}

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
    name: cleanTitle,
    image: imageUrl,
    description: `Ofertas e comparação de preço de ${cleanTitle} para PC no Brasil.`,
    sku: String(gameId),
    offers: offersSchema,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <SafeLoot initialId={gameId} initialTitle={titulo || ''} />
    </>
  );
}

