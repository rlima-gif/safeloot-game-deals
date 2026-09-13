import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const cache = new Map();
export function moduleUrl(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full);
  const compiled = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText;
  const linked = compiled.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => {
    if (specifier.startsWith('@/'))
      return `from '${moduleUrl(specifier.replace('@/', ''))}'`;
    if (specifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(full), specifier);
      return `from '${moduleUrl(fs.existsSync(resolved) ? resolved : `${resolved}.ts`)}'`;
    }
    return `from '${specifier}'`;
  });
  const url =
    'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
  cache.set(full, url);
  return url;
}
