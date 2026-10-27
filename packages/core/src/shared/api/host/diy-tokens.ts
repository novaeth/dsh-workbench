import type { TokenEntry, TokenSet } from '@dsh-workbench/shared/host';
import { nearestTokens, tokenFamilyOf } from '@dsh-workbench/shared/host';
import { PRUNE_CHARS } from './diy-components';

export interface TokenRenderOptions {
  readonly name: string;
  readonly bucket: string;
  readonly all: boolean;
  readonly searched: readonly string[];
}

const TOKEN_WB = 'wb';

function tokenValueText(entry: TokenEntry): string {
  const { light, dark } = entry.values;
  if (light !== null && dark !== null) return light === dark ? `值 ${light}` : `浅 ${light} / 深 ${dark}`;
  if (light !== null) return `值 ${light}`;
  if (dark !== null) return `只深色 ${dark}`;
  return '没读到值';
}

function truncatedValue(entry: TokenEntry): string {
  const text = tokenValueText(entry);
  return text.length <= 64 ? text : `${text.slice(0, 60)}…`;
}

function familyNamesOf(entries: readonly TokenEntry[]): readonly { readonly family: string; readonly names: readonly string[] }[] {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const family = tokenFamilyOf(entry.name);
    const bucket = groups.get(family);
    if (bucket === undefined) groups.set(family, [entry.name]);
    else bucket.push(entry.name);
  }
  return [...groups.entries()]
    .map(([family, names]) => ({ family, names: [...names].sort() }))
    .sort((left, right) => right.names.length - left.names.length || left.family.localeCompare(right.family));
}

function sourceText(set: TokenSet, searched: readonly string[]): string {
  const dsw = set.dsw;
  const wb = set.wb;
  const dswPart =
    dsw === null
      ? `--dsw-* 没读到（${searched.length === 0 ? '没有可找的目录' : `找过 ${searched.slice(0, 3).join('、')}`} 下没有装着 @deepseek-ai/dsh-client-ui-theme 的 dsh）`
      : `--dsw-* ${dsw.entries.length} 个（dsh 主题 ${dsw.version ?? '版本未知'}）`;
  const wbPart =
    wb === null
      ? '--wb-* 没读到（外壳的 client.js 不在）'
      : `--wb-* ${wb.entries.length} 个（外壳 ${wb.version ?? '版本未知'}）`;
  return `${dswPart} · ${wbPart}`;
}

function briefSource(set: TokenSet): string {
  const dsw = set.dsw === null ? 'dsh 主题没读到' : `dsh 主题 ${set.dsw.version ?? '版本未知'}`;
  const wb = set.wb === null ? '外壳没读到' : `外壳 ${set.wb.version ?? '版本未知'}`;
  return `现读 ${dsw} + ${wb}`;
}

function tokenNameText(set: TokenSet, name: string, searched: readonly string[]): string {
  const dsw = set.dsw;
  const wb = set.wb;
  const inDsw = dsw?.entries.find((one) => one.name === name);
  const inWb = wb?.entries.find((one) => one.name === name);
  const found = inDsw ?? inWb;
  if (found !== undefined) {
    const where = inDsw === undefined ? (wb === null ? '清单' : `外壳 ${wb.version ?? ''}`.trim()) : `dsh 主题 ${dsw?.version ?? ''}`.trim();
    return `${name} 在清单里（${where}）· ${truncatedValue(found)}`;
  }
  const names = [...(dsw?.entries ?? []), ...(wb?.entries ?? [])].map((one) => one.name);
  if (names.length === 0) {
    return `${name} 没法验：${sourceText(set, searched)}。`;
  }
  const near = nearestTokens(name, names);
  const verdict = `${name} 清单里没有它（${briefSource(set)}）。`;
  if (near.length === 0) return `${verdict}\n按族看有哪些：bucket=alias（或 static / font / radius / wb …）`;
  return `${verdict}\n近似的名字：${near.join(' ')}\n（name=<近似的那个> 看浅/深值；bucket=alias 列全族）`;
}

function tokenBucketText(set: TokenSet, bucket: string): string {
  const wanted = bucket.trim().toLowerCase();
  if (wanted === TOKEN_WB) {
    if (set.wb === null) return '--wb-* 没读到（外壳的 client.js 不在）。';
    return `--wb-* ${set.wb.entries.length} 个（外壳 ${set.wb.version ?? '版本未知'}）：\n${set.wb.entries.map((one) => one.name).join(' ')}`;
  }
  const groups = set.dsw === null ? [] : familyNamesOf(set.dsw.entries);
  const matched = groups.find((one) => one.family === wanted);
  if (matched === undefined) {
    const keys = [...groups.map((one) => `${one.family}（${one.names.length}）`), ...(set.wb === null ? [] : [`wb（${set.wb.entries.length}）`])];
    return keys.length === 0
      ? `没有「${bucket}」这一族，这次也读不到令牌。`
      : `没有「${bucket}」这一族。能问的：${keys.join(' · ')}`;
  }
  return `--dsw-${matched.family}-* ${matched.names.length} 个（dsh 主题 ${set.dsw?.version ?? '版本未知'}）：\n${matched.names.join(' ')}`;
}

export function renderTokensText(set: TokenSet, options: TokenRenderOptions): string {
  const name = options.name.trim();
  if (name !== '') return tokenNameText(set, name, options.searched);
  const bucket = options.bucket.trim();
  if (bucket !== '') return tokenBucketText(set, bucket);
  const lines = [sourceText(set, options.searched)];
  const groups = set.dsw === null ? [] : familyNamesOf(set.dsw.entries);
  if (groups.length > 0) lines.push(`按族：${groups.map((one) => `${one.family} ${one.names.length}`).join(' · ')}`);
  if (options.all) {
    if (set.dsw !== null) lines.push(`--dsw-* 全表：\n${set.dsw.entries.map((one) => one.name).join(' ')}`);
    if (set.wb !== null) lines.push(`--wb-* 全表：\n${set.wb.entries.map((one) => one.name).join(' ')}`);
  } else {
    const keys = [...groups.map((one) => one.family), ...(set.wb === null ? [] : [TOKEN_WB])];
    if (keys.length > 0) lines.push(`列全一族：${keys.map((one) => `bucket=${one}`).join(' / ')}`);
    if (set.dsw !== null) lines.push(`查单个连浅/深值：name=--dsw-alias-bg-layer-1${set.wb === null ? '' : '（--wb-* 同理）'}；全表：all=true`);
  }
  let text = lines.join('\n');
  if (text.length <= PRUNE_CHARS) return text;
  const family = groups[0]?.family ?? '';
  text = text.slice(0, PRUNE_CHARS);
  const cut = text.lastIndexOf(' ');
  return `${text.slice(0, cut)}\n（到这儿 ${PRUNE_CHARS} 字符就截了 —— 剩下的按族问${family === '' ? '' : `：bucket=${family}`}）`;
}
