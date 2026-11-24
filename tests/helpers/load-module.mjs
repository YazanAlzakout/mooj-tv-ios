import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Execute the actual TS module with explicit native/network boundaries mocked.
export function loadModule(path, mocks) {
  const filename = resolve(process.env.REVIEW_SOURCE_ROOT ?? process.cwd(), path);
  const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  const nativeRequire = createRequire(filename);
  const require = id => {
    if (Object.hasOwn(mocks, id)) return mocks[id];
    if (id.startsWith('@/') || id.startsWith('expo')) throw new Error(`Unmocked dependency: ${id}`);
    return nativeRequire(id);
  };
  new Function('require', 'module', 'exports', source)(require, module, module.exports);
  return module.exports;
}
export function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
