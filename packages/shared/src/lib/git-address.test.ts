import { describe, expect, it } from 'vitest';
import { gitAddressOf, gitAddressText, gitTransportCandidates } from './git-address.js';

describe('git 地址的两种读法', () => {
  it('https 原样留着，另一条推成 ssh://', () => {
    expect(gitTransportCandidates('https://e.coding.net/org/repo.git')).toEqual([
      { kind: 'https', url: 'https://e.coding.net/org/repo.git' },
      { kind: 'ssh', url: 'ssh://git@e.coding.net/org/repo.git' },
    ]);
  });

  it('scp 写法当 ssh，并规范成 ssh://（pnpm 只认这个）', () => {
    expect(gitTransportCandidates('git@e.coding.net:org/repo.git')).toEqual([
      { kind: 'ssh', url: 'ssh://git@e.coding.net/org/repo.git' },
      { kind: 'https', url: 'https://e.coding.net/org/repo.git' },
    ]);
  });

  it('git+ 前缀先剥掉，别带进 spec', () => {
    expect(gitTransportCandidates('git+https://host/org/repo.git')[0]).toEqual({
      kind: 'https',
      url: 'https://host/org/repo.git',
    });
  });

  it('端口只留在它本来那一种上，另一种回到默认端口', () => {
    expect(gitTransportCandidates('ssh://git@host:2222/org/repo.git')).toEqual([
      { kind: 'ssh', url: 'ssh://git@host:2222/org/repo.git' },
      { kind: 'https', url: 'https://host/org/repo.git' },
    ]);
    expect(gitTransportCandidates('https://host:8443/org/repo.git')).toEqual([
      { kind: 'https', url: 'https://host:8443/org/repo.git' },
      { kind: 'ssh', url: 'ssh://git@host/org/repo.git' },
    ]);
  });

  it('http 的仓库留着 http，别替发布者升到 https', () => {
    expect(gitTransportCandidates('http://host/org/repo.git')[0]).toEqual({
      kind: 'https',
      url: 'http://host/org/repo.git',
    });
  });

  it('拆得开要拆对，拆不开给 undefined', () => {
    expect(gitAddressOf('https://host/a/b.git')).toEqual({ kind: 'https', host: 'host', path: 'a/b.git' });
    expect(gitAddressOf('ssh://git@host:2222/a/b.git')).toEqual({
      kind: 'ssh',
      host: 'host',
      path: 'a/b.git',
      user: 'git',
      port: 2222,
    });
    expect(gitAddressOf('git@host:a/b.git')).toEqual({ kind: 'ssh', host: 'host', path: 'a/b.git', user: 'git' });
    expect(gitAddressOf('https://host/')).toBeUndefined();
    expect(gitAddressOf('ftp://host/a.git')).toBeUndefined();
    expect(gitAddressOf('')).toBeUndefined();
  });

  it('拼回去是规范写法，用户名缺省补 git', () => {
    expect(gitAddressText({ kind: 'ssh', host: 'h', path: 'a/b.git' })).toBe('ssh://git@h/a/b.git');
    expect(gitAddressText({ kind: 'https', host: 'h', path: 'a/b.git', port: 8443 })).toBe('https://h:8443/a/b.git');
  });
});
