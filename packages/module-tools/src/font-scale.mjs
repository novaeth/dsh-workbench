import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export const DSH_ALIAS_FONT_SIZES = [11, 12, 13, 14, 16, 20, 24];

const SHELL_FONT_TOKEN = /--wb-font-[a-z0-9-]+\s*:\s*([0-9]+(?:\.[0-9]+)?)px/g;

export function shellFontScaleIn(files) {
  const sizes = new Set();
  for (const file of files) {
    if (!existsSync(file)) continue;
    for (const hit of readFileSync(file, 'utf8').matchAll(SHELL_FONT_TOKEN)) {
      sizes.add(Number(hit[1]));
    }
  }
  return sizes;
}

export function fontScaleOf(shellTokenFiles = []) {
  return new Set([...DSH_ALIAS_FONT_SIZES, ...shellFontScaleIn(shellTokenFiles)]);
}

const CSS_FONT_SIZE = /(?:^|[;{\s])font-size\s*:\s*([^;{}]+)/g;
const CSS_FONT_SHORTHAND = /(?:^|[;{\s])font\s*:\s*([^;{}]+)/g;
const JS_FONT_SIZE = /\bfontSize\s*[:=]\s*\{?\s*(['"]?)([^,}'"\n]+)\1\s*\}?/g;
const FONT_TOKEN_REF = /var\(\s*(--[a-z0-9-]*font[a-z0-9-]*)/g;

const FONT_FAMILY_TOKEN = /font-(?:family|mono)/;
const NUMERIC_VALUE = /^([0-9]*\.?[0-9]+)(px|rem|em|%)?$/;

function sizeTokenRefs(value) {
  const names = [];
  for (const hit of value.matchAll(FONT_TOKEN_REF)) {
    if (!FONT_FAMILY_TOKEN.test(hit[1])) names.push(hit[1]);
  }
  return names;
}

export function classifyFontValue(value) {
  const raw = String(value).trim();
  const refs = sizeTokenRefs(raw);
  if (refs.length > 0) return { kind: 'ref', refs };
  const first = (raw.split(/\s+/)[0] ?? '').replace(/\/.*$/, '');
  const hit = NUMERIC_VALUE.exec(first);
  if (hit === null) return { kind: 'keyword', value: first };
  const unit = hit[2] ?? 'px';
  if (unit === 'em' || unit === '%') return { kind: 'relative', value: first };
  const px = unit === 'rem' ? Number(hit[1]) * 16 : Number(hit[1]);
  return { kind: 'size', px, value: first };
}

function isTestSource(file) {
  return /(^|[\\/])__tests__[\\/]/.test(file) || /\.test\.[cm]?tsx?$/.test(file);
}

function walk(dir, acc = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(css|ts|tsx)$/.test(full)) acc.push(full);
  }
  return acc;
}

export function auditFontSizes({ roots, scale }) {
  const refs = [];
  const offScale = [];
  const onScale = [];
  const relativeSizes = [];
  const refFiles = new Set();
  const litFiles = new Set();
  for (const root of roots) {
    for (const file of walk(root.dir)) {
      if (!/\.css$/.test(file) && isTestSource(file)) continue;
      let text;
      try {
        text = readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const rel = relative(root.dir, file);
      text.split('\n').forEach((line, at) => {
        const values = [];
        for (const hit of line.matchAll(CSS_FONT_SIZE)) values.push({ value: hit[1], decl: hit[0] });
        for (const hit of line.matchAll(CSS_FONT_SHORTHAND)) values.push({ value: hit[1], decl: hit[0] });
        for (const hit of line.matchAll(JS_FONT_SIZE)) values.push({ value: hit[2], decl: hit[0] });
        for (const one of values) {
          const verdict = classifyFontValue(one.value);
          if (verdict.kind === 'keyword') continue;
          const where = {
            pkg: root.label,
            file: rel,
            line: at + 1,
            decl: one.decl.replace(/^[;{\s]+/, '').trim().slice(0, 56),
          };
          if (verdict.kind === 'ref') {
            refFiles.add(`${root.label}:${rel}`);
            refs.push(where);
            continue;
          }
          litFiles.add(`${root.label}:${rel}`);
          if (verdict.kind === 'relative') {
            relativeSizes.push({ ...where, px: verdict.value });
          } else if (scale.has(verdict.px)) {
            onScale.push({ ...where, px: verdict.px });
          } else {
            offScale.push({ ...where, px: verdict.px });
          }
        }
      });
    }
  }
  return { refs, offScale, onScale, relative: relativeSizes, refFiles, litFiles };
}

const formatSize = (value) => String(value);

const DETAIL_LIMIT = 12;

function detailOf(hit, verdict) {
  const head = `${hit.pkg}: ${hit.file}:${hit.line} ${hit.decl}`;
  return verdict === 'off'
    ? `· ${head} —— ${formatSize(hit.px)} 不在刻度上（刻度外）`
    : `· ${head} —— ${formatSize(hit.px)} 在刻度上，可收进令牌（但不是错）`;
}

export function fontScaleNotes(report, scale, { doc }) {
  const sizes = [...scale].sort((a, b) => a - b).map(formatSize).join(' / ');
  const head =
    `字号口径（黄，不判红）：刻度 ${sizes}（从 --dsw-font-* 与 --wb-font-* 的**定义**读出来，` +
    `出处见 ${doc}）；引用令牌 ${report.refs.length} 处 / ${report.refFiles.size} 文件（合规，不列）；` +
    `刻度外字面值 ${report.offScale.length} 处 / ${report.litFiles.size} 文件；` +
    `刻度上字面值 ${report.onScale.length} 处；相对单位（em/%）判不了 ${report.relative.length} 处`;
  const all = [
    ...report.offScale.map((hit) => detailOf(hit, 'off')),
    ...report.onScale.map((hit) => detailOf(hit, 'on')),
  ];
  if (all.length === 0) {
    return [`${head} —— 面板的字号全走令牌，一处刻度外的字面值都没有`];
  }
  const notes = [head, ...all.slice(0, DETAIL_LIMIT)];
  if (all.length > DETAIL_LIMIT) {
    notes.push(
      `…另有 ${all.length - DETAIL_LIMIT} 处（刻度外 ${report.offScale.length} / 刻度上 ${report.onScale.length}）` +
        `没列出（这里最多列 ${DETAIL_LIMIT} 行）；口径与出处见 ${doc}`,
    );
  }
  return notes;
}
