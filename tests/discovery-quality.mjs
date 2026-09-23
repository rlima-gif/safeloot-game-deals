import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import assert from 'node:assert/strict';

function moduleUrl(file) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const linked = code.replace(/from ['"](\.\/[^'"]+)['"]/g, (_, rel) => `from '${moduleUrl(path.resolve(path.dirname(file), rel + '.ts'))}'`);
  return 'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
}

const d = await import(moduleUrl('lib/discovery.ts'));

// 1. Anti-shovelware filtering (isHighSignalDiscoveryGame)
assert.equal(d.isHighSignalDiscoveryGame({ id: '1', title: 'Asset Flip', price: 9.99, original: 9.99, discount: 0, url: '', tags: [], reviews: 45, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '2', title: 'Broken Game', price: 19.99, original: 19.99, discount: 0, url: '', tags: [], reviews: 1200, positive: 45 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '3', title: 'Super Game Demo', price: 0, original: 0, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '4', title: 'Epic RPG Soundtrack', price: 19.99, original: 19.99, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '5', title: 'Tactical Shooter Playtest', price: 0, original: 0, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '6', title: 'Mystery Island: Prologue', price: 0, original: 0, discount: 0, url: '', tags: [], reviews: 500, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '7', title: 'Unpriced Game', price: null, original: null, discount: 0, url: '', tags: [], reviews: 5000, positive: 90 }), false);
assert.equal(d.isHighSignalDiscoveryGame({ id: '8', title: 'Hades', price: 36.99, original: 73.99, discount: 50, url: '', tags: ['Roguelike'], reviews: 240000, positive: 98 }), true);
assert.equal(d.isHighSignalDiscoveryGame({ id: '9', title: 'Death Stranding', price: 0, original: 159.99, discount: 100, url: '', store: 'Epic Games', tags: ['Action'], reviews: 10000, positive: 93 }), true);

// 2. Deterministic relevance scoring (calculateRelevanceScore)
const score1 = d.calculateRelevanceScore({ id: '1', title: 'Popular Hit', price: 29.99, original: 99.99, discount: 70, url: '', tags: [], reviews: 50000, positive: 95 });
const score2 = d.calculateRelevanceScore({ id: '2', title: 'Niche Game', price: 99.99, original: 99.99, discount: 0, url: '', tags: [], reviews: 200, positive: 72 });
assert.ok(typeof score1 === 'number' && typeof score2 === 'number');
assert.ok(score1 > score2, 'Popular discounted hit must score higher than niche full price game');
assert.equal(score1, d.calculateRelevanceScore({ id: '1', title: 'Popular Hit', price: 29.99, original: 99.99, discount: 70, url: '', tags: [], reviews: 50000, positive: 95 }));

// 3. Explainability badge assignment (assignExplainBadge)
assert.equal(d.assignExplainBadge({ id: '1', title: 'Free Game', price: 0, original: 50, discount: 100, url: '', store: 'Epic Games', tags: [] }), 'Grátis');
assert.equal(d.assignExplainBadge({ id: '2', title: 'Steep Discount', price: 20, original: 100, discount: 80, url: '', tags: [] }), '-80% OFF');
assert.equal(d.assignExplainBadge({ id: '3', title: 'Overwhelmingly Positive', price: 60, original: 60, discount: 0, url: '', tags: [], positive: 96, reviews: 2500 }), '95%+ Positivas');
assert.equal(d.assignExplainBadge({ id: '4', title: 'Mid-range Discount', price: 45, original: 90, discount: 50, url: '', tags: [] }), '-50% OFF');
assert.equal(d.assignExplainBadge({ id: '5', title: 'Cheap Indie', price: 15, original: 15, discount: 0, url: '', tags: [] }), 'Até R$ 20');

// 4. Franchise diversity (applyDiscoveryDiversity)
const franchiseList = [
  { id: 'f1', title: 'Borderlands 2', price: 10, original: 50, discount: 80, url: '', tags: [] },
  { id: 'f2', title: 'Borderlands 3', price: 30, original: 150, discount: 80, url: '', tags: [] },
  { id: 'f3', title: 'Borderlands: The Pre-Sequel', price: 15, original: 60, discount: 75, url: '', tags: [] },
  { id: 'f4', title: 'Cyberpunk 2077', price: 99, original: 199, discount: 50, url: '', tags: [] },
];
const diverse = d.applyDiscoveryDiversity(franchiseList, 2);
assert.equal(diverse.length, 3, 'Must cap Borderlands to max 2 items');
assert.equal(diverse.some(g => g.title === 'Borderlands 2'), true);
assert.equal(diverse.some(g => g.title === 'Borderlands 3'), true);
assert.equal(diverse.some(g => g.title === 'Borderlands: The Pre-Sequel'), false);
assert.equal(diverse.some(g => g.title === 'Cyberpunk 2077'), true);

// 5. Game editorial contract: compact link-only stores
const editorialCode = fs.readFileSync('components/game-editorial.tsx', 'utf8');
assert.ok(editorialCode.includes('marketplace-compact-list'), 'Must render compact list for keyshops');
assert.ok(editorialCode.includes('Buscar na loja'), 'Must use honest CTA "Buscar na loja"');
assert.ok(!editorialCode.includes('Ver preço atual'), 'Must NOT claim to see current price for unintegrated keyshops');
assert.ok(editorialCode.includes('Preços não monitorados'), 'Must include disclosure about unmonitored prices');
assert.ok(editorialCode.includes('/go/keyshop/'), 'Must preserve outbound resolver route');

// 6. Discovery card explainability badge presence
const shelfCode = fs.readFileSync('components/discovery-shelves.tsx', 'utf8');
assert.ok(shelfCode.includes('discover-badge-pill'), 'Must render discover-badge-pill for explainability');

console.log('Discovery Quality & Game Page UX: all contracts and invariants passed.');
