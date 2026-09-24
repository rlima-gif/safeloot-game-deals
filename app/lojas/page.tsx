/* Native document links preserve the existing SafeLoot navigation contract. */
/* oxlint-disable next/no-html-link-for-pages */
import type { Metadata } from 'next';
import { getSourceHealth } from '@/lib/source-health';
import { stores } from '@/lib/stores';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://safeloot.safeloot.workers.dev';

export const metadata: Metadata = {
  title: 'Lojas e integrações monitoradas | SafeLoot',
  description: 'Veja quais lojas o SafeLoot monitora e o status atual de cada integração de preços.',
  alternates: { canonical: `${SITE_URL.replace(/\/$/, '')}/lojas` },
};

async function checkedNow() {
  return Date.now();
}
export const dynamic = 'force-dynamic';
export default async function StoresPage() {
  const now = await checkedNow();
  const health = await getSourceHealth().catch(() => null);
  return (
    <main className="integration-doc">
      <a href="/">← Voltar ao SafeLoot</a>
      <h1>Lojas e integrações</h1>
      <p>
        Uma integração disponível pode não encontrar oferta para determinado
        jogo. A comparação na página do jogo mostra apenas os preços confirmados
        naquela consulta.
      </p>
      {!health && (
        <output>
          O status recente das fontes está temporariamente indisponível.
        </output>
      )}
      {stores
        .filter(
          (s) =>
            s.active ||
            ['eneba', 'kinguin', 'gamivo', 'cdkeys', 'instant-gaming'].includes(
              s.id,
            ),
        )
        .map((store) => {
          const latest = health?.find((h) => h.store === store.name);
          const status = !store.active
            ? 'Preço ainda não integrado ao SafeLoot'
            : store.id === 'epic'
              ? 'Integração de jogos grátis'
              : !latest
                ? 'Aguardando primeira verificação'
                : now - Date.parse(latest.checkedAt) > 3600000
                  ? 'Sem verificação recente'
                  : latest.status === 'confirmed'
                    ? 'Preço confirmado na última consulta'
                    : latest.status === 'no-offer'
                      ? 'Sem oferta na última consulta'
                      : latest.status === 'not-integrated'
                        ? 'Preço por jogo não integrado'
                        : 'Fonte temporariamente indisponível';
          return (
            <article key={store.id}>
              <h2>{store.name}</h2>
              <strong>{status}</strong>
              <p>
                {store.kind === 'key'
                  ? 'Marketplace / Keys · confira ativação, vendedor e taxas.'
                  : 'Loja oficial ou revendedora autorizada (segundo dados públicos).'}
              </p>
              {latest && (
                <p>
                  Última consulta:{' '}
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: 'America/Sao_Paulo',
                  }).format(new Date(latest.checkedAt))}{' '}
                  · Brasília
                </p>
              )}
            </article>
          );
        })}
      <a href="/como-verificamos">Como verificamos os preços →</a>
    </main>
  );
}
