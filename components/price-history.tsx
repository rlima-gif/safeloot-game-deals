'use client';
import { useEffect, useState } from 'react';
import { History, LoaderCircle } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { priceInsights } from '@/lib/price-insights';
import type { LiveOffer } from '@/lib/game-api';
import type { HistoryPayload } from '@/lib/history';
import { Button } from '@/components/ui/button';
const money = (n: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    n,
  );
export function PriceHistory({ appId, currentOffer }: { appId: number; currentOffer?: LiveOffer }) {
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
  const insights = currentOffer && payload ? priceInsights(payload.analysisPoints || payload.points, currentOffer.finalPrice, currentOffer.discount) : null;
  return (
    <section className="history-panel">
      <div className="panel-heading">
        <h2>Histórico de preços</h2>
        <select
          aria-label="Período do histórico"
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
        >
          <option value={90}>3 meses</option>
          <option value={180}>6 meses</option>
          <option value={365}>1 ano</option>
        </select>
      </div>
      <div className="buy-verdict"><h3>Vale comprar agora?</h3>{insights ? <><strong>{insights.score.toLocaleString('pt-BR')}/10 · {insights.label}</strong><p>{insights.aboveLow === null ? 'O jogo já teve preço zero neste período.' : `${insights.aboveLow.toFixed(1).replace('.', ',')}% acima do menor preço observado nos últimos 90 dias.`} Comparação da Steam Brasil.</p><div className="insight-values"><span>Menor em 90 dias <b>{money(insights.low)}</b></span><span>Diferença <b>{money(insights.difference)}</b></span><span>Média 30 dias <b>{money(insights.avg30)}</b></span><span>Média 90 dias <b>{money(insights.avg90)}</b></span></div><details><summary>Como calculamos</summary><p>Nota indicativa: proximidade da mínima (60%), média ponderada pelo tempo (25%) e desconto atual (15%). Penalidade de 0,5 ponto se houve pelo menos três quedas em 90 dias e o preço está mais de 10% acima da mínima. Quedas observadas: {insights.drops}. Não prevê preços futuros.</p></details></> : <p>Histórico insuficiente para atribuir uma nota confiável. A análise exige cobertura de 90 dias e pelo menos três registros da Steam Brasil.</p>}</div>
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
      ) : payload.status !== 'ready' ? (
        <div className="history-empty">
          <History size={32} />
          <h3>O preço de hoje, com transparência.</h3>
          <p>
            {payload.status === 'not-configured'
              ? 'O histórico ainda não está disponível no SafeLoot. Compare as ofertas atuais, sem estimativas.'
              : 'Ainda não encontramos registros em reais para este período.'}
          </p>
          <a
            href={`https://steamdb.info/app/${appId}/`}
            target="_blank"
            rel="noreferrer"
          >
            Consultar histórico na SteamDB ↗
          </a>
        </div>
      ) : (
        <>
          <p className="history-caption">Steam · Brasil · R$</p>
          <div className="price-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={payload.points}
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
                  labelFormatter={(n) =>
                    new Intl.DateTimeFormat('pt-BR').format(Number(n))
                  }
                  formatter={(n) => [money(Number(n)), 'Preço']}
                  contentStyle={{
                    background: 'var(--card)',
                    borderColor: 'var(--border)',
                    color: 'var(--foreground)',
                  }}
                />
                <Line
                  type="stepAfter"
                  dataKey="price"
                  stroke="var(--primary)"
                  strokeWidth={2}
                  dot={payload.points.length === 1}
                  isAnimationActive={false}
                />
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
            Fonte: {payload.source}. Histórico desta loja; não representa todas
            as lojas.
          </p>
        </>
      )}
    </section>
  );
}
