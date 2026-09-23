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
  const port = 9223;
  const tempDir = path.join(os.tmpdir(), `cdp-price-bands-${Date.now()}`);
  let chromeProc = null;
  const TARGET_URL = 'https://safeloot.safeloot.workers.dev';

  try {
    chromeProc = await startChrome(port, tempDir);
    const tabsRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const tabs = await tabsRes.json();
    const pageTab = tabs.find((t) => t.type === 'page') || tabs[0];
    const wsUrl = pageTab?.webSocketDebuggerUrl;
    if (!wsUrl) throw new Error('No WebSocket URL found');

    const client = new CDPClient(wsUrl);
    await client.connect();
    await client.send('Page.enable');
    await client.send('DOM.enable');

    console.log(`\n======================================================`);
    console.log(`REAL PRODUCTION CDP AUDIT: PRICE BANDS & DISCOVERY UX`);
    console.log(`Target: ${TARGET_URL}`);
    console.log(`======================================================\n`);

    await client.send('Page.navigate', { url: TARGET_URL });
    await sleep(3500);

    // 1. Audit Home Hero Discovery Ranking
    console.log(`--- [1] AUDITING HOME DISCOVERY RANKING ---`);
    const heroGames = await client.eval(`
      (() => {
        // Collect hero / top games
        const links = Array.from(document.querySelectorAll('a[href^="/jogo/"]'));
        const seen = new Set();
        const results = [];
        for (const a of links) {
          const titleEl = a.querySelector('h2, h3, p.font-semibold, p.font-bold, .font-medium');
          const title = titleEl ? titleEl.textContent.trim() : a.textContent.trim().split('\\n')[0];
          const href = a.getAttribute('href');
          const badge = a.querySelector('.discover-badge-pill, span[class*="emerald"], span[class*="amber"]')?.textContent?.trim() || '';
          if (title && !seen.has(href) && results.length < 12) {
            seen.add(href);
            results.push({ title, href, badge });
          }
        }
        return results;
      })()
    `);

    console.log(`Top 10 Games Rendered on Home:`);
    heroGames.slice(0, 10).forEach((g, idx) => {
      console.log(`  #${idx + 1}: ${g.title} (${g.badge || 'No badge'}) -> ${g.href}`);
    });

    // 2. Audit Every Price Band on Desktop
    console.log(`\n--- [2] AUDITING NON-OVERLAPPING PRICE BANDS ---`);
    const bandsToTest = [
      { id: 'all', label: 'Todos', min: 0, max: Infinity, allowZero: true },
      { id: '0', label: 'Grátis', min: 0, max: 0, allowZero: true },
      { id: '10', label: 'Até R$ 10', min: 0.001, max: 10.00, allowZero: false },
      { id: '10-20', label: 'R$ 10–20', min: 10.001, max: 20.00, allowZero: false },
      { id: '20-30', label: 'R$ 20–30', min: 20.001, max: 30.00, allowZero: false },
      { id: '30-50', label: 'R$ 30–50', min: 30.001, max: 50.00, allowZero: false },
      { id: '50-100', label: 'R$ 50–100', min: 50.001, max: 100.00, allowZero: false },
      { id: '100+', label: 'R$ 100+', min: 100.001, max: Infinity, allowZero: false },
    ];

    const auditResults = [];

    for (const band of bandsToTest) {
      console.log(`\nAuditing Price Band: "${band.label}" (id: ${band.id})...`);

      // Click the button matching the label or text
      const clicked = await client.eval(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const btn = buttons.find(b => {
            const txt = b.textContent.trim().toLowerCase();
            if ('${band.id}' === 'all' && txt === 'todos') return true;
            if ('${band.id}' === '0' && txt === 'grátis') return true;
            if ('${band.id}' === '10' && txt.includes('até r$ 10')) return true;
            if ('${band.id}' === '10-20' && txt.includes('10–20')) return true;
            if ('${band.id}' === '20-30' && txt.includes('20–30')) return true;
            if ('${band.id}' === '30-50' && txt.includes('30–50')) return true;
            if ('${band.id}' === '50-100' && txt.includes('50–100')) return true;
            if ('${band.id}' === '100+' && txt.includes('100+')) return true;
            return false;
          });
          if (btn) {
            btn.click();
            return { found: true, text: btn.textContent.trim() };
          }
          return { found: false };
        })()
      `);

      if (!clicked.found) {
        console.error(`  ❌ Failed to find button for band: ${band.label}`);
        continue;
      }
      console.log(`  Clicked button: "${clicked.text}"`);
      await sleep(1500);

      // Extract cards from the deals section
      const cardData = await client.eval(`
        (() => {
          const rows = Array.from(document.querySelectorAll('article.game-row'));
          const results = [];
          for (const r of rows) {
            const title = r.querySelector('.game-name')?.textContent?.trim() || 'Unknown';
            const priceText = r.querySelector('.row-price strong')?.textContent?.trim() || '';
            let price = null;
            if (/grátis|free/i.test(priceText)) {
              price = 0;
            } else {
              const m = priceText.match(/R\\$\\s*([0-9]+(?:[.,][0-9]{2})?)/);
              if (m) price = parseFloat(m[1].replace(',', '.'));
            }
            if (price !== null) {
              results.push({ title, price });
            }
          }
          return results;
        })()
      `);

      const count = cardData.length;
      const prices = cardData.map((c) => c.price);
      const minPrice = prices.length ? Math.min(...prices) : null;
      const maxPrice = prices.length ? Math.max(...prices) : null;

      // Check invariants
      let violations = 0;
      for (const card of cardData) {
        if (band.id === '0' && card.price !== 0) {
          console.error(`    VIOLATION in Grátis: ${card.title} has price R$ ${card.price}`);
          violations++;
        }
        if (band.id !== '0' && band.id !== 'all' && card.price === 0) {
          console.error(`    VIOLATION in ${band.label}: Free game ${card.title} appeared in paid band!`);
          violations++;
        }
        if (card.price < band.min || card.price > band.max) {
          console.error(`    VIOLATION in ${band.label}: ${card.title} price R$ ${card.price} out of range [${band.min}, ${band.max}]`);
          violations++;
        }
      }

      console.log(`  Cards: ${count} | Min Price: R$ ${minPrice ?? 'N/A'} | Max Price: R$ ${maxPrice ?? 'N/A'} | Violations: ${violations}`);
      if (cardData.length > 0) {
        console.log(`  Sample (first 3): ${cardData.slice(0, 3).map(c => `${c.title} (R$ ${c.price})`).join(', ')}`);
      }

      auditResults.push({
        band: band.id,
        label: band.label,
        count,
        minPrice,
        maxPrice,
        violations,
      });
    }

    console.log(`\n======================================================`);
    console.log(`PRICE BAND AUDIT SUMMARY:`);
    console.log(`======================================================`);
    console.table(auditResults);

    const totalViolations = auditResults.reduce((acc, r) => acc + r.violations, 0);
    if (totalViolations === 0) {
      console.log(`\n✅ ALL PRICE BAND INVARIANTS PASSED PERFECTLY IN PRODUCTION!`);
    } else {
      console.error(`\n❌ FOUND ${totalViolations} PRICE BAND VIOLATIONS!`);
    }

    client.close();
  } catch (err) {
    console.error('Audit error:', err);
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

run();
