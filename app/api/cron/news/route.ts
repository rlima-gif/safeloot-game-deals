import { authorizeAdmin } from '@/lib/admin-auth';
import { collectNewsFromAllSources } from '@/lib/news/collector';

export async function POST(request: Request) {
  const denied = authorizeAdmin(request);
  if (denied) return denied;

  try {
    const summary = await collectNewsFromAllSources();
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
