import { createRule } from '@arch-guard/core';
import { numericTokens } from '@arch-guard/core/packs/core/rules/design-shared';

const MANIFEST = /^src\/modules\/([^/]+)\/unit\.ts$/;

function suiteIds(records) {
  return new Set(
    records
      .map((record) => MANIFEST.exec(record.rel)?.[1])
      .filter((id) => id !== undefined),
  );
}

function resolveSpec(spec, fromRel) {

  if (spec.startsWith('@/')) return `src/${spec.slice(2)}`;
  if (!spec.startsWith('.')) return null;
  const base = fromRel.split('/').slice(0, -1);
  for (const part of spec.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') base.pop();
    else base.push(part);
  }
  return base.join('/');
}

function suiteTarget(spec, fromRel, ids) {
  const resolved = resolveSpec(spec, fromRel);
  if (resolved === null) return null;
  const match = /^src\/modules\/([^/]+)(\/(.*))?$/.exec(resolved);
  if (match === null) return null;
  const [, id, , rest = ''] = match;
  if (!ids.has(id)) return null;

  const depth = rest.replace(/\.(ts|tsx)$/, '');
  return { id, depth };
}

const isFace = (depth) => depth === '' || depth === 'index' || depth === 'client';

const shellOnlyFaces = createRule({
  id: 'S60',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '外壳只许使用套件的公开面',
  hint: '宿主面用 `@/modules/<id>`，浏览器面用 `@/modules/<id>/client`；到 model/views/hooks/unit 的深路径都不行。',
  run(ctx) {
    const ids = suiteIds(ctx.records);
    const findings = [];
    for (const record of ctx.records) {
      if (!record.rel.startsWith('src/app/')) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        const target = suiteTarget(fact.spec, record.rel, ids);
        if (target === null || isFace(target.depth)) continue;
        findings.push({
          rule: 'S60',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `外壳 import 了 ${fact.spec}（套件 ${target.id} 的内部）`,
          hint: `改用 @/modules/${target.id} 或 @/modules/${target.id}/client`,
        });
      }
    }
    return findings;
  },
});

const suitesAreIsolated = createRule({
  id: 'S62',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '套件之间不许互相 import',
  hint: '套件只许依赖 `shared/**` 与自己；要共用就抬进 shared，要协作就走各自的公开面。',
  run(ctx) {
    const ids = suiteIds(ctx.records);
    const findings = [];
    for (const record of ctx.records) {
      const owner = /^src\/modules\/([^/]+)\//.exec(record.rel)?.[1];
      if (owner === undefined || !ids.has(owner)) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        const target = suiteTarget(fact.spec, record.rel, ids);
        if (target === null || target.id === owner) continue;
        findings.push({
          rule: 'S62',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `${owner} 套件 import 了 ${target.id} 套件（${fact.spec}）`,
          hint: '两个套件之间不该有直接依赖',
        });
      }
    }
    return findings;
  },
});

const manifestIsPure = createRule({
  id: 'S63',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '套件清单只依赖纯类型契约',
  hint: '`unit.ts` 是两端都能读的纯数据，只能 import `@/shared/api/unit` 或 `@dsh-workbench/shared`（后者是共享包的浏览器侧入口；`/host` 会把宿主实现拖进清单）。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (MANIFEST.exec(record.rel) === null) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        if (fact.spec === '@/shared/api/unit' || fact.spec === '@dsh-workbench/shared') continue;
        findings.push({
          rule: 'S63',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `清单 import 了 ${fact.spec}`,
          hint: '清单只许依赖 @/shared/api/unit 与 @dsh-workbench/shared（纯类型契约），不许碰 @dsh-workbench/shared/host —— 那会把宿主实现拖进清单',
        });
      }
    }
    return findings;
  },
});

const bothFacesRegistered = createRule({
  id: 'S64',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '套件必须在两端都登记',
  hint: '宿主面在 `app/host.ts` 的套件表里；有卡片的套件还要在浏览器装配里 import 它的 `client` 面。',
  run(ctx) {
    const findings = [];
    const appImports = new Set();
    for (const record of ctx.records) {
      if (!record.rel.startsWith('src/app/')) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) appImports.add(fact.spec);
    }

    for (const record of ctx.records) {
      const id = MANIFEST.exec(record.rel)?.[1];
      if (id === undefined) continue;

      const isBoard = !/\bcard:\s*null\b/.test(ctx.sourceOf(record.rel) ?? '');
      if (!appImports.has(`@/modules/${id}`)) {
        findings.push({
          rule: 'S64',
          file: record.rel,
          line: 1,
          text: `没有 src/app/** import @/modules/${id}（宿主面未登记）`,
          hint: '在 app/host.ts 的套件表里加上它的面',
        });
      }
      if (isBoard && !appImports.has(`@/modules/${id}/client`)) {
        findings.push({
          rule: 'S64',
          file: record.rel,
          line: 1,
          text: `没有 src/app/** import @/modules/${id}/client（浏览器面未登记）`,
          hint: '在浏览器装配里 import 它的面（卡片与内层界面都从面里拿）',
        });
      }
    }
    return findings;
  },
});

