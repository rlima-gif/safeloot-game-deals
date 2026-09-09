import type { Metadata } from 'next';
import { Space_Grotesk } from 'next/font/google';
import './globals.css';

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  icons: { icon: '/favicon.svg' },
  title: 'SafeLoot — ofertas de jogos sem achismo',
  description: 'Compare ofertas de jogos em reais, filtre por preço e encontre jogos grátis para resgatar. Preços com fonte, moeda e região identificadas.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body className={`${spaceGrotesk.variable} antialiased`}>{children}</body>
    </html>
  );
}
