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
    return new Promise((resolve, reject) => {
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

async function runVisualAcceptance() {
  const artifactDir = 'C:\\Users\\PC\\.gemini\\antigravity\\brain\\6ad0b1d7-c225-4b9b-a22d-bc11917d384b';
  const port = 9245;
  const tempDir = path.join(os.tmpdir(), `discovery-vis-${Date.now()}`);
  let chromeProc = null;

  try {
    chromeProc = await startChrome(port, tempDir);
    const targetListRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetListRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    const cdp = new CDPClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });

    console.log('Navigating to http://localhost:3000/ ...');
    await cdp.send('Page.navigate', { url: 'http://localhost:3000/' });

    // Wait for discovery to be loaded
    let loaded = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const isReady = await cdp.eval(`
        Boolean(document.querySelector('.discovery-home') &&
                document.querySelectorAll('.category-tiles a').length >= 2 &&
                document.querySelectorAll('.discover-card').length >= 4)
      `);
      if (isReady) {
        loaded = true;
        break;
      }
    }
    assert.ok(loaded, 'Discovery shelves must load within 10s');

    // Scroll to discovery section so it is right at the top of the viewport
    await cdp.eval(`
      const intro = document.querySelector('.discovery-home');
      if (intro) {
        intro.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    `);
    await sleep(300);

    // ==========================================
    // STATE A: Initial Discovery State
    // ==========================================
    console.log('\n--- Evaluating STATE A (Initial) ---');
    const stateA = await cdp.eval(`
      (() => {
        const tiles = Array.from(document.querySelectorAll('.category-tiles a')).map(el => {
          const r = el.getBoundingClientRect();
          return {
            testId: el.getAttribute('data-testid'),
            repId: el.getAttribute('data-rep-id'),
            repTitle: el.getAttribute('data-rep-title'),
            text: el.innerText.trim(),
            imgSrc: el.querySelector('img')?.src,
            rect: { top: r.top, bottom: r.bottom, height: r.height }
          };
        });
        const cards = Array.from(document.querySelectorAll('.discover-shelf .discover-card')).map(el => {
          const r = el.getBoundingClientRect();
          return {
            appId: el.getAttribute('data-appid'),
            id: el.getAttribute('data-game-id'),
            title: el.querySelector('h3')?.innerText?.trim(),
            rect: { top: r.top, bottom: r.bottom, height: r.height }
          };
        });
        return { tiles, cards, scrollY: window.scrollY };
      })()
    `);

    console.log('State A tiles:', JSON.stringify(stateA.tiles, null, 2));
    const rogueTileA = stateA.tiles.find(t => t.testId === 'category-tile-roguelike');
    const indieTileA = stateA.tiles.find(t => t.testId === 'category-tile-indie');
    const epicTileA = stateA.tiles.find(t => t.testId === 'category-tile-epic');

    assert.ok(rogueTileA, 'Roguelike tile must exist');
    assert.ok(indieTileA, 'Indie tile must exist');
    assert.notEqual(rogueTileA.repId, indieTileA.repId, 'STATE A ACCEPTANCE: Roguelikes and Indies must NEVER share representative game!');
    assert.notEqual(rogueTileA.imgSrc, indieTileA.imgSrc, 'STATE A ACCEPTANCE: Roguelikes and Indies must NEVER share artwork!');
    console.log(` Roguelikes: [${rogueTileA.repTitle}] vs Indies: [${indieTileA.repTitle}] -> DISTINCT!`);

    // Verify first row of deal cards is visible above fold
    const visibleCardsA = stateA.cards.filter(c => c.rect.top < 900 && c.rect.bottom > 0);
    console.log(`Visible cards above the fold in State A: ${visibleCardsA.length}`);
    assert.ok(visibleCardsA.length >= 2, 'At least 2 deal cards must be visible above the fold on desktop 1280x900');

    // Capture screenshot A
    const screenshotA = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathA = path.join(artifactDir, 'discovery_state_a.png');
    fs.writeFileSync(pathA, Buffer.from(screenshotA.data, 'base64'));
    console.log(`Saved STATE A screenshot to ${pathA}`);

    // ==========================================
    // STATE B: After ↻ Rotation #1
    // ==========================================
    console.log('\n--- Evaluating STATE B (Rotation #1) ---');
    await cdp.eval(`document.querySelector('[data-testid="rotate-button"]').click()`);
    await sleep(400);

    const stateB = await cdp.eval(`
      (() => {
        const tiles = Array.from(document.querySelectorAll('.category-tiles a')).map(el => ({
          testId: el.getAttribute('data-testid'),
          repId: el.getAttribute('data-rep-id'),
          repTitle: el.getAttribute('data-rep-title'),
          imgSrc: el.querySelector('img')?.src,
        }));
        const cards = Array.from(document.querySelectorAll('.discover-shelf .discover-card')).map(el => ({
          appId: el.getAttribute('data-appid'),
          id: el.getAttribute('data-game-id'),
          title: el.querySelector('h3')?.innerText?.trim()
        }));
        return { tiles, cards };
      })()
    `);

    console.log('State B tiles:', JSON.stringify(stateB.tiles, null, 2));
    const rogueTileB = stateB.tiles.find(t => t.testId === 'category-tile-roguelike');
    const indieTileB = stateB.tiles.find(t => t.testId === 'category-tile-indie');
    assert.notEqual(rogueTileB.repId, indieTileB.repId, 'STATE B ACCEPTANCE: Roguelikes and Indies must NEVER share representative game!');
    assert.notEqual(rogueTileB.imgSrc, indieTileB.imgSrc, 'STATE B ACCEPTANCE: Roguelikes and Indies must NEVER share artwork!');

    // Check visible rotation: tile representative or cards changed
    const tileChanged = stateB.tiles.some((t, i) => t.repId !== stateA.tiles[i]?.repId || t.imgSrc !== stateA.tiles[i]?.imgSrc);
    const cardChanged = stateB.cards.slice(0, 4).some((c, i) => c.id !== stateA.cards[i]?.id);
    assert.ok(tileChanged || cardChanged, 'Clicking ↻ must cause an OBVIOUS visible change on screen!');
    console.log(` Rotation #1 visible change: tileChanged=${tileChanged}, cardChanged=${cardChanged}`);

    const screenshotB = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathB = path.join(artifactDir, 'discovery_state_b.png');
    fs.writeFileSync(pathB, Buffer.from(screenshotB.data, 'base64'));
    console.log(`Saved STATE B screenshot to ${pathB}`);

    // ==========================================
    // STATE C: After ↻ Rotation #2
    // ==========================================
    console.log('\n--- Evaluating STATE C (Rotation #2) ---');
    await cdp.eval(`document.querySelector('[data-testid="rotate-button"]').click()`);
    await sleep(400);

    const stateC = await cdp.eval(`
      (() => {
        const tiles = Array.from(document.querySelectorAll('.category-tiles a')).map(el => ({
          testId: el.getAttribute('data-testid'),
          repId: el.getAttribute('data-rep-id'),
          repTitle: el.getAttribute('data-rep-title'),
          imgSrc: el.querySelector('img')?.src,
        }));
        const cards = Array.from(document.querySelectorAll('.discover-shelf .discover-card')).map(el => ({
          appId: el.getAttribute('data-appid'),
          id: el.getAttribute('data-game-id'),
          title: el.querySelector('h3')?.innerText?.trim()
        }));
        return { tiles, cards };
      })()
    `);

    console.log('State C tiles:', JSON.stringify(stateC.tiles, null, 2));
    const rogueTileC = stateC.tiles.find(t => t.testId === 'category-tile-roguelike');
    const indieTileC = stateC.tiles.find(t => t.testId === 'category-tile-indie');
    assert.notEqual(rogueTileC.repId, indieTileC.repId, 'STATE C ACCEPTANCE: Roguelikes and Indies must NEVER share representative game!');
    assert.notEqual(rogueTileC.imgSrc, indieTileC.imgSrc, 'STATE C ACCEPTANCE: Roguelikes and Indies must NEVER share artwork!');

    const screenshotC = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathC = path.join(artifactDir, 'discovery_state_c.png');
    fs.writeFileSync(pathC, Buffer.from(screenshotC.data, 'base64'));
    console.log(`Saved STATE C screenshot to ${pathC}`);

    // ==========================================
    // STATE D: Descobrir Active
    // ==========================================
    console.log('\n--- Evaluating STATE D (Descobrir Active) ---');
    await cdp.eval(`document.querySelector('[data-testid="discover-button"]').click()`);
    await sleep(500);

    const stateD = await cdp.eval(`
      (() => {
        const showcase = document.querySelector('[data-testid="curated-discover-shelf"]');
        const heading = showcase?.querySelector('h2')?.innerText?.trim();
        const eyebrow = showcase?.querySelector('.eyebrow')?.innerText?.trim();
        const cards = Array.from(showcase?.querySelectorAll('.discover-card') || []).map(el => ({
          title: el.querySelector('h3')?.innerText?.trim(),
          store: el.querySelector('.discover-card-meta span')?.innerText?.trim(),
          price: el.querySelector('.discover-card-bottom strong')?.innerText?.trim()
        }));
        const exitBtn = showcase?.querySelector('[data-testid="discover-exit-button"]')?.innerText?.trim();
        const reshuffleBtn = showcase?.querySelector('[data-testid="discover-reshuffle-button"]')?.innerText?.trim();
        return {
          hasShowcase: Boolean(showcase),
          heading,
          eyebrow,
          cardsCount: cards.length,
          cards,
          exitBtn,
          reshuffleBtn,
        };
      })()
    `);

    console.log('State D showcase details:', JSON.stringify(stateD, null, 2));
    assert.ok(stateD.hasShowcase, 'STATE D ACCEPTANCE: Dedicated Descobrir showcase must be rendered');
    assert.equal(stateD.heading, 'Descobertas para você explorar', 'STATE D ACCEPTANCE: Heading must match');
    assert.ok(stateD.eyebrow.includes('MODO DESCOBERTA'), 'STATE D ACCEPTANCE: Eyebrow must announce MODO DESCOBERTA');
    assert.equal(stateD.cardsCount, 8, 'STATE D ACCEPTANCE: Exactly 8 curated cards must be displayed');
    assert.ok(stateD.exitBtn.includes('Voltar às vitrines'), 'STATE D ACCEPTANCE: Exit button must be present');
    assert.ok(stateD.reshuffleBtn.includes('Sortear outro mix'), 'STATE D ACCEPTANCE: Reshuffle button must be present');

    const screenshotD = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathD = path.join(artifactDir, 'discovery_state_d.png');
    fs.writeFileSync(pathD, Buffer.from(screenshotD.data, 'base64'));
    console.log(`Saved STATE D screenshot to ${pathD}`);

    // ==========================================
    // MOBILE SMOKE TESTS: 390px and 360px
    // ==========================================
    console.log('\n--- Mobile Smoke Test (390px) ---');
    // Exit descobrir first to check standard shelves layout
    await cdp.eval(`document.querySelector('[data-testid="discover-exit-button"]').click()`);
    await sleep(300);

    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(300);

    const overflow390 = await cdp.eval(`
      (() => {
        const root = document.documentElement;
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          hasOverflow: root.scrollWidth > root.clientWidth
        };
      })()
    `);
    console.log('390px overflow check:', overflow390);
    assert.ok(!overflow390.hasOverflow, 'Zero horizontal overflow at 390px viewport');

    const screenshot390 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const path390 = path.join(artifactDir, 'discovery_mobile_390.png');
    fs.writeFileSync(path390, Buffer.from(screenshot390.data, 'base64'));
    console.log(`Saved 390px screenshot to ${path390}`);

    console.log('\n--- Mobile Smoke Test (360px) ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 740,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(300);

    const overflow360 = await cdp.eval(`
      (() => {
        const root = document.documentElement;
        return {
          scrollWidth: root.scrollWidth,
          clientWidth: root.clientWidth,
          hasOverflow: root.scrollWidth > root.clientWidth
        };
      })()
    `);
    console.log('360px overflow check:', overflow360);
    assert.ok(!overflow360.hasOverflow, 'Zero horizontal overflow at 360px viewport');

    const screenshot360 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const path360 = path.join(artifactDir, 'discovery_mobile_360.png');
    fs.writeFileSync(path360, Buffer.from(screenshot360.data, 'base64'));
    console.log(`Saved 360px screenshot to ${path360}`);

    console.log('\nALL VISUAL & CDP ACCEPTANCE CHECKS PASSED PERFECTLY!');
    cdp.close();
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

runVisualAcceptance().catch(err => {
  console.error('Visual acceptance failed:', err);
  process.exit(1);
});
