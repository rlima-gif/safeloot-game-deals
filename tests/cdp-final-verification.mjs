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

function parseRgb(colorStr) {
  if (!colorStr) return null;
  const match = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return null;
  return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
}

function getLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1, rgb2) {
  if (!rgb1 || !rgb2) return 1.0;
  const l1 = getLuminance(rgb1);
  const l2 = getLuminance(rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
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

async function runAudit() {
  const port = 9225;
  const tempDir = path.join(os.tmpdir(), `cdp-proof-${Date.now()}`);
  let chromeProc = null;
  const TARGET_URL = 'https://safeloot.safeloot.workers.dev';

  console.log(`Starting Live Production Verification on ${TARGET_URL}...`);

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

    // 1. Mobile 390x844 (Dark Mode)
    console.log('\n--- 1. Testing Mobile 390x844 (Dark Mode) ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });
    await client.send('Page.navigate', { url: TARGET_URL });
    await sleep(4000);

    const mobile390 = await client.eval(`
      (() => {
        // A. Controls Audit
        const filterTrigger = document.querySelector('.mobile-filter-trigger');
        const catalogSwitchActive = document.querySelector('.catalog-switch button[aria-pressed="true"], .catalog-switch button.active');
        const catalogSwitchInactive = document.querySelector('.catalog-switch button:not([aria-pressed="true"]):not(.active)');
        const refreshBtn = document.querySelector('.section-heading > button');
        const limitBtns = Array.from(document.querySelectorAll('.limit-switch-btn'));
        const newsChips = Array.from(document.querySelectorAll('.news-category-chip'));
        const newsBadges = Array.from(document.querySelectorAll('.news-category'));
        const newsArticles = Array.from(document.querySelectorAll('.news-card'));

        const getStyle = (el) => {
          if (!el) return null;
          const s = window.getComputedStyle(el);
          return {
            text: el.innerText.trim(),
            bg: s.backgroundColor,
            color: s.color,
            border: s.borderColor,
            fontSize: s.fontSize,
            w: Math.round(el.getBoundingClientRect().width),
            h: Math.round(el.getBoundingClientRect().height),
          };
        };

        // B. Images Audit
        const images = Array.from(document.querySelectorAll('img')).map(img => ({
          src: img.src,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          displayWidth: Math.round(img.getBoundingClientRect().width),
          displayHeight: Math.round(img.getBoundingClientRect().height),
          alt: img.alt || '',
        }));

        // C. Viewport overflow check
        const scrollWidth = document.documentElement.scrollWidth;
        const clientWidth = document.documentElement.clientWidth;

        // D. Safe Area check
        const nav = document.querySelector('.mobile-nav');
        const navPad = nav ? window.getComputedStyle(nav).paddingBottom : null;
        const footer = document.querySelector('.site-footer');
        const footerPad = footer ? window.getComputedStyle(footer).paddingBottom : null;

        return {
          scrollWidth,
          clientWidth,
          hasHorizontalOverflow: scrollWidth > clientWidth,
          filterTrigger: getStyle(filterTrigger),
          catalogSwitchActive: getStyle(catalogSwitchActive),
          catalogSwitchInactive: getStyle(catalogSwitchInactive),
          refreshBtn: getStyle(refreshBtn),
          limitSwitchCount: limitBtns.length,
          newsChips: newsChips.map(c => ({
            text: c.innerText.trim(),
            active: c.classList.contains('active') || c.getAttribute('aria-selected') === 'true',
            bg: window.getComputedStyle(c).backgroundColor,
            color: window.getComputedStyle(c).color,
          })),
          newsBadgeTexts: newsBadges.map(b => b.innerText.trim()),
          totalNewsArticles: newsArticles.length,
          imagesCount: images.length,
          sampleImages: images.filter(i => i.src.includes('steamstatic') || i.src.includes('steam')).slice(0, 10),
          navPad,
          footerPad,
        };
      })()
    `);

    console.log(`Viewport: clientWidth=${mobile390.clientWidth}, scrollWidth=${mobile390.scrollWidth} (Overflow: ${mobile390.hasHorizontalOverflow})`);
    console.log(`Mobile Filter Trigger:`, mobile390.filterTrigger);
    if (mobile390.filterTrigger) {
      const fg = parseRgb(mobile390.filterTrigger.color);
      const bg = parseRgb(mobile390.filterTrigger.bg);
      console.log(`  -> Filter Trigger Contrast Ratio: ${contrastRatio(fg, bg).toFixed(2)}:1`);
    }

    console.log(`Catalog Switch Active:`, mobile390.catalogSwitchActive);
    if (mobile390.catalogSwitchActive) {
      const fg = parseRgb(mobile390.catalogSwitchActive.color);
      const bg = parseRgb(mobile390.catalogSwitchActive.bg);
      console.log(`  -> Catalog Switch Active Contrast Ratio: ${contrastRatio(fg, bg).toFixed(2)}:1`);
    }

    console.log(`Catalog Switch Inactive:`, mobile390.catalogSwitchInactive);
    if (mobile390.catalogSwitchInactive) {
      const fg = parseRgb(mobile390.catalogSwitchInactive.color);
      // Inactive sits on .catalog-switch bg (var(--card) = #170b25 = [23, 11, 37])
      console.log(`  -> Catalog Switch Inactive Contrast Ratio: ${contrastRatio(fg, [23, 11, 37]).toFixed(2)}:1`);
    }

    console.log(`Section Heading Refresh Button:`, mobile390.refreshBtn);
    console.log(`Mobile Nav Safe Area: ${mobile390.navPad}, Footer Safe Area: ${mobile390.footerPad}`);
    console.log(`News Rail Chips (${mobile390.newsChips.length}):`, mobile390.newsChips.map(c => c.text).join(' | '));
    console.log(`News Badge Texts (${mobile390.newsBadgeTexts.length}):`, mobile390.newsBadgeTexts);
    const otherBadges = mobile390.newsBadgeTexts.filter(t => t.toUpperCase() === 'OTHER');
    console.log(`  -> OTHER category count: ${otherBadges.length} (Rate: ${(otherBadges.length / (mobile390.newsBadgeTexts.length || 1) * 100).toFixed(1)}%)`);

    console.log(`Images sampled (${mobile390.sampleImages.length}):`);
    for (const img of mobile390.sampleImages) {
      const is231 = img.src.includes('231x87');
      const is616 = img.src.includes('616x353');
      const isHeader = img.src.includes('header.jpg');
      console.log(`  - [${img.displayWidth}x${img.displayHeight}] nat: ${img.naturalWidth}x${img.naturalHeight} | ${is616 ? '616x353 CAPSULE ✅' : isHeader ? 'HEADER.JPG ✅' : is231 ? '⚠️ LOW-RES 231x87' : 'OTHER'} | ${img.src.slice(0, 95)}...`);
    }

    // 2. Mobile 360x800
    console.log('\n--- 2. Testing Mobile 360x800 (Compact Android) ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 360,
      height: 800,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(1000);
    const mobile360 = await client.eval(`
      (() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        filterTriggerVisible: Boolean(document.querySelector('.mobile-filter-trigger')),
        railVisible: Boolean(document.querySelector('.news-category-rail')),
      }))()
    `);
    console.log(`360x800: clientWidth=${mobile360.clientWidth}, scrollWidth=${mobile360.scrollWidth} (Overflow: ${mobile360.scrollWidth > mobile360.clientWidth})`);

    // 3. Desktop 1280x800
    console.log('\n--- 3. Testing Desktop 1280x800 ---');
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sleep(1000);
    const desktop = await client.eval(`
      (() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        catalogSwitch: Boolean(document.querySelector('.catalog-switch')),
        rail: Boolean(document.querySelector('.news-category-rail')),
        newsCards: document.querySelectorAll('.news-card').length,
      }))()
    `);
    console.log(`Desktop: clientWidth=${desktop.clientWidth}, scrollWidth=${desktop.scrollWidth}, newsCards=${desktop.newsCards}`);

    // 4. Light Mode Contrast Emulation
    console.log('\n--- 4. Testing Light Mode Contrast (prefers-color-scheme: light) ---');
    await client.send('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [{ name: 'prefers-color-scheme', value: 'light' }],
    });
    await sleep(1000);

    const lightAudit = await client.eval(`
      (() => {
        const catalogSwitchActive = document.querySelector('.catalog-switch button[aria-pressed="true"], .catalog-switch button.active');
        const filterTrigger = document.querySelector('.mobile-filter-trigger');
        const activeChip = document.querySelector('.news-category-chip.active');

        const getInfo = (el) => {
          if (!el) return null;
          const s = window.getComputedStyle(el);
          return { bg: s.backgroundColor, color: s.color, text: el.innerText.trim() };
        };

        return {
          catalogSwitchActive: getInfo(catalogSwitchActive),
          filterTrigger: getInfo(filterTrigger),
          activeChip: getInfo(activeChip),
        };
      })()
    `);

    console.log(`Light Mode Controls:`, lightAudit);
    if (lightAudit.catalogSwitchActive) {
      const fg = parseRgb(lightAudit.catalogSwitchActive.color);
      const bg = parseRgb(lightAudit.catalogSwitchActive.bg);
      console.log(`  -> Light Mode Catalog Switch Active Contrast Ratio: ${contrastRatio(fg, bg).toFixed(2)}:1`);
    }
    if (lightAudit.activeChip) {
      const fg = parseRgb(lightAudit.activeChip.color);
      const bg = parseRgb(lightAudit.activeChip.bg);
      console.log(`  -> Light Mode Active Chip Contrast Ratio: ${contrastRatio(fg, bg).toFixed(2)}:1`);
    }

    // 5. Test Category Filtering Interaction
    console.log('\n--- 5. Testing Category Chip Interaction ---');
    const chipClickResult = await client.eval(`
      (async () => {
        const chips = Array.from(document.querySelectorAll('.news-category-chip'));
        if (chips.length < 2) return { success: false, reason: 'Not enough chips' };
        
        // Click second chip (e.g. Jogos)
        const chipToClick = chips[1];
        const categoryClicked = chipToClick.innerText.trim();
        chipToClick.click();
        
        // Wait for React re-render
        await new Promise(r => setTimeout(r, 200));
        
        return {
          clickedCategory: categoryClicked,
          activeNow: chipToClick.classList.contains('active'),
          ariaSelected: chipToClick.getAttribute('aria-selected'),
          visibleArticles: document.querySelectorAll('.news-card').length,
          hasEmptyState: Boolean(document.querySelector('.news-empty-category')),
        };
      })()
    `);
    console.log(`Chip click result:`, chipClickResult);

    client.close();
    console.log('\nAudit complete! ✅');
  } catch (err) {
    console.error('Audit failed:', err);
  } finally {
    if (chromeProc) chromeProc.kill();
  }
}

runAudit();
