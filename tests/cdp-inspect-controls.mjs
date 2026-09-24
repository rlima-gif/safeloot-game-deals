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
    '--window-size=390,844',
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
  const port = 9224;
  const tempDir = path.join(os.tmpdir(), `cdp-controls-${Date.now()}`);
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

    // Emulate Mobile iPhone 390
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });

    await client.send('Page.navigate', { url: TARGET_URL });
    await sleep(3500);

    console.log(`Auditing Controls on Mobile 390x844...`);

    const controlData = await client.eval(`
      (() => {
        const results = [];
        // Find elements in section-heading, catalog-switch, limit-switch, mobile-filter-trigger
        const selector = '.section-heading, .section-heading *, .catalog-switch, .catalog-switch *, .limit-switch, .limit-switch *, .mobile-filter-trigger';
        const elements = Array.from(document.querySelectorAll(selector));

        for (const el of elements) {
          if (el.tagName === 'BUTTON' || el.tagName === 'A' || el.classList.contains('mobile-filter-trigger') || el.classList.contains('limit-switch-btn') || el.tagName === 'SELECT') {
            const comp = window.getComputedStyle(el);
            const rect = el.getBoundingClientRect();
            const text = el.innerText || el.textContent || '';
            const html = el.outerHTML.slice(0, 100);
            const svg = el.querySelector('svg');
            const svgComp = svg ? window.getComputedStyle(svg) : null;

            results.push({
              tag: el.tagName,
              classes: el.className,
              text: text.trim().replace(/\\s+/g, ' '),
              html,
              visible: rect.width > 0 && rect.height > 0,
              rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
              color: comp.color,
              backgroundColor: comp.backgroundColor,
              borderColor: comp.borderColor,
              svgColor: svgComp ? svgComp.color : null,
              svgFill: svgComp ? svgComp.fill : null,
              svgStroke: svgComp ? svgComp.stroke : null,
            });
          }
        }
        return results;
      })()
    `);

    console.log(`Found ${controlData.length} controls:`);
    for (const c of controlData) {
      console.log(JSON.stringify(c, null, 2));
    }

    client.close();
  } catch (err) {
    console.error('Audit error:', err);
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

run();
