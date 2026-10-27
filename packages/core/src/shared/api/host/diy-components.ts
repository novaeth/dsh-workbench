import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DshShell } from '@dsh-workbench/shared';
import { quoteShellArg, runShell } from '@dsh-workbench/shared/host';

export const SURFACE_TIMEOUT_MS = 30000;
export const EXCERPT_LINES = 60;
export const SUMMARY_PER_BUCKET = 12;
export const NEAR_LIMIT = 8;
export const PRUNE_CHARS = 8192;
export const PRIMITIVES_PKG = '@deepseek-ai/dsh-client-ui-primitives';

export const MANIFEST_TAIL = '//# sourceMappingURL=';

export type SurfaceScope = 'all' | 'primitives' | 'kit' | 'tokens';

export interface SurfacePayload {
  readonly [key: string]: unknown;
}

export interface SurfaceQuery {
  readonly primitives?: SurfacePayload;
  readonly kit?: SurfacePayload;
}

export function scopeOf(raw: string): SurfaceScope {
  if (raw === 'primitives' || raw === 'kit' || raw === 'tokens') return raw;
  return 'all';
}

export function wantsPrimitives(scope: SurfaceScope): boolean {
  return scope !== 'kit' && scope !== 'tokens';
}

export function wantsKit(scope: SurfaceScope): boolean {
  return scope !== 'primitives' && scope !== 'tokens';
}

export function toolchainBinOf(root: string): string | null {
  const bin = join(root, 'node_modules', '.bin', 'dsh-wb-module');
  if (existsSync(bin)) return bin;
  const script = join(root, 'node_modules', '@dsh-workbench', 'module-tools', 'bin', 'dsh-wb-module.mjs');
  return existsSync(script) ? script : null;
}

export function toolchainBinAmong(root: string, dirs: readonly string[]): string | null {
  const direct = toolchainBinOf(root);
  if (direct !== null) return direct;
  for (const dir of dirs) {
    const bin = toolchainBinOf(dir);
    if (bin !== null) return bin;
  }
  return null;
}

export function queryCommandOf(bin: string, only: 'kit' | 'primitives'): string {
  return `${quoteShellArg(bin)} check --only ${only} --json`;
}

export async function runSurfaceQuery(
  shell: DshShell,
  bin: string,
  only: 'kit' | 'primitives',
  root: string,
  fallbackBin?: string,
): Promise<SurfacePayload> {
  const result = await runShell(shell, queryCommandOf(bin, only), { workdir: root, timeoutMs: SURFACE_TIMEOUT_MS });
  const parsed = jsonOf(result.stdout);
  if (parsed !== null) return withoutProblems(parsed);
  const retry = fallbackBin === undefined || fallbackBin === bin ? undefined : fallbackBin;
  if (retry !== undefined) {
    const second = await runShell(shell, queryCommandOf(retry, only), {
      workdir: root,
      timeoutMs: SURFACE_TIMEOUT_MS,
    });
    const secondParsed = jsonOf(second.stdout);
    if (secondParsed !== null) return withoutProblems(secondParsed);
  }
  if (result.exitCode !== 0) {
    const tail = `${result.stderr}\n${result.stdout}`.trim().split('\n').slice(-3).join(' | ');
    throw new Error(
      `工具链的 \`check --only ${only} --json\` 没跑通（exit ${String(result.exitCode)}）—— ` +
        `这不是工具链坏了，是工作区里有模块过不了判据，所以连清单也没打出来${tail === '' ? '' : `：${tail}`}`,
    );
  }
  throw new Error(
    `工具链的 \`check --only ${only} --json\` 没回 JSON：${result.stdout.trim().split('\n').slice(-2).join(' | ')}` +
      (retry === undefined
        ? ` —— 这份工具链可能太旧（没有 --json）：在 ${root} 里把 @dsh-workbench/module-tools 升到 ^0.3.4（pnpm install）`
        : ' —— 连跑着的那份外壳自带的工具链也没回 JSON，这条得问人'),
  );
}

function jsonOf(stdout: string): SurfacePayload | null {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return typeof parsed === 'object' && parsed !== null ? (parsed as SurfacePayload) : null;
  } catch {
    return null;
  }
}

