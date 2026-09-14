import { database } from '@/lib/db';
import { getLatestNewsRun, interpretNewsRunStatus } from '@/lib/news/news-store';

// Read-only diagnostic endpoint: returns the latest News cron run record.
// Never triggers collection, never mutates state, never requires admin auth.
export async function GET() {
  try {
    const db = await database();
    const run = await getLatestNewsRun(db);
    if (!run) {
      return Response.json(
        { run: null },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    return Response.json(
      {
        run: {
          id: run.id,
          status: run.status,
          interpretedStatus: interpretNewsRunStatus(run),
          startedAt: run.startedAt,
          updatedAt: run.updatedAt,
          finishedAt: run.finishedAt,
          error: run.error,
          summary: run.summary,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    return Response.json(
      {
        run: null,
        error: error instanceof Error ? error.message : 'Status indisponível.',
      },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
