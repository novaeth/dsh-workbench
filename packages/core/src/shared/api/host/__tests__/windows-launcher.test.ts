import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const launcher = fileURLToPath(new URL('../../../../../bin/dsh-workbench.cmd', import.meta.url));

describe('Windows 开发启动器边界', () => {
  it('★ 只说明 Desktop/Web 该走哪条路，不假装能跑 bash 启动器', () => {
    const text = readFileSync(launcher, 'utf8');
    expect(text.startsWith('@echo off')).toBe(true);
    expect(text).toContain('Desktop');
    expect(text).toContain('exit /b 1');
    expect(text).not.toContain('#!/usr/bin/env bash');
  });
});
