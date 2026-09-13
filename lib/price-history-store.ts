import { database, type Database } from './db';
import { resultToOffer, type StoreResult } from './connectors/types';

export async function recordConfirmedPrice(
  appId: number,
  title: string,
  result: StoreResult,
  connection?: Database,
) {
  const offer = result.offer;
  if (!resultToOffer(result) || !offer || offer.currency !== 'BRL')
    return false;
  const db = connection || (await database());
  const productId = result.productId || offer.productUrl;
  const id = JSON.stringify([appId, result.store, productId]);
  const cents = Math.round(offer.price * 100),
    original = Math.round(offer.originalPrice * 100);
  const at = offer.verifiedAt;
  // Atomic batch: repeated price extends its observed interval. A return to an old price is a new event.
  await db.batch([
    db
      .prepare(`INSERT INTO games(app_id,title,created_at,checked_at) VALUES(?,?,?,?)
      ON CONFLICT(app_id) DO UPDATE SET title=excluded.title,checked_at=excluded.checked_at`)
      .bind(appId, title, at, at),
    db
      .prepare(`INSERT INTO store_products(id,app_id,store,product_id,url,edition,launcher,region,status,checked_at)
      VALUES(?,?,?,?,?,?,?,?,'confirmed',?) ON CONFLICT(id) DO UPDATE SET
      url=excluded.url,edition=excluded.edition,launcher=excluded.launcher,region=excluded.region,
      status=excluded.status,checked_at=excluded.checked_at WHERE excluded.checked_at>=store_products.checked_at`)
      .bind(
        id,
        appId,
        result.store,
        productId,
        offer.productUrl,
        offer.edition || null,
        offer.launcher || null,
        offer.region,
        at,
      ),
    db
      .prepare(`INSERT OR IGNORE INTO price_history(product,price_cents,original_cents,currency,observed_at,last_seen_at)
      SELECT ?,?,?,'BRL',?,? WHERE NOT EXISTS (SELECT 1 FROM price_history WHERE id=(
        SELECT id FROM price_history WHERE product=? ORDER BY observed_at DESC LIMIT 1)
        AND (last_seen_at>=? OR (price_cents=? AND original_cents=?)))`)
      .bind(id, cents, original, at, at, id, at, cents, original),
    db
      .prepare(`UPDATE price_history SET last_seen_at=? WHERE id=(SELECT id FROM price_history
      WHERE product=? ORDER BY observed_at DESC LIMIT 1) AND price_cents=? AND original_cents=? AND last_seen_at<?`)
      .bind(at, id, cents, original, at),
  ]);
  return true;
}

export async function getStoredHistory(
  appId: number,
  days: number,
  connection?: Database,
) {
  const db = connection || (await database());
  const since = Date.now() - days * 86400000;
  const { results } = await db
    .prepare(`SELECT h.observed_at,h.last_seen_at,h.price_cents,p.store
    FROM price_history h JOIN store_products p ON p.id=h.product
    WHERE p.app_id=? AND h.currency='BRL' AND h.last_seen_at>=? ORDER BY h.observed_at`)
    .bind(appId, new Date(since).toISOString())
    .all<{
      observed_at: string;
      last_seen_at: string;
      price_cents: number;
      store: string;
    }>();
  return results
    .flatMap((row) => {
      const first = {
        date: Date.parse(row.observed_at),
        price: row.price_cents / 100,
        store: row.store,
      };
      const last = Date.parse(row.last_seen_at);
      // Both endpoints were actually observed; never extend prices to today.
      return last > first.date ? [first, { ...first, date: last }] : [first];
    })
    .sort((a, b) => a.date - b.date);
}
export async function getMappedProduct(appId: number, store: string) {
  const db = await database();
  return db
    .prepare(
      'SELECT url FROM store_products WHERE app_id=? AND store=? ORDER BY checked_at DESC LIMIT 1',
    )
    .bind(appId, store)
    .first<{ url: string }>();
}
export async function monitoredGames(connection?: Database) {
  const db = connection || (await database());
  return (
    await db
      .prepare(
        'SELECT app_id AS appId,title FROM games WHERE monitored=1 ORDER BY checked_at ASC LIMIT 25',
      )
      .all<{ appId: number; title: string }>()
  ).results;
}
