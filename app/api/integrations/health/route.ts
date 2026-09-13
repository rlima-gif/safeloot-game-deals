import { getSourceHealth } from '@/lib/source-health';
import { authorizeAdmin } from '@/lib/admin-auth';
export async function GET(request: Request) {
  const denied = authorizeAdmin(request);
  if (denied) return denied;
  try {
    return Response.json(
      { updatedAt: new Date().toISOString(), sources: await getSourceHealth() },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { error: 'Banco temporariamente indisponível.' },
      { status: 503 },
    );
  }
}
