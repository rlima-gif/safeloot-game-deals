import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://safeloot.safeloot.workers.dev';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  icons: { icon: '/favicon.svg' },
  title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
  description: 'Compare ofertas de jogos em reais, veja histórico de preços verificado e encontre jogos grátis para resgatar. Preços com fonte, moeda e região identificadas.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
    description: 'Compare ofertas de jogos em reais, histórico verificado e jogos grátis na Steam, Nuuvem e lojas autorizadas.',
    url: SITE_URL,
    siteName: 'SafeLoot',
    locale: 'pt_BR',
    type: 'website',
    images: [
      {
        url: '/og-home.png',
        width: 1200,
        height: 630,
        alt: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
    description: 'Compare ofertas de jogos em reais, histórico verificado e jogos grátis na Steam, Nuuvem e lojas autorizadas.',
    images: ['/og-home.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className="dark" style={{ colorScheme: 'dark' }}>
      <body className={`${spaceGrotesk.variable} antialiased`}>{children}</body>
    </html>
  );
}
