import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readBootRecord } from '@dsh-workbench/shared/host';
import { bootOkAction } from '../boot-ok';

const dir = mkdtempSync(join(tmpdir(), 'dsh-wb-boot-ok-'));

describe('客户端起来了 → 宿主落一条确认记录', () => {
  it('★ 落的是宿主这一版（版本由宿主给，客户端说不上话）', () => {
    const file = join(dir, 'up.json');
    const action = bootOkAction({ version: () => '1.2.3-beta.3', file });

    expect(action.resource).toBe('workbenchBootOk');
    expect(action.handle({})).toEqual({ ok: true, version: '1.2.3-beta.3' });
    const record = readBootRecord(file);
    expect(record?.version).toBe('1.2.3-beta.3');
    expect(record?.pid).toBe(process.pid);
    expect(Number.isFinite(Date.parse(record?.at ?? ''))).toBe(true);
  });

  it('★ 再报一次照旧（幂等，客户端重挂不会写坏）', () => {
    const file = join(dir, 'twice.json');
    const action = bootOkAction({ version: () => '1.2.3-beta.3', file });
    action.handle({});
    action.handle({});
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ version: '1.2.3-beta.3' });
  });

  it('★ 宿主启动时就落 boot 记录：启动那一拍收在 boot-chores 里，接线在 app/host.ts（少一行这条链就断在这儿）', async () => {
    const host = readFileSync(new URL('../../../../app/host.ts', import.meta.url), 'utf8');
    const chores = readFileSync(new URL('../boot-chores.ts', import.meta.url), 'utf8');
    expect(host).toContain('bootChores({ ctx, supply: adapters.modules');
    expect(host).toContain('bootOkAction({ version:');
    expect(chores).toContain('writeBootRecord({ version');
    expect(chores).toContain('workbenchBootFile()');
  });
});