const PLATFORM_MARKS = [/e\.demo\.net/i, /demo-/i, /(^|[^a-z])demo([^a-z]|$)/i];
const shellHasNoPlatform = createRule({
  id: 'S65',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '外壳层不得出现平台知识',
  hint: '平台名/域名/命令前缀/错误码前缀只许住在 `src/platforms/**` 或 `src/modules/**`；外壳（`app/**` 与 `shared/**`）只传机制。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const isApp = record.rel.startsWith('src/app/');
      const isShared = record.rel.startsWith('src/shared/');
      const isTest = /\.test\.(ts|tsx)$/.test(record.rel) || record.rel.includes('__tests__/');
      if ((!isApp && !isShared) || isTest) continue;
      const facts = ctx.facts.get(record.rel);

      const specifiers = new Set((facts?.imports ?? []).map((fact) => fact.spec));

      for (const fact of facts?.strings ?? []) {
        if (specifiers.has(fact.value)) continue;

        if (fact.value.startsWith('workbench_')) continue;
        if (!PLATFORM_MARKS.some((mark) => mark.test(fact.value))) continue;
        findings.push({
          rule: 'S65',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `外壳层出现平台字符串：${JSON.stringify(fact.value).slice(0, 60)}`,
          hint: '把这条知识搬到 src/platforms/<平台>/**（或套件里），外壳只传机制',
        });
      }

      for (const fact of facts?.imports ?? []) {
        const toPlatform = fact.spec.startsWith('@/platforms/');
        const toSuite = fact.spec.startsWith('@/modules/');
        if (!toPlatform && !(toSuite && isShared)) continue;
        findings.push({
          rule: 'S65',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `外壳层 import 了 ${fact.spec}${toPlatform ? '（外壳不该认识平台）' : '（机制不该依赖套件）'}`,
          hint: '反向依赖：让套件来组合机制与平台，而不是外壳去认识它们',
        });
      }
    }
    return findings;
  },
});

const SUITE_ID_PATTERN = (id) => new RegExp(`(^|[^a-z0-9])${id}([^a-z0-9]|$)`, 'i');

function boardSuiteIds(ctx) {
  const ids = new Set();
  for (const record of ctx.records) {
    const id = MANIFEST.exec(record.rel)?.[1];
    if (id === undefined) continue;
    if (/\bcard:\s*null\b/.test(ctx.sourceOf(record.rel) ?? '')) continue;
    ids.add(id);
  }
  return ids;
}

const shellHasNoSuiteId = createRule({
  id: 'S66',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '外壳层不得出现套件 id',
  hint: '套件 id 只许住在 `src/modules/**`。外壳要显示套件的什么，就让套件通过面/契约交出来（例如内层界面的 titleKey），外壳只转发。',
  run(ctx) {
    const findings = [];
    const ids = boardSuiteIds(ctx);
    if (ids.size === 0) return findings;

    for (const record of ctx.records) {
      const isApp = record.rel.startsWith('src/app/');
      const isShared = record.rel.startsWith('src/shared/');
      const isTest = /\.test\.(ts|tsx)$/.test(record.rel) || record.rel.includes('__tests__/');
      if ((!isApp && !isShared) || isTest) continue;

      const specifiers = new Set(
        (ctx.facts.get(record.rel)?.imports ?? []).map((fact) => fact.spec),
      );

      for (const fact of ctx.facts.get(record.rel)?.strings ?? []) {
        if (specifiers.has(fact.value)) continue;
        const hit = [...ids].find((id) => SUITE_ID_PATTERN(id).test(fact.value));
        if (hit === undefined) continue;
        findings.push({
          rule: 'S66',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `外壳层出现套件 id ${JSON.stringify(hit)}：${JSON.stringify(fact.value).slice(0, 60)}`,
          hint: '让套件把要显示的东西从面/契约交出来（例如 `UnitStep.titleKey`），外壳只转发、不写名字',
        });
      }
    }
    return findings;
  },
});

