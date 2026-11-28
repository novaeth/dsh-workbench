import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';

import { PKG, pkg, read, REPO } from '../lib.mjs';
import { documentedInterfaces } from '../public-types.mjs';

const skillFile = (name) => read(pkg(`skills/workbench-module-diy/${name}`));
const diyConstants = () => read(pkg('../shared/src/contract/protocol/diy.ts'));

function skillAnchorCheck(title, file, needles) {
  return {
    title,
    run(_ctx, report) {
      const text = skillFile(file);
      report(
        title,
        needles.every((needle) => text.includes(needle)),
        needles.map((needle) => `${needle} ${text.includes(needle)}`).join(' / '),
      );
    },
  };
}

export const checks = [
  {
    title: '★ 宿主把工坊登记成工作台的工作区（少了它入口点了没反应，且不报错）',
    run(_ctx, report) {
      const hostEntry = read(pkg('src/app/host.ts'));
      const workshop = read(pkg('src/shared/api/host/workshop-session.ts'));
      const diyModule = read(pkg('src/shared/api/host/diy.ts'));
      report(
        '★ 宿主把工坊登记成工作台的工作区（少了它入口点了没反应，且不报错）',
        hostEntry.includes('registerWorkshopSession(') &&
          workshop.includes("'workspaceRegistry'") &&
          workshop.includes('workshopPathOf(') &&
          /join\(workbenchRoot\(\), 'diy'\)/.test(diyModule) &&
          !diyModule.includes('dshHomePath'),
      );
    },
  },
  {
    title: '★ 空工坊的首会话由宿主按 DIY 预设创建（没有会话控制器时只登记工作区）',
    run(_ctx, report) {
      const workshop = read(pkg('src/shared/api/host/workshop-session.ts'));
      const wired = read(pkg('src/app/host.ts')).includes('registerWorkshopSession(ctx)');
      const creates = ['sessionIds.length > 0', 'agentPreset: DIY_PRESET_ID', "'sessionController'"].every(
        (needle) => workshop.includes(needle),
      );
      report(
        '★ 空工坊的首会话由宿主按 DIY 预设创建（没有会话控制器时只登记工作区）',
        wired && creates,
        `接线 ${wired} · 只在空工坊建 ${workshop.includes('sessionIds.length > 0')} · 带 DIY 预设 ${workshop.includes('agentPreset: DIY_PRESET_ID')} · 有控制器才建 ${workshop.includes("'sessionController'")}`,
      );
    },
  },
  {
    title: '★ DIY preset 在启动时按选中的模式派生（默认 standard，无生成物）',
    run(_ctx, report) {
      const title = '★ DIY preset 在启动时按选中的模式派生（默认 standard，无生成物）';
      const hostEntry = read(pkg('src/app/host.ts'));
      const hostSide = read(pkg('src/shared/api/host/diy-preset.ts'));
      const orchestration = read(pkg('src/shared/api/host/diy-preset-host.ts'));
      const derive = read(pkg('../shared/src/host/diy/diy-preset.ts'));
      const manifest = JSON.parse(read(pkg('package.json')));
      const patches = manifest.dsh?.bundle?.patch;
      const patchList = Array.isArray(patches) ? patches : [patches];
      const noArtifact = !patchList.includes('./preset/diy.patch.yml') && !existsSync(pkg('preset/diy.patch.yml'));
      const wired = hostEntry.includes('mountDiyPreset(') && orchestration.includes('registerDiyPreset(');
      const sourceChoice = orchestration.includes('diyPresetSource') && orchestration.includes('settings.watch');
      const hostReads = hostSide.includes("'agentPresets'") && hostSide.includes("'loader'") && hostSide.includes('.register(');
      const deriveAnchors =
        derive.includes('DIY_PRESET_ID') &&
        derive.includes('skill-filesystem') &&
        derive.includes('tool-cordis') &&
        derive.includes('tool-plugin-manager');
      report(
        title,
        wired && sourceChoice && hostReads && deriveAnchors && noArtifact,
        `宿主接线 ${wired} · 按设置选来源 ${sourceChoice} · 读 loader/agentPresets ${hostReads} · 三处差分锚点 ${deriveAnchors} · 生成物已删 ${noArtifact}`,
      );
    },
  },
  {
    title: '★ preset id 只有一处真相（派生那份从 DIY_PRESET_ID 来，宿主不另写一遍）',
    run(_ctx, report) {
      const presetId = /DIY_PRESET_ID = '([^']+)'/.exec(diyConstants())?.[1];
      const derive = read(pkg('../shared/src/host/diy/diy-preset.ts'));
      const hostSide = read(pkg('src/shared/api/host/diy-preset.ts'));
      const sameId = presetId !== undefined && derive.includes('id: DIY_PRESET_ID');
      const notCopied = presetId === undefined || (!hostSide.includes(`'${presetId}'`) && !hostSide.includes(`"${presetId}"`));
      report(
        '★ preset id 只有一处真相（派生那份从 DIY_PRESET_ID 来，宿主不另写一遍）',
        sameId && notCopied,
        `代码说 ${String(presetId)} · 派生用常量 ${sameId} · 宿主没另写 ${notCopied}`,
      );
    },
  },
  {
    title: '★ 落 DIY 模式只有一份实现（`diyStartOptions` 带 agentPreset），客户端一行都不许自己写 preset',
    run(_ctx, report) {

      const clientEntry = read(pkg('src/app/client.tsx'));
      const entryLines = clientEntry.split('\n');
      const injectAt = entryLines.findIndex((line) => line.includes('export const inject = ['));
      const injectClose = injectAt < 0 ? -1 : entryLines.findIndex((line, index) => index > injectAt && line.trim() === '];');
      const injectEnd = injectAt < 0 ? -1 : injectClose < 0 ? injectAt : injectClose;
      const outsideInject = (index) => injectAt < 0 || index < injectAt || index > injectEnd;
      const startsAt = entryLines.findIndex((line) => line.includes('const startSessionIn = '));
      const startsBody = startsAt < 0 ? '' : entryLines.slice(startsAt, startsAt + 12).join('\n');
      const presetSites = read(pkg('src/shared/api/diy.ts'))
        .split('\n')
        .filter((line) => line.includes('agentPreset: DIY_PRESET_ID')).length;
      const presetMentions = entryLines.filter((line, index) => outsideInject(index) && line.includes('agentPreset')).length;
      report(
        '★ 落 DIY 模式只有一份实现（`diyStartOptions` 带 agentPreset），客户端一行都不许自己写 preset',
        startsAt >= 0 &&
          startsBody.includes('diyDraftOptions(') &&
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
  skillAnchorCheck(
    '★ 指引有"数据从哪来"那一节：站点表 → 预装的运行时探 → 固化成一条读 → 三态',
    'DATASOURCE.md',
    ['运行时', '预装', '侦察兵', '固化进模块', '没登录', '站点表', 'check --only contracts'],
  ),
  skillAnchorCheck(
    '★ 指引有"写通道"那一节：现成写命令 → 入参/出参来源 → 没有预览档的不许试',
    'WRITES.md',
    ['运行时', '预览', '工程域', '回读'],
  ),
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
    title: '★ 登记的公开类型成员都有 JSDoc（surface name=<类型> 才答得出用法）',
    run(_ctx, report) {
      const missing = [];
      let total = 0;
      for (const { file, name: wanted, members } of documentedInterfaces()) {
        const text = read(join(REPO, file));
        const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
        let found = false;
        source.forEachChild((node) => {
          if (!ts.isInterfaceDeclaration(node) || node.name.text !== wanted) return;
          found = true;
          if (members !== 'all') {
            const present = node.members.map((member) => member.name.getText(source));
            for (const one of members) if (!present.includes(one)) missing.push(`${wanted}.${one}（不在接口里）`);
          }
          const listed =
            members === 'all'
              ? node.members
              : node.members.filter((member) => members.includes(member.name.getText(source)));
          for (const member of listed) {
            total += 1;
            if (ts.getJSDocCommentsAndTags(member).length === 0) missing.push(`${wanted}.${member.name.getText(source)}`);
          }
        });
        if (!found) missing.push(`${wanted}（在 ${file} 里没找到）`);
      }
      report(
        '★ 登记的公开类型成员都有 JSDoc（surface name=<类型> 才答得出用法）',
        missing.length === 0 && total > 0,
        `${String(total)} 个成员${missing.length === 0 ? '都有 JSDoc' : `，缺 ${missing.join('、')}`}`,
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
    title: '★ 声明了验过的 dsh 下限（旧一代没有现场派生的注册口，DIY 整个不显示）',
    run(_ctx, report) {

      const manifest = JSON.parse(read(pkg('package.json')));
      const floor = manifest.engines?.dsh;
      const pinned = manifest.devDependencies?.['@deepseek-ai/dsh-client-ui-primitives'];
      const floorVersion = /^>=\s*(.+)$/.exec(floor ?? '')?.[1];
      const launcher = read(pkg('bin/dsh-workbench'));
      const gateReadsManifest = launcher.includes('engines');
      const noSecondCopy = floorVersion === undefined || !launcher.includes(floorVersion);
      const verifiedText = read(pkg('../shared/src/host/runtime/verified-dsh.ts'));
      const declared = /VERIFIED_DSH = '([^']+)'/.exec(verifiedText)?.[1];
      const sameVerified = declared !== undefined && declared === floorVersion;
      const recover = /'env\.hostVersion\.recover': '([^']+)'/.exec(read(pkg('../shared/src/i18n/zh.ts')))?.[1];
      const readmeRecover = recover !== undefined && read(pkg('README.md')).includes(recover.replace('{host}', 'dsh'));
      report(
        '★ 声明了验过的 dsh 下限（旧一代没有现场派生的注册口，DIY 整个不显示）',
        floorVersion !== undefined &&
          floorVersion === pinned &&
          gateReadsManifest &&
          noSecondCopy &&
          sameVerified &&
          readmeRecover,
        `engines.dsh ${JSON.stringify(floor)} · 验过的 dsh（primitives pin）${String(pinned)} · 启动器读清单 ${gateReadsManifest} · 启动器没另写版本号 ${noSecondCopy} · 启动检查读的那一版 ${String(declared)} 与下限一致 ${sameVerified} · 打不开时的恢复说明与 README 同句 ${readmeRecover}`,
      );
    },
  },
  {
    title: '★ DIY 模式挂不起来时，启动体检会摆出来并停在那一页（不是进去才发现）',
    run(_ctx, report) {

      const preflight = read(pkg('../adapter-probe/src/preflight/preflight.ts'));
      const route = read(pkg('../adapter-probe/src/preflight/preflight-route.ts'));
      const health = read(pkg('../adapter-probe/src/preflight/diy-preset-health.ts'));
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
