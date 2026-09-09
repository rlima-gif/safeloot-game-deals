'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { OfferDeadline } from '@/components/offer-deadline';
import type { Giveaway } from '@/lib/giveaways';

export function FreeGames() {
  const [games, setGames] = useState<Giveaway[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/giveaways');
      const payload = await response.json() as { games: Giveaway[]; error?: string };
      if (!response.ok) throw new Error(payload.error);
      setGames(payload.games);
      setNow(Date.now());
    } catch { setError('Não foi possível consultar os resgates da Epic agora. Tente novamente.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(timer); }, [refresh]);
  const active = games.filter((game) => Date.parse(game.endsAt) > now);
  return <div>
    <div className="giveaway-head"><p className="filter-status">Jogos pagos com resgate gratuito por tempo limitado na Epic Games Store, para ficar na biblioteca.</p><Button variant="outline" onClick={() => void refresh()} disabled={loading}><RefreshCw /> Atualizar grátis</Button></div>
    {loading ? <p className="filter-status" role="status"><LoaderCircle className="spin inline" /> Consultando resgates…</p> : error ? <p className="source-error" role="alert">{error}</p> : <>
      {!active.length && <p className="filter-status" role="status">Nenhum resgate gratuito ativo encontrado na Epic Games Store agora.</p>}
      <div className="deals-grid">{active.map((game) => <article className="deal-card" key={game.id}>
        <a className="deal-art" href={game.url} target="_blank" rel="noreferrer" aria-label={`Resgatar ${game.title}`}><img src={game.image} alt="" loading="lazy" /><span className="art-shade" /><span className="discount-pill">−100%</span></a>
        <OfferDeadline expiresAt={Date.parse(game.endsAt) / 1000} /><div className="deal-body"><span className="storeline">Epic Games Store · Brasil</span><h3>{game.title}</h3><div className="deal-price-row"><div><s>{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(game.originalPrice)}</s><strong>Grátis</strong></div></div><p className="filter-status">Resgate até {new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(game.endsAt))} (Brasília)</p><a className="consult-button giveaway-link" href={game.url} target="_blank" rel="noreferrer">Resgatar na Epic <ExternalLink size={16} /></a></div>
      </article>)}</div>
    </>}
  </div>;
}
