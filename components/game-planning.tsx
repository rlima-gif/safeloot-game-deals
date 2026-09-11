'use client';
import { useEffect, useState } from 'react';
import type { GameDetails, LiveOffer } from '@/lib/game-api';
import { offerCost, offerKind, offerLink } from '@/lib/stores';
type BasketItem = {
  id: number;
  title: string;
  offers: LiveOffer[];
  updatedAt: string;
};
type AlertRule = {
  appId: number;
  type: 'price' | 'discount' | 'low';
  threshold: number | null;
  enabled: boolean;
};
const basketKey = 'safeloot-shopping-v1';
const money = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    n,
  );
function readBasket(): BasketItem[] {
  try {
    const items = JSON.parse(localStorage.getItem(basketKey) || '[]');
    return Array.isArray(items)
      ? items
          .filter(
            (item) =>
              Number.isSafeInteger(item?.id) &&
              typeof item.title === 'string' &&
              Array.isArray(item.offers),
          )
          .slice(0, 20)
          .map((item) => ({
            ...item,
            offers: item.offers.filter(
              (offer: LiveOffer | null) =>
                offer &&
                typeof offer.store === 'string' &&
                typeof offer.id === 'string' &&
                Number.isFinite(offer.finalPrice) &&
                offer.finalPrice >= 0,
            ),
          }))
      : [];
  } catch {
    return [];
  }
}
function writeBasket(items: BasketItem[]) {
  localStorage.setItem(basketKey, JSON.stringify(items));
  window.dispatchEvent(new Event('safeloot-shopping'));
}
export function GamePlanning({
  game,
  offers,
  updatedAt,
}: {
  game: GameDetails;
  offers: LiveOffer[];
  updatedAt: string;
}) {
  const [type, setType] = useState<AlertRule['type']>('price'),
    [threshold, setThreshold] = useState(''),
    [message, setMessage] = useState('');
  useEffect(() => {
    try {
      const rule = JSON.parse(
        localStorage.getItem(`safeloot-alert-${game.id}`) || 'null',
      );
      if (rule && ['price', 'discount', 'low'].includes(rule.type)) {
        setType(rule.type);
        setThreshold(rule.threshold == null ? '' : String(rule.threshold));
      }
    } catch {
      /* Optional local preference. */
    }
  }, [game.id]);
  return (
    <section className="planning-panel">
      <h2>Planeje sua compra</h2>
      <button
        className="secondary-link"
        type="button"
        onClick={() => {
          try {
            const items = readBasket();
            if (
              items.length >= 20 &&
              !items.some((item) => item.id === game.id)
            ) {
              setMessage(
                'A lista aceita até 20 jogos. Remova um para continuar.',
              );
              return;
            }
            writeBasket([
              ...items.filter((item) => item.id !== game.id),
              { id: game.id, title: game.title, offers, updatedAt },
            ]);
            setMessage('Jogo adicionado à lista de compras.');
          } catch {
            setMessage('Não foi possível salvar neste navegador.');
          }
        }}
      >
        Adicionar à lista de compras
      </button>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const value = Number(threshold);
          if (
            type !== 'low' &&
            (!threshold.trim() ||
              !Number.isFinite(value) ||
              value < 0 ||
              (type === 'discount' && value > 100))
          ) {
            setMessage('Informe um valor válido. Descontos vão de 0 a 100%.');
            return;
          }
          const rule: AlertRule = {
            appId: game.id,
            type,
            threshold: type === 'low' ? null : value,
            enabled: false,
          };
          try {
            localStorage.setItem(
              `safeloot-alert-${game.id}`,
              JSON.stringify(rule),
            );
            setMessage(
              'Preferência salva. Notificações ainda não estão ativas.',
            );
          } catch {
            setMessage('Não foi possível salvar neste navegador.');
          }
        }}
      >
        <label htmlFor="alert-type">Preparar alerta</label>
        <select
          id="alert-type"
          value={type}
          onChange={(event) => setType(event.target.value as AlertRule['type'])}
        >
          <option value="price">Abaixo de R$ X</option>
          <option value="discount">Desconto maior que X%</option>
          <option value="low">Novo menor preço histórico</option>
        </select>
        {type !== 'low' && (
          <label>
            {type === 'price' ? 'Preço máximo (R$)' : 'Desconto mínimo (%)'}
            <input
              type="number"
              min="0"
              max={type === 'discount' ? '100' : undefined}
              step={type === 'price' ? '0.01' : '1'}
              value={threshold}
              onChange={(event) => setThreshold(event.target.value)}
              required
            />
          </label>
        )}
        <button type="submit" className="secondary-link">
          Salvar preferência
        </button>
        <button
          type="button"
          className="secondary-link"
          onClick={() => {
            try {
              localStorage.removeItem(`safeloot-alert-${game.id}`);
              setThreshold('');
              setMessage('Preferência removida.');
            } catch {
              setMessage('Não foi possível remover a preferência.');
            }
          }}
        >
          Remover preferência
        </button>
        <p className="muted">
          Salvo somente neste navegador. Sem envio de notificações.
        </p>
      </form>
      <p role="status">{message}</p>
    </section>
  );
}
export function ShoppingList() {
  const [items, setItems] = useState<BasketItem[]>([]),
    [kind, setKind] = useState('all'),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  useEffect(() => {
    const sync = () => setItems(readBasket());
    sync();
    window.addEventListener('safeloot-shopping', sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener('safeloot-shopping', sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  const rows = items.map((item) => ({
    ...item,
    best: item.offers
      .filter(
        (offer) =>
          offer.currency === 'BRL' &&
          offer.activationInBrazil !== false &&
          Number.isFinite(offerCost(offer)) &&
          offerCost(offer) >= 0 &&
          (kind === 'all' || offerKind(offer) === kind),
      )
      .sort((a, b) => offerCost(a) - offerCost(b))[0],
  }));
  const covered = rows.filter((row) => row.best);
  return (
    <details className="shopping-panel">
      <summary>Lista de compras ({items.length})</summary>
      <label>
        Comparar usando
        <select
          aria-label="Lojas da lista de compras"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="all">Todas as lojas</option>
          <option value="official">Somente oficiais</option>
          <option value="key">Somente keys</option>
        </select>
      </label>
      {items.length ? (
        <>
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                <a
                  href={`/jogo/${row.id}?titulo=${encodeURIComponent(row.title)}`}
                >
                  {row.title}
                </a>
                <span>
                  {row.best
                    ? money(offerCost(row.best))
                    : 'Sem oferta compatível'}
                </span>
                {row.best && (
                  <a
                    href={offerLink(row.best)}
                    target="_blank"
                    rel={
                      row.best.affiliate ? 'sponsored noreferrer' : 'noreferrer'
                    }
                  >
                    Comprar{row.best.affiliate ? ' · afiliado' : ''}
                  </a>
                )}
                <button
                  type="button"
                  aria-label={`Remover ${row.title} da lista de compras`}
                  onClick={() => {
                    try {
                      writeBasket(items.filter((item) => item.id !== row.id));
                    } catch {
                      setMessage('Não foi possível salvar a alteração.');
                    }
                  }}
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
          <p>
            {covered.length === 0
              ? 'Sem preços confirmados para este filtro'
              : covered.length === items.length
                ? 'Menor custo total nas ofertas salvas'
                : `Subtotal disponível (${covered.length}/${items.length} jogos)`}
            {covered.length > 0 && (
              <strong>
                :{' '}
                {money(
                  covered.reduce((sum, row) => sum + offerCost(row.best!), 0),
                )}
              </strong>
            )}
          </p>
          <p className="muted">
            Valores da última consulta; taxas não confirmadas podem ser
            cobradas. Atualize antes de comprar.
          </p>
          <button
            type="button"
            className="secondary-link"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setMessage('');
              let failed = 0;
              const updates = await Promise.all(
                items.map(async (item) => {
                  try {
                    const response = await fetch(
                      `/api/offers?appid=${item.id}&title=${encodeURIComponent(item.title)}`,
                      { signal: AbortSignal.timeout(20000) },
                    );
                    if (!response.ok) throw new Error();
                    const data = (await response.json()) as {
                      offers: LiveOffer[];
                      updatedAt: string;
                    };
                    if (
                      !Array.isArray(data.offers) ||
                      typeof data.updatedAt !== 'string'
                    )
                      throw new Error();
                    return {
                      ...item,
                      offers: data.offers,
                      updatedAt: data.updatedAt,
                    };
                  } catch {
                    failed++;
                    return item;
                  }
                }),
              );
              try {
                const latest = readBasket();
                writeBasket(
                  latest.map(
                    (item) =>
                      updates.find((update) => update.id === item.id) || item,
                  ),
                );
                setMessage(
                  failed
                    ? `${failed} jogos não atualizaram; os demais estão atualizados.`
                    : 'Preços atualizados.',
                );
              } catch {
                setMessage('Não foi possível salvar os preços atualizados.');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? 'Atualizando…' : 'Atualizar preços da lista'}
          </button>
        </>
      ) : (
        <p className="muted">
          Adicione jogos pelas páginas de comparação. A compra continua na loja.
        </p>
      )}
      <p role="status">{message}</p>
    </details>
  );
}
function safeSource(url: string) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
export function GameAvailability({ game }: { game: GameDetails }) {
  const cloud = game.cloud?.filter((item) => safeSource(item.sourceUrl));
  const subscriptions = game.subscriptions?.filter((item) =>
    safeSource(item.sourceUrl),
  );
  return (
    <section className="availability-panel">
      <h2>Cloud Gaming</h2>
      {cloud?.length ? (
        cloud.map((item) => (
          <a
            key={item.provider}
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            {item.provider} · Ver fonte
          </a>
        ))
      ) : (
        <p>Disponibilidade em nuvem ainda não verificada.</p>
      )}
      {game.linuxNative && <p>Linux nativo · informado pela Steam</p>}
      {game.steamDeck && safeSource(game.steamDeck.sourceUrl) && (
        <a href={game.steamDeck.sourceUrl}>
          Steam Deck: {game.steamDeck.status}
        </a>
      )}
      {game.protonDB && safeSource(game.protonDB.sourceUrl) && (
        <a href={game.protonDB.sourceUrl}>ProtonDB: {game.protonDB.rating}</a>
      )}
      {!!subscriptions?.length && (
        <div>
          <h2>Também disponível em assinatura</h2>
          {subscriptions.map((item) => (
            <a
              key={item.provider}
              href={item.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              {item.provider} · Ver fonte
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
