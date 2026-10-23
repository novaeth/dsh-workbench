import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import ts from 'typescript';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PKG_URL = new URL('../../', import.meta.url);
const strip = (path) => path.replace(/[/\\]+$/, '');
export const PKG = strip(fileURLToPath(PKG_URL));
export const REPO = strip(fileURLToPath(new URL('../../../../', import.meta.url)));
export const SRC = join(PKG, 'src');
export const SHARED_SRC = join(PKG, '../shared/src');

export const pkg = (rel) => join(PKG, rel);

const textCache = new Map();

export function read(path) {
  const key = typeof path === 'string' ? path : fileURLToPath(path);
  if (!textCache.has(key)) textCache.set(key, readFileSync(key, 'utf8'));
  return textCache.get(key);
}

const JUNK = new Set(['node_modules', 'dist', 'coverage', '.git']);

export function walk(dir, { withTests = false } = {}) {
  const out = [];
  const visit = (here) => {
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      if (JUNK.has(entry.name)) continue;
      if (!withTests && entry.name === '__tests__') continue;
      const full = join(here, entry.name);
      if (entry.isDirectory()) visit(full);
      else out.push(full);
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

export function sourceIndex() {
  const out = [];
  for (const root of [SRC, SHARED_SRC]) {
    if (!existsSync(root)) continue;
    for (const name of readdirSync(root, { recursive: true })) {
      if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
      out.push({ name, source: read(join(root, name)) });
    }
  }
  return out;
}

export function allSourceCss() {
  return walk(SRC)
    .filter((file) => file.endsWith('.css'))
    .map((file) => read(file))
    .join('\n');
}

const DIRECTIVE = /^(?:\/\/|\/\*)\s*(?:!?\s*@(?:license|preserve)\b|eslint-(?:disable|enable)\b|@ts-(?:ignore|expect-error|nocheck|check)\b|@vitest-|@jest-|@flow\b|@jsx|prettier-ignore\b|global\b|exported\b|c8\b|v8\b|istanbul\b|#\s*sourceMappingURL\b|@__PURE__|#__PURE__|\/?\s*<reference\b)/u;

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.css']);
const CODE_SKIP = new Set([...JUNK, 'private-docs', '.verify', '.pnpm-store', '.worktrees', 'golden']);

const SHARED_ENTRIES = ['index.ts', 'host.ts', 'testing.ts'];
const SHELL_CLIENT = 'packages/workbench/src/app/client.tsx';
const publicSurfaceCache = { files: undefined };

function resolveLocalModule(fromFile, spec) {
  const clean = spec.replace(/\.js$/, '');
  let base;
  if (clean.startsWith('@/')) base = join(SRC, clean.slice(2));
  else if (clean.startsWith('.')) base = resolve(dirname(fromFile), clean);
  else return undefined;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return undefined;
}

function sharedEntryFiles() {
  const out = [];
  for (const entry of SHARED_ENTRIES) {
    const file = join(SHARED_SRC, entry);
    if (!existsSync(file)) continue;
    out.push(file);
    for (const match of read(file).matchAll(/from\s+'(\.[^']+)'/g)) {
      const resolved = resolveLocalModule(file, match[1]);
      if (resolved !== undefined) out.push(resolved);
    }
  }
  return out;
}

function importedBindings(source) {
  const bindings = new Map();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const specifier = statement.moduleSpecifier;
    if (!ts.isStringLiteral(specifier)) continue;
    const clause = statement.importClause;
    if (clause === undefined) continue;
    if (clause.name !== undefined) bindings.set(clause.name.text, specifier.text);
    const named = clause.namedBindings;
    if (named === undefined) continue;
    if (ts.isNamespaceImport(named)) {
      bindings.set(named.name.text, specifier.text);
      continue;
    }
    for (const element of named.elements) bindings.set(element.name.text, specifier.text);
  }
  return bindings;
}

function kitObjectOf(source) {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== 'kit') continue;
      if (declaration.initializer !== undefined && ts.isObjectLiteralExpression(declaration.initializer)) {
        return declaration.initializer;
      }
    }
  }
  return undefined;
}

function kitIdentifiersOf(object) {
  const names = new Set();
  const visit = (node) => {
    for (const property of node.properties) {
      if (ts.isShorthandPropertyAssignment(property)) names.add(property.name.text);
      else if (ts.isSpreadAssignment(property) && ts.isIdentifier(property.expression)) {
        names.add(property.expression.text);
      } else if (ts.isPropertyAssignment(property)) {
        if (ts.isIdentifier(property.initializer)) names.add(property.initializer.text);
        else if (ts.isObjectLiteralExpression(property.initializer)) visit(property.initializer);
      }
    }
  };
  visit(object);
  return names;
}

function kitSourceFiles() {
  const file = join(REPO, SHELL_CLIENT);
  if (!existsSync(file)) return [];
  const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const kit = kitObjectOf(source);
  if (kit === undefined) return [];
  const bindings = importedBindings(source);
  const out = [];
  for (const name of kitIdentifiersOf(kit)) {
    const specifier = bindings.get(name);
    if (specifier === undefined) continue;
    const resolved = resolveLocalModule(file, specifier);
    if (resolved !== undefined) out.push(resolved);
  }
  return out;
}

