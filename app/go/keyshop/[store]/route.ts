import { keyshopDestination } from '@/lib/store-links';
export async function GET(_request:Request,{params}:{params:Promise<{store:string}>}) {
  try { const link=keyshopDestination((await params).store);
    if(!link)return Response.json({error:'Loja desconhecida.'},{status:404});
    return Response.redirect(link.url,302);
  } catch { return Response.json({error:'Link temporariamente indisponível.'},{status:503}); }
}
