import { createRule } from '@arch-guard/core';

const KERNEL_SIDE = /^src\/kernel\/(host|client)\//;

const kernelSidesAreIsolated = createRule({
  id: 'S71',
  domain: 'structure',
  level: 'L2',
  severity: 'error',
  title: '内核两侧（host / client）不互相 import',
  hint:
    'kernel/host 与 kernel/client 同层，但它们是两个运行时。' +
    '共享的形状放 kernel/contract 或 shared 契约；不要从一侧 import 另一侧。',
  run(ctx) {
    const findings = [];
    for (const record of ctx.records) {
      const side = KERNEL_SIDE.exec(record.rel)?.[1];
      if (side === undefined) continue;
      for (const fact of ctx.facts.get(record.rel)?.imports ?? []) {
        const target =
          /^@\/kernel\/(host|client)\//.exec(fact.spec)?.[1] ??
          /^\.\.\/(host|client)\//.exec(fact.spec)?.[1];
        if (target === undefined || target === side) continue;
        findings.push({
          rule: 'S71',
          file: record.rel,
          line: fact.line,
          ...(fact.column === undefined ? {} : { column: fact.column }),
          text: `内核 ${side} 侧 import 了 ${target} 侧：${fact.spec}`,
          hint: '把共享的形状抬到 kernel/contract 或 shared 契约；两侧只依赖它，不互相依赖',
        });
      }
    }
    return findings;
  },
});

export const kernelRules = [kernelSidesAreIsolated];
