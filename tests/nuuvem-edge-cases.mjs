import fs from 'node:fs';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const {
  parseNuuvemResult,
  parseNuuvemCandidates,
  fetchNuuvemHtml,
  getNuuvemResult,
} = await import(moduleUrl('lib/connectors/nuuvem.ts'));
const html = fs.readFileSync(
  'tests/fixtures/nuuvem-watch-dogs-2-deluxe.html',
  'utf8',
);
const url = 'https://www.nuuvem.com/br-pt/item/catalog-slug-unrelated-to-title';
let checks = 0;
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const parse = (
  content,
  title = 'Watch Dogs 2 Deluxe Edition',
  destination = url,
) => parseNuuvemResult(content, title, destination);
eq(parse(html).status, 'confirmed');
eq(parse(html.replace('Windows', 'PlayStation 5')).status, 'no-offer');
eq(
  parse(html.replace('product__available', 'product__soldout')).status,
  'unavailable',
);
eq(parse(html.replace('2099-01-01', '2000-01-01')).status, 'no-offer');
eq(parse('<html>New store layout</html>').status, 'parser-error');
eq(parse(html, 'Watch Dogs 2').status, 'no-offer');
eq(
  parse(
    html.replaceAll('Watch Dogs 2 Deluxe Edition', 'Resident Evil 4 Remake'),
    'Resident Evil 4',
  ).status,
  'no-offer',
);
eq(
  parse(
    html,
    'Watch Dogs 2 Deluxe Edition',
    'https://www.nuuvem.com.evil.test/br-pt/item/game',
  ).status,
  'parser-error',
);
eq(
  parse(
    html,
    'Watch Dogs 2 Deluxe Edition',
    'https://user:pass@www.nuuvem.com/br-pt/item/game',
  ).status,
  'parser-error',
);
eq(
  parseNuuvemCandidates(
    '<a href="https://www.nuuvem.com/br-pt/item/actual-slug">Game</a><a href="https://evil.test/br-pt/item/game">Other</a>',
  ),
  ['https://www.nuuvem.com/br-pt/item/actual-slug'],
);
eq(
  parse(
    html.replaceAll(
      'Watch Dogs 2 Deluxe Edition',
      'Watch_Dogs 2: Deluxe Edition',
    ),
  ).status,
  'confirmed',
);
eq(
  parse(
    html.replaceAll(
      'Watch Dogs 2 Deluxe Edition',
      'Watch_Dogs 2: Deluxe Edition',
    ),
    'Watch_Dogs 2',
  ).status,
  'no-offer',
);
eq(
  parse(
    html.replaceAll(
      'Watch Dogs 2 Deluxe Edition',
      'The Elder Scrolls V Skyrim: Special Edition',
    ),
    'The Elder Scrolls V: Skyrim Special Edition',
  ).status,
  'confirmed',
);
const realFetch = globalThis.fetch;
try {
  const requested = [];
  globalThis.fetch = async (target) => {
    requested.push(target instanceof Request ? target.url : target.toString());
    return new Response(
      html.replaceAll('Watch Dogs 2 Deluxe Edition', 'Resident Evil 4 Remake'),
    );
  };
  const mapped = await getNuuvemResult({
    appId: 2050650,
    title: 'Resident Evil 4',
    canonicalTitle: 'Resident Evil 4',
    kind: 'game',
  });
  eq(mapped.status, 'confirmed');
  eq(requested, ['https://www.nuuvem.com/br-pt/item/resident-evil-4-remake']);
  requested.length = 0;
  globalThis.fetch = async (target) => {
    requested.push(target instanceof Request ? target.url : target.toString());
    return new Response(
      (target instanceof Request ? target.url : target.toString()).includes(
        '/catalog/',
      )
        ? '<a href="https://www.nuuvem.com/br-pt/item/actual-catalog-slug">Game</a>'
        : html.replaceAll(
            'Watch Dogs 2 Deluxe Edition',
            'The Elder Scrolls V Skyrim: Special Edition',
          ),
    );
  };
  const discovered = await getNuuvemResult({
    appId: 489830,
    title: 'The Elder Scrolls V: Skyrim Special Edition',
    canonicalTitle: 'The Elder Scrolls V: Skyrim Special Edition',
    kind: 'game',
  });
  eq(discovered.status, 'confirmed');
  eq(
    requested[0],
    'https://www.nuuvem.com/br-pt/catalog/page/1/search/The%20Elder%20Scrolls%20V%20Skyrim%20Special%20Edition',
  );
  eq(
    discovered.offer.productUrl,
    'https://www.nuuvem.com/br-pt/item/actual-catalog-slug',
  );
} finally {
  globalThis.fetch = realFetch;
}

let calls = 0;
try {
  globalThis.fetch = async () => {
    calls++;
    return new Response(null, {
      status: 302,
      headers: { location: 'https://evil.test/steal' },
    });
  };
  await assert.rejects(() => fetchNuuvemHtml(url), /inseguro/);
  checks++;
  eq(calls, 1);
  globalThis.fetch = async (_url, { signal }) => {
    signal.throwIfAborted();
    return new Promise((_resolve, reject) =>
      signal.addEventListener('abort', () => reject(signal.reason), {
        once: true,
      }),
    );
  };
  await assert.rejects(
    () => fetchNuuvemHtml(url, AbortSignal.abort(new Error('timeout'))),
    /timeout/,
  );
  checks++;
} finally {
  globalThis.fetch = realFetch;
}
console.log(`nuuvem-edge-cases: ${checks} checks passed`);
