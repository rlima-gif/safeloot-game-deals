import type { Metadata } from 'next';
import { SafeLoot } from '@/components/safeloot';

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
  const description = `Compare o menor preço confirmado de ${cleanTitle} para PC em reais na Steam, Nuuvem e lojas oficiais. Histórico auditado e radar de preço no Brasil.`;
  const canonicalUrl = `https://safeloot.safeloot.workers.dev/jogo/${gameId}`;
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
  const canonicalUrl = `https://safeloot.safeloot.workers.dev/jogo/${gameId}`;
  const imageUrl = `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/${gameId}/header.jpg`;

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: cleanTitle,
    image: imageUrl,
    description: `Ofertas e comparação de preço de ${cleanTitle} para PC no Brasil.`,
    sku: String(gameId),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'BRL',
      url: canonicalUrl,
      availability: 'https://schema.org/InStock',
    },
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