export function publicSurfaceFiles() {
  if (publicSurfaceCache.files !== undefined) return publicSurfaceCache.files;
  const files = new Set();
  for (const file of [...sharedEntryFiles(), ...kitSourceFiles()]) {
    files.add(relative(REPO, file).split('\\').join('/'));
  }
  publicSurfaceCache.files = files;
  return files;
}

export function allowsJsDoc(rel) {
  return publicSurfaceFiles().has(rel);
}

export function walkCode(dir = REPO) {
  const out = [];
  const visit = (here) => {
    for (const entry of readdirSync(here, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!CODE_SKIP.has(entry.name)) visit(join(here, entry.name));
        continue;
      }
      if (!entry.isFile() || entry.name === 'client.js') continue;
      if (CODE_EXT.has(entry.name.slice(entry.name.lastIndexOf('.')))) out.push(join(here, entry.name));
    }
  };
  if (existsSync(dir)) visit(dir);
  return out;
}

function tsCommentRanges(text) {
  const source = ts.createSourceFile('scan.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Map();
  const add = (ranges) => {
    for (const range of ranges ?? []) found.set(range.pos, range);
  };
  const visit = (node) => {
    add(ts.getLeadingCommentRanges(text, node.getFullStart()));
    add(ts.getTrailingCommentRanges(text, node.getEnd()));
    ts.forEachChild(node, visit);
  };
  visit(source);
  add(ts.getLeadingCommentRanges(text, 0));
  add(ts.getTrailingCommentRanges(text, text.length));
  return [...found.values()].sort((a, b) => a.pos - b.pos);
}

function cssCommentRanges(text) {
  const found = [];
  let at = 0;
  let quote = null;
  while (at < text.length) {
    const ch = text[at];
    if (quote !== null) {
      if (ch === '\\') at += 2;
      else {
        if (ch === quote) quote = null;
        at += 1;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      at += 1;
      continue;
    }
    if (ch === '/' && text[at + 1] === '*') {
      const end = text.indexOf('*/', at + 2);
      if (end === -1) break;
      found.push({ pos: at, end: end + 2 });
      at = end + 2;
      continue;
    }
    at += 1;
  }
  return found;
}

function followedByExport(text, end) {
  return /^\s*export\b/u.test(text.slice(end));
}

export function commentViolationsOf(text, { css = false, allowJsDoc = false } = {}) {
  const ranges = css
    ? cssCommentRanges(text)
    : tsCommentRanges(text).map((range) => ({ pos: range.pos, end: range.end }));
  const bad = [];
  for (const range of ranges) {
    const raw = text.slice(range.pos, range.end);
    if (!css && DIRECTIVE.test(raw)) continue;
    if (!css) {
      const jsdoc = raw.startsWith('/**') && raw !== '/**/';
      if (allowJsDoc && jsdoc && followedByExport(text, range.end)) continue;
    }
    bad.push(text.slice(0, range.pos).split('\n').length);
  }
  return bad;
}

export function fakeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(key, value) {
      this.headers[key] = value;
    },
    end(chunk) {
      this.body = chunk ?? '';
    },
  };
}

export const fakePost = (url, body) => ({
  method: 'POST',
  url,
  async *[Symbol.asyncIterator]() {
    yield Buffer.from(body, 'utf8');
  },
});

export function fakeStreamRes() {
  const chunks = [];
  return {
    statusCode: 0,
    headers: {},
    chunks,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    writeHead(status, headers) {
      this.statusCode = status;
      Object.assign(this.headers, headers);
    },
    write(chunk) {
      chunks.push(chunk);
    },
    end() {},
    on() {},
  };
}

export function makeFakeDom(injectedStyles, isSeatOnScreen) {
  const created = [];
  const node = (tagName) => {
    const element = {
      tagName,
      className: '',
      id: '',
      textContent: '',
      hidden: false,
      inert: false,
      dataset: {},
      children: [],
      attrs: {},
      setAttribute(name, value) {
        this.attrs[name] = value;
      },
      addEventListener() {},
      remove() {},
      append(...kids) {
        this.children.push(...kids);
      },
      appendChild(kid) {
        this.children.push(kid);
        return kid;
      },
      replaceChildren(...kids) {
        this.children = [...kids];
      },
    };
    created.push(element);
    return element;
  };
  const body = node('body');
  const head = node('head');

  head.appendChild = (kid) => {
    injectedStyles.push(kid);
    head.children.push(kid);
    return kid;
  };
  const root = node('div');
  root.id = 'root';
  return {
    created,
    body,
    head,
    createElement: node,

    createElementNS: (_namespace, tagName) => node(tagName),
    getElementById: (id) => (id === 'root' ? root : null),
    querySelector: (selector) =>
      selector === '[data-sidebar-right-session]' && isSeatOnScreen() ? node('div') : null,
  };
}
