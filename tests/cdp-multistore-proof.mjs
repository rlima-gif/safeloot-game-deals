import { spawn } from 'child_process';
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
  const port = 9444;
  const tempDir = path.join(os.tmpdir(), `cdp-multistore-${Date.now()}`);
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

    console.log('\n=== REAL MULTI-STORE BROWSER PROOF ===\n');

    // 1. Slay the Spire (646570)
    console.log(`[1] Navigating to ${BASE_URL}/jogo/646570 (Slay the Spire)...`);
    await client.send('Page.navigate', { url: `${BASE_URL}/jogo/646570` });
    await sleep(4000); // Allow live pricing to load

    const stsPageData = await client.eval(`(() => {
      const title = document.querySelector('h1')?.innerText;
      const bestPriceText = document.querySelector('.purchase-price strong')?.innerText;
      const bestStoreText = document.querySelector('.purchase-store b')?.innerText;
      const offerRows = Array.from(document.querySelectorAll('.offer-table tbody tr')).map(row => {
        const store = row.querySelector('.offer-store')?.innerText?.trim();
        const price = row.querySelector('strong')?.innerText?.trim();
        const ctaHref = row.querySelector('.cta-small')?.getAttribute('href');
        return { store, price, ctaHref };
      });
      const jsonLdScript = document.querySelector('script[type="application/ld+json"]')?.innerText;
      let jsonLd = null;
      try { jsonLd = JSON.parse(jsonLdScript); } catch {}
      return { title, bestPriceText, bestStoreText, offerRows, jsonLd };
    })()`);

    console.log(`  Rendered Title: "${stsPageData.title}"`);
    console.log(`  Best Price Displayed: "${stsPageData.bestPriceText}" on "${stsPageData.bestStoreText}"`);
    console.log(`  Offers in Comparison Table:`, stsPageData.offerRows);
    console.log(`  JSON-LD Product:`, {
      name: stsPageData.jsonLd?.name,
      lowPrice: stsPageData.jsonLd?.offers?.lowPrice,
      highPrice: stsPageData.jsonLd?.offers?.highPrice,
      offerCount: stsPageData.jsonLd?.offers?.offerCount,
      currency: stsPageData.jsonLd?.offers?.priceCurrency,
    });

    // 2. LEGO Marvel's Avengers (405310)
    console.log(`\n[2] Navigating to ${BASE_URL}/jogo/405310 (LEGO Marvel)...`);
    await client.send('Page.navigate', { url: `${BASE_URL}/jogo/405310` });
    await sleep(4000);

    const legoPageData = await client.eval(`(() => {
      const title = document.querySelector('h1')?.innerText;
      const bestPriceText = document.querySelector('.purchase-price strong')?.innerText;
      const bestStoreText = document.querySelector('.purchase-store b')?.innerText;
      const offerRows = Array.from(document.querySelectorAll('.offer-table tbody tr')).map(row => {
        const store = row.querySelector('.offer-store')?.innerText?.trim();
        const price = row.querySelector('strong')?.innerText?.trim();
        const ctaHref = row.querySelector('.cta-small')?.getAttribute('href');
        return { store, price, ctaHref };
      });
      return { title, bestPriceText, bestStoreText, offerRows };
    })()`);

    console.log(`  Rendered Title: "${legoPageData.title}"`);
    console.log(`  Best Price Displayed: "${legoPageData.bestPriceText}" on "${legoPageData.bestStoreText}"`);
    console.log(`  Offers in Comparison Table:`, legoPageData.offerRows);

    client.close();
  } finally {
    if (chromeProc) chromeProc.kill();
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  }
}

run().catch(console.error);
