import type { UnitEnvNeeds, UnitHostNeeds, UnitManifest } from '../api/unit.js';

/**
 * 声明协议当前版本；模块清单的 dsh.workbench.apiVersion 要写这个整数。
 */
export const WORKBENCH_API_VERSION = 1;

/**
 * 外壳愿意认的协议版本；不在表里的模块当场被拒，不猜语义。
 */
export const SUPPORTED_API_VERSIONS: readonly number[] = [WORKBENCH_API_VERSION];

/**
 * 清单里那半张卡片声明：文案键加排序位；卡片默认显不显示不在这里（那是运行期面板配置的事）。
 */
export interface UnitCardDeclaration {
  readonly titleKey: string;
  readonly order: number;
}

/**
 * 清单里的一条工具声明：进 dsh 工具表的全名、会不会写，以及生成物里的键名。
 */
export interface UnitToolDeclaration {
  readonly name: string;
  readonly writes: boolean;
  readonly key?: string;
}

/**
 * 模块清单里 dsh.workbench 那一段的完整形状（协议版本、单元 id、卡片、工具、宿主与环境需要）。
 */
export interface UnitDeclaration {
  readonly apiVersion: number;
  readonly unit: string;
  readonly card: UnitCardDeclaration | null;
  readonly tools: readonly UnitToolDeclaration[];
  readonly host: UnitHostNeeds;
  readonly env?: UnitEnvNeeds;
}

/**
 * 协议认得的全部键；写了别的键不会被采纳（外壳静默忽略），所以字段名拼错不会有提示。
 */
export const DECLARATION_KEYS: readonly string[] = [
  'apiVersion',
  'unit',
  'card',
  'tools',
  'host',
  'env',
];

/**
 * 协议要求必写的键；env 不在其中（没有环境需要就不写）。
 */
export const DECLARATION_REQUIRED_KEYS: readonly string[] = [
  'apiVersion',
  'unit',
  'card',
  'tools',
  'host',
];

const CARD_KEYS = ['titleKey', 'order'];
const TOOL_KEYS = ['name', 'writes', 'key'];

const TOOL_KEY_SHAPE = /^[a-z][a-zA-Z0-9]*$/;
const HOST_KEYS = ['inject', 'optional'];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function outsideKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): string[] {
  return Object.keys(value).filter((key) => !allowed.includes(key));
}

function listOf(keys: readonly string[]): string {
  return keys.map((key) => JSON.stringify(key)).join(' / ');
}

function stringArrayProblems(at: string, value: unknown): string[] {
  if (!Array.isArray(value)) return [`${at} 要是一串字符串，现在是 ${JSON.stringify(value)}`];
  return value.flatMap((item, index) =>
    text(item) === '' ? [`${at}[${index}] 不是非空字符串：${JSON.stringify(item)}`] : [],
  );
}

/**
 * 查清单里 dsh.workbench 那一段的形状，回一串给人看的问题（中文，带字段路径）。
 * @param subject 报错时用的主语，一般是包名。
 * @param raw 清单里那段原始值，可能什么都不是。
 * @returns 空数组表示形状过得去；版本不对就当场返回（后面的字段无从判起）。
 */
