import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import { moduleUrl } from './load-ts.mjs';

const { canonicalStoreName, canonicalStoreId, findStore } = await import(
  moduleUrl('lib/stores.ts')
);

console.log('Testing Missing Store Price & UI Cleanup...');

// 1. Store matching and canonical normalization
assert.equal(canonicalStoreName('GreenManGaming'), 'Green Man Gaming', 'CheapShark GreenManGaming must map to Green Man Gaming');
assert.equal(canonicalStoreId('GreenManGaming'), 'gmg', 'CheapShark GreenManGaming must map to gmg id');
assert.equal(canonicalStoreName('Green Man Gaming'), 'Green Man Gaming');
assert.equal(canonicalStoreId('Green Man Gaming'), 'gmg');
assert.equal(canonicalStoreName('Humble Store'), 'Humble Store');
assert.equal(canonicalStoreId('Humble Store'), 'humble');

// 2. Editorial file invariants
const editorial = fs.readFileSync('components/game-editorial.tsx', 'utf8');

// Unified compact disclosure exists
assert.ok(editorial.includes('OtherStoresConsultation'), 'OtherStoresConsultation component must exist');
assert.ok(editorial.includes('other-stores-disclosure'), 'other-stores-disclosure class must exist');
assert.ok(editorial.includes('Consultar em outras lojas'), 'Consultar em outras lojas heading must exist');
assert.ok(editorial.includes('other-stores-grid'), 'other-stores-grid class must exist');

// Truthful status tags instead of misleading generic badges
assert.ok(editorial.includes('Aguardando feed'), 'GMG status tag must be Aguardando feed');
assert.ok(editorial.includes('Sem API BRL'), 'GameBillet/IndieGala status tag must be Sem API BRL');
assert.ok(editorial.includes('Cobrança em USD'), 'Fanatical/Humble/GamesPlanet status tag must be Cobrança em USD');
assert.ok(editorial.includes('Marketplace'), 'Keyshop status tag must be Marketplace');

// Contract: honest action & zero fabricated prices
assert.ok(editorial.includes('Buscar na loja'), 'Must have Buscar na loja CTA');
assert.ok(!editorial.includes('Ver preço atual'), 'Must NOT claim Ver preço atual for unintegrated stores');
assert.ok(editorial.includes('/go/keyshop/'), 'Must preserve /go/keyshop/ outbound routes');

// 3. Game page integration check
const safeloot = fs.readFileSync('components/safeloot.tsx', 'utf8');
assert.ok(safeloot.includes('OtherStoresConsultation'), 'safeloot.tsx must render OtherStoresConsultation');
assert.ok(!safeloot.includes('<SmallerRetailersLinks'), 'safeloot.tsx must not render old separate SmallerRetailersLinks');
assert.ok(!safeloot.includes('<MarketplaceLinks />'), 'safeloot.tsx must not render old separate MarketplaceLinks');

// 4. CSS styling check
const css = fs.readFileSync('app/globals.css', 'utf8');
assert.ok(css.includes('.other-stores-disclosure'), 'CSS must define .other-stores-disclosure');
assert.ok(css.includes('.other-stores-grid'), 'CSS must define .other-stores-grid');
assert.ok(css.includes('.other-stores-chip'), 'CSS must define .other-stores-chip');

console.log('Missing Store Price & UI Cleanup: ALL checks passed! ✅');
