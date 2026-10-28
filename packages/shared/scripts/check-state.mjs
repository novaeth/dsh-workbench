import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

function walk(dir, acc = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

const findings = [];
for (const file of walk(SRC)) {
  const rel = file.slice(SRC.length + 1);
  const source = readFileSync(file, 'utf8');
  source.split('\n').forEach((line, index) => {
    const at = `${rel}:${index + 1}`;
    if (/^(export\s+)?(let|var)\s/.test(line)) {
      findings.push(`${at} 顶层可变绑定：${line.trim()}`);
      return;
    }
    const held = /^(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+(Map|Set)\b/.exec(line);
    if (!held) return;
    const [, , name, kind] = held;
    const mutators = kind === 'Map' ? ['.set(', '.delete(', '.clear('] : ['.add(', '.delete(', '.clear('];
    const mutated = mutators.some((call) => source.includes(`${name}${call}`));
    if (mutated) findings.push(`${at} 顶层可变 ${kind}（${name} 被写入）：${line.trim()}`);
  });
}

const HOST_SIDE_EFFECTS = [
  [/from 'node:child_process'/, '起子进程'],
  [/process\.env\.[A-Za-z_$][\w$]*\s*=[^=]/, '改 process.env'],
];

const RUNTIME_FS_WRITES = [
  [/writeFileSync|writeFile\(|appendFileSync|mkdirSync|symlinkSync|rmSync|renameSync|unlinkSync|copyFileSync/,
    '写文件系统'],
];

for (const file of walk(join(SRC, 'host'))) {
  const rel = `host/${file.slice(join(SRC, 'host').length + 1)}`;
  const source = readFileSync(file, 'utf8');
  source.split('\n').forEach((line, index) => {
    const comment = /^\s*(\*|\/\/|\/\*)/.test(line);
    if (comment) return;
    for (const [pattern, what] of HOST_SIDE_EFFECTS) {
      if (pattern.test(line)) findings.push(`${rel}:${index + 1} 共享包${what}：${line.trim()}`);
    }
    if (/opencli/i.test(line)) {
      for (const [pattern, what] of RUNTIME_FS_WRITES) {
        if (pattern.test(line)) findings.push(`${rel}:${index + 1} 提到运行时又${what}：${line.trim()}`);
      }
    }
  });
}

const PROTOCOL_FILES = [
  'host/port-types.ts',
  'host/adapter-types.ts',
  'host/http.ts',
  'host/lib-runners.ts',
  'host/adapter-set.ts',
];

const VOCABULARY = [/'opencli-plugin'/];
const COMMENT = /^\s*(\*|\/\/|\/\*)/;

for (const rel of PROTOCOL_FILES) {
  const file = join(SRC, rel);
  if (!existsSync(file)) continue;
  readFileSync(file, 'utf8').split('\n').forEach((line, index) => {
    if (!/opencli/i.test(line)) return;
    if (COMMENT.test(line)) return;
    if (VOCABULARY.some((pattern) => pattern.test(line))) return;
    findings.push(`${rel}:${index + 1} 协议面出现运行时实现名：${line.trim()}`);
  });
}

if (findings.length > 0) {
  console.error(`✖ 共享包判据不过：${findings.length} 处`);
  for (const finding of findings) console.error(`  · ${finding}`);
  console.error('  （带状态的东西留外壳，靠 kit / peer 保证只有一份；共享包会被每个消费者各打一份）');
  process.exit(1);
}
console.log('✔ 共享包无模块级可变状态、协议面没有运行时实现名（工厂与纯函数可以安全复制）');
