import type { UnitManifest } from '@dsh-workbench/shared';
import type { Toolbox } from './toolbox';

interface SkillInvocation {
  readonly modelInvocable: boolean;
  readonly userInvocable: boolean;
}

interface SkillSummary {
  readonly name: string;
  readonly description: string;
  readonly whenToUse?: string;
  readonly invocation: SkillInvocation;
  readonly source: string;
  readonly provider: string;
}

interface SkillCandidate extends SkillSummary {
  readonly rank: number;
  readonly locator: unknown;
}

interface SkillDefinition extends SkillSummary {
  readonly content: string;
}

interface SkillLookupOptions {
  readonly cwd?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

export interface SkillProvider {
  readonly name: string;
  list(options: SkillLookupOptions): Promise<readonly SkillCandidate[]>;
  get(candidate: SkillCandidate, options: SkillLookupOptions): Promise<SkillDefinition | undefined>;
}

export interface SkillRegistry {
  registerProvider(create: (control: { readonly signal: AbortSignal; invalidate(): void }) => SkillProvider): () => void;
}

export interface UnitSkillDeps {
  readonly skills?: Pick<SkillRegistry, 'registerProvider'> | undefined;
  readonly manifests: () => readonly UnitManifest[];
  readonly toolbox: Pick<Toolbox, 'resolve'>;
  readonly workspaceOf: (cwd: string | null) => string | null;
  readonly subscribe: (listener: () => void) => () => void;
  readonly logger?: { warn?(message: string): void } | undefined;
}

const SKILL_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const SKILL_PROVIDER = 'workbench';

const WORKBENCH_ROOT = 'workbench';

const WORKBENCH_ROOT_LOCATOR = { kind: 'workbench-root' } as const;

const WORKBENCH_ROOT_DESCRIPTION = '用工作台自己的工具：面板 / 安装 / 模块市场 / DIY';

const WORKBENCH_ROOT_CONTENT =
  '用户指定了工作台自己的工具（工具包 manage；DIY 会话是 diy-flow 及其子包）。';

function workbenchRootCandidate(): SkillCandidate {
  return {
    name: WORKBENCH_ROOT,
    description: WORKBENCH_ROOT_DESCRIPTION,
    invocation: { modelInvocable: false, userInvocable: true },
    source: 'custom',
    provider: SKILL_PROVIDER,
    rank: 0,
    locator: WORKBENCH_ROOT_LOCATOR,
  };
}

export function skillNameOf(unit: string): string {
  return `workbench-${unit}`;
}

export function skillDescriptionOf(manifest: UnitManifest): string {
  const title = manifest.title?.zh ?? manifest.id;
  const description = manifest.description?.trim();
  return description === undefined || description === '' ? title : `${title} · ${description}`;
}

export function skillContentOf(manifest: UnitManifest): string {
  const title = manifest.title?.zh ?? manifest.id;
  return `用户指定了工作台的「${title}」模块（工具包 unit:${manifest.id}）。`;
}

function visibleOf(deps: UnitSkillDeps, workspace: string): readonly UnitManifest[] {
  return deps.manifests().filter(
    (manifest) =>
      manifest.id !== 'panels' &&
      (manifest.tools ?? []).length > 0 &&
      deps.toolbox.resolve([`unit:${manifest.id}`], workspace).packs.length > 0,
  );
}

export function registerUnitSkills(deps: UnitSkillDeps): Array<() => void> {
  if (deps.skills === undefined) return [];
  const warned = new Set<string>();
  const dispose = deps.skills.registerProvider((control) => {
    const offChange = deps.subscribe(() => control.invalidate());
    control.signal.addEventListener('abort', () => offChange(), { once: true });
    return {
      name: SKILL_PROVIDER,
      async list(options) {
        const listed: SkillCandidate[] = [workbenchRootCandidate()];
        const workspace = deps.workspaceOf(options.cwd ?? null);
        if (workspace === null) return listed;
        for (const manifest of visibleOf(deps, workspace)) {
          const id = manifest.skillId ?? manifest.id;
          if (!SKILL_ID.test(id)) {
            if (!warned.has(id)) {
              warned.add(id);
              deps.logger?.warn?.(
                `[dsh-workbench] 模块 ${manifest.id} 的 /workbench- 标识不是 kebab-case（${id}）—— 这条入口先不给；` +
                  '标识只能用小写字母、数字和横线',
              );
            }
            continue;
          }
          const whenToUse = manifest.description?.trim();
          listed.push({
            name: skillNameOf(id),
            description: skillDescriptionOf(manifest),
            ...(whenToUse === undefined ? {} : { whenToUse }),
            invocation: { modelInvocable: false, userInvocable: true },
            source: 'custom',
            provider: SKILL_PROVIDER,
            rank: 0,
            locator: manifest.id,
          });
        }
        return listed;
      },
      async get(candidate) {
        if (candidate.locator === WORKBENCH_ROOT_LOCATOR) {
          return {
            name: candidate.name,
            description: candidate.description,
            invocation: candidate.invocation,
            source: candidate.source,
            provider: candidate.provider,
            content: WORKBENCH_ROOT_CONTENT,
          };
        }
        const unit = candidate.locator;
        if (typeof unit !== 'string') return undefined;
        const manifest = deps.manifests().find((one) => one.id === unit);
        if (manifest === undefined) return undefined;
        return {
          name: candidate.name,
          description: candidate.description,
          ...(candidate.whenToUse === undefined ? {} : { whenToUse: candidate.whenToUse }),
          invocation: candidate.invocation,
          source: candidate.source,
          provider: candidate.provider,
          content: skillContentOf(manifest),
        };
      },
    };
  });
  return [dispose];
}
