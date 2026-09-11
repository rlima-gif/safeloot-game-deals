import { getDiscovery } from '@/lib/discovery';
export async function GET() {
  try { return Response.json(await getDiscovery(),{headers:{'Cache-Control':'public, max-age=120'}}); }
  catch { return Response.json({error:'Não foi possível carregar as vitrines.'},{status:502}); }
}
