import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';

import { PKG, pkg, read } from '../lib.mjs';

const skillFile = (name) => read(pkg(`skills/workbench-module-diy/${name}`));
const diyConstants = () => read(pkg('src/shared/api/diy.ts'));

export const checks = [
  {
    title: '★ 宿主把工坊登记成工作台的工作区（少了它入口点了没反应，且不报错）',
    run(_ctx, report) {
      const hostEntry = read(pkg('src/app/host.ts'));
      const diyModule = read(pkg('src/shared/api/host/diy.ts'));
      const workshopPathModule = read(pkg('src/shared/api/diy.ts'));
      report(
        '★ 宿主把工坊登记成工作台的工作区（少了它入口点了没反应，且不报错）',
        hostEntry.includes("'workspaceRegistry'") &&
          hostEntry.includes('workshopPathOf(') &&
          /WORKSHOP_RELATIVE = 'workbench\/diy'/.test(workshopPathModule) &&
          diyModule.includes("from '@/shared/api/diy'"),
      );
    },
  },
  {
    title: '★ preset 在 dsh.bundle.patch 里（不接线就加载不到，且不报错）',
    run(_ctx, report) {
      const patches = JSON.parse(read(pkg('package.json'))).dsh?.bundle?.patch;
      const patchList = Array.isArray(patches) ? patches : [patches];
      report('★ preset 在 dsh.bundle.patch 里（不接线就加载不到，且不报错）', patchList.includes('./preset/diy.patch.yml'), patchList.join(' / '));
    },
  },
  {
    title: '★ preset/ 在 package.json 的 files 里（漏了不报错，只是装出去没有它）',
    run(_ctx, report) {
      const manifest = JSON.parse(read(pkg('package.json')));
      report('★ preset/ 在 package.json 的 files 里（漏了不报错，只是装出去没有它）', (manifest.files ?? []).includes('preset'));
    },
  },
  {
    title: '★ preset 与 dsh 出厂那份 standard.patch.yml 同步（生成的，不是手抄的）',
    run(_ctx, report) {
      const title = '★ preset 与 dsh 出厂那份 standard.patch.yml 同步（生成的，不是手抄的）';
      try {
        execFileSync(process.execPath, [pkg('scripts/gen-diy-preset.mjs'), '--check'], { stdio: 'pipe', encoding: 'utf8' });
        report(title, true);
      } catch (error) {
        const detail = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim().split('\n').slice(-4).join(' · ');
        report(title, false, detail);
      }
    },
  },
  {
    title: '★ preset id 只有一处真相（生成物与代码对得上）',
    run(_ctx, report) {
      const presetId = /DIY_PRESET_ID = '([^']+)'/.exec(diyConstants())?.[1];
      const presetPatch = read(pkg('preset/diy.patch.yml'));
      report(
        '★ preset id 只有一处真相（生成物与代码对得上）',
        presetId !== undefined && new RegExp(`^        id: ${presetId}$`, 'm').test(presetPatch),
        `代码说 ${String(presetId)}`,
      );
    },
  },
  {
    title: '★ 落 DIY 模式只有一份实现（`diyStartOptions` 带 agentPreset），客户端一行都不许自己写 preset',
    run(_ctx, report) {

      const clientEntry = read(pkg('src/app/client.tsx'));
      const entryLines = clientEntry.split('\n');
      const startsAt = entryLines.findIndex((line) => line.includes('const startSessionIn = '));
      const startsBody = startsAt < 0 ? '' : entryLines.slice(startsAt, startsAt + 12).join('\n');
      const presetSites = diyConstants().split('\n').filter((line) => line.includes('agentPreset: DIY_PRESET_ID')).length;
      const presetMentions = entryLines.filter((line) => line.includes('agentPreset')).length;
      report(
        '★ 落 DIY 模式只有一份实现（`diyStartOptions` 带 agentPreset），客户端一行都不许自己写 preset',
        startsAt >= 0 &&
          startsBody.includes('diyStartOptions(') &&
          startsBody.includes('ctx.uiWorkspace.startSession(') &&
          presetSites === 1 &&
          presetMentions === 0,
        `落模式实现 ${startsAt >= 0 ? '在' : '找不到'} · agentPreset：实现里 ${presetSites} 处 / client.tsx ${presetMentions} 处`,
      );
    },
  },
  {
    title: '★ 工坊那两条入口走同一份落模式实现（造一个模块 / 切到工坊的 startSession）',
    run(_ctx, report) {
      const clientEntry = read(pkg('src/app/client.tsx'));
      const entryLines = clientEntry.split('\n');
      const implAt = entryLines.findIndex((line) => line.includes('const buildModule = '));
      const implBody = implAt < 0 ? '' : entryLines.slice(implAt, implAt + 12).join('\n');
      const sidebarStartsIn = /startSession:\s*startSessionIn\b/.test(clientEntry);
      report(
        '★ 工坊那两条入口走同一份落模式实现（造一个模块 / 切到工坊的 startSession）',
        implAt >= 0 &&
          entryLines.filter((line) => /^\s*buildModule:\s*\(/.test(line)).length === 0 &&
          implBody.includes('selectProject(') &&
          implBody.includes('startSessionIn(') &&
          !implBody.includes('ctx.uiWorkspace.startSession(') &&
          sidebarStartsIn,
        `buildModule ${implAt >= 0} / selectProject ${implBody.includes('selectProject(')} / startSessionIn ${implBody.includes('startSessionIn(')} / 侧栏 startSession ${sidebarStartsIn}`,
      );
    },
  },
  {
    title: '★ 判域按"要不要新凭据"判，不按"要不要接新平台"',
    run(_ctx, report) {
      const designMd = skillFile('DESIGN.md');
      report(
        '★ 判域按"要不要新凭据"判，不按"要不要接新平台"',
        designMd.includes('要**新凭据**') && !designMd.includes('要接一个新平台的账号'),
        designMd.includes('要**新凭据**') ? '按新凭据判 ✅' : '判域表里没写"新凭据"',
      );
    },
  },
  {
    title: '★ 指引有"数据从哪来"那一节：预装的 opencli 探 → 固化成一条读 → 三态',
    run(_ctx, report) {
      const datasourceMd = skillFile('DATASOURCE.md');
      report(
        '★ 指引有"数据从哪来"那一节：预装的 opencli 探 → 固化成一条读 → 三态',
        datasourceMd.includes('opencli') &&
          datasourceMd.includes('预装') &&
          datasourceMd.includes('侦察兵') &&
          datasourceMd.includes('固化进模块') &&
          datasourceMd.includes('没登录'),
        `opencli ${datasourceMd.includes('opencli')} / 预装 ${datasourceMd.includes('预装')} / 固化 ${datasourceMd.includes('固化进模块')} / 三态 ${datasourceMd.includes('没登录')}`,
      );
    },
  },
  {
    title: '★ 指引有"写通道"那一节：现成写命令 → 入参/出参来源 → 没有预览档的不许试',
    run(_ctx, report) {
      const writesMd = skillFile('WRITES.md');
      report(
        '★ 指引有"写通道"那一节：现成写命令 → 入参/出参来源 → 没有预览档的不许试',
        writesMd.includes('opencli') &&
          writesMd.includes('预览') &&
          writesMd.includes('工程域') &&
          writesMd.includes('回读'),
        `opencli ${writesMd.includes('opencli')} / 预览 ${writesMd.includes('预览')} / 工程域 ${writesMd.includes('工程域')} / 回读 ${writesMd.includes('回读')}`,
      );
    },
  },
  {
    title: '★ 入口（SKILL.md）指向那一节，并且它排在"从模板改"之前',
    run(_ctx, report) {
      const skillMd = skillFile('SKILL.md');
      report(
        '★ 入口（SKILL.md）指向那一节，并且它排在"从模板改"之前',
        skillMd.includes('DATASOURCE.md') && skillMd.indexOf('DATASOURCE.md') < skillMd.indexOf('BUILD.md'),
        'SKILL.md 的索引与步骤',
      );
    },
  },
  {
    title: '★ 随包出货的 skill 里没有死链（链接必须落在包内且存在 —— 它的读者手里没有本仓）',
    run(_ctx, report) {

      const dir = pkg('skills/workbench-module-diy');
      const names = readdirSync(dir)
        .filter((name) => name.endsWith('.md'))
        .sort();
      const problems = [];
      let links = 0;
      for (const name of names) {
        const file = join(dir, name);
        for (const match of read(file).matchAll(/\]\(([^()\s]+)\)/g)) {
          const target = match[1];
          if (/^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(target)) continue;
          const pathPart = target.split('#')[0];
          if (pathPart === '') continue;
          links += 1;
          const resolved = resolve(dirname(file), pathPart);
          const inside = resolved === PKG || resolved.startsWith(PKG + sep);
          if (!inside) problems.push(`${name} → ${target}（爬出包：解析到 ${relative(PKG, resolved)}）`);
          else if (!existsSync(resolved)) problems.push(`${name} → ${target}（不存在）`);
        }
      }
      report(
        '★ 随包出货的 skill 里没有死链（链接必须落在包内且存在 —— 它的读者手里没有本仓）',
        problems.length === 0,
        problems.length === 0 ? `${names.length} 份指引 / ${links} 条包内链接` : problems.join('；'),
      );
    },
  },
  {
    title: '★ 工坊的新名字不在"旧名字"名单里（否则每次启动改名一次，永远改不干净）',
    run(_ctx, report) {
      const text = diyConstants();
      const titleNow = /WORKSHOP_TITLE = '([^']+)'/.exec(text)?.[1];
      const pastTitles = [...text.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      const pastLine = /WORKSHOP_PAST_TITLES[^=]*=\s*\[([^\]]*)\]/.exec(text)?.[1] ?? '';
      const past = [...pastLine.matchAll(/'([^']+)'/g)].map((m) => m[1]);
      report(
        '★ 工坊的新名字不在"旧名字"名单里（否则每次启动改名一次，永远改不干净）',
        titleNow !== undefined && !past.includes(titleNow) && pastTitles.includes(titleNow),
        `新 ${String(titleNow)} / 旧 ${past.join('、')}`,
      );
    },
  },
  {
    title: '★ 换名字只在客户端有一条一次性迁移（只认我们自己起过的名字）',
    run(_ctx, report) {
      report(
        '★ 换名字只在客户端有一条一次性迁移（只认我们自己起过的名字）',
        read(pkg('src/app/client.tsx')).includes('WORKSHOP_PAST_TITLES.includes(title)'),
      );
    },
  },
  {
    title: '★ 声明了验过的 dsh 下限（DIY preset 是照那一代派生的，旧一代整个不显示）',
    run(_ctx, report) {

      const manifest = JSON.parse(read(pkg('package.json')));
      const floor = manifest.engines?.dsh;
      const pinned = manifest.devDependencies?.['@deepseek-ai/dsh-client-ui-primitives'];
      const floorVersion = /^>=\s*(.+)$/.exec(floor ?? '')?.[1];
      const launcher = read(pkg('bin/dsh-workbench'));
      const gateReadsManifest = launcher.includes('engines');
      const noSecondCopy = floorVersion === undefined || !launcher.includes(floorVersion);
      report(
        '★ 声明了验过的 dsh 下限（DIY preset 是照那一代派生的，旧一代整个不显示）',
        floorVersion !== undefined && floorVersion === pinned && gateReadsManifest && noSecondCopy,
        `engines.dsh ${JSON.stringify(floor)} · 验过的 dsh（primitives pin）${String(pinned)} · 启动器读清单 ${gateReadsManifest} · 启动器没另写版本号 ${noSecondCopy}`,
      );
    },
  },
  {
    title: '★ DIY 模式挂不起来时，启动体检会摆出来并停在那一页（不是进去才发现）',
    run(_ctx, report) {

      const preflight = read(pkg('src/shared/api/host/preflight.ts'));
      const route = read(pkg('src/shared/api/host/preflight-route.ts'));
      const health = read(pkg('src/shared/api/host/diy-preset-health.ts'));
      const gate = read(pkg('src/app/layouts/env-gate/boot-gate.ts'));
      const gateText = read(pkg('src/app/layouts/env-gate/gate-text.ts'));
      const launcher = read(pkg('bin/dsh-workbench'));
      const command = /DIY_UPGRADE_COMMAND = '([^']+)'/.exec(health)?.[1];
      const hostSide =
        preflight.includes('diyGap') && preflight.includes('probeDiy') && health.includes('agentPresets');
      const routeSide = route.includes('createDiyPresetProbe');
      const clientSide =
        gate.includes('diyGap') && gateText.includes("t('env.diy.ok')") && gateText.includes("t('env.diy.short')");
      const sameCommand = command !== undefined && launcher.includes(command);
      report(
        '★ DIY 模式挂不起来时，启动体检会摆出来并停在那一页（不是进去才发现）',
        hostSide && routeSide && clientSide && sameCommand,
        `宿主读名册 ${hostSide} · 路由接上 ${routeSide} · 界面停在那一页 ${clientSide} · 升级命令一处真相 ${sameCommand}（${String(command)}）`,
      );
    },
  },
];
