import { describe, expect, it } from 'vitest';
import { createDiyRig } from '../__tests__/diy-harness';
import { specArgvOf, SPEC_TIMEOUT_MS } from './diy-spec';
import { DIY_SPEC_TOOL } from '../unit';

const SPEC = JSON.stringify({
  site: 'inventory',
  name: 'publish',
  command: 'opencli inventory publish',
  access: 'write',
  positionals: [],
  command_options: [
    { name: 'env_name', required: true, help: '环境名称 ID' },
    { name: 'yes', required: false, default: false },
  ],
  columns: ['task_id'],
});

describe('问一条命令的形状：site 与名字两个词', () => {
  it('空格形式、斜杠形式、多余空白都归一成同一条 argv', () => {
    expect(specArgvOf('inventory publish')).toEqual(['inventory', 'publish', '--help', '-f', 'json']);
    expect(specArgvOf('inventory/publish')).toEqual(['inventory', 'publish', '--help', '-f', 'json']);
    expect(specArgvOf('  inventory   publish \n')).toEqual(['inventory', 'publish', '--help', '-f', 'json']);
  });

  it('少一个词 / 多一个词 / 空串都不猜，回空数组（调用方当场拒）', () => {
    expect(specArgvOf('inventory')).toEqual([]);
    expect(specArgvOf('')).toEqual([]);
    expect(specArgvOf('inventory publish now')).toEqual([]);
    expect(specArgvOf('   ')).toEqual([]);
  });
});

describe('这把工具', () => {
  const rig = createDiyRig();

  it('★★ 把 opencli 自己的 JSON 原样交出去（access / 入参 / 出参列都在里面）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: SPEC }] });
    const answer = (await built.tool(DIY_SPEC_TOOL).execute({ command: 'inventory publish' }, rig.diyExec())) as {
      ok: boolean;
      spec?: { access?: string; columns?: readonly string[] };
      stdout: string;
    };

    expect(answer.ok).toBe(true);
    expect(answer.spec?.access).toBe('write');
    expect(answer.spec?.columns).toEqual(['task_id']);
    expect(answer.stdout).toContain('command_options');
  });

  it('★★ 一行命令都不认识就当场拒，而且零 opencli 调用', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: SPEC }] });

    await expect(built.tool(DIY_SPEC_TOOL).execute({ command: 'inventory' }, rig.diyExec())).rejects.toThrow(
      'site 与名字两个词',
    );
    expect(built.commands).toEqual([]);
  });

  it('★★ 不看屏、也不要调试约定（问形状是本地一条 --help）', async () => {
    const built = rig.harness({ withTools: true, pact: false, probe: [{ stdout: SPEC }] });

    await built.tool(DIY_SPEC_TOOL).execute({ command: 'inventory/publish' }, rig.diyExec());

    expect(built.commands).toHaveLength(1);
    expect(built.commands[0]).toContain('--help');
    expect(built.commands[0]).toContain("'inventory' 'publish'");
    expect(built.commands[0]).toContain('OPENCLI_WINDOW=background');
  });

  it('回的不是 JSON（老版本 / 报错原文）也照样把 stdout 交出去，不假装有 spec', async () => {
    const built = rig.harness({
      withTools: true,
      pact: false,
      probe: [{ stdout: 'Usage: opencli inventory publish', exitCode: 2 }],
    });
    const answer = (await built.tool(DIY_SPEC_TOOL).execute({ command: 'inventory publish' }, rig.diyExec())) as {
      ok: boolean;
      exitCode: number | null;
      spec?: unknown;
      stdout: string;
    };

    expect(answer.ok).toBe(false);
    expect(answer.exitCode).toBe(2);
    expect(answer.spec).toBeUndefined();
    expect(answer.stdout).toBe('Usage: opencli inventory publish');
  });

  it('超时可传；不给就是默认（问形状不该久等）', () => {
    expect(SPEC_TIMEOUT_MS).toBe(20000);
  });
});
