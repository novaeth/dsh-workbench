import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { workspacesRoot } from '../host/data-root.js';

export interface ModuleStore {
  readonly dir: string;
  read(name: string): unknown | null;
  write(name: string, value: unknown): void;
  remove(name: string): void;
  list(): string[];
}

export interface WorkspaceStore {
  for(unitId: string, workspace: string | null): ModuleStore;
  machine(unitId: string): ModuleStore;
  scan(unitId: string): ModuleStore[];
}

function slug(raw: string, max = 40): string {
  const cleaned = raw
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, max);
  return cleaned === '' ? 'workspace' : cleaned;
}

export function workspaceKey(workspace: string): string {
  const abs = path.resolve(workspace);
  return `${slug(path.basename(abs))}-${createHash('sha1').update(abs).digest('hex').slice(0, 8)}`;
}

function inside(dir: string, name: string): string {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') {
    throw new Error(`模块文件夹里只接受相对文件名，收到的是「${name}」`);
  }
  if (trimmed.includes('\0') || path.isAbsolute(trimmed)) {
    throw new Error(`模块只能写自己的文件夹：不接受绝对路径「${name}」`);
  }
  const full = path.resolve(dir, trimmed);
  if (full !== dir && !full.startsWith(dir + path.sep)) {
    throw new Error(`模块只能写自己的文件夹：路径越界「${name}」`);
  }
  return full;
}

function memoryStore(dir: string): ModuleStore {
  const files = new Map<string, unknown>();
  return {
    dir,
    read: (name) => {
      inside(dir, name);
      return files.get(name) ?? null;
    },
    write: (name, value) => {
      inside(dir, name);
      files.set(name, value);
    },
    remove: (name) => {
      inside(dir, name);
      files.delete(name);
    },
    list: () => [...files.keys()].sort(),
  };
}

function fileStore(dir: string): ModuleStore {
  const ensureFor = (file: string): void => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  };
  return {
    dir,
    read: (name) => {
      const file = inside(dir, name);
      try {
        return JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
      } catch {
        return null;
      }
    },
    write: (name, value) => {
      const file = inside(dir, name);
      ensureFor(file);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, file);
    },
    remove: (name) => {
      const file = inside(dir, name);
      try {
        fs.unlinkSync(file);
      } catch {
      }
    },
    list: () => {
      try {
        return fs
          .readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isFile())
          .map((entry) => entry.name)
          .sort();
      } catch {
        return [];
      }
    },
  };
}

export function createWorkspaceStore(options: {
  readonly root?: string | null | undefined;
  readonly logger?: { warn?(message: string): void } | undefined;
}): WorkspaceStore {
  const root = options.root === null ? null : options.root ?? workspacesRoot();
  let warned = false;
  const memory = new Map<string, ModuleStore>();
  const fallback = (dir: string): ModuleStore => {
    if (!warned) {
      warned = true;
      options.logger?.warn?.(
        '[dsh-workbench] 没有可写的数据根：模块配置只在本进程内生效（见 shared/api/host/data-root.ts）',
      );
    }
    const hit = memory.get(dir);
    if (hit !== undefined) return hit;
    const created = memoryStore(dir);
    memory.set(dir, created);
    return created;
  };

  const open = (parts: readonly string[]): ModuleStore =>
    root === null
      ? fallback(path.join('/_memory', ...parts))
      : fileStore(
          path.join(
            root,
            ...parts.map((part) => slug(part)),
          ),
        );

  return {
    for: (unitId, workspace) =>
      workspace === null || workspace.trim() === ''
        ? fallback(path.join('/_memory', slug(unitId)))
        : open([workspaceKey(workspace), unitId]),
    machine: (unitId) => open(['_machine', unitId]),
    scan: (unitId) => {
      if (root === null) return [];
      let entries: string[];
      try {
        entries = fs.readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
          .map((entry) => entry.name)
          .sort();
      } catch {
        return [];
      }
      return entries.map((key) => fileStore(path.join(root, key, slug(unitId))));
    },
  };
}
