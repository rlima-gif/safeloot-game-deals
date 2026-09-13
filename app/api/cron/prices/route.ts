import { authorizeAdmin } from '@/lib/admin-auth';
import { collectPrices } from '@/lib/price-collection';
export async function POST(request: Request) {
  const denied = authorizeAdmin(request);
  if (denied) return denied;
  try {
    const result = await collectPrices();
    return Response.json(
      { updatedAt: new Date().toISOString(), ...result },
      {
        status: result.busy ? 409 : result.failed ? 503 : 200,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch {
    return Response.json(
      { error: 'Coleta indisponível. Verifique banco e fontes.' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
