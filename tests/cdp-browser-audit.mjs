import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    return new Promise(async (resolve, reject) => {
      const WebSocketModule = await import('ws');
      const WebSocket = WebSocketModule.default || WebSocketModule;
      this.ws = new WebSocket(this.wsUrl);
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
    '--window-size=1280,800',
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

export async function runBrowserAudit() {
  const port = 9222;
  const tempDir = path.join(os.tmpdir(), `cdp-audit-${Date.now()}`);
  let chromeProc = null;
  const TARGET_URL = 'https://safeloot.safeloot.workers.dev';

  try {
    chromeProc = await startChrome(port, tempDir);
    const tabsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await tabsRes.json();
    const pageTab = tabs.find((t) => t.type === 'page') || tabs[0];
    const wsUrl = pageTab?.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error('No WebSocket URL found for target');

    const client = new CDPClient(wsUrl);
    await client.connect();

    await client.send('Page.enable');
    await client.send('DOM.enable');

    console.log(`Starting Rigorous Browser Audit against ${TARGET_URL}...`);

    const viewports = [
      { name: 'Desktop Large (1440x900)', width: 1440, height: 900, isMobile: false },
      { name: 'Desktop Standard (1280x800)', width: 1280, height: 800, isMobile: false },
      { name: 'Mobile iPhone (390)', width: 390, height: 844, isMobile: true },
      { name: 'Mobile Android (360)', width: 360, height: 800, isMobile: true },
    ];

    for (const vp of viewports) {
      console.log(`\n======================================================`);
      console.log(`Auditing Viewport: ${vp.name}`);
      console.log(`======================================================`);

      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
        mobile: vp.isMobile,
      });

      // Navigate to Home
      await client.send('Page.navigate', { url: TARGET_URL });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const count = await client.eval(`document.querySelectorAll('.game-row').length`);
        if (count > 0) break;
      }

      // 1. First Viewport & Layout
      const homeLayout = await client.eval(`(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const docWidth = document.documentElement.offsetWidth;
        const firstCard = document.querySelector('.game-row, .game-grid article');
        const firstCardRect = firstCard ? firstCard.getBoundingClientRect() : null;
        const totalCards = document.querySelectorAll('.game-grid article.game-row').length;

        return {
          scrollWidth,
          docWidth,
          hasHorizontalOverflow: scrollWidth > docWidth,
          firstCardAboveFold: firstCardRect ? (firstCardRect.top < window.innerHeight) : false,
          firstCardTop: firstCardRect ? firstCardRect.top : null,
          totalCards
        };
      })()`);

      console.log(`  Layout overflow check: scrollWidth=${homeLayout.scrollWidth}, docWidth=${homeLayout.docWidth}, hasOverflow=${homeLayout.hasHorizontalOverflow}`);
      console.log(`  First deal card above fold: ${homeLayout.firstCardAboveFold} (top: ${homeLayout.firstCardTop}px)`);
      console.log(`  Total deal cards in grid on Home: ${homeLayout.totalCards}`);

      // 2. Comprehensive Price Filter Measurement (Task 1)
      const filters = [
        { label: 'Todos', threshold: Infinity },
        { label: 'Até R$ 10', threshold: 10.0 },
        { label: 'Até R$ 20', threshold: 20.0 },
        { label: 'Até R$ 30', threshold: 30.0 },
        { label: 'Até R$ 50', threshold: 50.0 },
        { label: 'Até R$ 100', threshold: 100.0 },
        { label: 'Grátis', threshold: 0.0 },
      ];

      for (const filter of filters) {
        // Click filter button
        const clicked = await client.eval(`(() => {
          const buttons = Array.from(document.querySelectorAll('.budget-filters button'));
          const btn = buttons.find(b => b.innerText.trim().toLowerCase() === '${filter.label.toLowerCase()}');
          if (btn) {
            btn.click();
            return true;
          }
          return false;
        })()`);

        if (!clicked) {
          console.warn(`  Warning: Filter button "${filter.label}" not found`);
          continue;
        }

        await sleep(600);

        // Extract and audit strictly from .game-grid article.game-row
        const extraction = await client.eval(`(() => {
          const rows = Array.from(document.querySelectorAll('.game-grid article.game-row'));
          const items = [];

          for (const row of rows) {
            // Check visibility
            const rect = row.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) continue;

            const nameEl = row.querySelector('.game-name');
            const href = nameEl ? nameEl.getAttribute('href') || '' : '';
            const idMatch = href.match(/\\/jogo\\/(\\d+)/);
            const gameId = idMatch ? Number(idMatch[1]) : null;
            const title = nameEl ? nameEl.innerText.trim() : '';

            const storeEl = row.querySelector('.store-meta');
            const store = storeEl ? storeEl.innerText.split('·')[0].trim() : 'Steam';

            const priceStrong = row.querySelector('.row-price strong');
            const priceText = priceStrong ? priceStrong.innerText.trim() : '';

            let numericPrice = null;
            let status = 'confirmed';

            if (priceText.toLowerCase().includes('grátis')) {
              numericPrice = 0.00;
            } else if (priceText.toLowerCase().includes('consultar')) {
              status = 'unconfirmed';
            } else {
              const cleaned = priceText.replace(/[^0-9,]/g, '').replace(',', '.');
              const parsed = parseFloat(cleaned);
              if (Number.isFinite(parsed)) {
                numericPrice = parsed;
              }
            }

            items.push({
              gameId,
              title,
              store,
              priceText,
              numericPrice,
              status
            });
          }

          const confirmedPrices = items
            .filter(i => i.numericPrice !== null && i.status === 'confirmed')
            .map(i => i.numericPrice);

          const minPrice = confirmedPrices.length > 0 ? Math.min(...confirmedPrices) : null;
          const maxPrice = confirmedPrices.length > 0 ? Math.max(...confirmedPrices) : null;

          return {
            totalCards: items.length,
            confirmedPricesCount: confirmedPrices.length,
            minPrice,
            maxPrice,
            first10: items.slice(0, 10),
            allPrices: confirmedPrices
          };
        })()`);

        let valid = true;
        if (filter.threshold === 0.0) {
          valid = extraction.allPrices.every((p) => p === 0);
        } else if (filter.threshold < Infinity) {
          valid = extraction.allPrices.every((p) => p <= filter.threshold + 0.01);
        }

        console.log(`  [Filter: ${filter.label}] Cards: ${extraction.totalCards} | Confirmed Prices: ${extraction.confirmedPricesCount} | Min: R$${extraction.minPrice} | Max: R$${extraction.maxPrice} | Invariant Satisfied: ${valid}`);
        if (extraction.first10.length > 0) {
          const sample = extraction.first10.slice(0, 3).map((g) => `#${g.gameId} "${g.title}" (R$${g.numericPrice})`).join('; ');
          console.log(`    Sample: ${sample}`);
        }
      }

      // Reset filter to Todos
      await client.eval(`(() => {
        const btn = Array.from(document.querySelectorAll('.budget-filters button')).find(b => b.innerText.trim().toLowerCase() === 'todos');
        if (btn) btn.click();
      })()`);
      await sleep(500);

      // 3. Real Browser Interactions (Task 21)
      console.log(`\n  --- Running Interaction Suite on ${vp.name} ---`);

      // 3a. Search interaction
      await client.eval(`(() => {
        const input = document.querySelector('input[placeholder*="Buscar"], .header-search input');
        if (input) {
          input.value = 'Spire';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(700);

      const searchResult = await client.eval(`(() => {
        const rows = document.querySelectorAll('.game-grid article.game-row');
        return { count: rows.length, firstTitle: rows[0]?.querySelector('.game-name')?.innerText || '' };
      })()`);
      console.log(`  Search "Spire" result: ${searchResult.count} cards found (First: "${searchResult.firstTitle}")`);

      // Clear search
      await client.eval(`(() => {
        const input = document.querySelector('input[placeholder*="Buscar"], .header-search input');
        if (input) {
          input.value = '';
          input.dispatchEvent(new Event('input', { bubbles: true }));
        }
      })()`);
      await sleep(500);

      // 3b. Open Game Detail Page (Slay the Spire)
      await client.send('Page.navigate', { url: `${TARGET_URL}/jogo/646570?titulo=Slay%20the%20Spire` });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const title = await client.eval(`document.querySelector('h1')?.innerText || ''`);
        if (title && !title.includes('Consultando')) break;
      }

      const gameDetailAudit = await client.eval(`(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const docWidth = document.documentElement.offsetWidth;
        const h1 = document.querySelector('h1')?.innerText || '';
        const radarInput = document.querySelector('input[name="targetPrice"]');
        const radarBtn = document.querySelector('.target-radar-inputs button');

        return {
          h1,
          scrollWidth,
          docWidth,
          hasOverflow: scrollWidth > docWidth,
          hasRadarInput: !!radarInput,
          hasRadarBtn: !!radarBtn
        };
      })()`);
      console.log(`  Game Detail: "${gameDetailAudit.h1}" | Overflow: ${gameDetailAudit.hasOverflow} | Radar Controls: ${gameDetailAudit.hasRadarInput}`);

      // 3c. Set Radar Target and Save Game
      const radarTrigger = await client.eval(`(() => {
        const input = document.querySelector('input[name="targetPrice"]');
        const form = document.querySelector('form.target-radar-form');
        if (input && form) {
          input.value = '25,00';
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
          return true;
        }
        return false;
      })()`);
      await sleep(500);
      console.log(`  Radar Target Set (R$ 25,00): ${radarTrigger}`);

      // 3d. Navigate to Wishlist
      await client.send('Page.navigate', { url: `${TARGET_URL}/?view=wishlist` });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const h1 = await client.eval(`document.querySelector('h1')?.innerText || ''`);
        if (h1 && (h1.includes('Radar') || h1.includes('Desejos'))) break;
      }

      const wishlistAudit = await client.eval(`(() => {
        const scrollWidth = document.documentElement.scrollWidth;
        const docWidth = document.documentElement.offsetWidth;
        const cards = document.querySelectorAll('.wishlist-card').length;
        const targetPill = document.querySelector('.radar-target-amount')?.innerText || '';

        return {
          scrollWidth,
          docWidth,
          hasOverflow: scrollWidth > docWidth,
          cards,
          targetPill
        };
      })()`);
      console.log(`  Wishlist View: ${wishlistAudit.cards} card(s) saved | Target Pill: "${wishlistAudit.targetPill}" | Overflow: ${wishlistAudit.hasOverflow}`);

      // 3e. Test News Article and Browser Back
      await client.send('Page.navigate', { url: `${TARGET_URL}/noticia/steam-summer-sale-preview` });
      await sleep(1500);
      const newsTitle = await client.eval(`document.querySelector('h1')?.innerText || document.title`);
      console.log(`  News article loaded: "${newsTitle.slice(0, 40)}..."`);

      // Browser back
      await client.eval(`window.history.back()`);
      await sleep(1000);
      const restoredTitle = await client.eval(`document.querySelector('h1')?.innerText || document.title`);
      console.log(`  Browser back restored view: "${restoredTitle.slice(0, 40)}..."`);
    }

    console.log(`\n=== Rigorous Browser Audit Completed Successfully ===\n`);
    client.close();
  } finally {
    if (chromeProc) chromeProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

runBrowserAudit().catch((err) => {
  console.error('Browser audit failed:', err);
  process.exit(1);
});
