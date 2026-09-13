import { database, type Database } from './db';
import { monitoredGames } from './price-history-store';
import { getGameOffers, getHighlights } from './game-api';
export async function collectPrices(
  connection?: Database,
  collect = getGameOffers,
) {
  const db = connection || (await database());
  const startedAt = new Date().toISOString();
  const runId = crypto.randomUUID();
  // A lease prevents overlapping scheduler/manual invocations, including after a crash.
  const lease = await db
    .prepare(`INSERT INTO collection_runs(id,started_at,result) VALUES('lease',?,?)
    ON CONFLICT(id) DO UPDATE SET started_at=excluded.started_at,result=excluded.result
    WHERE collection_runs.started_at<? RETURNING result`)
    .bind(startedAt, runId, new Date(Date.now() - 600000).toISOString())
    .first<{ result: string }>();
  if (lease?.result !== runId)
    return { busy: true, requested: 0, completed: 0, failed: 0, recorded: 0 };
  let completed = 0,
    failed = 0,
    recorded = 0;
  try {
    let games = await monitoredGames(db);
    if (!games.length) {
      const highlights = await getHighlights();
      games = highlights.featured
        .slice(0, 8)
        .map((game) => ({ appId: game.id, title: game.title }));
    }
    // At most two collectors at once; the monitored list rotates by last check.
    const pending = [...games];
    await Promise.all(
      [0, 1].map(async () => {
        while (pending.length) {
          const game = pending.shift()!;
          try {
            const result = await collect(game.appId, game.title);
            recorded += result.collection.recorded;
            if (result.collection.persistenceFailures) failed++;
            else completed++;
          } catch {
            failed++;
          }
          await db
            .prepare('UPDATE games SET checked_at=? WHERE app_id=?')
            .bind(new Date().toISOString(), game.appId)
            .run();
        }
      }),
    );
    const result = {
      busy: false,
      requested: games.length,
      completed,
      failed,
      recorded,
    };
    await db
      .prepare(
        'INSERT INTO collection_runs(id,started_at,finished_at,result) VALUES(?,?,?,?)',
      )
      .bind(runId, startedAt, new Date().toISOString(), JSON.stringify(result))
      .run();
    return result;
  } finally {
    await db
      .prepare("DELETE FROM collection_runs WHERE id='lease' AND result=?")
      .bind(runId)
      .run();
  }
}
