import type { Translate } from './dsh-client.js';

export interface PromptHostFacts {
  readonly label: string;
  readonly version: string;
  readonly verified: string;
}

export interface PromptProblem {
  readonly why?: string;
  readonly rows?: string;
  readonly issue?: string;
  readonly reason?: string;
  readonly corrId?: string;
}

export interface PromptContext {
  readonly deployment?: string;
  readonly configDir?: string;
  readonly logDir?: string;
  readonly evidence?: string;
  readonly tried?: number;
}

export interface PromptFacts {
  readonly screen: string;
  readonly step?: string;
  readonly host?: PromptHostFacts;
  readonly problem?: PromptProblem;
  readonly context?: PromptContext;
}

/**
 * 取一段多行文本里第一行有内容的，给提示词与卡片当「原文首行」。
 * @param text - 可能为空或全是空行的原文。
 * @returns 第一行非空文本，没有就 `undefined`。
 */
export function firstLineOf(text: string | undefined): string | undefined {
  const line = (text ?? '')
    .split('\n')
    .map((one) => one.trim())
    .find((one) => one !== '');
  return line === undefined ? undefined : line;
}

/**
 * 把「哪里出的问题、看到什么、有什么证据」拼成一段可以直接粘给 agent 的提示词。
 * 空的整行省略；`step` 不给就只写屏幕名。
 * @param facts - 屏幕 / 步骤 / 版本对照 / 现象 / 现场上下文。
 * @param t - 文案函数，键在 askAgent.* 下。
 * @returns 多行提示词，最后一行是「先读证据再下结论」。
 */
export function faultPromptOf(facts: PromptFacts, t: Translate): string {
  const problem = facts.problem ?? {};
  const context = facts.context ?? {};
  const host = facts.host;
  const where =
    facts.step === undefined || facts.step.trim() === ''
      ? t('askAgent.prompt.whereOnly', { screen: facts.screen })
      : t('askAgent.prompt.where', { screen: facts.screen, step: facts.step });
  const lines = [t('askAgent.prompt.head'), where];
  const add = (key: string, value: string | number | undefined, param: string): void => {
    if (value !== undefined) lines.push(t(key, { [param]: value }));
  };
  add('askAgent.prompt.why', problem.why, 'detail');
  add('askAgent.prompt.rows', problem.rows, 'rows');
  add('askAgent.prompt.issue', problem.issue, 'issue');
  add('askAgent.prompt.reason', problem.reason, 'reason');
  add('askAgent.prompt.corrId', problem.corrId, 'corrId');
  if (host !== undefined) {
    lines.push(t('askAgent.prompt.host', { host: host.label, version: host.version, verified: host.verified }));
  }
  add('askAgent.prompt.deployment', context.deployment, 'deployment');
  add('askAgent.prompt.configDir', context.configDir, 'configDir');
  add('askAgent.prompt.logDir', context.logDir, 'dir');
  add('askAgent.prompt.tried', context.tried !== undefined && context.tried > 0 ? context.tried : undefined, 'n');
  add('askAgent.prompt.evidence', context.evidence, 'files');
  lines.push(t('askAgent.prompt.ask'));
  return lines.join('\n');
}
