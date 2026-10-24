import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { read, pkg, SHARED_SRC } from '../lib.mjs';

export const checks = [
  {
    title: '★ 每个卡片套件都用机制上报（useUnitBoard / useCardSummary），不许手写 useEffect',
    run(ctx, report) {

      const approvingBoardUnits = [];
      const readOnlyBoardUnits = [];
      const boardUnits = [...approvingBoardUnits, ...readOnlyBoardUnits];
      ctx.approvingBoardUnits = approvingBoardUnits;
      ctx.readOnlyBoardUnits = readOnlyBoardUnits;
      ctx.boardUnits = boardUnits;
      const usesSummaryMechanism = (id) => {
        const dir = pkg(`src/modules/${id}`);
        return readdirSync(dir, { recursive: true })
          .filter((name) => name.endsWith('.ts') || name.endsWith('.tsx'))
          .map((name) => read(join(dir, name)))
          .some((source) => source.includes('useUnitBoard(') || source.includes('useCardSummary('));
      };
      const missingSummary = boardUnits.filter((id) => !usesSummaryMechanism(id));
      report(
        '★ 每个卡片套件都用机制上报（useUnitBoard / useCardSummary），不许手写 useEffect',
        missingSummary.length === 0,
        missingSummary.join(' · ') || boardUnits.join(' · ') + ' 都在',
      );
    },
  },
  {
    title: '★ 审批闸门从套件取策略与明细（host.ts 接线 + approval-gate.ts 按归属套件取，没有第二份兜底）',
    run(ctx, report) {

      const hostSource = read(pkg('src/app/host.ts'));
      const gateSource = read(pkg('src/shared/api/host/approval-gate.ts'));
      const wired =
        hostSource.includes('createApprovalGate(') &&
        /approvalFor\(call, \{/.test(gateSource) &&
        gateSource.includes('owner?.needsApproval') &&
        gateSource.includes('.approvalDetail?.(');
      report(
        '★ 审批闸门从套件取策略与明细（host.ts 接线 + approval-gate.ts 按归属套件取，没有第二份兜底）',
        wired,
      );
    },
  },
  {
    title: '★ 每个卡片套件都交"这次会发生什么" + 那块明细（漏了弹窗只剩一句通用话）',
    run(ctx, report) {
      const { approvingBoardUnits } = ctx;

      const missing = [];
      for (const id of approvingBoardUnits) {
        const hostSource = read(pkg(`src/modules/${id}/index.ts`));
        const clientSource = read(pkg(`src/modules/${id}/client.ts`));
        if (!hostSource.includes('approvalDetail')) missing.push(`${id}/index.ts 没交 approvalDetail`);
        if (!clientSource.includes('approval:')) missing.push(`${id}/client.ts 没认领审批明细`);
      }
      report(
        '★ 每个卡片套件都交"这次会发生什么" + 那块明细（漏了弹窗只剩一句通用话）',
        missing.length === 0,
        missing.join(' · ') || approvingBoardUnits.join(' · ') + ' 都交了（只读套件没有审批面，不在此列）',
      );
    },
  },
  {
    title: '★ 注册期抛了：已经注册的工具要撤回（不然套件判失败、它的工具还挂着能调）',
    run(ctx, report) {

      const hostSource = read(pkg('src/app/host.ts'));
      const mountSource = read(pkg('src/kernel/host/mount-units.ts'));
      const registered = /catch \(error\) \{\s*slot\.rollbackTools\(\);/.test(hostSource);
      const journaled = mountSource.includes('journal.push(registered)') && mountSource.includes('toolJournal.splice(0)');
      report(
        '★ 注册期抛了：已经注册的工具要撤回（不然套件判失败、它的工具还挂着能调）',
        registered && journaled,
        `调用点${registered ? '在' : '缺'} · 记账${journaled ? '在' : '缺'}`,
      );
    },
  },
  {
    title: '★ 清单里声明会写的工具都由**它自己的套件**认领（外壳不再按名字认领）',
    run(ctx, report) {

      const modulesDir = pkg('src/modules');
      const readModuleSources = (dir) =>
        readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
          const child = join(dir, entry.name);
          if (entry.isDirectory()) return readModuleSources(child);
          if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith('.test.ts')) return [];
          return [read(child)];
        });
      const constantOf = (sources, token) => {
        const pattern = new RegExp(`export const ${token}\\s*=\\s*['"]([^'"]+)['"]`);
        for (const source of sources) {
          const found = pattern.exec(source);
          if (found !== null) return found[1];
        }
        return undefined;
      };
      const writers = [];
      for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const unitPath = join(modulesDir, entry.name, 'unit.ts');
        if (!existsSync(unitPath)) continue;
        const unitSource = read(unitPath);
        const sources = [unitSource, ...readModuleSources(join(modulesDir, entry.name))];
        for (const match of unitSource.matchAll(/name:\s*([^,}]+?)\s*,\s*writes:\s*true/g)) {
          const token = match[1].trim();
          const literal = /^['"]([^'"]+)['"]$/.exec(token);
          const name = literal === null ? constantOf(sources, token) : literal[1];
          writers.push({ module: entry.name, token, name });
        }
      }

      const missing = [];
      for (const moduleId of new Set(writers.map((item) => item.module))) {
        const hostSource = read(pkg(`src/modules/${moduleId}/index.ts`));
        if (!hostSource.includes('needsApproval')) missing.push(`${moduleId}/index.ts 没交 needsApproval`);
      }
      report(
        '★ 清单里声明会写的工具都由**它自己的套件**认领（外壳不再按名字认领）',
        missing.length === 0,
        missing.join(' · ') || writers.map((item) => `${item.module}:${item.name ?? item.token}`).join(' · '),
      );
    },
  },
  {
    title: '★ 审批机制里没有任何工具名（认领全在套件，外壳只留机制）',
    run(ctx, report) {
      const approvalSource = read(join(SHARED_SRC, 'host/tool-approval.ts'));
      report(
        '★ 审批机制里没有任何工具名（认领全在套件，外壳只留机制）',
        !/workbench_/.test(approvalSource),
        `tool-approval.ts 里的 workbench_ 字面量：${String((approvalSource.match(/workbench_/g) ?? []).length)} 个`,
      );
    },
  },
  {
    title: '★ 完全权限（审批 never + danger-full-access）下不再把 ask 交给 dsh（它会把 ask 自动拒掉）',
    run(ctx, report) {

      const hostSource = read(pkg('src/app/host.ts'));
      const gateSource = read(pkg('src/shared/api/host/approval-gate.ts'));
      const mechanism = read(pkg('src/shared/api/host/permission-mode.ts'));
      const wired =
        hostSource.includes('createApprovalGate(') &&
        gateSource.includes('fullPermissionOf(') &&
        gateSource.includes('skipAsk');
      const detects =
        mechanism.includes("'approval'") &&
        mechanism.includes("'sandboxPolicy'") &&
        mechanism.includes("'never'") &&
        mechanism.includes("'danger-full-access'");
      report(
        '★ 完全权限（审批 never + danger-full-access）下不再把 ask 交给 dsh（它会把 ask 自动拒掉）',
        wired && detects,
        `接线${wired ? '在' : '缺'} · 判据${detects ? '在' : '缺'}`,
      );
    },
  },
  {
    title: '★ 跨仓兜底表已经删掉（外壳里只有套件交的那一份认领；老模块靠升级，不许再加回来）',
    run(ctx, report) {

      const legacyPath = pkg('src/shared/api/host/approval-legacy.ts');
      report(
        '★ 跨仓兜底表已经删掉（外壳里只有套件交的那一份认领；老模块靠升级，不许再加回来）',
        !existsSync(legacyPath),
        existsSync(legacyPath) ? 'approval-legacy.ts 又出现了：写清为什么非它不可，别默认把它加回来' : '已删',
      );
    },
  },
];
