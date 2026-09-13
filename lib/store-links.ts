import { stores } from './stores';
import { affiliateDestination } from './affiliate';
// Non-price links use a distinct route and never enter comparison/history.
export function recommendedKeyshops() {
  return stores
    .filter((s) =>
      ['eneba', 'kinguin', 'gamivo', 'cdkeys', 'instant-gaming'].includes(s.id),
    )
    .map((s) => {
      let affiliate = false;
      try {
        affiliate = affiliateDestination({
          store: s.name,
          url: s.url,
          source: 'External lookup',
        }).affiliate;
      } catch {
        /* invalid optional config leaves direct links */
      }
      return { id: s.id, name: s.name, affiliate };
    });
}
export function keyshopDestination(id: string) {
  const store = stores.find((s) => s.id === id && s.kind === 'key');
  if (!store) return null;
  return affiliateDestination({
    store: store.name,
    url: store.url,
    source: 'External lookup',
  });
}
