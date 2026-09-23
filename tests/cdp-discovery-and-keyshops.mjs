import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import assert from 'node:assert/strict';

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    const WebSocketModule = await import('ws');
    const WebSocket = WebSocketModule.default || WebSocketModule;
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.on('open', () => resolve());
      this.ws.on('error', (err) => reject(err));
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const cb = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) cb.reject(new Error(msg.error.message));
          else cb.resolve(msg.result);
        }
      });
    });
  }

  async send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findChromePath() {
  const common = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const p of common) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

async function startChrome(port, tempDir) {
  const chromePath = await findChromePath();
  if (!chromePath) throw new Error('Chrome executable not found');

  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempDir}`,
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    '--window-size=1280,900',
    'about:blank',
  ];

  const proc = spawn(chromePath, args, { stdio: 'ignore' });
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return proc;
    } catch {}
  }
  proc.kill();
  throw new Error('Chrome failed to start');
}

async function run() {
  const port = 9555;
  const tempDir = path.join(os.tmpdir(), `cdp-discovery-${Date.now()}`);
  let chromeProc = null;
  const BASE_URL = 'https://safeloot.safeloot.workers.dev';

  try {
    chromeProc = await startChrome(port, tempDir);
    const tabsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await tabsRes.json();
    const pageTab = tabs.find((t) => t.type === 'page') || tabs[0];
    const wsUrl = pageTab?.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error('No WebSocket URL');

    const client = new CDPClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('DOM.enable');

    console.log('\n==================================================');
    console.log('REAL BROWSER (CDP) AUDIT: DISCOVERY QUALITY & KEYSHOP UX');
    console.log('Target: ' + BASE_URL);
    console.log('==================================================\n');

    // TEST 1: HOME PAGE DISCOVERY & BADGES (1280px Desktop)
    console.log('[1/4] Auditing Home Page Discovery & Badges at 1280px...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send('Page.navigate', { url: BASE_URL });
    await sleep(5000); // Wait for discovery shelves and highlights to hydrate

    const homeData = await client.eval(`(() => {
      const cards = Array.from(document.querySelectorAll('.discover-card')).map(card => {
        const title = card.querySelector('h3')?.innerText?.trim();
        const store = card.querySelector('.discover-card-meta span:first-child')?.innerText?.trim();
        const badge = card.querySelector('.discover-badge-pill')?.innerText?.trim();
        const price = card.querySelector('.discover-card-bottom strong')?.innerText?.trim();
        const discount = card.querySelector('.discount')?.innerText?.trim();
        const reviews = card.querySelector('.discover-reviews')?.innerText?.trim();
        return { title, store, badge, price, discount, reviews };
      });

      const shelves = Array.from(document.querySelectorAll('.discover-shelf')).map(shelf => {
        const title = shelf.querySelector('h2')?.innerText?.trim();
        const count = shelf.querySelectorAll('.discover-card').length;
        const firstCards = Array.from(shelf.querySelectorAll('.discover-card')).slice(0, 3).map(c => ({
          title: c.querySelector('h3')?.innerText?.trim(),
          price: c.querySelector('.discover-card-bottom strong')?.innerText?.trim(),
          badge: c.querySelector('.discover-badge-pill')?.innerText?.trim()
        }));
        return { title, count, firstCards };
      });

      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const hasOverflow = scrollWidth > clientWidth;

      return { totalCards: cards.length, shelves, sampleCards: cards.slice(0, 8), hasOverflow, scrollWidth, clientWidth };
    })()`);

    console.log(`  Total Discovery Cards in DOM: ${homeData.totalCards}`);
    console.log(`  Total Shelves Rendered: ${homeData.shelves.length}`);
    console.log(`  Horizontal Overflow: ${homeData.hasOverflow} (${homeData.scrollWidth}px vs ${homeData.clientWidth}px)`);
    assert.equal(homeData.hasOverflow, false, 'Home page must have zero horizontal overflow at 1280px');

    console.log('\n  Rendered Shelves Summary:');
    homeData.shelves.forEach((s, idx) => {
      console.log(`    [Shelf ${idx + 1}] "${s.title}" — ${s.count} cards`);
      s.firstCards.forEach(c => {
        console.log(`       * ${c.title} (${c.price}) [Badge: ${c.badge || 'none'}]`);
      });
    });

    // TEST 2: GAME PAGE KEYSHOP UX (1280px Desktop)
    console.log('\n[2/4] Auditing Game Page Keyshop UX at 1280px (/jogo/646570)...');
    await client.send('Page.navigate', { url: `${BASE_URL}/jogo/646570` });
    await sleep(5000); // Allow live pricing and keyshops to mount

    const keyshopDataDesktop = await client.eval(`(() => {
      const section = document.querySelector('.marketplace-panel');
      if (!section) return { found: false };

      const heading = section.querySelector('#marketplace-heading')?.innerText?.trim();
      const badge = section.querySelector('.marketplace-badge')?.innerText?.trim();
      const disclosure = section.querySelector('.marketplace-disclosure')?.innerText?.trim();
      const compactList = section.querySelector('.marketplace-compact-list');
      const items = Array.from(section.querySelectorAll('.marketplace-compact-item')).map(item => {
        const store = item.querySelector('.marketplace-store-name')?.innerText?.trim();
        const tag = item.querySelector('.marketplace-status-tag')?.innerText?.trim();
        const cta = item.querySelector('.marketplace-cta');
        const ctaText = cta?.innerText?.trim();
        const href = cta?.getAttribute('href');
        const target = cta?.getAttribute('target');
        const rect = item.getBoundingClientRect();
        const ctaRect = cta?.getBoundingClientRect();
        return { store, tag, ctaText, href, target, itemHeight: rect.height, ctaHeight: ctaRect?.height };
      });

      const sectionText = section.innerText;
      const priceMatches = sectionText.match(/R\\$\\s*[\\d.,]+/g) || [];

      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;

      return {
        found: true,
        heading,
        badge,
        disclosure,
        hasCompactList: !!compactList,
        itemCount: items.length,
        items,
        numericPricesFound: priceMatches,
        hasOverflow: scrollWidth > clientWidth,
        scrollWidth,
        clientWidth
      };
    })()`);

    console.log(`  Keyshop Section Found: ${keyshopDataDesktop.found}`);
    assert.ok(keyshopDataDesktop.found, 'Keyshop section must be found in DOM');
    console.log(`  Heading: "${keyshopDataDesktop.heading}"`);
    console.log(`  Badge: "${keyshopDataDesktop.badge}"`);
    console.log(`  Disclosure: "${keyshopDataDesktop.disclosure}"`);
    console.log(`  Items Count: ${keyshopDataDesktop.itemCount}`);
    assert.equal(keyshopDataDesktop.itemCount, 5, 'Must have exactly 5 keyshop stores');

    console.log('\n  Keyshop Stores:');
    keyshopDataDesktop.items.forEach(item => {
      console.log(`    - ${item.store} | Tag: "${item.tag}" | CTA: "${item.ctaText}" | Href: ${item.href} | CTA H: ${item.ctaHeight}px`);
      assert.ok(item.ctaText.includes('Buscar na loja'), 'CTA must be "Buscar na loja"');
      assert.ok(!item.ctaText.includes('Ver preço atual'), 'Must NOT claim "Ver preço atual"');
      assert.ok(item.href.startsWith('/go/keyshop/'), 'Must use /go/keyshop/ route');
    });

    console.log(`  Numeric prices in keyshop section: ${keyshopDataDesktop.numericPricesFound.length}`);
    assert.equal(keyshopDataDesktop.numericPricesFound.length, 0, 'Zero numeric prices allowed in keyshop section');
    console.log(`  Horizontal Overflow: ${keyshopDataDesktop.hasOverflow}`);
    assert.equal(keyshopDataDesktop.hasOverflow, false, 'No horizontal overflow on desktop');

    // TEST 3: MOBILE RESPONSIVE AUDIT AT 390px (iPhone 14)
    console.log('\n[3/4] Auditing Game Page Keyshop UX at 390px (iPhone 14)...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await sleep(1500);

    const mobile390 = await client.eval(`(() => {
      const section = document.querySelector('.marketplace-panel');
      const items = Array.from(section?.querySelectorAll('.marketplace-compact-item') || []).map(item => {
        const cta = item.querySelector('.marketplace-cta');
        const itemRect = item.getBoundingClientRect();
        const ctaRect = cta?.getBoundingClientRect();
        return {
          store: item.querySelector('.marketplace-store-name')?.innerText?.trim(),
          itemWidth: itemRect.width,
          itemHeight: itemRect.height,
          ctaWidth: ctaRect?.width,
          ctaHeight: ctaRect?.height
        };
      });

      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;

      return {
        itemCount: items.length,
        items,
        hasOverflow: scrollWidth > clientWidth,
        scrollWidth,
        clientWidth
      };
    })()`);

    console.log(`  Viewport: 390px | Scroll: ${mobile390.scrollWidth}px | Client: ${mobile390.clientWidth}px`);
    console.log(`  Horizontal Overflow: ${mobile390.hasOverflow}`);
    assert.equal(mobile390.hasOverflow, false, 'Must have zero overflow at 390px');
    console.log('  Mobile 390px Item Dimensions:');
    mobile390.items.forEach(item => {
      console.log(`    - ${item.store}: Item W=${Math.round(item.itemWidth)}px H=${Math.round(item.itemHeight)}px | CTA H=${Math.round(item.ctaHeight)}px`);
      assert.ok(item.ctaHeight >= 32, 'Touch target height must be accessible');
    });

    // TEST 4: MOBILE RESPONSIVE AUDIT AT 360px (Android Common)
    console.log('\n[4/4] Auditing Game Page Keyshop UX at 360px (Android Common)...');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 800,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(1500);

    const mobile360 = await client.eval(`(() => {
      const scrollWidth = document.documentElement.scrollWidth;
      const clientWidth = document.documentElement.clientWidth;
      const section = document.querySelector('.marketplace-panel');
      const sectionRect = section?.getBoundingClientRect();

      return {
        hasOverflow: scrollWidth > clientWidth,
        scrollWidth,
        clientWidth,
        sectionWidth: sectionRect?.width
      };
    })()`);

    console.log(`  Viewport: 360px | Scroll: ${mobile360.scrollWidth}px | Client: ${mobile360.clientWidth}px`);
    console.log(`  Horizontal Overflow: ${mobile360.hasOverflow}`);
    assert.equal(mobile360.hasOverflow, false, 'Must have zero overflow at 360px');

    console.log('\n==================================================');
    console.log('✅ ALL REAL BROWSER CDP AUDIT CHECKS PASSED');
    console.log('==================================================\n');

    client.close();
  } finally {
    if (chromeProc) {
      chromeProc.kill();
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

run().catch((err) => {
  console.error('\n❌ CDP Audit Failed:', err);
  process.exit(1);
});
