import { spawn } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const TARGET_URL = 'https://safeloot.safeloot.workers.dev';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function test() {
  const port = 9446;
  const tempDir = mkdtempSync(join(tmpdir(), 'chrome-test-'));
  const proc = spawn(CHROME_PATH, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${tempDir}`,
    'about:blank'
  ]);

  await sleep(1500);

  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  const tabs = await res.json();
  const pageTab = tabs.find(t => t.type === 'page');
  const wsUrl = pageTab?.webSocketDebuggerUrl;

  const ws = new WebSocket(wsUrl);
  await new Promise(r => ws.onopen = r);

  let id = 0;
  function call(method, params = {}) {
    return new Promise(resolve => {
      const msgId = ++id;
      const handler = (event) => {
        const data = JSON.parse(event.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  const requestsSent = [];
  const responsesReceived = [];
  const consoleMessages = [];

  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Runtime.consoleAPICalled') {
      consoleMessages.push(data.params.args.map(a => a.value || a.description).join(' '));
    } else if (data.method === 'Network.requestWillBeSent') {
      requestsSent.push(data.params.request.url);
    } else if (data.method === 'Network.responseReceived') {
      responsesReceived.push({
        url: data.params.response.url,
        status: data.params.response.status,
      });
    }
  });

  await call('Network.enable');
  await call('Runtime.enable');
  await call('Page.enable');

  console.log('Navigating to', TARGET_URL);
  await call('Page.navigate', { url: TARGET_URL });

  // Wait 12 seconds to observe full loading and any slow network requests
  console.log('Waiting up to 12s for all requests and hydration...');
  for (let i = 0; i < 12; i++) {
    await sleep(1000);
    const cardCheck = await call('Runtime.evaluate', {
      expression: `(() => {
        const cards = document.querySelectorAll('a[href^="/jogo/"]');
        const h2 = document.querySelector('h2')?.innerText || '';
        return { count: cards.length, h2 };
      })()`,
      returnByValue: true
    });
    console.log(`[t=${i+1}s] cards: ${cardCheck.result.value.count} | h2: "${cardCheck.result.value.h2}"`);
    if (cardCheck.result.value.count > 0) {
      console.log('Cards rendered!');
      break;
    }
  }

  console.log('Total Requests Sent:', requestsSent.length);
  console.log('API requests sent:', requestsSent.filter(u => u.includes('/api/')));
  console.log('API responses:', responsesReceived.filter(r => r.url.includes('/api/')));
  console.log('Console messages:', consoleMessages);

  ws.close();
  proc.kill();
  await sleep(1000);
  try { rmSync(tempDir, { recursive: true, force: true }); } catch {}
}

test().catch(console.error);
