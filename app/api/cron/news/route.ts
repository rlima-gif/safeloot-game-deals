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
