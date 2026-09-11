import { affiliateDestination } from '@/lib/affiliate';
import { getDiscovery, discoveryOffer } from '@/lib/discovery';
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params;
  const data=await getDiscovery();
  const game=data.shelves.flatMap(shelf=>shelf.games).find(game=>game.id===id);
  if(!game || (game.endsAt && Date.parse(game.endsAt)<=Date.now()))return new Response('Esta oferta não está mais disponível. Atualize a vitrine.',{status:404});
  return new Response(null,{status:302,headers:{Location:affiliateDestination(discoveryOffer(game)).url,'Cache-Control':'no-store'}});
}
