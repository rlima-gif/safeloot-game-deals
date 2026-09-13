'use client';
/* oxlint-disable next/no-img-element -- Remote store artwork uses the existing native image fallback contract. */
import { useEffect, useState } from 'react';
import { ArrowUpRight, Gamepad2, Store } from 'lucide-react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';
import type { LiveGame } from '@/lib/game-api';
const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    value,
  );
function Spotlight({ game, index }: { game: LiveGame; index: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <a
      className="loot-spotlight"
      href={`/jogo/${game.id}?titulo=${encodeURIComponent(game.title)}`}
    >
      {!broken && game.image ? (
        <img
          src={game.image}
          alt=""
          loading={index === 0 ? 'eager' : 'lazy'}
          onError={() => setBroken(true)}
        />
      ) : (
        <Gamepad2 className="spotlight-placeholder" />
      )}
      <div className="spotlight-content">
        <span className="spotlight-store">
          <Store size={13} /> Steam · Brasil · PC
        </span>
        <h2>{game.title}</h2>
        <div className="spotlight-money">
          <div>
            {game.originalPrice !== null &&
              game.originalPrice > game.finalPrice! && (
                <s>{money(game.originalPrice)}</s>
              )}
            <strong>
              {game.finalPrice === 0 ? 'Grátis' : money(game.finalPrice!)}
            </strong>
          </div>
          {game.discount > 0 && (
            <b className="spotlight-discount">−{game.discount}%</b>
          )}
        </div>
        <span className="spotlight-cta">
          Comparar lojas <ArrowUpRight size={18} />
        </span>
      </div>
    </a>
  );
}
export function DealCarousel({
  games,
  updatedAt,
}: {
  games: LiveGame[];
  updatedAt: string;
}) {
  const [now, setNow] = useState(() => Date.parse(updatedAt));
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [updatedAt]);
  const valid = games
    .filter(
      (g) =>
        g.currency === 'BRL' &&
        g.finalPrice !== null &&
        Number.isFinite(g.finalPrice) &&
        (!g.expiresAt || g.expiresAt * 1000 > now),
    )
    .slice(0, 8);
  if (!valid.length) return null;
  return (
    <Carousel
      className="loot-carousel"
      opts={{ align: 'center', containScroll: 'trimSnaps' }}
      aria-label="Ofertas em reais"
    >
      <div className="spotlight-heading">
        <span className="eyebrow">No radar agora</span>
        <div className="spotlight-controls">
          <CarouselPrevious />
          <CarouselNext />
        </div>
      </div>
      <CarouselContent>
        {valid.map((game, i) => (
          <CarouselItem
            className="loot-slide"
            key={game.id}
            aria-label={`${i + 1} de ${valid.length}`}
          >
            <Spotlight game={game} index={i} />
          </CarouselItem>
        ))}
      </CarouselContent>
      <p className="spotlight-note">
        Verificado às{' '}
        {new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'America/Sao_Paulo',
        }).format(new Date(updatedAt))}{' '}
        · Brasília. Preços podem mudar. Confirme o valor final na loja.
      </p>
    </Carousel>
  );
}
