'use client';
import { useEffect, useState } from 'react';
import { History, LoaderCircle } from 'lucide-react';
import {
  Legend,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getSafeLootPriceIntelligence, priceInsights } from '@/lib/price-insights';
import type { LiveOffer } from '@/lib/game-api';
import type { HistoryPayload } from '@/lib/history';
import { Button } from '@/components/ui/button';

const money = (n: number | null | undefined) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n)
    : '—';

const formatBRTDate = (timestamp: number | string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
};

const formatBRTDateTime = (timestamp: number | string) => {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(new Date(timestamp));
  } catch {
    return '';
  }
};

export function PriceHistory({
  appId,
  currentOffer,
  allOffers,
}: {
  appId: number;
  currentOffer?: LiveOffer;
  allOffers?: LiveOffer[];
}) {
  const [days, setDays] = useState(90),
    [payload, setPayload] = useState<HistoryPayload | null>(null),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setPayload(null);
    setError('');
    void fetch(`/api/history?appid=${appId}&days=${days}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = (await r.json()) as HistoryPayload & { error?: string };
        if (!r.ok) throw new Error(data.error);
        if (!controller.signal.aborted) setPayload(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [appId, days, retry]);

  const safeIntel = getSafeLootPriceIntelligence(
    payload?.points || [],
    currentOffer,
    allOffers || [],
  );

  const chartStores = payload ? [...new Set(payload.points.map((p) => p.store || 'Preço'))] : [];
  const chartData = payload
    ? [
        ...payload.points
          .reduce((map, point) => {
            const row = map.get(point.date) || { date: point.date };
            row[point.store || 'Preço'] = point.price;
            map.set(point.date, row);
            return map;
          }, new Map<number, Record<string, number>>())
          .values(),
      ].sort((a, b) => Number(a.date) - Number(b.date))
    : [];

  const colors = ['var(--primary)', 'var(--loot-green)', '#ff8a3d', '#6ee7f9', '#f472b6'];

  return (
    <section className="history-panel">
      <div className="panel-heading">
        <h2>Histórico de preços & Inteligência</h2>
        <select
          aria-label="Período do histórico"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={30}>30 dias</option>
          <option value={90}>3 meses</option>
          <option value={180}>6 meses</option>
          <option value={365}>1 ano</option>
        </select>
      </div>

      <div className="buy-verdict">
        <h3>Vale comprar agora?</h3>
        <strong>
          {safeIntel.advice.score.toLocaleString('pt-BR')}/10 · {safeIntel.advice.label}
        </strong>
        <p>{safeIntel.advice.explanation}</p>

        <div className="insight-values">
          <span>
            Menor no SafeLoot{' '}
            <b>
              {safeIntel.lowestRecorded
                ? money(safeIntel.lowestRecorded.price)
                : currentOffer
                  ? money(currentOffer.finalPrice)
                  : 'Em análise'}
            </b>
            <small>
              {safeIntel.lowestRecorded
                ? `${safeIntel.lowestRecorded.store} · ${formatBRTDate(safeIntel.lowestRecorded.date)}`
                : 'Primeira verificação'}
            </small>
          </span>

          <span>
            Diferença da mínima{' '}
            <b>
              {safeIntel.differenceFromLowest === 0
                ? 'No menor valor!'
                : safeIntel.differenceFromLowest !== null
                  ? `+ ${money(safeIntel.differenceFromLowest)}`
                  : '—'}
            </b>
            <small>
              {safeIntel.percentageAboveLowest && safeIntel.percentageAboveLowest > 0
                ? `${safeIntel.percentageAboveLowest}% acima da mínima`
                : 'Melhor patamar SafeLoot'}
            </small>
          </span>

          <span>
            Melhor loja hoje{' '}
            <b>
              {safeIntel.bestOfferToday
                ? `${safeIntel.bestOfferToday.store} (${money(safeIntel.bestOfferToday.price)})`
                : currentOffer?.store || 'Steam'}
            </b>
            <small>
              {safeIntel.cheaperStoreThanSteam
                ? `Economia de ${money(safeIntel.cheaperStoreThanSteam.savingsBrl)} vs Steam`
                : 'Loja autorizada · Brasil'}
            </small>
          </span>

          <span>
            Prazo da oferta{' '}
            <b>
              {safeIntel.hoursUntilExpiration
                ? `Termina em ~${safeIntel.hoursUntilExpiration}h`
                : 'Preço atual ativo'}
            </b>
            <small>
              {safeIntel.saleExpiresAt
                ? `${formatBRTDateTime(safeIntel.saleExpiresAt)} (BRT)`
                : 'Valores sujeitos a alteração'}
            </small>
          </span>
        </div>

        <details>
          <summary>Como o SafeLoot avalia este preço</summary>
          <p>
            O SafeLoot registra ofertas em reais coletadas diretamente das lojas e revendedoras monitoradas (Steam, Nuuvem, Green Man Gaming, Epic).
            Avaliamos a proximidade do menor valor observado pelo SafeLoot, o desconto em relação ao preço regular e a comparação entre as lojas disponíveis hoje.
            Não inventamos dados nem projetamos promoções futuras.
          </p>
        </details>
      </div>

      {error ? (
        <div className="history-empty" role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
            Tentar novamente
          </Button>
        </div>
      ) : !payload ? (
        <div className="history-empty" role="status">
          <LoaderCircle className="spin" /> Consultando histórico…
        </div>
      ) : chartData.length >= 2 ? (
        <>
          <p className="history-caption">
            {payload.source || 'SafeLoot · Histórico verificado por loja'} · Brasil · R$
          </p>
          <div className="price-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={chartData}
                margin={{ left: 0, right: 12, top: 12, bottom: 4 }}
              >
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(n) =>
                    new Intl.DateTimeFormat('pt-BR', {
                      month: 'short',
                      day: '2-digit',
                      timeZone: 'America/Sao_Paulo',
                    }).format(n)
                  }
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <YAxis
                  tickFormatter={(n) => `R$${n}`}
                  width={54}
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                />
                <Tooltip
                  labelFormatter={(n) => formatBRTDateTime(Number(n))}
                  formatter={(n, name) => [money(Number(n)), name]}
                  contentStyle={{
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
                <Legend />
                {chartStores.map((store, index) => (
                  <Line
                    key={store}
                    type="stepAfter"
                    dataKey={store}
                    stroke={colors[index % colors.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    isAnimationActive={false}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="history-note">
            Menor registrado no período:{' '}
            <strong>
              {money(Math.min(...payload.points.map((p) => p.price)))}
            </strong>
          </p>
          <p className="muted">
            Fonte: {payload.source}. Observações reais das lojas exibidas. Linhas conectam verificações confirmadas.
          </p>
          {payload.maturity && payload.maturity.observationCount > 0 && (
            <p className="muted" style={{ fontSize: '0.8rem', marginTop: '4px' }}>
              Base observada: {payload.maturity.observationCount} checagens ({payload.maturity.changeCount} variações) em {payload.maturity.retailerCount} {payload.maturity.retailerCount === 1 ? 'loja autorizada' : 'lojas autorizadas'}.
            </p>
          )}
        </>
      ) : chartData.length === 1 ? (
        <div className="history-empty" style={{ minHeight: '140px', justifyContent: 'flex-start', padding: '16px 0' }}>
          <History size={24} />
          <h3>Monitoramento iniciado pelo SafeLoot</h3>
          <p>
            Temos 1 registro confirmado neste período: <strong>{money(chartData[0][chartStores[0] || 'Preço'])}</strong> na {chartStores[0] || 'Steam'} ({formatBRTDate(chartData[0].date)}).
            O gráfico comparativo será traçado conforme novas variações de preço forem capturadas pelas consultas automáticas.
          </p>
          <a
            href={`https://steamdb.info/app/${appId}/`}
            target="_blank"
            rel="noreferrer"
          >
            Consultar histórico completo de anos anteriores na SteamDB ↗
          </a>
        </div>
      ) : (
        <div className="history-empty">
          <History size={32} />
          <h3>Histórico em construção</h3>
          <p>
            O SafeLoot já iniciou o rastreamento diário deste título. Conforme novas checagens forem feitas nas lojas oficiais, a curva de preços aparecerá aqui.
          </p>
          <a
            href={`https://steamdb.info/app/${appId}/`}
            target="_blank"
            rel="noreferrer"
          >
            Consultar histórico na SteamDB ↗
          </a>
        </div>
      )}
    </section>
  );
}

