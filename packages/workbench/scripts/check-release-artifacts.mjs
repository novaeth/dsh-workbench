#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, posix, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const PKG_ROOT = fileURLToPath(new URL('..', import.meta.url));

const SPEC_HINT = '内部设计记录';

const MARKERS = [
  'wbMock',
  'MockStrip',
  'useFixturePick',
  'mockModeOn',
  'crashModeOn',
  'wb-fixture',
  'BoardMockStrip',
  'gate-mock',
  'kit-preview',
];

const MARKERS_CI = ['mockstrip', 'wb-mock'];

const FIXTURE_NAME_PATTERNS = [
  'dev/',
  'fixture-unit-mock',
  'board-mock',
  'market-mock',
  'market-installed-mock',
  'market-mock-types',
  'panel-mock',
  'add-module-mock',
  'gate-mock',
  'boardmockstrip',
  'kit-preview',
  'mock-mode',
  'use-fixture-pick',
  '__tests__',
];

const CONTENT_EXEMPT_EXT = /\.(md|markdown)$/i;

function isAuditScope(entry) {
  return entry === 'client.js' || entry === 'dist' || entry.startsWith('dist/');
}

const NON_PRODUCT_DIRS = new Set(['bin', 'profile', 'preset', 'skills']);
const NON_PRODUCT_EXT = /\.(md|yml|yaml|svg|sh|mjs|json|txt|html)$/;
function isNonProductEntry(entry) {
  return NON_PRODUCT_DIRS.has(entry) || NON_PRODUCT_EXT.test(entry);
}

const toPosix = (rel) => rel.split(sep).join('/');