export function declarationProblemsOf(subject: string, raw: unknown): readonly string[] {
  if (!isRecord(raw)) return [`${subject}: dsh.workbench 不是一个对象 —— ${JSON.stringify(raw)}`];

  const version = raw.apiVersion;
  if (version === undefined) {
    return [
      `${subject}: dsh.workbench 没有 apiVersion —— 协议从 v${WORKBENCH_API_VERSION} 起，` +
        `写 \`"apiVersion": ${WORKBENCH_API_VERSION}\`。缺它 = 外壳不认这个模块（ADR-0038 §2.3）`,
    ];
  }
  if (!Number.isInteger(version) || !SUPPORTED_API_VERSIONS.includes(version as number)) {
    return [
      `${subject}: dsh.workbench.apiVersion 是 ${JSON.stringify(version)}，这里只认 ` +
        `${SUPPORTED_API_VERSIONS.join(' / ')}（要整数）`,
    ];
  }

  const problems: string[] = [];

  const unknown = outsideKeys(raw, DECLARATION_KEYS);
  if (unknown.length > 0) {
    problems.push(
      `${subject}: dsh.workbench 里有协议 v${WORKBENCH_API_VERSION} 不认识的键 ${listOf(unknown)} —— ` +
        `只有 ${listOf(DECLARATION_KEYS)}。（拼错的键会被外壳**静默忽略**：那句声明等于没写）`,
    );
  }

  for (const key of DECLARATION_REQUIRED_KEYS) {
    if (raw[key] === undefined) {
      problems.push(
        `${subject}: dsh.workbench 缺 ${key}` +
          (key === 'card' ? '（这个模块没有卡片就写 `"card": null`）' : ''),
      );
    }
  }

  const card = raw.card;
  if (card !== undefined && card !== null) {
    if (!isRecord(card)) {
      problems.push(`${subject}: dsh.workbench.card 要么是对象、要么是 null，现在是 ${JSON.stringify(card)}`);
    } else {
      const extra = outsideKeys(card, CARD_KEYS);
      if (extra.length > 0) {
        problems.push(
          `${subject}: dsh.workbench.card 里有不认的键 ${listOf(extra)} —— card 只有 ${listOf(CARD_KEYS)}` +
            `（卡片默认显不显示由运行期的面板配置决定，清单里没有这一位）`,
        );
      }
      if (text(card.titleKey) === '') {
        problems.push(`${subject}: dsh.workbench.card.titleKey 要是非空字符串（面板那一格的文案键）`);
      }
      if (typeof card.order !== 'number' || !Number.isFinite(card.order)) {
        problems.push(`${subject}: dsh.workbench.card.order 要是数字，现在是 ${JSON.stringify(card.order)}`);
      }
    }
  }

  const tools = raw.tools;
  if (tools !== undefined) {
    if (!Array.isArray(tools)) {
      problems.push(`${subject}: dsh.workbench.tools 要是一串声明，现在是 ${JSON.stringify(tools)}`);
    } else {
      const seen = new Set<string>();
      const seenKeys = new Set<string>();
      tools.forEach((tool, index) => {
        const at = `dsh.workbench.tools[${index}]`;
        if (!isRecord(tool)) {
          problems.push(`${subject}: ${at} 要是对象，现在是 ${JSON.stringify(tool)}`);
          return;
        }
        const extra = outsideKeys(tool, TOOL_KEYS);
        if (extra.length > 0) {
          problems.push(`${subject}: ${at} 里有不认的键 ${listOf(extra)} —— tools 只有 ${listOf(TOOL_KEYS)}`);
        }
        const name = text(tool.name);
        if (name === '') {
          problems.push(`${subject}: ${at}.name 要是非空字符串`);
        } else if (seen.has(name)) {
          problems.push(`${subject}: ${at}.name「${name}」与前面那条撞了 —— 工具名会进 dsh 的工具表，不许重`);
        } else {
          seen.add(name);
        }
        if (typeof tool.writes !== 'boolean') {
          problems.push(
            `${subject}: ${at}.writes 要是 true / false（它是"这会写"的唯一声明，缺了审批无从认领）`,
          );
        }
        if (tool.key !== undefined) {
          const key = text(tool.key);
          if (!TOOL_KEY_SHAPE.test(key)) {
            problems.push(
              `${subject}: ${at}.key 要是 lowerCamelCase 的标识符（如 \`sync\` / \`podLogs\`），` +
                `现在是 ${JSON.stringify(tool.key)} —— 它会变成生成物里的键名，所以不引号、不许带点或横线`,
            );
          } else if (seenKeys.has(key)) {
            problems.push(`${subject}: ${at}.key「${key}」与前面那条撞了 —— 生成物里的键只能有一个`);
          } else {
            seenKeys.add(key);
          }
        }
      });
    }
  }

  const host = raw.host;
  if (host !== undefined) {
    if (!isRecord(host)) {
      problems.push(`${subject}: dsh.workbench.host 要是对象，现在是 ${JSON.stringify(host)}`);
    } else {
      const extra = outsideKeys(host, HOST_KEYS);
      if (extra.length > 0) {
        problems.push(`${subject}: dsh.workbench.host 里有不认的键 ${listOf(extra)} —— host 只有 ${listOf(HOST_KEYS)}`);
      }
      if (host.inject === undefined) {
        problems.push(
          `${subject}: dsh.workbench.host.inject 没写 —— 它声明这个模块要外壳的哪几个服务，` +
            `外壳靠它判"能不能挂"。一个都不要也要写 \`"inject": []\``,
        );
      } else {
        problems.push(...stringArrayProblems(`${subject}: dsh.workbench.host.inject`, host.inject));
      }
      if (host.optional !== undefined) {
        problems.push(...stringArrayProblems(`${subject}: dsh.workbench.host.optional`, host.optional));
      }
    }
  }

  if (raw.env !== undefined && !isRecord(raw.env)) {
    problems.push(
      `${subject}: dsh.workbench.env 要是对象（command / plugins / libs）—— ` +
        `语义由门禁的 env 判据查，这里只查形状`,
    );
  }

  return problems;
}

/**
 * 读一份清单的结果：要么带着规整过的声明与 manifest，要么只带一串问题。
 */
export interface DeclarationRead {
  readonly declaration?: UnitDeclaration;
  readonly manifest?: UnitManifest;
  readonly problems: readonly string[];
}

/**
 * 读一份清单：先查形状，过了再把声明规整成 manifest。
 * @param subject 报错时用的主语。
 * @param raw 清单里 dsh.workbench 那段原始值。
 * @returns 有问题时只有 problems；没问题时 declaration 与 manifest 都给，manifest 里的字符串已 trim。
 */
export function readDeclaration(subject: string, raw: unknown): DeclarationRead {
  const problems = declarationProblemsOf(subject, raw);
  if (problems.length > 0) return { problems };
  const declaration = raw as UnitDeclaration;
  const card = declaration.card;
  return {
    declaration,
    problems: [],
    manifest: {
      id: text(declaration.unit),
      card:
        card === null
          ? null
          : {
              titleKey: text(card.titleKey),
              order: card.order,
            },
      tools: declaration.tools.map((tool) => ({
        name: text(tool.name),
        writes: tool.writes,
      })),
      host: {
        inject: [...(declaration.host.inject ?? [])],
        ...(declaration.host.optional === undefined ? {} : { optional: [...declaration.host.optional] }),
      },
      ...(declaration.env === undefined ? {} : { env: declaration.env }),
    },
  };
}
