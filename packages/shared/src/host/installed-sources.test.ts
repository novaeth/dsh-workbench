import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  forgetPackageSource,
  installedSourcesFile,
  packageSourceOf,
  readInstalledSources,
  rememberPackageSource,
} from './installed-sources.js';

const dirs: string[] = [];

function profile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-sources-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('按包记安装来源（检查更新只认这一份）', () => {
  it('写一条再读回来：版本与源都在，文件是临时名换过去的', () => {
    const dir = profile();
    rememberPackageSource(dir, '@a/mod', { version: '0.3.1', registry: 'https://r1.example/' });

    expect(packageSourceOf(dir, '@a/mod')).toEqual({ version: '0.3.1', registry: 'https://r1.example/' });
    expect(fs.existsSync(`${installedSourcesFile(dir)}.tmp`)).toBe(false);
  });

  it('★ 同一个 scope 的两个包可以各记各的源（.npmrc 做不到这件事）', () => {
    const dir = profile();
    rememberPackageSource(dir, '@x/a', { version: '1.0.0', registry: 'https://r1.example/' });
    rememberPackageSource(dir, '@x/b', { version: '2.0.0', registry: 'https://r2.example/' });

    expect(packageSourceOf(dir, '@x/a')?.registry).toBe('https://r1.example/');
    expect(packageSourceOf(dir, '@x/b')?.registry).toBe('https://r2.example/');
    expect(readInstalledSources(dir)).toHaveProperty('@x/a');
  });

  it('再装一次同一个包 → 覆盖成这次记录的版本与源', () => {
    const dir = profile();
    rememberPackageSource(dir, '@x/a', { version: '1.0.0', registry: 'https://r1.example/' });
    rememberPackageSource(dir, '@x/a', { version: '1.1.0', registry: 'https://r2.example/' });

    expect(packageSourceOf(dir, '@x/a')).toEqual({ version: '1.1.0', registry: 'https://r2.example/' });
  });

  it('卸载后删掉；没有这条时也不写空文件', () => {
    const dir = profile();
    rememberPackageSource(dir, '@x/a', { version: '1.0.0', registry: 'https://r1.example/' });
    forgetPackageSource(dir, '@x/a');

    expect(packageSourceOf(dir, '@x/a')).toBeUndefined();
    const before = fs.readFileSync(installedSourcesFile(dir), 'utf8');
    forgetPackageSource(dir, '@x/never');
    expect(fs.readFileSync(installedSourcesFile(dir), 'utf8')).toBe(before);
  });

  it('文件坏了 / 没有 / profile 不认识 → 一律当没有记录，不抛', () => {
    const dir = profile();
    fs.writeFileSync(installedSourcesFile(dir), '{ 坏的 json', 'utf8');
    expect(readInstalledSources(dir)).toEqual({});
    expect(packageSourceOf(dir, '@x/a')).toBeUndefined();
    expect(readInstalledSources(null)).toEqual({});
  });

  it('空包名 / 空源 / 空版本不落盘（别把没问到的写进去当事实）', () => {
    const dir = profile();
    rememberPackageSource(dir, ' ', { version: '1.0.0', registry: 'https://r1.example/' });
    rememberPackageSource(dir, '@x/a', { version: '', registry: 'https://r1.example/' });
    rememberPackageSource(dir, '@x/b', { version: '1.0.0', registry: ' ' });

    expect(readInstalledSources(dir)).toEqual({});
    expect(fs.existsSync(installedSourcesFile(dir))).toBe(false);
  });
});
