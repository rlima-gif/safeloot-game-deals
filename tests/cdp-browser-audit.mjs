import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://safeloot.safeloot.workers.dev';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function startChrome(port, userDataDir) {
  const args = [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-extensions',
    '--disable-sync',
    '--disable-translate',
    'about:blank'
  ];
  const proc = spawn(CHROME_PATH, args, { stdio: 'ignore' });
  // Wait for remote debugging to be ready
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) {
        return proc;
      }
    } catch {}
  }
  proc.kill();
  throw new Error('Chrome failed to start or remote debugging not responding');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(`Eval error: ${res.exceptionDetails.text} - ${JSON.stringify(res.exceptionDetails.exception)}`);
    }
    return res.result?.value;
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function runBrowserAudit() {
  console.log(`Starting Real Browser Audit against ${TARGET_URL}...`);
  const port = 9333;
  const tempDir = mkdtempSync(join(tmpdir(), 'safeloot-audit-'));

  let chromeProc;
  try {
    chromeProc = await startChrome(port, tempDir);
    const tabsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await tabsRes.json();
    const pageTab = tabs.find(t => t.type === 'page') || tabs[0];
    const wsUrl = pageTab?.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error('No WebSocket URL found for target');

    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('Runtime.enable');
    await client.send('DOM.enable');
    await client.send('Log.enable');

    const viewports = [
      { name: 'Desktop Large', width: 1440, height: 900, isMobile: false },
      { name: 'Desktop Standard', width: 1280, height: 800, isMobile: false },
      { name: 'Mobile iPhone (390)', width: 390, height: 844, isMobile: true },
      { name: 'Mobile Android (360)', width: 360, height: 800, isMobile: true },
    ];

    const auditResults = {};

    for (const vp of viewports) {
      console.log(`\n--- Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

      // Set device metrics
      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.isMobile ? 3 : 1,
        mobile: vp.isMobile,
      });

      // Clear cookies and storage for clean context
      await client.send('Storage.clearDataForOrigin', {
        origin: TARGET_URL,
        storageTypes: 'all',
      });

      // Navigate to Home
      await client.send('Page.navigate', { url: TARGET_URL });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const count = await client.eval(`document.querySelectorAll('.game-row, a[href^="/jogo/"]').length`);
        if (count > 0) break;
      }

      // 1. Audit Home First Viewport & Layout
      const homeLayout = await client.eval(`(() => {
        const docWidth = document.documentElement.offsetWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const bodyScrollWidth = document.body.scrollWidth;
        const hasHorizontalOverflow = scrollWidth > docWidth || bodyScrollWidth > docWidth;

        // Above the fold checks
        const header = document.querySelector('header');
        const filterBar = document.querySelector('.filter-bar, [class*="filter"]');
        const dealsSection = document.querySelector('#ofertas, .deals-section');
        const firstCard = document.querySelector('.game-card, [class*="game-card"], a[href^="/jogo/"]');

        const headerRect = header ? header.getBoundingClientRect() : null;
        const filterRect = filterBar ? filterBar.getBoundingClientRect() : null;
        const firstCardRect = firstCard ? firstCard.getBoundingClientRect() : null;

        // Visible text & quick indicators
        const h1 = document.querySelector('h1')?.innerText || '';
        const title = document.title;
        const dealsCount = document.querySelectorAll('a[href^="/jogo/"]').length;

        return {
          viewport: { width: window.innerWidth, height: window.innerHeight },
          hasHorizontalOverflow,
          scrollWidth,
          docWidth,
          firstCardAboveFold: firstCardRect ? (firstCardRect.top < window.innerHeight) : false,
          firstCardTop: firstCardRect ? firstCardRect.top : null,
          dealsCount,
          h1,
          title
        };
      })()`);

      console.log(`  Layout overflow check: scrollWidth=${homeLayout.scrollWidth}, docWidth=${homeLayout.docWidth}, hasOverflow=${homeLayout.hasHorizontalOverflow}`);
      console.log(`  First deal card above the fold: ${homeLayout.firstCardAboveFold} (top: ${homeLayout.firstCardTop}px)`);
      console.log(`  Total deal cards rendered on Home: ${homeLayout.dealsCount}`);

      // 2. Test Price Filter Interactivity
      const filterAudit = await client.eval(`(() => {
        const results = {};
        const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
        const filterLabels = ['Todos', 'Até R$ 10', 'Até R$ 20', 'Até R$ 30', 'Até R$ 50', 'Até R$ 100', 'Grátis'];

        for (const label of filterLabels) {
          const btn = buttons.find(b => b.innerText.trim().toLowerCase() === label.toLowerCase());
          results[label] = { found: !!btn };
        }
        return results;
      })()`);
      console.log(`  Budget filter buttons found:`, Object.entries(filterAudit).map(([k, v]) => `${k}:${v.found}`).join(', '));

      // Click "Até R$ 20"
      await client.eval(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('20'));
        if (btn) btn.click();
      })()`);
      await sleep(1000);

      const after20 = await client.eval(`(() => {
        const cards = Array.from(document.querySelectorAll('a[href^="/jogo/"]'));
        const prices = cards.map(c => {
          const text = c.innerText;
          const match = text.match(/R\\$\\s*([0-9]+[.,][0-9]{2})/);
          if (match) return parseFloat(match[1].replace(',', '.'));
          if (text.includes('Grátis') || text.includes('GRÁTIS')) return 0;
          return null;
        }).filter(p => p !== null);

        const heading = document.querySelector('h2, [class*="section-header"]')?.innerText || '';
        const maxObservedPrice = prices.length ? Math.max(...prices) : 0;
        return {
          cardCount: cards.length,
          maxObservedPrice,
          allUnder20: maxObservedPrice <= 20.001,
          heading
        };
      })()`);

      console.log(`  After filtering "Até R$ 20": cards=${after20.cardCount}, maxPrice=R$${after20.maxObservedPrice}, allUnder20=${after20.allUnder20}`);

      // Click "Todos" to reset
      await client.eval(`(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim().toLowerCase() === 'todos');
        if (btn) btn.click();
      })()`);
      await sleep(500);

      // 3. Test Game Detail Page (Slay the Spire)
      await client.send('Page.navigate', { url: `${TARGET_URL}/jogo/646570?titulo=Slay%20the%20Spire` });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const title = await client.eval(`document.querySelector('h1')?.innerText || ''`);
        if (title && !title.includes('Consultando')) break;
      }

      const gamePageAudit = await client.eval(`(() => {
        const docWidth = document.documentElement.offsetWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const hasHorizontalOverflow = scrollWidth > docWidth;

        const title = document.querySelector('h1')?.innerText || '';
        const priceMetrics = document.querySelectorAll('.metric-card, [class*="metric"], [class*="price-history"]');
        const storeOffers = document.querySelectorAll('.offer-row, [class*="store-row"], [class*="offer-card"]');
        const targetRadar = document.querySelector('.detail-target-radar, [class*="target-radar"]');
        const radarInput = document.querySelector('input[type="number"], input[name="targetPrice"], input[placeholder*="alvo"], input[placeholder*="30"]');

        return {
          title,
          hasHorizontalOverflow,
          metricsCount: priceMetrics.length,
          offersCount: storeOffers.length,
          hasRadarWidget: !!targetRadar,
          hasRadarInput: !!radarInput
        };
      })()`);

      console.log(`  Game Page Audit: Title="${gamePageAudit.title}", Overflow=${gamePageAudit.hasHorizontalOverflow}, MetricsCards=${gamePageAudit.metricsCount}, RadarWidget=${gamePageAudit.hasRadarWidget}`);

      // 4. Test Wishlist / Radar View
      await client.send('Page.navigate', { url: `${TARGET_URL}/?view=wishlist` });
      for (let i = 0; i < 15; i++) {
        await sleep(500);
        const h1 = await client.eval(`document.querySelector('h1')?.innerText || ''`);
        if (h1 && (h1.includes('Radar') || h1.includes('Desejos'))) break;
      }

      const wishlistAudit = await client.eval(`(() => {
        const docWidth = document.documentElement.offsetWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const hasHorizontalOverflow = scrollWidth > docWidth;

        const privacyBanner = document.querySelector('.wishlist-privacy-banner');
        const emptyState = document.querySelector('.wishlist-empty, [class*="empty"]');
        const filterPills = document.querySelectorAll('.wishlist-pill');

        return {
          hasHorizontalOverflow,
          hasPrivacyBanner: !!privacyBanner,
          privacyText: privacyBanner ? privacyBanner.innerText.slice(0, 80) : '',
          hasEmptyState: !!emptyState,
          emptyText: emptyState ? emptyState.innerText.slice(0, 80) : '',
          pillCount: filterPills.length
        };
      })()`);

      console.log(`  Wishlist View: Overflow=${wishlistAudit.hasHorizontalOverflow}, PrivacyBanner=${wishlistAudit.hasPrivacyBanner}, EmptyState=${wishlistAudit.hasEmptyState}`);

      auditResults[vp.name] = {
        home: homeLayout,
        filter20: after20,
        gamePage: gamePageAudit,
        wishlist: wishlistAudit,
      };
    }

    client.close();
    console.log('\n=== Browser Audit Completed Successfully ===');
    return auditResults;
  } finally {
    if (chromeProc) chromeProc.kill();
    try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

runBrowserAudit().catch(err => {
  console.error('Browser audit failed:', err);
  process.exit(1);
});
