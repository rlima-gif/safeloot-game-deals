import { authorizeAdmin } from '@/lib/admin-auth';
import { database, type Database } from '@/lib/db';
import { collectNewsFromAllSources } from '@/lib/news/collector';

export async function POST(request: Request, connection?: Database) {
  const denied = authorizeAdmin(request);
  if (denied) return denied;

  try {
    const db = connection || (await database());
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
