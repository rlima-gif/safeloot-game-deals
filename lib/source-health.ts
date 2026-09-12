import type { ConnectorHealthEvent, StoreStatus } from './connectors/types';

const health = new Map<string, ConnectorHealthEvent>();

export function recordSourceHealth(event: ConnectorHealthEvent) {
  health.set(event.store, event);
}

export async function runWithHealth<T>(
  store: string,
  run: () => Promise<{ result: T; status: StoreStatus; candidates?: number; validated?: boolean; priceExtracted?: boolean }>,
) {
  const started = Date.now();
  try {
    const outcome = await run();
    recordSourceHealth({
      store,
      status: outcome.status,
      responded: true,
      durationMs: Date.now() - started,
      candidates: outcome.candidates,
      validated: outcome.validated,
      priceExtracted: outcome.priceExtracted,
      checkedAt: new Date().toISOString(),
    });
    return outcome.result;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida';
    const timeout = /timeout|aborted|tempo/i.test(message);
    recordSourceHealth({
      store,
      status: timeout ? 'unavailable' : 'parser-error',
      responded: !timeout,
      durationMs: Date.now() - started,
      parserError: !timeout,
      timeout,
      checkedAt: new Date().toISOString(),
    });
    throw error;
  }
}

export function getSourceHealth() {
  return [...health.values()].sort((a, b) => a.store.localeCompare(b.store));
}
