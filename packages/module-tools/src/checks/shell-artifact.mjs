import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const SHELL = '@dsh-workbench/core';

function defaultReact() {
  const stub = () => null;
  return new Proxy(
    { default: stub, Component: class {} },
    { get: (target, key) => (key in target ? target[key] : stub) },
  );
}

function defaultSeed() {
  const stub = () => null;
  return new Proxy(
    { default: stub },
    { get: (target, key) => (key in target ? target[key] : stub) },
  );
}

export function shellClientPathOf(pkgDir) {
  const override = process.env.DSH_WB_CORE_CLIENT;
  if (override !== undefined && override.trim() !== '') return override.trim();
  try {
    const require = createRequire(join(pkgDir, 'package.json'));
    return join(dirname(require.resolve(`${SHELL}/package.json`)), 'client.js');
  } catch {
    return undefined;
  }
}

export function shellKitOf(clientPath, options = {}) {
  const react = options.react ?? defaultReact();
  const seed = options.dshPackage ?? defaultSeed();
  let exports;
  const load = (registration) => {
    exports = registration.factory((specifier) => {
      if (specifier === 'react' || specifier === 'react/jsx-runtime' || specifier === 'react-dom') {
        return react;
      }
      if (specifier.startsWith('@deepseek-ai/')) return seed;
      if (specifier === SHELL) return exports;
      throw new Error(`外壳产物里出现了一个不认识的 require("${specifier}")`);
    });
  };
  const window = { __ModuleLoader__: { load } };
  new Function('window', readFileSync(clientPath, 'utf8'))(window);
  return exports?.kit ?? {};
}