function withoutProblems(payload: SurfacePayload): SurfacePayload {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key !== 'problems') rest[key] = value;
  }
  return rest;
}

function recordOf(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function stringsOf(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : [];
}

export function filesOf(payload: SurfacePayload | undefined): Record<string, string> {
  const files = recordOf(payload?.['files']);
  const out: Record<string, string> = {};
  for (const [name, file] of Object.entries(files)) if (typeof file === 'string') out[name] = file;
  return out;
}

export function rootsOf(payload: SurfacePayload | undefined): Record<string, string> {
  const roots = recordOf(payload?.['roots']);
  const out: Record<string, string> = {};
  for (const [key, dir] of Object.entries(roots)) if (typeof dir === 'string') out[key] = dir;
  return out;
}

export function countsOf(payload: SurfacePayload | undefined): Record<string, number> {
  const counts = recordOf(payload?.['counts']);
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(counts)) if (typeof value === 'number') out[key] = value;
  return out;
}

export function installedVersionOf(payload: SurfacePayload | undefined): string | null {
  const version = recordOf(payload?.['installed'])['version'];
  return typeof version === 'string' ? version : null;
}

function distance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_unused, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      const same = left[row - 1] === right[column - 1] ? 0 : 1;
      current.push(Math.min((previous[column] ?? 0) + 1, (current[column - 1] ?? 0) + 1, (previous[column - 1] ?? 0) + same));
    }
    previous = current;
  }
  return previous[right.length] ?? 0;
}

export function nearNamesOf(name: string, names: readonly string[], limit = NEAR_LIMIT): readonly string[] {
  const wanted = name.toLowerCase();
  return names
    .flatMap((one) => {
      const lower = one.toLowerCase();
      if (lower.length < 3) return lower === wanted ? [{ one, score: 0 }] : [];
      if (lower.includes(wanted)) return [{ one, score: 0 }];
      if (wanted.includes(lower)) return [{ one, score: 1 }];
      const typos = distance(lower, wanted);
      return typos <= 2 ? [{ one, score: typos + 1 }] : [];
    })
    .sort((left, right) => left.score - right.score || left.one.length - right.one.length || left.one.localeCompare(right.one))
    .slice(0, limit)
    .map((one) => one.one);
}

export function findFileOf(name: string, query: SurfaceQuery): { readonly file: string; readonly from: 'kit' | 'primitives' } | null {
  const primitives = filesOf(query.primitives)[name];
  if (primitives !== undefined) return { file: primitives, from: 'primitives' };
  const kit = filesOf(query.kit)[name];
  return kit === undefined ? null : { file: kit, from: 'kit' };
}

export function excerptOf(text: string, maxLines = EXCERPT_LINES): string {
  const cutAt = text.indexOf(MANIFEST_TAIL);
  const body = (cutAt === -1 ? text : text.slice(0, cutAt)).trimEnd();
  const lines = body.split('\n');
  return lines.length <= maxLines ? body : `${lines.slice(0, maxLines).join('\n')}\n…（这份文件还有 ${String(lines.length - maxLines)} 行）`;
}

export function excerptAt(file: string, maxLines = EXCERPT_LINES): string {
  try {
    return excerptOf(readFileSync(file, 'utf8'), maxLines);
  } catch {
    return '（打不开那份类型文件 —— 照上面的路径自己看一眼）';
  }
}

