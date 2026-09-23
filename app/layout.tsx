import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://safeloot.safeloot.workers.dev'),
  icons: { icon: '/favicon.svg' },
  title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
  description: 'Compare ofertas de jogos em reais, veja histórico de preços verificado e encontre jogos grátis para resgatar. Preços com fonte, moeda e região identificadas.',
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
    description: 'Compare ofertas de jogos em reais, histórico verificado e jogos grátis na Steam, Nuuvem e lojas oficiais.',
    url: 'https://safeloot.safeloot.workers.dev',
    siteName: 'SafeLoot',
    locale: 'pt_BR',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SafeLoot — Comparador de Preços de Jogos de PC no Brasil',
    description: 'Compare ofertas de jogos em reais, histórico verificado e jogos grátis na Steam, Nuuvem e lojas oficiais.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${spaceGrotesk.variable} antialiased`}>{children}</body>
    </html>
  );
}
