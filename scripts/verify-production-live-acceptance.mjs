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

async function runProductionAudit() {
  const artifactDir = 'C:\\Users\\PC\\.gemini\\antigravity\\brain\\6ad0b1d7-c225-4b9b-a22d-bc11917d384b';
  const prodUrl = 'https://safeloot.safeloot.workers.dev';
  const port = 9250;
  const tempDir = path.join(os.tmpdir(), `prod-audit-${Date.now()}`);
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

    console.log(`Navigating to ${prodUrl}/ ...`);
    await cdp.send('Page.navigate', { url: prodUrl });

    let loaded = false;
    for (let i = 0; i < 50; i++) {
      await sleep(300);
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
    assert.ok(loaded, 'Production Discovery shelves must load within 15s');

    await cdp.eval(`
      const intro = document.querySelector('.discovery-home');
      if (intro) {
        intro.scrollIntoView({ behavior: 'instant', block: 'start' });
      }
    `);
    await sleep(400);

    // ==========================================
    // PROD STATE A: Initial Discovery State
    // ==========================================
    console.log('\n--- Evaluating PROD STATE A (Initial) ---');
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

    console.log('Production State A tiles:', JSON.stringify(stateA.tiles, null, 2));
    const rogueTileA = stateA.tiles.find(t => t.testId === 'category-tile-roguelike');
    const indieTileA = stateA.tiles.find(t => t.testId === 'category-tile-indie');

    assert.ok(rogueTileA, 'Roguelike tile must exist on production');
    assert.ok(indieTileA, 'Indie tile must exist on production');
    assert.notEqual(rogueTileA.repId, indieTileA.repId, 'PROD STATE A: Roguelikes and Indies must NEVER share representative game!');
    assert.notEqual(rogueTileA.imgSrc, indieTileA.imgSrc, 'PROD STATE A: Roguelikes and Indies must NEVER share artwork!');
    console.log(` Production: Roguelikes [${rogueTileA.repTitle}] vs Indies [${indieTileA.repTitle}] -> DISTINCT!`);

    const visibleCardsA = stateA.cards.filter(c => c.rect.top < 900 && c.rect.bottom > 0);
    console.log(`Visible cards above fold in Prod State A: ${visibleCardsA.length}`);
    assert.ok(visibleCardsA.length >= 2, 'Deal cards must be visible above the fold on production desktop 1280x900');

    const screenshotA = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathA = path.join(artifactDir, 'prod_discovery_state_a.png');
    fs.writeFileSync(pathA, Buffer.from(screenshotA.data, 'base64'));
    console.log(`Saved PROD STATE A screenshot to ${pathA}`);

    // ==========================================
    // PROD STATE B: After ↻ Rotation #1
    // ==========================================
    console.log('\n--- Evaluating PROD STATE B (Rotation #1) ---');
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

    const rogueTileB = stateB.tiles.find(t => t.testId === 'category-tile-roguelike');
    const indieTileB = stateB.tiles.find(t => t.testId === 'category-tile-indie');
    assert.notEqual(rogueTileB.repId, indieTileB.repId, 'PROD STATE B: Roguelikes and Indies must NEVER share representative game!');
    assert.notEqual(rogueTileB.imgSrc, indieTileB.imgSrc, 'PROD STATE B: Roguelikes and Indies must NEVER share artwork!');

    const screenshotB = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathB = path.join(artifactDir, 'prod_discovery_state_b.png');
    fs.writeFileSync(pathB, Buffer.from(screenshotB.data, 'base64'));
    console.log(`Saved PROD STATE B screenshot to ${pathB}`);

    // ==========================================
    // PROD STATE C: After ↻ Rotation #2
    // ==========================================
    console.log('\n--- Evaluating PROD STATE C (Rotation #2) ---');
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

    const rogueTileC = stateC.tiles.find(t => t.testId === 'category-tile-roguelike');
    const indieTileC = stateC.tiles.find(t => t.testId === 'category-tile-indie');
    assert.notEqual(rogueTileC.repId, indieTileC.repId, 'PROD STATE C: Roguelikes and Indies must NEVER share representative game!');
    assert.notEqual(rogueTileC.imgSrc, indieTileC.imgSrc, 'PROD STATE C: Roguelikes and Indies must NEVER share artwork!');

    const screenshotC = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathC = path.join(artifactDir, 'prod_discovery_state_c.png');
    fs.writeFileSync(pathC, Buffer.from(screenshotC.data, 'base64'));
    console.log(`Saved PROD STATE C screenshot to ${pathC}`);

    // ==========================================
    // PROD STATE D: Descobrir Active
    // ==========================================
    console.log('\n--- Evaluating PROD STATE D (Descobrir Active) ---');
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

    console.log('Production State D showcase details:', JSON.stringify(stateD, null, 2));
    assert.ok(stateD.hasShowcase, 'PROD STATE D: Dedicated Descobrir showcase must be rendered');
    assert.equal(stateD.heading, 'Descobertas para você explorar', 'PROD STATE D: Heading must match');
    assert.ok(stateD.eyebrow.includes('MODO DESCOBERTA'), 'PROD STATE D: Eyebrow must announce MODO DESCOBERTA');
    assert.equal(stateD.cardsCount, 8, 'PROD STATE D: Exactly 8 curated cards must be displayed');
    assert.ok(stateD.exitBtn.includes('Voltar às vitrines'), 'PROD STATE D: Exit button must be present');
    assert.ok(stateD.reshuffleBtn.includes('Sortear outro mix'), 'PROD STATE D: Reshuffle button must be present');

    const screenshotD = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const pathD = path.join(artifactDir, 'prod_discovery_state_d.png');
    fs.writeFileSync(pathD, Buffer.from(screenshotD.data, 'base64'));
    console.log(`Saved PROD STATE D screenshot to ${pathD}`);

    // ==========================================
    // PROD MOBILE SMOKE TEST: 390px
    // ==========================================
    console.log('\n--- Production Mobile Smoke Test (390px) ---');
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
    console.log('Prod 390px overflow check:', overflow390);
    assert.ok(!overflow390.hasOverflow, 'Zero horizontal overflow on production at 390px');

    const screenshot390 = await cdp.send('Page.captureScreenshot', { format: 'png' });
    const path390 = path.join(artifactDir, 'prod_discovery_mobile_390.png');
    fs.writeFileSync(path390, Buffer.from(screenshot390.data, 'base64'));
    console.log(`Saved PROD 390px screenshot to ${path390}`);

    // ==========================================
    // REGRESSION CHECKS: Hover & Structured Data
    // ==========================================
    console.log('\n--- Verifying Regression: Hover Containment on Game Page ---');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await cdp.send('Page.navigate', { url: `${prodUrl}/jogo/1091500` });

    let gameLoaded = false;
    for (let i = 0; i < 40; i++) {
      await sleep(250);
      const ready = await cdp.eval(`Boolean(document.querySelector('.purchase-panel'))`);
      if (ready) {
        gameLoaded = true;
        break;
      }
    }
    assert.ok(gameLoaded, 'Game page purchase panel must load');

    const hoverCheck = await cdp.eval(`
      (() => {
        const panel = document.querySelector('.purchase-panel');
        const wishlistBtn = panel?.querySelector('.wishlist-button');
        if (!panel || !wishlistBtn) return { error: 'elements not found' };

        const cRectBefore = panel.getBoundingClientRect();
        const bRectBefore = wishlistBtn.getBoundingClientRect();

        // Dispatch mouseover/mouseenter
        wishlistBtn.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
        wishlistBtn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

        const cRectAfter = panel.getBoundingClientRect();
        const bRectAfter = wishlistBtn.getBoundingClientRect();

        return {
          panelWidthBefore: cRectBefore.width,
          panelWidthAfter: cRectAfter.width,
          btnRightBefore: bRectBefore.right,
          panelRightBefore: cRectBefore.right,
          btnRightAfter: bRectAfter.right,
          panelRightAfter: cRectAfter.right,
          isContained: bRectAfter.right <= cRectAfter.right + 2 && bRectAfter.left >= cRectAfter.left - 2
        };
      })()
    `);
    console.log('Hover containment check on production:', hoverCheck);
    assert.ok(hoverCheck.isContained, 'Wishlist button hover must stay contained inside purchase panel');

    console.log('\n--- Verifying Regression: Structured Data Availability Invariant ---');
    const jsonLdCheck = await cdp.eval(`
      (() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        const schemas = scripts.map(s => {
          try { return JSON.parse(s.textContent); } catch { return null; }
        }).filter(Boolean);
        const product = schemas.find(s => s['@type'] === 'Product');
        const offers = product?.offers;
        return {
          hasProduct: Boolean(product),
          productName: product?.name,
          offersAvailability: offers?.availability,
          hasPriceTruth: Boolean(offers?.price || offers?.lowPrice)
        };
      })()
    `);
    console.log('JSON-LD schema check on production:', jsonLdCheck);
    assert.ok(jsonLdCheck.hasProduct, 'Product schema must be present');
    assert.ok(jsonLdCheck.hasPriceTruth, 'Price truth must be preserved');
    assert.equal(
      jsonLdCheck.offersAvailability,
      undefined,
      'Structured data availability must NOT be emitted without explicit stock signal!'
    );

    console.log('\nALL PRODUCTION VERIFICATIONS PASSED WITH ZERO REGRESSIONS!');
    cdp.close();
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

runProductionAudit().catch(err => {
  console.error('Production audit failed:', err);
  process.exit(1);
});
