'use client';
import { useState } from 'react';
import { stores, offerKind, offerCost, offerLink } from '@/lib/stores';
import type { LiveOffer } from '@/lib/game-api';
const money = (offer: LiveOffer) =>
  new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: offer.currency,
  }).format(offerCost(offer));
export function StoreOptions({
  offers,
  filter,
}: {
  offers: LiveOffer[];
  filter: string;
}) {
  const [selected, setSelected] = useState('nuuvem');
  const options = stores.filter(
    (store) => filter === 'all' || store.kind === filter,
  );
  const store = options.find((store) => store.id === selected) || options[0];
  const quote = (name: string) =>
    offers
      .filter(
        (offer) =>
          offer.store === name &&
          offer.currency === 'BRL' &&
          offer.activationInBrazil !== false &&
          (filter === 'all' || offerKind(offer) === filter),
      )
      .sort((a, b) => offerCost(a) - offerCost(b))[0];
  const offer = store && quote(store.name);
  return (
    <div className="store-options">
      <label htmlFor="comparison-store">Todas as opções de lojas e keys</label>
      <div>
        <select
          id="comparison-store"
          value={store?.id || ''}
          onChange={(event) => setSelected(event.target.value)}
        >
          {options.map((store) => {
            const offer = quote(store.name);
            return (
              <option key={store.id} value={store.id}>
                {store.name} · {store.kind === 'key' ? 'Key' : 'Oficial'} ·{' '}
                {offer ? money(offer) : 'Sem preço confirmado'}
              </option>
            );
          })}
        </select>
        {store && (
          <a
            className="cta-small"
            href={offer ? offerLink(offer) : store.url}
            target="_blank"
            rel={offer?.affiliate ? 'sponsored noreferrer' : 'noreferrer'}
          >
            {offer
              ? `Comprar${offer.affiliate ? ' · afiliado' : ''}`
              : 'Consultar na loja'}{' '}
            ↗
          </a>
        )}
      </div>
      <p>
        {offer
          ? `${store.name}: ${money(offer)} · ${offer.launcher || 'Confira a ativação na loja'}.`
          : `${store?.name}: ainda não recebemos uma cotação confirmada para este jogo. Você pode consultar a loja diretamente.`}
      </p>
    </div>
  );
}