const suitesOwnTheirFolder = createRule({
  id: 'S67',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '套件只能通过外壳给的专属文件夹读写',
  hint: '用注入的 `UnitMountDeps.store`（`store.for(unitId, workspace)`），别自己 import node:fs —— 见 shared/api/host/workspace-store.ts。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const owner = /^src\/modules\/([^/]+)\//.exec(record.rel)?.[1];
      if (owner === undefined) continue;
      if (/\.test\.(ts|tsx)$/.test(record.rel) || record.rel.includes('__tests__/')) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        if (fact.spec !== 'node:fs' && fact.spec !== 'fs' && fact.spec !== 'node:fs/promises') continue;
        findings.push({
          rule: 'S67',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `${owner} 套件直接 import 了 ${fact.spec}`,
          hint: '模块只能写自己的文件夹：用注入的 store，不要自己碰文件系统',
        });
      }
    }
    return findings;
  },
});

const RUNTIME_ORCHESTRATION = [/^src\/app\/host\.ts$/, /^src\/kernel\/host\//, /^src\/shared\/api\/host\//];
const RUNTIME_PRODUCT_FILES = [/^src\/shared\/api\/host\/diy-/, /^src\/shared\/api\/host\/bundle-routes\.ts$/];

const shellHasNoRuntimeImpl = createRule({
  id: 'S68',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '外壳编排面不得出现运行时实现名',
  hint: '运行时（例如 opencli）是适配器的实现：外壳只认 AdapterSet 的中立形状（commands / runners / health）。名字、路径、安装、注入器留 adapter-* 与 src/modules/**；界面文案与夹具不算编排。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const rel = record.rel;
      if (!RUNTIME_ORCHESTRATION.some((pattern) => pattern.test(rel))) continue;
      if (/\.test\.(ts|tsx)$/.test(rel) || rel.includes('__tests__/')) continue;
      if (RUNTIME_PRODUCT_FILES.some((pattern) => pattern.test(rel))) continue;
      const source = ctx.sourceOf(rel) ?? '';
      source.split('\n').forEach((line, index) => {
        const text = line.trim();
        if (text === '') return;
        if (!/opencli/i.test(text)) return;
        findings.push({
          rule: 'S68',
          file: rel,
          line: index + 1,
          text: `外壳编排面出现运行时实现名：${text.slice(0, 80)}`,
          hint: '把名字/路径/安装搬进 adapters-*，外壳从 RuntimePort 拿中立形状；要显示的文案交给 src/modules/**',
        });
      });
    }
    return findings;
  },
});

const ADAPTER_PACKAGE = /@dsh-workbench\/(?:adapters-default|adapter-[a-z0-9-]+)/;

const shellNamesNoAdapter = createRule({
  id: 'S69',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '外壳不许点名具体适配器包',
  hint: '默认装哪份集合是部署的事：写在 package.json 的 workbench.adapterSet 里，代码按这个 spec 动态装载。src/** 里出现 @dsh-workbench/adapters-default 或 adapter-* 就是又把实现写回了外壳。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const rel = record.rel;
      if (!rel.startsWith('src/')) continue;
      if (/\.test\.(ts|tsx)$/.test(rel) || rel.includes('__tests__/')) continue;
      const source = ctx.sourceOf(rel) ?? '';
      source.split('\n').forEach((line, index) => {
        const text = line.trim();
        if (text === '') return;
        const match = ADAPTER_PACKAGE.exec(text);
        if (match === null) return;
        findings.push({
          rule: 'S69',
          file: rel,
          line: index + 1,
          text: `外壳点名了具体适配器包：${text.slice(0, 80)}`,
          hint: '默认集合走 package.json 的 workbench.adapterSet；代码只认 AdapterSet 协议（测试夹具不算）。',
        });
      });
    }
    return findings;
  },
});

