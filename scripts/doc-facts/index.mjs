import { readText, writeText, parseBlocks, replaceBlock, normalizeBody } from './lib.mjs';
import { adapterSet, archRules, dataContract, gateChain, gateChainInline, gateChainLabels } from './blocks.mjs';
import { depEdges, packageTable, sharedExportsCheck } from './checks.mjs';
import { contractPorts, counts, mountContract, needsKinds, privateSymlink, skillsDesign, skillsSchema, skillsTools, templateScripts } from './extra-checks.mjs';
import { selfTest } from './selftest.mjs';

const BLOCK_FACTS = {
  'gate-chain': { files: ['ARCHITECTURE.md'], render: gateChain },
  'gate-chain-inline': { files: ['AGENTS.md', 'CONTRIBUTING.md'], render: gateChainInline },
  'gate-chain-labels': {
    files: ['packages/docs/site/desktop/views/guide/architecture.md'],
    render: gateChainLabels,
  },
  'arch-rules': { files: ['ARCHITECTURE.md'], render: archRules },
  'adapter-set': { files: ['ADAPTERS.md'], render: adapterSet },
  'data-contract': { files: ['ARCHITECTURE.md'], render: dataContract },
};

const ASSERT_FACTS = {
  'package-table': packageTable,
  'dep-edges': depEdges,
  'shared-exports': sharedExportsCheck,
  'contract-ports': contractPorts,
  counts,
  'skills-tools': skillsTools,
  'skills-design': skillsDesign,
  'private-symlink': privateSymlink,
  'skills-schema': skillsSchema,
  'needs-kinds': needsKinds,
  'mount-contract': mountContract,
  'template-scripts': templateScripts,
};

function option(args, name) {
  const prefixed = args.find((one) => one.startsWith(`${name}=`));
  if (prefixed !== undefined) return prefixed.slice(name.length + 1);
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function selected(map, only) {
  if (only === undefined) return Object.entries(map);
  return map[only] === undefined ? [] : [[only, map[only]]];
}

function printProblem(problem) {
  console.error(`✖ ${problem.file}:${problem.line} ${problem.message}`);
  if (problem.fix !== undefined) console.error(`  → ${problem.fix}`);
}

async function runCheck(only, reportOnly) {
  const selftest = await selfTest();
  const broken = selftest.filter((one) => !one.ok);
  if (broken.length > 0) {
    for (const one of broken) console.error(`✖ 自检失败：${one.name}`);
    console.error(`✖ 自检 ${broken.length}/${selftest.length} 条失败`);
    return 2;
  }
  const problems = [];
  const markerErrors = [];
  let blockCount = 0;
  let assertCount = 0;
  for (const [name, fact] of selected(BLOCK_FACTS, only)) {
    const rendered = await Promise.resolve(fact.render());
    for (const file of fact.files) {
      const text = readText(file);
      const parsed = parseBlocks(text);
      if (parsed.errors.length > 0) {
        for (const error of parsed.errors) markerErrors.push(`${file} ${error}`);
        continue;
      }
      const block = parsed.blocks.find((one) => one.name === name);
      if (block === undefined) {
        markerErrors.push(`${file}: 缺 <!-- doc-facts:begin ${name} --> 标记`);
        continue;
      }
      blockCount += 1;
      const lines = text.split('\n');
      const actual = lines.slice(block.beginLine + 1, block.endLine).join('\n');
      if (normalizeBody(actual) !== normalizeBody(rendered)) {
        problems.push({
          file,
          line: block.beginLine + 2,
          message: `块 ${name} 与代码事实不一致`,
          fix: '跑 pnpm run doc-facts:write 重新生成，再看 diff',
        });
      }
    }
  }
  for (const [name, run] of selected(ASSERT_FACTS, only)) {
    assertCount += 1;
    const findings = run();
    for (const item of findings) {
      problems.push({
        file: item.file,
        line: item.line,
        message: `断言 ${name}：${item.message}`,
        fix: item.fix,
      });
    }
  }
  for (const error of markerErrors) console.error(`✖ 标记：${error}`);
  for (const problem of problems) printProblem(problem);
  if (markerErrors.length > 0) {
    console.error(`✖ 标记错误 ${markerErrors.length} 处`);
    return 2;
  }
  if (problems.length > 0) {
    console.error(`✖ 文档事实：${problems.length} 处漂移（${blockCount} 个管理块 / ${assertCount} 条断言）`);
    return reportOnly ? 0 : 1;
  }
  console.log(`✔ 文档事实一致（${blockCount} 个管理块 / ${assertCount} 条断言 / 自检 ${selftest.length} 条）`);
  return 0;
}

async function runWrite(only) {
  if (only !== undefined && BLOCK_FACTS[only] === undefined) throw new Error(`${only} 不是块事实（断言没有 --write）`);
  let count = 0;
  for (const [name, fact] of selected(BLOCK_FACTS, only)) {
    const rendered = await Promise.resolve(fact.render());
    for (const file of fact.files) {
      const text = readText(file);
      const next = replaceBlock(text, name, rendered);
      if (next === text) {
        console.log(`○ 未变：${file}（${name}）`);
        continue;
      }
      writeText(file, next);
      console.log(`✔ 已更新：${file}（${name}）`);
      count += 1;
    }
  }
  console.log(`✔ 写入完成：${count} 处`);
  return 0;
}

function runList() {
  for (const [name, fact] of Object.entries(BLOCK_FACTS)) {
    console.log(`block\t${name}\t${fact.files.join(' · ')}`);
  }
  for (const name of Object.keys(ASSERT_FACTS)) console.log(`assert\t${name}`);
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const reportOnly = args.includes('--report-only');
  const only = option(args, '--only');
  if (only !== undefined && BLOCK_FACTS[only] === undefined && ASSERT_FACTS[only] === undefined) {
    throw new Error(`没有这个事实：${only}`);
  }
  if (args.includes('--list')) {
    runList();
    return 0;
  }
  if (args.includes('--self-test')) {
    const results = await selfTest();
    for (const one of results) console.log(`${one.ok ? '✔' : '✖'} ${one.name}`);
    console.log(`自检：${results.filter((one) => one.ok).length}/${results.length}`);
    return results.every((one) => one.ok) ? 0 : 1;
  }
  if (write && reportOnly) throw new Error('--write 与 --report-only 不能同时用');
  if (write) return runWrite(only);
  return runCheck(only, reportOnly);
}

main()
  .then((code) => process.exit(code))
  .catch((error) => {
    console.error(`✖ ${error.message}`);
    process.exit(2);
  });
