import { recommendedKeyshops } from '@/lib/store-links';
export async function GET() {
  return Response.json(
    { stores: recommendedKeyshops() },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  );
}
