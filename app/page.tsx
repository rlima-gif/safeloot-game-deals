import type { Metadata } from 'next';
import { getHighlights } from '@/lib/game-api';
import { SafeLoot } from '@/components/safeloot';

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://safeloot.safeloot.workers.dev').replace(/\/$/, '');

const OG_IMAGES = [
  {
    url: '/og-home.png',
    width: 1200,
    height: 630,
    alt: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
  },
];
const TWITTER_IMAGES = ['/og-home.png'];

export const revalidate = 120;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}): Promise<Metadata> {
  const { view } = await searchParams;

  if (view === 'free') {
    return {
      title: 'Jogos grátis para resgatar | SafeLoot',
      description: 'Encontre jogos pagos com resgate 100% gratuito por tempo limitado na Epic Games Store e outras lojas autorizadas.',
      alternates: {
        canonical: `${SITE_URL}/?view=free`,
      },
      openGraph: {
        title: 'Jogos grátis para resgatar | SafeLoot',
        description: 'Encontre jogos pagos com resgate 100% gratuito por tempo limitado na Epic Games Store e outras lojas autorizadas.',
        url: `${SITE_URL}/?view=free`,
        images: OG_IMAGES,
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Jogos grátis para resgatar | SafeLoot',
        description: 'Encontre jogos pagos com resgate 100% gratuito por tempo limitado na Epic Games Store e outras lojas autorizadas.',
        images: TWITTER_IMAGES,
      },
    };
  }

  if (view === 'wishlist') {
    return {
      title: 'Minha lista de desejos | SafeLoot',
      description: 'Acompanhe seus jogos favoritos e receba alertas de menor preço histórico e promoções em lojas legítimas.',
      robots: {
        index: false,
        follow: true,
      },
      alternates: {
        canonical: `${SITE_URL}/?view=wishlist`,
      },
      openGraph: {
        title: 'Minha lista de desejos | SafeLoot',
        description: 'Acompanhe seus jogos favoritos e receba alertas de menor preço histórico e promoções em lojas legítimas.',
        url: `${SITE_URL}/?view=wishlist`,
        images: OG_IMAGES,
      },
      twitter: {
        card: 'summary_large_image',
        title: 'Minha lista de desejos | SafeLoot',
        description: 'Acompanhe seus jogos favoritos e receba alertas de menor preço histórico e promoções em lojas legítimas.',
        images: TWITTER_IMAGES,
      },
    };
  }

  return {
    title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
    description: 'Compare ofertas de jogos em reais, veja histórico de preços verificado e encontre jogos grátis para resgatar. Preços com fonte, moeda e região identificadas.',
    alternates: {
      canonical: `${SITE_URL}/`,
    },
    openGraph: {
      title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
      description: 'Compare ofertas de jogos em reais, histórico verificado e jogos grátis na Steam, Nuuvem e lojas autorizadas.',
      url: `${SITE_URL}/`,
      images: OG_IMAGES,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
      description: 'Compare ofertas de jogos em reais, histórico verificado e jogos grátis na Steam, Nuuvem e lojas autorizadas.',
      images: TWITTER_IMAGES,
    },
  };
}

export default async function Home() {
  // Busca os destaques no servidor (SSR) em vez de deixar o primeiro
  // paint em branco esperando o client buscar via /api/highlights.
  // Bots sem JS (e o preview de redes sociais) passam a ver os jogos
  // reais no HTML, não "Carregando ofertas…".
  let initialData = null;
  try {
    initialData = await getHighlights();
  } catch {
    // Se a Steam/CheapShark estiverem fora do ar nesse instante, o
    // client assume normalmente e tenta de novo — sem quebrar a página.
    initialData = null;
  }

  return (
    <>
      {initialData ? <HighlightsJsonLd data={initialData} /> : null}
      <SafeLoot initialData={initialData} />
    </>
  );
}

function HighlightsJsonLd({
  data,
}: {
  data: Awaited<ReturnType<typeof getHighlights>>;
}) {
  // Dedup por id: featured e trending podem repetir o mesmo jogo.
  const seen = new Set<number>();
  const games = [...data.featured, ...data.trending].filter((g) => {
    if (g.finalPrice === null || seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });

  const itemListElement = games.slice(0, 30).map((game, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'Product',
      name: game.title,
      image: game.headerImage || game.image,
      offers: {
        '@type': 'Offer',
        price: game.finalPrice,
        priceCurrency: game.currency || 'BRL',
        // Só declara disponibilidade quando o preço foi de fato confirmado
        // na loja (priceStatus), não apenas "veio um número da API".
        ...(game.priceStatus === 'confirmed'
          ? { availability: 'https://schema.org/InStock' }
          : {}),
        url: game.storeUrl,
      },
    },
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Ofertas de jogos em destaque — SafeLoot',
    itemListElement,
  };

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
    />
  );
}
