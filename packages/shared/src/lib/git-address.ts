export interface GitAddress {
  readonly kind: 'https' | 'ssh';
  readonly host: string;
  readonly path: string;
  readonly user?: string;
  readonly port?: number;
}

export interface GitTransportCandidate {
  readonly kind: 'https' | 'ssh';
  readonly url: string;
}

const SCP = /^(?:([A-Za-z0-9._-]+)@)?([A-Za-z0-9.-]+):(?!\/)(\S+)$/;

function bare(url: string): string {
  return url.trim().replace(/^git\+/, '');
}

function pathOf(pathname: string): string {
  return pathname.replace(/^\/+/, '').replace(/\/+$/, '');
}

/**
 * 把一个 git 地址拆成「哪台主机 + 哪个路径」，不管发布者当初用的是 https、ssh 还是
 * scp 那种 `git@host:path` 写法；认不出来给 undefined。
 */
export function gitAddressOf(url: string): GitAddress | undefined {
  const text = bare(url);
  if (text === '') return undefined;
  if (text.includes('://')) {
    let parsed: URL;
    try {
      parsed = new URL(text);
    } catch {
      return undefined;
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:' && parsed.protocol !== 'ssh:') {
      return undefined;
    }
    const path = pathOf(parsed.pathname);
    if (path === '') return undefined;
    const port = parsed.port === '' ? undefined : Number(parsed.port);
    const shared = {
      host: parsed.hostname,
      path,
      ...(port === undefined ? {} : { port }),
    };
    if (parsed.protocol !== 'ssh:') return { kind: 'https', ...shared };
    return { kind: 'ssh', ...shared, ...(parsed.username === '' ? {} : { user: parsed.username }) };
  }
  const scp = SCP.exec(text);
  if (scp === null) return undefined;
  const path = pathOf(scp[3] ?? '');
  if (path === '') return undefined;
  return {
    kind: 'ssh',
    host: scp[2] ?? '',
    path,
    ...(scp[1] === undefined ? {} : { user: scp[1] }),
  };
}

/** 一份地址的规范写法：ssh 一律成 `ssh://user@host/path`（pnpm 认这个），https 原样。 */
export function gitAddressText(address: GitAddress): string {
  const port = address.port === undefined ? '' : `:${String(address.port)}`;
  if (address.kind === 'ssh') {
    return `ssh://${address.user === undefined || address.user === '' ? 'git' : address.user}@${address.host}${port}/${address.path}`;
  }
  return `https://${address.host}${port}/${address.path}`;
}

/**
 * 同一个仓库的两种读法，发布者用的那种排前面。ssh 那条一律规范成 `ssh://` 形式，
 * 因为 `git@host:path` 拼进安装 spec 时 pnpm 不认；https 那条保留发布者的原样（含 http）。
 */
export function gitTransportCandidates(url: string): readonly GitTransportCandidate[] {
  const address = gitAddressOf(url);
  if (address === undefined) {
    const only = bare(url);
    return only === '' ? [] : [{ kind: only.startsWith('ssh') ? 'ssh' : 'https', url: only }];
  }
  const primary: GitTransportCandidate = {
    kind: address.kind,
    url: address.kind === 'ssh' ? gitAddressText(address) : bare(url),
  };
  const other: GitTransportCandidate =
    address.kind === 'https'
      ? { kind: 'ssh', url: gitAddressText({ kind: 'ssh', host: address.host, path: address.path }) }
      : { kind: 'https', url: gitAddressText({ kind: 'https', host: address.host, path: address.path }) };
  return other.url === primary.url ? [primary] : [primary, other];
}
