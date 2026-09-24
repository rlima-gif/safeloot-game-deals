import assert from 'node:assert/strict';
import { pathToFileURL } from 'url';
import path from 'path';

function moduleUrl(file) {
  return pathToFileURL(path.resolve(process.cwd(), file)).href;
}

const taxonomy = await import(moduleUrl('lib/news/taxonomy.ts'));
const gameImages = await import(moduleUrl('lib/game-images.ts'));

console.log('Testing News Taxonomy, Deterministic Classification & Image Pipeline...');

// 1. News Taxonomy & Normalization
const testArticles = [
  {
    title: 'Retrocon 2027 ganhou dados!',
    summary: 'A maior feira de retrogames do Brasil tem data marcada em São Paulo.',
    expected: 'eventos',
  },
  {
    title: 'O primeiro personagem MMO de um jornalista: Leetman, o humano ladrão',
    summary: 'Um jornalista da PC Gamer recorda seu primeiro personagem em World of Warcraft.',
    expected: 'cultura',
  },
  {
    title: 'Rush Hour: Modo 3v3 de CS2',
    summary: 'Rush é um modo de 3v3 de CS2 com jogos rápidos e arenas de batalha.',
    expected: 'atualizacoes',
  },
  {
    title: 'Xbox anuncia novos despidos após reestruturação',
    summary: 'A Microsoft anunciou mais 268 desligamentos no Xbox continuando a reestruturação.',
    expected: 'industria',
  },
  {
    title: 'Franquia Sonic quase foi encerrada, mas filme salvou em 2020',
    summary: 'O chefe do Sonic Team confessou que a franquia quase acabou antes da adaptação para cinema.',
    expected: 'cultura',
  },
  {
    title: 'Break The Night: hack \'n\' slash com elementos de roguelike',
    summary: 'Jogo de ação com elementos roguelike e garotas mágicas.',
    expected: 'jogos',
  },
  {
    title: 'Steam: 5 jogos em oferta para comprar já',
    summary: 'Promoções da semana na loja da Valve com grandes descontos.',
    expected: 'promocoes',
  },
  {
    title: 'Middle-earth: Shadow Bundle Anunciado para Switch 2',
    summary: 'A coletânea chega ao novo console da Nintendo.',
    expected: 'nintendo',
  },
  {
    title: 'Steam Deck ganha novo driver com suporte a FSR 3.1',
    summary: 'Atualização para o sistema Linux do console portátil.',
    expected: 'pc',
  },
  {
    title: 'PlayStation Plus anuncia jogos grátis de outubro',
    summary: 'Assinantes do PS5 e PS4 recebem 3 novos títulos.',
    expected: 'playstation',
  },
];

let otherCount = 0;
for (const a of testArticles) {
  const result = taxonomy.classifyArticleCategory(a);
  assert.equal(
    result,
    a.expected,
    `Article "${a.title}" should be classified as "${a.expected}", got "${result}"`,
  );
  if (result === 'other') otherCount++;
}

assert.equal(otherCount, 0, 'Zero representative articles should be classified as OTHER');
console.log('  ✅ 10/10 representative articles correctly classified with 0% OTHER rate.');

// 2. Primary Category Badge Formatter
assert.equal(taxonomy.getCategoryBadgeLabel('eventos'), 'EVENTOS');
assert.equal(taxonomy.getCategoryBadgeLabel('industria'), 'INDÚSTRIA');
assert.equal(taxonomy.getCategoryBadgeLabel('cultura'), 'CULTURA');
assert.equal(taxonomy.getCategoryBadgeLabel('jogos'), 'JOGOS');
assert.equal(taxonomy.getCategoryBadgeLabel('atualizacoes'), 'ATUALIZAÇÕES');
assert.equal(taxonomy.getCategoryBadgeLabel('pc'), 'PC / STEAM');
assert.equal(taxonomy.getCategoryBadgeLabel('playstation'), 'PLAYSTATION');
assert.equal(taxonomy.getCategoryBadgeLabel('xbox'), 'XBOX');
assert.equal(taxonomy.getCategoryBadgeLabel('nintendo'), 'NINTENDO');
console.log('  ✅ Category badge labels correctly formatted in uppercase Portuguese.');

// 3. Image Resolution & Priority Guard
const dyingLight = {
  id: 239140,
  appId: 239140,
  image: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/239140/2f76ff4a0212ecf8d7a2096f91cd2a0e9235e3ee/capsule_231x87.jpg?t=1782913513',
  headerImage: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/239140/2f76ff4a0212ecf8d7a2096f91cd2a0e9235e3ee/capsule_231x87.jpg?t=1782913513',
};

// Hero surface MUST reject the 231x87 thumbnail and use high-resolution capsule
const heroArt = gameImages.resolveGameArtwork(dyingLight, 'hero');
assert.ok(
  heroArt.includes('capsule_616x353.jpg'),
  `Hero artwork must be high-resolution 616x353, got: ${heroArt}`,
);
assert.ok(!heroArt.includes('231x87'), 'Hero artwork MUST NOT use 231x87 thumbnail');

// Card surface
const cardArt = gameImages.resolveGameArtwork(dyingLight, 'card');
assert.ok(cardArt.includes('capsule_616x353.jpg'), 'Card artwork should use 616x353');

// Compact row
const rowArt = gameImages.resolveGameArtwork(dyingLight, 'row');
assert.ok(rowArt.includes('header.jpg'), 'Row artwork should use header.jpg');

// Fallback sequence
const fb1 = gameImages.getGameArtworkFallback(heroArt, 239140);
assert.equal(fb1, 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/239140/header.jpg');
const fb2 = gameImages.getGameArtworkFallback(fb1, 239140);
assert.equal(fb2, 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/239140/library_hero.jpg');

console.log('  ✅ Image source priority and thumbnail upgrade guard passed.');

// 4. Contrast Ratio Utility Verification
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1, rgb2) {
  const l1 = getLuminance(...rgb1);
  const l2 = getLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Active button: Neon Green background (#39ff14 = [57, 255, 20]) with dark text (#0f0518 = [15, 5, 24])
const activeContrast = contrastRatio([57, 255, 20], [15, 5, 24]);
assert.ok(
  activeContrast >= 10.0,
  `Active control contrast must be >= 10:1 for high readability, got ${activeContrast.toFixed(2)}:1`,
);

// Card background (#170b25 = [23, 11, 37]) with foreground text (#f2eff8 = [242, 239, 248])
const cardTextContrast = contrastRatio([23, 11, 37], [242, 239, 248]);
assert.ok(
  cardTextContrast >= 7.0,
  `Card text contrast must satisfy WCAG AAA (>= 7:1), got ${cardTextContrast.toFixed(2)}:1`,
);

// Light mode active: Deep green (#15803d = [21, 128, 61]) with white text (#ffffff = [255, 255, 255])
const lightActiveContrast = contrastRatio([21, 128, 61], [255, 255, 255]);
assert.ok(
  lightActiveContrast >= 4.5,
  `Light mode active control contrast must satisfy WCAG AA (>= 4.5:1), got ${lightActiveContrast.toFixed(2)}:1`,
);

console.log(`  ✅ Contrast ratios verified: Dark Active = ${activeContrast.toFixed(1)}:1, Dark Card = ${cardTextContrast.toFixed(1)}:1, Light Active = ${lightActiveContrast.toFixed(1)}:1`);

console.log('ALL News Taxonomy, Image Quality & Contrast tests passed successfully! ✅');
