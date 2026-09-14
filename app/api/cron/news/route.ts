import { authorizeAdmin } from '@/lib/admin-auth';
import { database } from '@/lib/db';
import { collectNewsFromAllSources } from '@/lib/news/collector';

// NOTE: this handler must take ONLY (request). The framework invokes route
// handlers as handlerFn(request, { params }), so any second parameter would
// receive the framework context object instead of a database connection.
export async function POST(request: Request) {
  const denied = authorizeAdmin(request);
  if (denied) return denied;

  try {
    const db = await database();
    // Watchdog: never start a new run while a previous run is still alive.
    // A `running` record whose heartbeat is older than the stale threshold is
    // reported as stale (likely truncated) and also blocks, so overlapping
    // executions cannot pile up AI/Workers costs.
    const { getLatestNewsRun, interpretNewsRunStatus } = await import('@/lib/news/news-store');
    const latest = await getLatestNewsRun(db).catch(() => null);
    if (latest && interpretNewsRunStatus(latest) === 'running') {
      return Response.json(
        {
          error: 'Coleta de notícias já em andamento.',
          runId: latest.id,
          startedAt: latest.startedAt,
        },
        { status: 409, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const summary = await collectNewsFromAllSources({ customDb: db });
    return Response.json(summary, {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Coleta de notícias indisponível.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
