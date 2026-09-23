import { affiliateDestination } from './affiliate';
import type { LiveOffer } from './game-api';
import { decodeEntities } from './regional-prices';
import { getGiveaways } from './giveaways';
export type DiscoveryDeal = { id: string; title: string; image: string; store: string; price: number; original: number; discount: number; url: string; appId?: number; positive?: number; reviews?: number; tags: string[]; endsAt?: string; affiliate?: boolean };
export type DiscoveryShelf = { id: string; title: string; description: string; games: DiscoveryDeal[]; status: 'ready' | 'unavailable' | 'empty' };
const plain = (s: string) => decodeEntities(s.replace(/<[^>]*>/g, ' ')).replace(/\s+/g,' ').trim();
export function discoveryOffer(game: DiscoveryDeal): LiveOffer { return { id: game.id, store: game.store, finalPrice: game.price, originalPrice: game.original, discount: game.discount, currency: 'BRL', region: 'Brasil', url: game.url, source: 'Catálogo direto da loja' }; }
const unique = (games: DiscoveryDeal[]) => [...new Map(games.map(game => [game.id, game])).values()];
const brl = (value: string) => Number(value.replace(/R\$|\s|\./g,'').replace(',','.'));

export function parseSteamDiscovery(html: string): DiscoveryDeal[] {
  const games: DiscoveryDeal[] = [];
  for (const match of html.matchAll(/<a\b[^>]*class="[^"]*search_result_row[^"]*"[^>]*>[\s\S]*?<\/a>/g)) {
    const card = match[0], app = card.match(/data-ds-appid="(\d+)"/)?.[1];
    if (!app || !card.includes(`data-ds-itemkey="App_${app}"`)) continue;
    const title = plain(card.match(/<span class="title">([\s\S]*?)<\/span>/)?.[1] || '');
    const raw = card.match(/data-price-final="(\d+)"/)?.[1];
    const visible = plain(card.match(/class="discount_final_price">([^<]+)/)?.[1] || '');
    if (!title || !raw || !visible.startsWith('R$')) continue;
    const price = Number(raw)/100;
    if (!Number.isFinite(price) || price <= 0 || Math.abs(brl(visible)-price) > .001) continue;
    const old = plain(card.match(/class="discount_original_price">([^<]+)/)?.[1] || '');
    const original = old.startsWith('R$') ? brl(old) : price;
    const tooltip = plain(card.match(/data-tooltip-html="([^"]+)"/)?.[1] || '');
    const review = tooltip.match(/(\d+)% das? ([\d.,]+) an/);
    const positive = review ? Number(review[1]) : undefined, reviews = review ? Number(review[2].replace(/[.,]/g,'')) : undefined;
    const tags = JSON.parse(card.match(/data-ds-tagids="(\[[\d,]*\])"/)?.[1] || '[]') as number[];
    games.push({id:`steam-${app}`,appId:Number(app),title,image:card.match(/<img[^>]*src="([^"]+)"/)?.[1] || '',store:'Steam',price,original,discount:Math.round((1-price/original)*100),url:`https://store.steampowered.com/app/${app}/?cc=br&l=brazilian`,positive,reviews,tags:[...(tags.includes(492)?['Indie']:[]),...(tags.includes(1716)||tags.includes(3959)?['Roguelike']:[])]});
  }
  return unique(games);
}

export const KNOWN_NUUVEM_SLUGS: Record<string, number> = {
  'resident-evil-4-remake': 2050650,
  'resident-evil-4': 254700,
  'resident-evil-2': 883710,
  'resident-evil-3': 952060,
  'resident-evil-7-biohazard': 418370,
  'resident-evil-village': 1196590,
  'monster-hunter-world': 582010,
  'monster-hunter-rise': 1446780,
  'street-fighter-6': 1364780,
  'dragons-dogma-2': 2054970,
  'devil-may-cry-5': 601150,
  'cyberpunk-2077': 1091500,
  'the-witcher-3-wild-hunt': 292030,
  'the-witcher-3-wild-hunt-complete-edition': 292030,
  'elden-ring': 1245620,
  'dark-souls-iii': 374320,
  'dark-souls-remastered': 570940,
  'sekiro-shadows-die-twice': 814380,
  'armored-core-vi-fires-of-rubicon': 1888160,
  'it-takes-two': 1426210,
  'slay-the-spire': 646570,
  'hades': 1145360,
  'dead-cells': 588650,
  'celeste': 504230,
  'hollow-knight': 367520,
  'god-of-war': 1593500,
  'marvels-spider-man-remastered': 1817070,
  'horizon-zero-dawn-complete-edition': 1151640,
  'days-gone': 1259420,
  'ghost-of-tsushima-directors-cut': 2215430,
  'helldivers-2': 553850,
  'baldurs-gate-3': 1086940,
  'red-dead-redemption-2': 1174180,
  'grand-theft-auto-v': 271590,
  'gta-v': 271590,
  'hogwarts-legacy': 990080,
  'mortal-kombat-1': 1971800,
  'mortal-kombat-11': 976310,
  'batman-arkham-knight': 208650,
  'tekken-8': 1778820,
  'persona-5-royal': 1687950,
  'persona-3-reload': 2161700,
  'lies-of-p': 1627720,
  'control': 870780,
  'death-stranding': 1190460,
  'death-stranding-directors-cut': 1850570,
  'disco-elysium': 632470,
  'frostpunk': 323190,
  'frostpunk-2': 1601580,
  'manor-lords': 1363080,
  'black-myth-wukong': 2358720,
  'palworld': 1623730,
  'enshrouded': 1203630,
};

export function resolveNuuvemAppId(slug: string, _title: string): number | undefined {
  if (KNOWN_NUUVEM_SLUGS[slug]) return KNOWN_NUUVEM_SLUGS[slug];
  const baseSlug = slug
    .replace(/-(standard|deluxe|gold|ultimate|complete|goty|edition|bundle)-?(edition)?$/, '')
    .replace(/-pc$/, '');
  if (KNOWN_NUUVEM_SLUGS[baseSlug]) return KNOWN_NUUVEM_SLUGS[baseSlug];
  return undefined;
}

export function parseNuuvemDiscovery(html: string): DiscoveryDeal[] {
  const games: DiscoveryDeal[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href="https:\/\/www\.nuuvem\.com\/br-pt\/item\/[^"]+"[^>]*>\s*<article\b[\s\S]*?<\/article>\s*<\/a>/g)) {
    const card = match[0];
    if (!/class="[^"]*\bproduct__purchasable\b/.test(card)) continue;
    const platforms = plain(card.match(/<ul class="platform-tags">([\s\S]*?)<\/ul>/)?.[1] || '');
    if (!/\b(Windows|Linux|Mac)\b/i.test(platforms)) continue;
    try {
      const tracking = JSON.parse(decodeEntities(card.match(/data-default-tracker-product-tracking-data-param="([^"]+)"/)?.[1] || '{}'));
      const price = JSON.parse(decodeEntities(card.match(/\bdata-price="([^"]+)"/)?.[1] || '{}'));
      const base = JSON.parse(decodeEntities(card.match(/\bdata-base-price="([^"]+)"/)?.[1] || '{}'));
      if (tracking.currency !== 'BRL' || typeof tracking.name !== 'string' || !Number.isSafeInteger(price.v) || price.v <= 0) continue;
      if (price.e && (!Number.isFinite(Date.parse(price.e)) || Date.parse(price.e)<=Date.now())) continue;
      if (/cart[aã]o|gift card|game pass|assinatura/i.test(tracking.name)) continue;
      const url = new URL(tracking.url);
      if (url.origin !== 'https://www.nuuvem.com' || !/^\/br-pt\/item\/[a-z0-9-]+$/.test(url.pathname)) continue;
      const slug = url.pathname.replace(/^\/br-pt\/item\//, '');
      const appId = resolveNuuvemAppId(slug, tracking.name);
      const amount = price.v/100, original = Number.isSafeInteger(base.v) && base.v >= price.v ? base.v/100 : amount;
      games.push({
        id: `nuuvem-${tracking.id}`,
        appId,
        title: tracking.name,
        image: tracking.image_url,
        store: 'Nuuvem',
        price: amount,
        original,
        discount: Math.round((1 - amount / original) * 100),
        url: url.toString(),
        tags: [],
      });
    } catch { /* A malformed card is not an offer. */ }
  }
  return unique(games);
}

export function parseGmgDiscovery(html: string): DiscoveryDeal[] {
  const starts = [...html.matchAll(/<div ng-controller="GameViewController" ng-init="initialize\(([^"]+)"/g)];
  const games: DiscoveryDeal[] = [];
  for (let i=0;i<starts.length;i++) {
    const card = html.slice(starts[i].index, starts[i+1]?.index ?? html.length);
    try {
      const args = JSON.parse(`[${decodeEntities(starts[i][1]).replace(/\);\s*$/, '')}]`);
      const p = args[0];
      if (args[1]?.Name !== 'PC' || p.IsOutOfStock !== false || p.IsComingSoon !== false || p.IsPrepurchase !== false || typeof p.GameName !== 'string') continue;
      const display = card.match(/<gmgPrice\b[^>]*type="currentPrice"[^>]*currency="'BRL'"[^>]*>([\s\S]*?)<\/gmgPrice>/)?.[1];
      if (!display || typeof p.Price !== 'number' || !Number.isFinite(p.Price) || p.Price<=0 || Math.abs(brl(plain(display))-p.Price)>.001) continue;
      if (typeof p.Url !== 'string' || !/^\/games\/[a-z0-9-]+\/$/.test(p.Url)) continue;
      const original = typeof p.OldPrice === 'number' && Number.isFinite(p.OldPrice) && p.OldPrice >= p.Price ? p.OldPrice : p.Price;
      games.push({id:`gmg-${p.Id}`,title:p.GameName,image:p.BigModuleHalfImage || p.CarouselDesktopImage,store:'Green Man Gaming',price:p.Price,original,discount:Math.round((1-p.Price/original)*100),url:`https://www.greenmangaming.com/pt${p.Url}`,tags:[]});
    } catch { /* Never evaluate storefront JavaScript. */ }
  }
  return unique(games);
}

async function html(url: string) {
  const response=await fetch(url,{headers:{Accept:'text/html','Accept-Language':'pt-BR,pt;q=0.9','User-Agent':'SafeLoot/2.0'},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Loja indisponível: HTTP ${response.status}`);
  const text=await response.text(); if(text.length>3_000_000)throw new Error('Catálogo muito grande');return text;
}
async function steam(extra: Record<string,string>) {
  const params=new URLSearchParams({start:'0',count:'50',specials:'1',category1:'998',cc:'BR',l:'brazilian',infinite:'1',sort_by:'Reviews_DESC',...extra});
  const response=await fetch(`https://store.steampowered.com/search/results/?${params}`,{signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Steam indisponível');
  const data=await response.json() as {results_html?:string};
  return parseSteamDiscovery(data.results_html || '').filter(game=>(game.positive||0)>=80 && (game.reviews||0)>=50);
}
let cache: {expires:number;shelves:DiscoveryShelf[];updatedAt:string}|undefined;
let pending: Promise<{shelves:DiscoveryShelf[];updatedAt:string}>|undefined;
export async function getDiscovery() {
  if(cache && cache.expires>Date.now())return {shelves:cache.shelves,updatedAt:cache.updatedAt};
  if(pending)return pending;
  pending=(async()=>{
    const sources = [
      {id:'cheap',title:'Achados por menos de R$ 10',description:'Pequenos preços, boas surpresas. Pelo menos 80% de avaliações positivas e 50 análises na Steam.',load:()=>steam({maxprice:'10'}).then(games=>games.filter(game=>game.price<10))},
      {id:'roguelike',title:'Só mais uma tentativa',description:'Roguelikes e roguelites em oferta, selecionados pelas tags e avaliações da Steam.',load:()=>steam({tags:'1716'}).then(games=>games.filter(game=>game.tags.includes('Roguelike')))},
      {id:'indie',title:'Indies para sair do óbvio',description:'Jogos independentes bem avaliados. Explore algo além dos grandes lançamentos.',load:()=>steam({tags:'492',maxprice:'30'}).then(games=>games.filter(game=>game.tags.includes('Indie')))},
      {id:'nuuvem',title:'Garimpo na Nuuvem',description:'Jogos para PC e preços em reais do catálogo brasileiro.',load:async()=>{
        const pages=await Promise.allSettled([html('https://www.nuuvem.com/br-pt/catalog'),html('https://www.nuuvem.com/br-pt/catalog/page/2')]);
        const good=pages.filter((p):p is PromiseFulfilledResult<string>=>p.status==='fulfilled');
        if(!good.length)throw new Error();
        const games = unique(good.flatMap(page=>parseNuuvemDiscovery(page.value))).sort((a,b)=>a.price-b.price);
        try {
          const { database } = await import('./db');
          const db = await database();
          const rows = await db.prepare('SELECT app_id, title FROM games WHERE app_id > 0').all<{ app_id: number; title: string }>();
          if (rows.results?.length) {
            const { cleanTitle } = await import('./regional-prices');
            const titleMap = new Map<string, number>();
            for (const r of rows.results) {
              titleMap.set(cleanTitle(r.title), r.app_id);
            }
            for (const g of games) {
              if (!g.appId) {
                const found = titleMap.get(cleanTitle(g.title));
                if (found) g.appId = found;
              }
            }
          }
        } catch {
          // graceful fallback when database is not available
        }
        return games;
      }},
      {id:'gmg',title:'Ofertas da Green Man Gaming',description:'Seleção da loja com preços confirmados em BRL. Confira a ativação no produto.',load:()=>html('https://www.greenmangaming.com/pt/hot-deals/').then(parseGmgDiscovery)},
      {id:'epic',title:'Para resgatar na Epic',description:'Jogos pagos que estão sendo oferecidos de graça por tempo limitado.',load:async()=>{const data=await getGiveaways();return data.games.map(game=>({id:`epic-${game.id}`,title:game.title,image:game.image,store:'Epic Games',price:0,original:game.originalPrice,discount:100,url:game.url,tags:[],endsAt:game.endsAt}));}},
    ];
    const results=await Promise.allSettled(sources.map(source=>source.load()));
    const shelves:DiscoveryShelf[]=sources.map((source,index)=>{const result=results[index];const games=result.status==='fulfilled'?result.value.slice(0,40).map(game=>{let affiliate=false;try{affiliate=affiliateDestination(discoveryOffer(game)).affiliate;}catch{}return {...game,affiliate};}):[];return {id:source.id,title:source.title,description:source.description,games,status:result.status==='rejected'?'unavailable':games.length?'ready':'empty'};});
    const updatedAt=new Date().toISOString();
    cache={expires:Date.now()+300000,shelves,updatedAt};return {shelves,updatedAt};
  })();
  try{return await pending;}finally{pending=undefined;}
}