const ADAPTER_ID_BRANCH = /adapters?\.id\s*[=!]==?\s*['"`]|['"`](?:opencli|chrome-mcp)['"`]\s*[=!]==?\s*(?:adapters?\.id|runtime)/;

const shellBranchesOnRuntimeId = createRule({
  id: 'S72',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '外壳不许按适配器 id 分支',
  hint: '换不换得动适配器，看的是能力（RuntimeCapabilities），不是 id。编排面里出现 `adapters.id === "…"` 或拿 id 做相等比较，就是又把具体实现写回了选择逻辑。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const rel = record.rel;
      if (!RUNTIME_ORCHESTRATION.some((pattern) => pattern.test(rel))) continue;
      if (/\.test\.(ts|tsx)$/.test(rel) || rel.includes('__tests__/')) continue;
      if (RUNTIME_PRODUCT_FILES.some((pattern) => pattern.test(rel))) continue;
      const source = ctx.sourceOf(rel) ?? '';
      source.split('\n').forEach((line, index) => {
        if (!ADAPTER_ID_BRANCH.test(line)) return;
        findings.push({
          rule: 'S72',
          file: rel,
          line: index + 1,
          text: `外壳按适配器 id 分支：${line.trim().slice(0, 80)}`,
          hint: '改查 runtime.capabilities(ctx)；id 只许用于日志与 health 展示。',
        });
      });
    }
    return findings;
  },
});

const ADAPTER_IMPORT = /from\s+['"]@dsh-workbench\/(?:adapters-default|adapter-[a-z0-9-]+)\b/;

const shellTestsUseFakeSet = createRule({
  id: 'S70',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '外壳的测试（含测试基建）也不许 import 适配器包',
  hint: '外壳只认协议：要适配器行为就用 shared/testing 的 fakeAdapterSet 或就地按端口写 double；适配器内部逻辑的测试归它自己那个包。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const rel = record.rel;
      const isTest = /\.test\.(ts|tsx)$/.test(rel) || rel.includes('__tests__/') || rel === 'vitest.setup.ts';
      if (!isTest) continue;
      const source = ctx.sourceOf(rel) ?? '';
      source.split('\n').forEach((line, index) => {
        if (!ADAPTER_IMPORT.test(line)) return;
        findings.push({
          rule: 'S70',
          file: rel,
          line: index + 1,
          text: `测试直接用了真实现：${line.trim().slice(0, 80)}`,
          hint: '换成 shared/testing 的假适配器集合；这一步做完，协议缺什么会立刻现形。',
        });
      });
    }
    return findings;
  },
});

const SIZE_PROPS = /^(min|max)-(width|height)$|^flex-basis$|^inset(-(block|inline))?(-(start|end))?$|^(row|column)-gap$/;
const SIZE_UNITS = ['px', 'rem', 'em'];
const DECLARATION = /([{;])\s*([a-zA-Z-]+)\s*:\s*([^;{}]*)/g;

const sizeFamilyHasNoLiterals = createRule({
  id: 'D31',
  domain: 'design',
  level: 'L2',
  severity: 'error',
  title: '尺寸族字面量也要走刻度',
  hint: 'min/max-宽高、flex-basis、inset、row/column-gap 与 D12 认的那批同类：值写成 var(令牌)，先在 tokens/scale.css 里有名字。',
  run(ctx) {
    const allow =
      (ctx.config.params?.valueWhitelists ?? []).find((item) => item.rule === 'D12')?.allow ?? [];
    const findings = [];
    for (const record of ctx.records) {
      if (record.kind !== 'css') continue;
      const text = ctx.sourceOf(record.rel);
      if (text === undefined) continue;
      for (const match of text.matchAll(DECLARATION)) {
        const prop = match[2];
        if (!SIZE_PROPS.test(prop)) continue;
        for (const token of numericTokens(match[3], SIZE_UNITS)) {
          if (token === '0' || allow.includes(token)) continue;
          findings.push({
            rule: 'D31',
            file: record.rel,
            line: text.slice(0, match.index).split('\n').length,
            text: `${prop}: ${token} 不在尺寸刻度里`,
            hint: '先写进 src/shared/styles/tokens/scale.css，再 var() 引用；dsh 有对应令牌的用 dsh 的',
          });
        }
      }
    }
    return findings;
  },
});

const shellNamesNoRuntime = {
  id: 'S74',
  title: '外壳的文案里不点名运行时（话与命令面都跟着适配器走）',
  level: 'L3',
  domain: 'copy',
  severity: 'error',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      if (record.rel.includes('__tests__/')) continue;
      if (/-mock\.tsx?$/.test(record.rel)) continue;
      const source = ctx.sourceOf(record.rel);
      if (source === undefined) continue;
      const lines = source.split('\n');
      for (let index = 0; index < lines.length; index += 1) {
        if (!/['"`][^'"`]*opencli[^'"`]*['"`]/i.test(lines[index])) continue;
        findings.push({
          rule: 'S74',
          file: record.rel,
          line: index + 1,
          text: `外壳的文案里点名了运行时：${lines[index].trim().slice(0, 80)}`,
          hint: '文案走 RuntimeProfile.terms / diagnose / bridge，命令走 runtime.commandSurface；协议字段名另计。',
        });
      }
    }
    return findings;
  },
};

export const unitRules = [
  shellOnlyFaces,
  suitesAreIsolated,
  manifestIsPure,
  bothFacesRegistered,
  shellHasNoPlatform,
  shellHasNoSuiteId,
  suitesOwnTheirFolder,
  shellHasNoRuntimeImpl,
  shellNamesNoAdapter,
  shellBranchesOnRuntimeId,
  shellTestsUseFakeSet,
  sizeFamilyHasNoLiterals,
  shellNamesNoRuntime,
];

