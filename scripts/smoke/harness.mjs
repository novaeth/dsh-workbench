import { execa } from 'execa';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const IS_WIN = process.platform === 'win32';
export const SHELL_KIND = IS_WIN ? 'pwsh' : 'bash';
export const PWSH_PREAMBLE = '[Console]::OutputEncoding=[Text.Encoding]::UTF8;';

export async function loadHost() {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  return import(pathToFileURL(join(root, 'packages', 'shared', 'dist', 'host.js')).href);
}

export function createReporter() {
  const failures = [];
  const ok = (name, extra = '') => {
    process.stdout.write(`✅ ${name}${extra === '' ? '' : ` —— ${extra}`}\n`);
  };
  const bad = (name, detail) => {
    failures.push(`${name}：${detail}`);
    process.stdout.write(`❌ ${name} —— ${detail}\n`);
  };
  const check = (name, pass, detail = '') => {
    if (pass) ok(name, detail);
    else bad(name, detail);
  };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const finish = () => {
    if (failures.length > 0) {
      process.stdout.write(`\n${String(failures.length)} 项没过：\n${failures.map((one) => `- ${one}`).join('\n')}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write('\n全部通过。\n');
  };
  return { ok, bad, check, same, finish };
}

export function createRealShell(host, { kind = SHELL_KIND, onCommand, defaultTimeoutMs = 20000 } = {}) {
  return {
    resolve(request) {
      onCommand?.(request.command);
      const script = kind === 'pwsh' ? `${PWSH_PREAMBLE}${request.command}` : request.command;
      const invocation = host.invocationOf(kind, script);
      return {
        file: invocation.file,
        args: invocation.args,
        timeoutMs: request.timeoutMs,
        ...(request.env === undefined ? {} : { env: request.env }),
      };
    },
    async execute(spec) {
      const done = await execa(spec.file, spec.args, {
        reject: false,
        timeout: spec.timeoutMs ?? defaultTimeoutMs,
        windowsHide: true,
        stripFinalNewline: false,
        maxBuffer: 8 * 1024 * 1024,
        ...(spec.env === undefined ? {} : { env: { ...process.env, ...spec.env } }),
      });
      return {
        result: async () => ({
          exitCode: typeof done.exitCode === 'number' ? done.exitCode : null,
          timedOut: done.timedOut === true,
          aborted: false,
          stdout: { text: done.stdout ?? '', truncated: false },
          stderr: { text: done.stderr ?? '', truncated: false },
        }),
      };
    },
  };
}
