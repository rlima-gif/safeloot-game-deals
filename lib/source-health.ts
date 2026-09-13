import { database, type Database } from './db';
import type { ConnectorHealthEvent, StoreStatus } from './connectors/types';
export async function recordSourceHealth(
  event: ConnectorHealthEvent,
  connection?: Database,
) {
  const db = connection || (await database());
  await db
    .prepare(`INSERT INTO source_health(store,status,checked_at,details) VALUES(?,?,?,?)
    ON CONFLICT(store) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at,details=excluded.details
    WHERE excluded.checked_at>=source_health.checked_at`)
    .bind(event.store, event.status, event.checkedAt, JSON.stringify(event))
    .run();
}
export async function runWithHealth<T>(
  store: string,
  run: () => Promise<{
    result: T;
    status: StoreStatus;
    candidates?: number;
    validated?: boolean;
    priceExtracted?: boolean;
  }>,
) {
  const started = Date.now();
  try {
    const outcome = await run();
    await recordSourceHealth({
      store,
      status: outcome.status,
      responded: true,
      durationMs: Date.now() - started,
      candidates: outcome.candidates,
      validated: outcome.validated,
      priceExtracted: outcome.priceExtracted,
      checkedAt: new Date().toISOString(),
    }).catch(() => console.error('source_health persistence unavailable'));
    return outcome.result;
  } catch (error) {
    const timeout = /timeout|aborted|tempo/i.test(
      error instanceof Error ? error.message : '',
    );
    await recordSourceHealth({
      store,
      status: timeout ? 'unavailable' : 'parser-error',
      responded: !timeout,
      durationMs: Date.now() - started,
      parserError: !timeout,
      timeout,
      checkedAt: new Date().toISOString(),
    }).catch(() => console.error('source_health persistence unavailable'));
    throw error;
  }
}
export async function getSourceHealth(connection?: Database) {
  const db = connection || (await database());
  const rows = await db
    .prepare('SELECT details FROM source_health ORDER BY store')
    .all<{ details: string }>();
  return rows.results.map(
    (row) => JSON.parse(row.details) as ConnectorHealthEvent,
  );
}
