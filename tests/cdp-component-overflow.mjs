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

export async function runComponentOverflowAudit() {
  const port = 9333;
  const tempDir = path.join(os.tmpdir(), `cdp-overflow-${Date.now()}`);
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

    console.log(`\n=== Component-Level Layout Audit (Unmasked Overflow) ===`);
    console.log(`Target: ${TARGET_URL}`);

    const viewports = [
      { name: 'Mobile iPhone (390)', width: 390, height: 844 },
      { name: 'Mobile Android (360)', width: 360, height: 800 },
    ];

    for (const vp of viewports) {
      console.log(`\n--- Auditing Viewport: ${vp.name} (${vp.width}x${vp.height}) ---`);

      await client.send('Emulation.setDeviceMetricsOverride', {
        width: vp.width,
        height: vp.height,
        deviceScaleFactor: 2,
        mobile: true,
      });

      // 1. Home Page Audit with unmasked overflow
      await client.send('Page.navigate', { url: TARGET_URL });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const count = await client.eval(`document.querySelectorAll('.game-row').length`);
        if (count > 0) break;
      }

      const homeOffenders = await client.eval(`(() => {
        // Temporarily remove global overflow clipping to test component-level layout
        document.documentElement.style.overflowX = 'visible';
        document.body.style.overflowX = 'visible';

        const docWidth = window.innerWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const bodyScrollWidth = document.body.scrollWidth;

        const allElements = Array.from(document.querySelectorAll('*'));
        const offenders = [];

        // Permitted horizontal scroll containers
        const allowedScrollContainers = ['budget-filters', 'profile-thumbnails', 'deal-carousel', 'carousel'];

        for (const el of allElements) {
          const rect = el.getBoundingClientRect();
          const className = typeof el.className === 'string' ? el.className : '';
          const isScrollable = allowedScrollContainers.some(c => className.includes(c));

          if (rect.right > docWidth + 1.5 && !isScrollable) {
            // Check if it is a child of an allowed scroll container
            let parent = el.parentElement;
            let insideAllowed = false;
            while (parent && parent !== document.body) {
              const pClass = typeof parent.className === 'string' ? parent.className : '';
              if (allowedScrollContainers.some(c => pClass.includes(c))) {
                insideAllowed = true;
                break;
              }
              parent = parent.parentElement;
            }
            if (!insideAllowed) {
              offenders.push({
                tag: el.tagName.toLowerCase(),
                id: el.id || '',
                className: className.slice(0, 80),
                rectRight: Math.round(rect.right),
                rectWidth: Math.round(rect.width),
                overflowPx: Math.round(rect.right - docWidth),
                snippet: (el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')
              });
            }
          }
        }

        // Restore styles
        document.documentElement.style.overflowX = '';
        document.body.style.overflowX = '';

        return {
          viewportWidth: docWidth,
          scrollWidth,
          bodyScrollWidth,
          hasOverflow: scrollWidth > docWidth,
          offenderCount: offenders.length,
          offenders: offenders.slice(0, 10)
        };
      })()`);

      console.log(`  Home (Unmasked): scrollWidth=${homeOffenders.scrollWidth}, docWidth=${homeOffenders.viewportWidth}, hasOverflow=${homeOffenders.hasOverflow}`);
      console.log(`  Home Offender Elements Count: ${homeOffenders.offenderCount}`);
      if (homeOffenders.offenders.length > 0) {
        console.log(`  Sample Offenders:`, JSON.stringify(homeOffenders.offenders, null, 2));
      }

      // 2. Game Detail Page Audit
      await client.send('Page.navigate', { url: `${TARGET_URL}/jogo/646570?titulo=Slay%20the%20Spire` });
      for (let i = 0; i < 20; i++) {
        await sleep(500);
        const title = await client.eval(`document.querySelector('h1')?.innerText || ''`);
        if (title && !title.includes('Consultando')) break;
      }

      const gameOffenders = await client.eval(`(() => {
        document.documentElement.style.overflowX = 'visible';
        document.body.style.overflowX = 'visible';

        const docWidth = window.innerWidth;
        const scrollWidth = document.documentElement.scrollWidth;
        const allElements = Array.from(document.querySelectorAll('*'));
        const offenders = [];
        const allowedScrollContainers = ['budget-filters', 'profile-thumbnails', 'deal-carousel', 'carousel'];

        for (const el of allElements) {
          const rect = el.getBoundingClientRect();
          const className = typeof el.className === 'string' ? el.className : '';
          const isScrollable = allowedScrollContainers.some(c => className.includes(c));

          if (rect.right > docWidth + 1.5 && !isScrollable) {
            let parent = el.parentElement;
            let insideAllowed = false;
            while (parent && parent !== document.body) {
              const pClass = typeof parent.className === 'string' ? parent.className : '';
              if (allowedScrollContainers.some(c => pClass.includes(c))) {
                insideAllowed = true;
                break;
              }
              parent = parent.parentElement;
            }
            if (!insideAllowed) {
              offenders.push({
                tag: el.tagName.toLowerCase(),
                className: className.slice(0, 80),
                rectRight: Math.round(rect.right),
                rectWidth: Math.round(rect.width),
                overflowPx: Math.round(rect.right - docWidth),
                snippet: (el.innerText || '').slice(0, 40).replace(/\\n/g, ' ')
              });
            }
          }
        }

        document.documentElement.style.overflowX = '';
        document.body.style.overflowX = '';

        return {
          viewportWidth: docWidth,
          scrollWidth,
          hasOverflow: scrollWidth > docWidth,
          offenderCount: offenders.length,
          offenders: offenders.slice(0, 10)
        };
      })()`);

      console.log(`  Game Detail (Unmasked): scrollWidth=${gameOffenders.scrollWidth}, docWidth=${gameOffenders.viewportWidth}, hasOverflow=${gameOffenders.hasOverflow}`);
      console.log(`  Game Detail Offender Count: ${gameOffenders.offenderCount}`);
      if (gameOffenders.offenders.length > 0) {
        console.log(`  Sample Offenders:`, JSON.stringify(gameOffenders.offenders, null, 2));
      }
    }

    client.close();
  } finally {
    if (chromeProc) chromeProc.kill();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

runComponentOverflowAudit().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
