import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  adoptTarballFile,
  cleanupStaging,
  journalFileOf,
  mirrorJournal,
  prepareStaging,
  stagingDirOf,
} from '../diy-release-staging';

const made: string[] = [];
const previous = process.env.DSH_WORKBENCH_HOME;

afterEach(() => {
  for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  if (previous === undefined) delete process.env.DSH_WORKBENCH_HOME;
  else process.env.DSH_WORKBENCH_HOME = previous;
});

function tempHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'wb-staging-home-'));
  made.push(home);
  return home;
}

describe('diy-release-staging', () => {
  it('staging 目录按 unit 收敛，resume 时不清空', () => {
    const raw = `acme/thing-${String(Date.now())}`;
    const dir = stagingDirOf(raw);
    const fresh = prepareStaging(raw, false);
    expect(fresh).toBe(dir);
    expect(dir.startsWith(tmpdir())).toBe(true);
    expect(dir.includes('acme-thing')).toBe(true);
    const marker = join(fresh, 'marker.txt');
    writeFileSync(marker, 'x');
    expect(prepareStaging(raw, true)).toBe(dir);
    expect(existsSync(marker)).toBe(true);
    cleanupStaging(raw);
    expect(existsSync(dir)).toBe(false);
  });

  it('staging 被清掉后 resume：从运行时根的记录兜底，不丢可续跑的那一份', () => {
    const home = tempHome();
    process.env.DSH_WORKBENCH_HOME = home;
    const unit = `resume-${String(Date.now())}`;
    const mirrored = join(home, 'releases', `${unit}.json`);
    mkdirSync(dirname(mirrored), { recursive: true });
    writeFileSync(mirrored, JSON.stringify({ run: { state: 'running', phase: 'workspace' } }));
    cleanupStaging(unit);
    const staging = prepareStaging(unit, true);
    made.push(staging);
    const seeded = JSON.parse(readFileSync(journalFileOf(staging, unit), 'utf8')) as { run: { state: string } };
    expect(seeded.run.state).toBe('running');
    cleanupStaging(unit);
  });

  it('staging 里已经有 journal：resume 不拿镜像记录盖掉它', () => {
    const home = tempHome();
    process.env.DSH_WORKBENCH_HOME = home;
    const unit = `resume-keep-${String(Date.now())}`;
    const mirrored = join(home, 'releases', `${unit}.json`);
    mkdirSync(dirname(mirrored), { recursive: true });
    writeFileSync(mirrored, JSON.stringify({ run: { state: 'done' } }));
    const staging = prepareStaging(unit, false);
    made.push(staging);
    mkdirSync(dirname(journalFileOf(staging, unit)), { recursive: true });
    writeFileSync(journalFileOf(staging, unit), JSON.stringify({ run: { state: 'interrupted' } }));
    prepareStaging(unit, true);
    const kept = JSON.parse(readFileSync(journalFileOf(staging, unit), 'utf8')) as { run: { state: string } };
    expect(kept.run.state).toBe('interrupted');
    cleanupStaging(unit);
  });

  it('journal 从 staging 镜像回运行时根', () => {
    const home = tempHome();
    process.env.DSH_WORKBENCH_HOME = home;
    const unit = `demo-${String(Date.now())}`;
    const staging = prepareStaging(unit, false);
    made.push(staging);
    const journal = journalFileOf(staging, unit);
    mkdirSync(dirname(journal), { recursive: true });
    writeFileSync(journal, JSON.stringify({ state: 'done' }));
    mirrorJournal(staging, unit);
    const mirrored = JSON.parse(readFileSync(join(home, 'releases', `${unit}.json`), 'utf8')) as { state: string };
    expect(mirrored.state).toBe('done');
  });

  it('产物从临时目录搬回 artifacts，缺文件时不动', () => {
    const home = tempHome();
    process.env.DSH_WORKBENCH_HOME = home;
    const unit = 'hello';
    const staging = prepareStaging(unit, false);
    made.push(staging);
    const file = join(staging, 'hello-1.0.0.tgz');
    writeFileSync(file, 'tgz');
    const dest = adoptTarballFile(file, unit);
    expect(dest).toBe(join(home, 'artifacts', unit, 'hello-1.0.0.tgz'));
    expect(existsSync(dest ?? '')).toBe(true);
    expect(existsSync(file)).toBe(false);
    expect(adoptTarballFile(join(staging, 'missing.tgz'), unit)).toBeUndefined();
  });
});
