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
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return proc;
    } catch {}
  }
  proc.kill();
  throw new Error('Chrome failed to start');
}

async function runAudit() {
  const TARGET_URL = process.argv[2] || 'http://localhost:5173';
  const port = 9226;
  const tempDir = path.join(os.tmpdir(), `cdp-engage-${Date.now()}`);
  let chromeProc = null;

  console.log(`Starting CDP Discovery Engagement Audit on ${TARGET_URL}...`);

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

    const viewports = [
      { name: 'Desktop (1280px)', width: 1280, height: 900, mobile: false, dsf: 1 },
      { name: 'Mobile (390px)', width: 390, height: 844, mobile: true, dsf: 3 },
      { name: 'Mobile (360px)', width: 360, height: 780, mobile: true, dsf: 3 },
    ];

    const results = {};

    for (const vp of viewports) {
      console.log(`\n==================================================`);
      console.log(`Auditing Viewport: ${vp.name}`);
      console.log(`==================================================`);

      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: vp.dsf,
        mobile: vp.mobile,
      });

      await client.send('Page.navigate', { url: TARGET_URL });
      await sleep(3500);

      // Check overflow and controls metrics
      const controlsMetrics = await client.eval(`
        (() => {
          const docEl = document.documentElement;
          const body = document.body;
          const overflowX = docEl.scrollWidth > docEl.clientWidth || body.scrollWidth > window.innerWidth;
          
          const rotateBtn = document.querySelector('[data-testid="rotate-button"]') || document.querySelector('button[aria-label="Mostrar outros jogos"]');
          const discoverBtn = document.querySelector('[data-testid="discover-button"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Descobrir'));
          
          const getMetrics = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return {
              w: Math.round(r.width),
              h: Math.round(r.height),
              text: el.innerText.trim(),
              ariaLabel: el.getAttribute('aria-label'),
              title: el.getAttribute('title'),
            };
          };

          return {
            overflowX,
            scrollWidth: docEl.scrollWidth,
            clientWidth: docEl.clientWidth,
            rotateBtn: getMetrics(rotateBtn),
            discoverBtn: getMetrics(discoverBtn),
          };
        })()
      `);

      console.log('Controls & Layout Metrics:', JSON.stringify(controlsMetrics, null, 2));

      // Test rotation & record AppID arrays
      const sequence = await client.eval(`
        (async () => {
          const getPrimaryAppIds = () => {
            // Collect visible cards from the first non-empty shelf (typically #selection-cheap)
            const shelf = document.querySelector('.discover-shelf');
            if (!shelf) return [];
            const cards = Array.from(shelf.querySelectorAll('.discover-card'));
            return cards.map(c => {
              const app = c.getAttribute('data-appid');
              return app ? Number(app) : c.getAttribute('data-game-id');
            }).filter(Boolean);
          };

          const rotateBtn = document.querySelector('[data-testid="rotate-button"]') || document.querySelector('button[aria-label="Mostrar outros jogos"]');
          const discoverBtn = document.querySelector('[data-testid="discover-button"]') || Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Descobrir'));

          const initialSet = getPrimaryAppIds();

          // Rotation 1
          if (rotateBtn) rotateBtn.click();
          await new Promise(r => setTimeout(r, 400));
          const rot1 = getPrimaryAppIds();

          // Rotation 2
          if (rotateBtn) rotateBtn.click();
          await new Promise(r => setTimeout(r, 400));
          const rot2 = getPrimaryAppIds();

          // Rotation 3
          if (rotateBtn) rotateBtn.click();
          await new Promise(r => setTimeout(r, 400));
          const rot3 = getPrimaryAppIds();

          // Descobrir Action
          if (discoverBtn) discoverBtn.click();
          await new Promise(r => setTimeout(r, 600));

          const discoverShelf = document.querySelector('#selection-descobrir');
          const discoverCards = discoverShelf ? Array.from(discoverShelf.querySelectorAll('.discover-card')) : [];
          const discoverSet = discoverCards.map(c => {
            const app = c.getAttribute('data-appid');
            const title = c.querySelector('h3')?.innerText?.trim() || '';
            const price = c.querySelector('.discover-card-bottom strong')?.innerText?.trim() || '';
            const badge = c.querySelector('.discover-badge-pill')?.innerText?.trim() || '';
            return {
              appId: app ? Number(app) : c.getAttribute('data-game-id'),
              title,
              price,
              badge,
            };
          });

          return {
            initialSet,
            rot1,
            rot2,
            rot3,
            discoverSet,
            hasDiscoverShelf: Boolean(discoverShelf),
          };
        })()
      `);

      results[vp.name] = {
        controls: controlsMetrics,
        sequence,
      };

      console.log(`INITIAL_SET (${sequence.initialSet.length}):`, sequence.initialSet);
      console.log(`ROTATION_1  (${sequence.rot1.length}):`, sequence.rot1);
      console.log(`ROTATION_2  (${sequence.rot2.length}):`, sequence.rot2);
      console.log(`ROTATION_3  (${sequence.rot3.length}):`, sequence.rot3);
      console.log(`DISCOVER_SET (${sequence.discoverSet.length}):`, sequence.discoverSet.map(d => `${d.title} [appId: ${d.appId}, ${d.badge}, ${d.price}]`));
    }

    client.close();
    console.log('\n==================================================');
    console.log('AUDIT COMPLETED SUCCESSFULLY ✅');
    console.log('==================================================');
    return results;
  } catch (err) {
    console.error('Audit failed:', err);
    throw err;
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
