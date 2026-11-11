import { createHash } from 'node:crypto';
import { execa } from 'execa';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const LOCK = join(ROOT, 'scripts', 'opencli-extension.lock.json');
const VENDOR = join(ROOT, 'packages', 'core', 'vendor', 'browser-extension');

function out(line) {
  process.stdout.write(`${line}\n`);
}

function digestOf(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

async function main() {
  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
  const work = mkdtempSync(join(tmpdir(), 'opencli-extension-'));
  const zip = join(work, 'ext.zip');
  out(`下载 ${lock.upstream}`);
  await execa('curl', ['-sSL', '-o', zip, lock.upstream], { stdio: 'inherit' });
  const actual = digestOf(zip);
  if (actual !== lock.sha256) {
    out(`sha256 对不上：lock 里 ${lock.sha256}，实际 ${actual} —— 先确认源没被替换，再更新 lock`);
    return 1;
  }
  out(`sha256 对得上：${actual}`);
  await execa('unzip', ['-q', zip, '-d', join(work, 'out')], { stdio: 'inherit' });
  const license = existsSync(join(VENDOR, 'LICENSE')) ? readFileSync(join(VENDOR, 'LICENSE')) : undefined;
  rmSync(VENDOR, { recursive: true, force: true });
  mkdirSync(VENDOR, { recursive: true });
  cpSync(join(work, 'out'), VENDOR, { recursive: true });
  if (license !== undefined) writeFileSync(join(VENDOR, 'LICENSE'), license);
  out(`已更新 vendor 目录：${readdirSync(VENDOR).join('、')}`);
  rmSync(work, { recursive: true, force: true });
  return 0;
}

process.exitCode = await main();