export function skillDirOf(from: string): string | null {
  let dir = from;
  for (let hop = 0; hop < 6; hop += 1) {
    const candidate = join(dir, 'skills', 'workbench-module-diy');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

function truncated(names: readonly string[], all: boolean): string {
  if (all || names.length <= SUMMARY_PER_BUCKET) return names.join(', ');
  return `${names.slice(0, SUMMARY_PER_BUCKET).join(', ')} …+${String(names.length - SUMMARY_PER_BUCKET)}`;
}

export function byLocationOf(payload: SurfacePayload): readonly { readonly where: string; readonly names: readonly string[] }[] {
  const roots = Object.values(rootsOf(payload)).sort((left, right) => right.length - left.length);
  const groups = new Map<string, string[]>();
  for (const [name, file] of Object.entries(filesOf(payload))) {
    const root = roots.find((one) => file === one || file.startsWith(`${one}/`));
    const rest = root === undefined ? file.split('/').slice(-2).join('/') : file.slice(root.length + 1);
    const where = rest.split('/').slice(0, -1).join('/') || '.';
    const bucket = groups.get(where);
    if (bucket === undefined) groups.set(where, [name]);
    else bucket.push(name);
  }
  return [...groups.entries()]
    .map(([where, names]) => ({ where, names: [...names].sort() }))
    .sort((left, right) => right.names.length - left.names.length || left.where.localeCompare(right.where));
}

function isComponents(where: string): boolean {
  return where.split('/').at(-1) === 'components';
}

export interface SurfaceBucket {
  readonly label: string;
  readonly key: string;
  readonly names: readonly string[];
}

export function kitBucketsOf(payload: SurfacePayload): readonly SurfaceBucket[] {
  const groups = byLocationOf(payload);
  const components = groups
    .filter((one) => isComponents(one.where))
    .flatMap((one) => one.names)
    .sort();
  return [
    ...(components.length === 0 ? [] : [{ label: '组件', key: 'components', names: components }]),
    ...groups
      .filter((one) => !isComponents(one.where))
      .map((one) => ({ label: one.where, key: one.where, names: one.names })),
  ];
}

export function matchesBucket(where: string, bucket: string): boolean {
  const wanted = bucket.trim().toLowerCase();
  if (wanted === '') return false;
  const one = where.trim().toLowerCase();
  return one === wanted || one.split('/').at(-1) === wanted;
}

function primitiveBucketsOf(
  payload: SurfacePayload,
): readonly { readonly bucket: string; readonly names: readonly string[] }[] {
  return Object.entries(recordOf(payload['onlyPrimitives']))
    .map(([bucket, value]) => ({ bucket, names: [...stringsOf(value)].sort() }))
    .filter((one) => one.names.length > 0);
}

export function bucketNamesOf(
  query: SurfaceQuery,
): readonly { readonly face: 'kit' | 'primitives'; readonly keys: readonly string[] }[] {
  const out: { face: 'kit' | 'primitives'; keys: readonly string[] }[] = [];
  if (query.kit !== undefined) {
    const keys = kitBucketsOf(query.kit).map((one) => one.key);
    if (keys.length > 0) out.push({ face: 'kit', keys });
  }
  if (query.primitives !== undefined) {
    const keys = primitiveBucketsOf(query.primitives).map((one) => one.bucket);
    if (keys.length > 0) out.push({ face: 'primitives', keys });
  }
  return out;
}

export const TWO_FACE_ALL =
  '⚠️ 要全表就指名一面：scope=kit / primitives / tokens。';

export function refusesEvery(scope: SurfaceScope, all: boolean, focused: boolean): boolean {
  return all && scope === 'all' && !focused;
}

export function renderSurfaceText(
  query: SurfaceQuery,
  options: { scope: SurfaceScope; all: boolean; bucket?: string },
): string {
  const bucket = (options.bucket ?? '').trim();
  const focused = bucket !== '';
  if (refusesEvery(options.scope, options.all, focused)) return TWO_FACE_ALL;
  const both = options.scope === 'all';
  const every = options.all && !both;
  let hit = false;
  const lines: string[] = [];
  const kitNames = Object.keys(filesOf(query.kit)).sort();
  if (query.kit !== undefined) {
    const groups = byLocationOf(query.kit);
    if (kitNames.length === 0 && groups.length === 0) {
      const anyNames = [...new Set(Object.values(recordOf(query.kit['buckets'])).flatMap((value) => stringsOf(value)))].sort();
      lines.push(anyNames.length === 0 ? 'kit：读不到（没找到 client.js）' : `kit：类型面扫不到，只有名字 ${truncated(anyNames, every)}`);
    } else {
      const buckets = kitBucketsOf(query.kit);
      lines.push(`kit ${kitNames.length}：${buckets.map((one) => `${one.label} ${one.names.length}`).join(' · ')}`);
      if (focused) {
        const matched = buckets.filter((one) => matchesBucket(one.key, bucket));
        for (const one of matched) lines.push(`  ${one.label}(${one.names.length})：${one.names.join(', ')}`);
        if (matched.length > 0) hit = true;
      } else {
        for (const one of buckets) lines.push(`  ${one.label}(${one.names.length})：${truncated(one.names, every)}`);
      }
    }
  }
  if (query.primitives !== undefined) {
    const version = installedVersionOf(query.primitives);
    const only = primitiveBucketsOf(query.primitives);
    const covered = (Array.isArray(query.primitives['kitCovered']) ? query.primitives['kitCovered'] : [])
      .map((one) => recordOf(one)['name'])
      .filter((one): one is string => typeof one === 'string');
    if (version === null) {
      const want = asText(recordOf(recordOf(query.primitives['snippet'])['devDependency'])['version']);
      lines.push(`原语：没装 —— devDependencies 加 "${PRIMITIVES_PKG}": "${want === '' ? '<外壳钉的那版>' : want}" 再 pnpm install`);
    } else if (focused) {
      lines.push(`原语 ${version}${only.length === 0 ? '' : `：只有它有 ${only.map((one) => `${one.bucket} ${one.names.length}`).join(' · ')}`}`);
      const matched = only.filter((one) => matchesBucket(one.bucket, bucket));
      for (const one of matched) lines.push(`  ${one.bucket}(${one.names.length})：${one.names.join(', ')}`);
      if (matched.length > 0) hit = true;
    } else {
      lines.push(`原语 ${version}${only.length === 0 ? '' : `：只有它有 ${only.map((one) => `${one.bucket} ${truncated(one.names, every)}`).join(' · ')}`}`);
    }
    if (only.length > 0 && version !== null) lines.push('（只有原语有的，用之前先在 dsh.client.external 里声明）');
    if (covered.length > 0) lines.push(`kit 里已有：${covered.join(', ')}`);
  }
  if (focused && !hit) {
    const keys = bucketNamesOf(query);
    lines.push(
      keys.length === 0
        ? `没有「${bucket}」这一桶，这次也读不到任何桶。`
        : `没有「${bucket}」这一桶。可用的桶：${keys.map((one) => `${one.face} → ${one.keys.join(' / ')}`).join('；')}`,
    );
  }
  const roots = [
    ...Object.entries(rootsOf(query.kit)).map(([key, dir]) => `${key}=${dir}`),
    ...Object.entries(rootsOf(query.primitives)).map(([key, dir]) => `${key}=${dir}`),
  ];
  if (roots.length > 0) lines.push(`类型面：${roots.join(' · ')}`);
  const text = lines.join('\n');
  if (text.length <= PRUNE_CHARS) return text;
  const commands = (options.scope === 'all' ? ['kit', 'primitives'] : [options.scope])
    .map((one) => `\`dsh-wb-module check --only ${one} --all\``)
    .join(' 或 ');
  return [
    `⚠️ 这份清单 ${String(text.length)} 字符，超过 ${String(PRUNE_CHARS)} 会被修剪器裁掉中间 —— 按桶问装得下；要一份全的走 shell：${commands} 再 grep。`,
    '   （shell 那份按 barrel 列，计数比这里的落点分组大 —— 两边口径不同。）',
    '',
    text,
  ].join('\n');
}

export function listedNamesOf(query: SurfaceQuery): readonly string[] {
  const out = new Set<string>([...Object.keys(filesOf(query.primitives)), ...Object.keys(filesOf(query.kit))]);
  for (const payload of [query.primitives, query.kit]) {
    if (payload === undefined) continue;
    for (const value of Object.values(recordOf(payload['buckets']))) {
      for (const one of stringsOf(value)) out.add(one);
    }
    for (const value of Object.values(recordOf(payload['onlyPrimitives']))) {
      for (const one of stringsOf(value)) out.add(one);
    }
    for (const one of Array.isArray(payload['kitCovered']) ? payload['kitCovered'] : []) {
      const covered = asText(recordOf(one)['name']);
      if (covered !== '') out.add(covered);
    }
  }
  return [...out].sort();
}

export type FaceState = 'not-queried' | 'ok' | 'unreadable';

export function faceStateOf(query: SurfaceQuery, face: 'kit' | 'primitives'): FaceState {
  const payload = face === 'kit' ? query.kit : query.primitives;
  if (payload === undefined) return 'not-queried';
  if (face === 'primitives') {
    const named = Object.keys(filesOf(payload)).length > 0 || Object.keys(recordOf(payload['onlyPrimitives'])).length > 0;
    return installedVersionOf(payload) === null || !named ? 'unreadable' : 'ok';
  }
  const readable = Object.keys(filesOf(payload)).length > 0 || Object.keys(rootsOf(payload)).length > 0;
  return readable ? 'ok' : 'unreadable';
}

function installSnippetOf(query: SurfaceQuery): string {
  const dependency = recordOf(recordOf(query.primitives?.['snippet'])['devDependency']);
  const name = asText(dependency['name']) || PRIMITIVES_PKG;
  const version = asText(dependency['version']);
  return `devDependencies 加 "${name}": "${version === '' ? '<外壳钉的那版>' : version}" 再 pnpm install`;
}

export function renderNameText(
  name: string,
  found: { readonly file: string; readonly from: 'kit' | 'primitives' } | null,
  query: SurfaceQuery,
): string {
  if (found === null) {
    const every = listedNamesOf(query);
    const listed = every.includes(name);
    const near = nearNamesOf(name, every).filter((one) => one !== name);
    const kit = faceStateOf(query, 'kit');
    const primitives = faceStateOf(query, 'primitives');
    const said = [kit === 'ok' ? 'kit 里没有' : '', primitives === 'ok' ? '原语里也没有' : ''].filter((one) => one !== '');
    const blind = [
      kit === 'ok' ? '' : `kit 那一面${kit === 'not-queried' ? '没查' : '读不到'}`,
      primitives === 'ok' ? '' : `原语那一面${primitives === 'not-queried' ? '没查' : '读不到（没装）'}`,
    ].filter((one) => one !== '');
    const how =
      primitives === 'unreadable'
        ? `${installSnippetOf(query)}，才敢说它在不在。`
        : kit === 'unreadable'
          ? '把这份外壳装上（让 client.js 读得到）再问。'
          : '不给 scope 就都查。';
    const lines = [
      ...(listed
        ? [`「${name}」在清单里（${String(every.length)} 个名字里有它），但扫不到它的类型文件 —— 类型面读不到，或这代外壳的声明形状变了。`]
        : kit === 'ok' && primitives === 'ok'
          ? [`没有「${name}」这个东西（kit 与原语里都没有）。`]
              : said.length > 0
            ? [`「${name}」${said.join('，')}。`, ...(blind.length === 0 ? [] : [`${blind.join('、')} —— ${how}`])]
            : [`没法确认「${name}」在不在：${blind.join('、')} —— ${how}`]),
    ];
    if (near.length > 0) lines.push(`近似的名字：${near.join(', ')}`);
    return lines.join('\n');
  }
  const body = excerptAt(found.file);
  const head = `${name} → ${found.file}（${found.from === 'kit' ? 'kit' : '原语'}）`;
  if (body.includes('/**')) {
    const note =
      found.from === 'kit'
        ? '（上面就是它的声明与 JSDoc —— 用法、默认值、边界都在里面。跨件的口径与最小写法看 KIT.md）'
        : '（上面就是它的声明与 JSDoc —— 用法与默认值都在里面。原语件要先在 dsh.client.external 里声明它）';
    return [head, '', body, '', note].join('\n');
  }
  const skillDir = skillDirOf(dirname(fileURLToPath(import.meta.url)));
  const docs = 'KIT.md（组件怎么拼）· LINKAGE.md / PANEL.md / TOOLS.md（取数 / 写 / 长任务）';
  const second =
    skillDir === null
      ? '这份外壳连指引也没装 —— 升级它。'
      : `跨件的口径看 ${docs}。`;
  const missing =
    found.from === 'kit'
      ? `（声明没说明文字（没有 JSDoc）—— kit 的每个成员都该有，selfcheck 里有一条自检钉着；多半是你手上这份外壳比工具旧，升级外壳与工坊工具链再看。${second}）`
      : `（声明没说明文字（没有 JSDoc）—— 装机那份原语本该自带；升级它再看。${second}）`;
  return [head, '', body, '', missing].join('\n');
}