function walkFiles(rootDir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(rootDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const rel = prefix === '' ? entry.name : posix.join(prefix, entry.name);
    const full = join(rootDir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

function collectAudited(rootDir) {
  const audited = [];
  if (existsSync(join(rootDir, 'client.js'))) audited.push('client.js');
  if (existsSync(join(rootDir, 'dist'))) audited.push(...walkFiles(join(rootDir, 'dist'), 'dist'));
  return audited;
}

function readShippedEntries() {
  const pkg = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf8'));
  return (pkg.files ?? []).map(toPosix);
}

function expandFrom(rootDir, entries) {
  const out = [];
  for (const entry of entries) {
    const abs = join(rootDir, entry);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) out.push(...walkFiles(abs, entry));
    else out.push(entry);
  }
  return out;
}

const ALWAYS_SHIPPED_NAME = /^(?:package\.json|README(?:\..*)?|LICEN[CS]E(?:\..*)?|NOTICE(?:\..*)?)$/i;
function npmAlwaysShipped(rootDir) {
  return readdirSync(rootDir)
    .filter((entry) => ALWAYS_SHIPPED_NAME.test(entry) && statSync(join(rootDir, entry)).isFile())
    .sort();
}

function alwaysShippedGaps(rootDir, scanFiles) {
  const seen = new Set(scanFiles);
  return npmAlwaysShipped(rootDir).filter((one) => !seen.has(one));
}

function contentFindings(rootDir, files) {
  const findings = [];
  for (const rel of files) {
    if (CONTENT_EXEMPT_EXT.test(rel)) continue;
    let text;
    try {
      text = readFileSync(join(rootDir, rel)).toString('utf8');
    } catch {
      continue;
    }
    const lower = text.toLowerCase();
    const hits = MARKERS.filter((one) => text.includes(one));
    for (const one of MARKERS_CI) {
      if (lower.includes(one) && !hits.includes(one)) hits.push(`${one}（忽略大小写）`);
    }
    if (hits.length > 0) findings.push({ file: rel, markers: hits });
  }
  return findings;
}

function looksLikeDevBuild(rootDir, m1Files) {
  if (m1Files.length === 0) return false;
  if (!m1Files.every((file) => file === 'client.js' || file.startsWith('dist/client/'))) return false;
  if (!existsSync(join(rootDir, 'dist/host/index.js'))) return false;
  return contentFindings(rootDir, ['dist/host/index.js']).length === 0;
}

const DEV_BUILD_HINT = [
  'ℹ️ 包内现在是**开发档**：client.js / dist/client/* 里带着夹具，而发布构建的产物不可能有它们',
  '   （`WB_RELEASE=1` 把 `@/dev/surface` 那条接缝换成了空实现），宿主产物是干净的 —— 夹具纯客户端。',
  '   所以这条红不是"产物脏"，先看你是哪种情况：',
  '   ① 正在发版：发布构建没写进包内 —— `WB_STAGE_DIR` 被带进了环境？用了 `--skip-build`？还是被',
  '      `pnpm run dev` 的 watcher 覆盖了？先停掉 watcher / 别带 `WB_STAGE_DIR` 再发；发版脚本那边',
  '      会另给更准的话（它会分辨"构建出来就脏"与"构建之后被别的进程改过"）。',
  '   ② 只是想自查：`--shipped` 扫的就是包内那份，它的前置条件是**刚跑过发布构建**（`WB_RELEASE=1`）；',
  '      在开发树上它本来就红。自查请用默认档：`node scripts/check-release-artifacts.mjs`',
  '      —— 它把发布构建建到临时根，不碰你的开发产物。',
].join('\n');

function nameFindings(files) {
  const findings = [];
  for (const rel of files) {
    const lower = rel.toLowerCase();
    const hits = FIXTURE_NAME_PATTERNS.filter((one) => lower.includes(one));
    if (hits.length > 0) findings.push({ file: rel, patterns: hits });
  }
  return findings;
}

function coverageFindings({ entries, auditRoot, audited }) {
  const seen = new Set(audited);
  const findings = [];
  for (const entry of entries) {
    if (!isAuditScope(entry)) {
      if (!isNonProductEntry(entry)) findings.push({ file: entry, reason: '出货清单里没被审计的新项' });
      continue;
    }
    const abs = join(auditRoot, entry);
    if (!existsSync(abs)) {
      findings.push({ file: entry, reason: '本次审计的树里没有这份产物（构建没跑？）' });
      continue;
    }
    if (statSync(abs).isDirectory()) {
      for (const rel of walkFiles(abs, entry)) {
        if (!seen.has(rel)) findings.push({ file: rel, reason: '不在审计集合里' });
      }
    } else if (!seen.has(entry)) {
      findings.push({ file: entry, reason: '不在审计集合里' });
    }
  }
  return findings;
}

function auditTree({ auditRoot, entries, scanFiles }) {
  const audited = collectAudited(auditRoot);
  const findings = [];
  findings.push(...contentFindings(auditRoot, scanFiles).map((one) => ({ check: 'M1', ...one })));
  findings.push(...nameFindings(scanFiles).map((one) => ({ check: 'M2', ...one })));
  findings.push(...coverageFindings({ entries, auditRoot, audited }).map((one) => ({ check: 'M3', ...one })));
  if (audited.length === 0) {
    findings.push({ check: 'M3', file: auditRoot, reason: '审计集合是空的（构建没跑？）' });
  }
  return findings;
}

function snapshotPackageProducts() {
  const snapshot = new Map();
  for (const rel of collectAudited(PKG_ROOT)) {
    const full = join(PKG_ROOT, rel);
    snapshot.set(rel, `${statSync(full).size}:${createHash('sha256').update(readFileSync(full)).digest('hex')}`);
  }
  return snapshot;
}

function diffSnapshot(before, after) {
  const changed = [];
  for (const [rel, hash] of after) {
    if (before.get(rel) !== hash) changed.push(rel);
  }
  for (const rel of before.keys()) {
    if (!after.has(rel)) changed.push(`${rel}（消失）`);
  }
  return changed;
}

function report(findings) {
  if (findings.length === 0) return false;
  const m1 = findings.filter((one) => one.check === 'M1');
  const m2 = findings.filter((one) => one.check === 'M2');
  const m3 = findings.filter((one) => one.check === 'M3');
  const brief = (list) => {
    const files = list.slice(0, 12).map((one) => one.file);
    return files.join('、') + (list.length > files.length ? ` …还有 ${list.length - files.length} 条` : '');
  };
  if (m1.length > 0) {
    console.error(
      `❌ 发布产物里有夹具（${brief(m1)}；命中标记：${[...new Set(m1.flatMap((one) => one.markers))].join('、')}）` +
        ` —— 夹具只许在开发构建里，见 ${SPEC_HINT}`,
    );
  }
  if (m2.length > 0) {
    console.error(`❌ 发布产物里有夹具文件（${brief(m2)}）—— 夹具只许在开发构建里，见 ${SPEC_HINT}`);
  }
  if (m3.length > 0) {
    console.error(
      `❌ 出货清单对不上（${m3.map((one) => `${one.file}：${one.reason}`).slice(0, 12).join('、')}` +
        `${m3.length > 12 ? ` …还有 ${m3.length - 12} 条` : ''}）` +
        '—— 要么把落点加进本判据的审计范围，要么在 NON_PRODUCT_DIRS / 扩展名那一档里认它是非产物',
    );
  }
  return true;
}

function runNode(script, env) {
  execFileSync(process.execPath, [join(PKG_ROOT, script)], { cwd: PKG_ROOT, stdio: 'inherit', env });
}

function typesBuildHonoursStaging() {
  return readFileSync(join(PKG_ROOT, 'scripts/build-types.mjs'), 'utf8').includes('WB_STAGE_DIR');
}

function gateMode() {

  if (selfTest(false) !== 0) {
    console.error('❌ 默认档进门先跑的那遍 --self-test 没过：判据自己坏了，先修它再看产物（见上一屏逐条）。');
    return 1;
  }

  if (!typesBuildHonoursStaging()) {
    console.error(
      '❌ scripts/build-types.mjs 还没认 WB_STAGE_DIR（或这条支持被改回去了）：跑它会就地改写' +
        ' packages/workbench/dist/types，而判据自己不许碰包内产物（见本文件头）。先给它接上暂存根；' +
        '现在只跑得动 --self-test / --shipped。',
    );
    return 1;
  }

  const stage = mkdtempSync(join(tmpdir(), 'wb-release-artifacts-'));
  const env = { ...process.env, WB_RELEASE: '1', WB_STAGE_DIR: stage };
  const entries = readShippedEntries();
  const before = snapshotPackageProducts();

  try {
    runNode('scripts/build.mjs', env);
    runNode('scripts/build-types.mjs', env);
  } catch {
    console.error(`❌ 发布构建失败（临时根留着给人看：${stage}）`);
    return 1;
  }

  const touched = diffSnapshot(before, snapshotPackageProducts());
  if (touched.length > 0) {
    console.error(
      `❌ 判据自己碰了包内产物（${touched.slice(0, 8).join('、')}${touched.length > 8 ? ' …' : ''}）` +
        ' —— 暂存构建漏了哪条路？（若是 dev watcher 同时在重建，也会命中这条；先停掉它再跑）',
    );
    console.error(`   临时根留着给人看：${stage}`);
    return 1;
  }

  const audited = collectAudited(stage);

  const findings = auditTree({ auditRoot: stage, entries, scanFiles: audited });
  if (report(findings)) {
    console.error(`   临时根留着给人看：${stage}`);
    return 1;
  }
  rmSync(stage, { recursive: true, force: true });
  console.log(
    `✅ 发布产物判据过了：${audited.length} 份产物（自检 21 条过 / 零夹具内容标记 / 零夹具文件名 / ` +
      `${entries.length} 项出货清单对得上）；包内 client.js 与 dist/** 一个字节都没动`,
  );
  return 0;
}

function shippedMode() {
  if (!existsSync(join(PKG_ROOT, 'client.js')) || !existsSync(join(PKG_ROOT, 'dist'))) {
    console.error('❌ 包内没有构建产物：发布前先跑 `WB_RELEASE=1 node scripts/build.mjs && node scripts/build-types.mjs`');
    return 1;
  }
  const entries = readShippedEntries();

  const shipped = [...new Set([...expandFrom(PKG_ROOT, entries), ...npmAlwaysShipped(PKG_ROOT)])];

  const gaps = alwaysShippedGaps(PKG_ROOT, shipped);
  if (gaps.length > 0) {
    console.error(
      `❌ 扫描集漏了 npm 恒发的 ${gaps.join('、')}：\`files\` ≠ tarball 实际内容，` +
        '恒发的那几份必须显式并进扫描集（见 npmAlwaysShipped 那段注释）',
    );
    return 1;
  }

  const findings = auditTree({ auditRoot: PKG_ROOT, entries, scanFiles: shipped });

  if (report(findings)) {

    const m1Files = findings.filter((one) => one.check === 'M1').map((one) => one.file);
    if (looksLikeDevBuild(PKG_ROOT, m1Files)) console.error(`\n${DEV_BUILD_HINT}`);
    return 1;
  }
  console.log(
    `✅ 出货集干净：${shipped.length} 份出货文件（含 npm 恒发的 ${npmAlwaysShipped(PKG_ROOT).join('、')}）、` +
      `${collectAudited(PKG_ROOT).length} 份构建产物，零夹具`,
  );
  return 0;
}

function selfTest(verbose) {
  const root = mkdtempSync(join(tmpdir(), 'wb-release-artifacts-selftest-'));
  const problems = [];
  const write = (rel, text) => {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  };
  const writeBytes = (rel, bytes) => {
    const full = join(root, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, Buffer.from(bytes));
  };
  const expect = (name, actual, wanted) => {
    const a = JSON.stringify(actual);
    const b = JSON.stringify(wanted);
    if (a === b) {
      if (verbose) console.log(`   ✅ ${name}`);
    } else {
      problems.push(`${name}：期望 ${b}，实际 ${a}`);
    }
  };
  const filesOf = (list) => list.map((one) => one.file);

  try {
    const clean = [
      'client.js',
      'dist/client/client.body.js',
      'dist/client/index.js',
      'dist/host/index.js',
      'dist/board.css',
      'dist/types/app/host.d.ts',
    ];
    for (const rel of clean) write(rel, 'export const ok = 1;\n');
    expect('干净目录：M1 零命中', contentFindings(root, clean), []);
    expect('干净目录：M2 零命中', nameFindings(clean), []);

    write('dist/client/index.js', 'var dev = wbMock ? 1 : 0;\n');
    expect('植入 wbMock 的开发档 ESM：M1 点名', filesOf(contentFindings(root, clean)), ['dist/client/index.js']);
    write('dist/client/index.js', 'export const ok = 1;\n');

    write('dist/board.css', '.wb-mockStrip_ab12 { color: red; }\n');
    expect('植入 .wb-mockStrip（大小写不同）：M1 点名', filesOf(contentFindings(root, clean)), ['dist/board.css']);
    write('dist/board.css', '.wb-card { color: red; }\n');

    write('dist/types/dev/MockStrip.d.ts', 'export declare const x: number;\n');
    expect('植入 dev/MockStrip.d.ts 名字：M2 点名', filesOf(nameFindings([...clean, 'dist/types/dev/MockStrip.d.ts'])), [
      'dist/types/dev/MockStrip.d.ts',
    ]);

    write('dist/types/app/__tests__/host.d.ts', 'export declare const x: number;\n');
    expect(
      '植入 __tests__/*.d.ts 名字：M2 点名',
      filesOf(nameFindings([...clean, 'dist/types/app/__tests__/host.d.ts'])),
      ['dist/types/app/__tests__/host.d.ts'],
    );

    expect(
      '出货覆盖：新出货项逃出审计范围 → M3 点名',
      filesOf(coverageFindings({ entries: ['client.js', 'dist', 'release'], auditRoot: root, audited: collectAudited(root) })),
      ['release'],
    );
    expect(
      '出货覆盖：声明的产物在这棵树里没有 → M3 点名',
      filesOf(coverageFindings({ entries: ['client.js', 'dist/missing'], auditRoot: root, audited: collectAudited(root) })),
      ['dist/missing'],
    );
    expect(
      '出货覆盖：非产物出货项认得（README / bin / patch）→ M3 零命中',
      coverageFindings({
        entries: ['README.md', 'bin', 'cordis.patch.yml', 'scripts/seed-profile.sh', 'icon.svg'],
        auditRoot: root,
        audited: collectAudited(root),
      }),
      [],
    );
    expect(
      '出货覆盖：审计集合缺一份产物 → M3 点名',
      (() => {
        write('dist/client/ghost.js', 'export const ok = 1;\n');
        return filesOf(
          coverageFindings({ entries: ['client.js', 'dist'], auditRoot: root, audited: ['client.js', 'dist/board.css'] }),
        ).slice(0, 1);
      })(),
      ['dist/client/client.body.js'],
    );

    write('dist/assets/fixture-data.json', '{"wbMock":true,"MockStrip":1}\n');
    expect('植入 dist/assets/fixture-data.json：M1 点名', filesOf(contentFindings(root, ['dist/assets/fixture-data.json'])), [
      'dist/assets/fixture-data.json',
    ]);

    write(
      'dist/client/index.js.map',
      '{"version":3,"sourcesContent":["import {MockStrip} from \\"@/dev/MockStrip\\""]}\n',
    );
    expect(
      '植入带 sourcesContent 的 dist/client/index.js.map：M1 点名',
      filesOf(contentFindings(root, ['dist/client/index.js.map'])),
      ['dist/client/index.js.map'],
    );

    write('scripts/seed-profile.sh', '#!/bin/sh\n# wbMock fixture helper\n');
    expect('植入 scripts/seed-profile.sh：M1 点名', filesOf(contentFindings(root, ['scripts/seed-profile.sh'])), [
      'scripts/seed-profile.sh',
    ]);

    write('bin/dsh-workbench', '#!/bin/sh\n# wbMock fixture helper\n');
    write('preset/diy.patch.yml', 'plugins:\n  # MockStrip fixture\n');
    write('profile/default/hint.txt', 'useFixturePick fixture helper\n');
    expect(
      '植入无后缀 bin/ 与 preset|profile 清单：M1 逐份点名',
      filesOf(
        contentFindings(root, ['bin/dsh-workbench', 'preset/diy.patch.yml', 'profile/default/hint.txt', 'cordis.patch.yml']),
      ),
      ['bin/dsh-workbench', 'preset/diy.patch.yml', 'profile/default/hint.txt'],
    );

    write('skills/workbench-module-diy/KIT.md', '模块**拿不到** `MockStrip` / `useFixturePick`；`?wbMock=1` 对模块不生效。\n');
    expect('`.md` 豁免：内容不扫（只过 M2 名字关）', contentFindings(root, ['skills/workbench-module-diy/KIT.md']), []);

    writeBytes('dist/assets/logo.png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0xff, 0xfe, 0x00, 0x01]);
    expect('二进制件（非法 utf8 字节）：不抛且零命中', contentFindings(root, ['dist/assets/logo.png']), []);

    write('package.json', '{"name":"probe","version":"0.0.0"}\n');
    expect(
      '自证：package.json 存在却不在扫描集 → 点名（恒发件必须并进来）',
      alwaysShippedGaps(root, ['client.js', 'dist']),
      ['package.json'],
    );
    expect(
      '自证：把恒发件并进扫描集 → 零缺口',
      alwaysShippedGaps(root, ['client.js', 'dist', ...npmAlwaysShipped(root)]),
      [],
    );
    write('package.json', '{"name":"probe","wbVerifierProbe":"wbMock"}\n');
    expect(
      '恒发的 package.json 里塞标记：M1 点名（δ1.3 漏的那一份）',
      filesOf(contentFindings(root, npmAlwaysShipped(root))),
      ['package.json'],
    );

    write('client.js', 'var dev = wbMock ? 1 : 0;\n');
    expect(
      '开发档识别：标记只在 client.js / dist/client/*，宿主产物干净 → 认作开发档',
      looksLikeDevBuild(root, ['client.js', 'dist/client/index.js']),
      true,
    );
    write('dist/host/index.js', 'var dev = MockStrip;\n');
    expect(
      '开发档识别：宿主产物也带标记（不是"夹具纯客户端"那个形状）→ 不认作开发档，只给原话',
      looksLikeDevBuild(root, ['client.js', 'dist/client/index.js', 'dist/host/index.js']),
      false,
    );
    write('client.js', 'export const ok = 1;\n');
    write('dist/host/index.js', 'export const ok = 1;\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  if (problems.length > 0) {
    for (const one of problems) console.error(`❌ --self-test：${one}`);
    return 1;
  }
  if (verbose) {
    console.log(
      '✅ --self-test：21 条断言全过（M1/M2/M3 的正负例：干净过、植入标记红、植入夹具文件名红、逃出覆盖红，' +
        '含 .json 夹具数据 / .js.map 的 sourcesContent / scripts/*.sh / 无后缀 bin / preset|profile，' +
        '以及 npm 恒发的 package.json 必须并进扫描集）',
    );
  }
  return 0;
}

const args = process.argv.slice(2);
const unknown = args.filter((one) => one !== '--shipped' && one !== '--self-test');
if (unknown.length > 0) {
  console.error(`用法：node scripts/check-release-artifacts.mjs [--shipped] [--self-test]（不认识：${unknown.join(' ')}）`);
  process.exit(1);
}
if (args.includes('--self-test') && args.includes('--shipped')) {
  console.error('用法：--self-test 与 --shipped 不能一起给');
  process.exit(1);
}

process.exit(args.includes('--self-test') ? selfTest(true) : args.includes('--shipped') ? shippedMode() : gateMode());
