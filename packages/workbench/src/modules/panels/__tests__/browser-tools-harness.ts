import { afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import { DIY_DEBUG_SERVICE, UNITS_SERVICE, createDebugStore } from '@dsh-workbench/shared/host';
import { registerBrowserTools } from '../model/diy-browser-tools';
import { fakeWorkspace, fakeWorkspaceRegistry } from './fake-workspace-registry';

export const PAGE = JSON.stringify({
  plugin: '@dsh-workbench/core',
  pid: 1,
  url: 'https://workbench.example/',
  open: true,
  shown: true,
  title: 't',
});

export interface Outcome {
  readonly workshop?: string;
  readonly unit?: string;
  readonly session?: string;
  readonly opened?: boolean;
  readonly verb: string;
  readonly argv: readonly string[];
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly file?: string;
  readonly cropped?: boolean;
  readonly cropReason?: string;
}

interface Answer {
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly truncated?: boolean;
}

export function createBrowserRig() {
  const roots: string[] = [];

  afterEach(() => {
    while (roots.length > 0) {
      const root = roots.pop();
      if (root !== undefined) rmSync(root, { recursive: true, force: true });
    }
  });

  function browserRig(plan: {
    readonly pact?: boolean;
    readonly scaffold?: boolean;
    readonly answer: (line: string, index: number) => Answer;
  }) {
    const root = mkdtempSync(join(tmpdir(), 'wb-browser-tools-'));
    roots.push(root);
    const workshop = join(root, 'workbench', 'diy');
    const profile = join(root, 'profiles', 'workbench');
    const packages = join(workshop, 'packages');
    mkdirSync(profile, { recursive: true });
    if (plan.scaffold !== false) {
      mkdirSync(workshop, { recursive: true });
      writeFileSync(join(workshop, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');
      const dir = join(packages, 'module-demo');
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: '@dsh-workbench/module-demo',
          version: '0.0.0',
          dsh: { workbench: { unit: 'demo' } },
        }),
      );
    }
    const commands: string[] = [];
    let index = 0;
    const shell = {
      resolve(request: { command: string }) {
        commands.push(request.command);
        return request;
      },
      async execute() {
        const line = commands[commands.length - 1] ?? '';
        const answer = plan.answer(line, index);
        index += 1;
        return {
          result: async () => ({
            exitCode: answer.exitCode === undefined ? 0 : answer.exitCode,
            timedOut: answer.timedOut ?? false,
            aborted: false,
            stdout: { text: answer.stdout ?? '', truncated: answer.truncated ?? false },
            stderr: { text: answer.stderr ?? '', truncated: false },
          }),
        };
      },
    };
    const registered: DshToolDefinition[] = [];
    const registry = {
      register(definition: DshToolDefinition) {
        registered.push(definition);
        return () => {};
      },
    };
    const store = createDebugStore();
    if (plan.pact !== false) {
      store.begin({
        sessionId: 's1',
        workspacePath: workshop,
        title: '工坊',
        board: workshop,
        unit: 'demo',
        name: 'demo',
        now: Date.now(),
      });
    }
    const ctx = {
      get: (key: string) => {
        if (key === 'tools') return registry as unknown as DshToolRegistry;
        if (key === 'shell') return shell;
        if (key === UNITS_SERVICE) {
          return { all: () => [{ unit: 'demo' }], refusals: () => [], failureOf: () => undefined };
        }
        if (key === DIY_DEBUG_SERVICE) return store;
        if (key === 'dshHomePath') return (relative: string) => join(root, relative);
        if (key === 'workspaceRegistry') return fakeWorkspaceRegistry(fakeWorkspace(workshop));
        if (key === 'profileContext') return { dir: profile };
        return undefined;
      },
      logger: { info: () => {}, warn: () => {} },
    } as unknown as DshHostContext;
    const disposers = registerBrowserTools(ctx, registry as unknown as DshToolRegistry);
    const exec = { agent: { session: { id: 's1', header: { cwd: workshop } } } } as unknown as DshToolRunContext;
    const toolOf = (name: string): DshToolDefinition => {
      const found = registered.find((one) => one.name === name);
      if (found === undefined) {
        throw new Error(`没有注册 ${name}（注册了：${registered.map((one) => one.name).join(', ')}）`);
      }
      return found;
    };
    return {
      root,
      workshop,
      packages,
      commands,
      registered,
      ctx,
      exec,
      tool: toolOf,
      dispose: () => {
        for (const one of disposers) one();
      },
    };
  }

  async function run(
    rig: ReturnType<typeof browserRig>,
    tool: string,
    raw: Record<string, unknown>,
  ): Promise<Outcome> {
    return (await rig.tool(tool).execute(raw, rig.exec)) as unknown as Outcome;
  }

  return { browserRig, run };
}
