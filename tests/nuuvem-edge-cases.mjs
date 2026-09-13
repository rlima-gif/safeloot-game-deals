import fs from 'node:fs';
import assert from 'node:assert/strict';
import { moduleUrl } from './load-ts.mjs';
const { parseNuuvemResult, parseNuuvemCandidates, fetchNuuvemHtml } =
  await import(moduleUrl('lib/connectors/nuuvem.ts'));
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
const realFetch = globalThis.fetch;
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
