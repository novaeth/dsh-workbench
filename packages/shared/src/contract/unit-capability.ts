import type { Need, NeedKind } from './needs.js';
import type { ProvisionProblem } from './plugin-source.js';

/**
 * 一条 need 探出来的样子：状态、给人看的一句、以及能照做的修法。
 */
export interface NeedState {
  readonly id: string;
  readonly kind: NeedKind;
  readonly name: string;
  readonly status: 'ok' | 'missing' | 'outdated' | 'unsatisfied' | 'unchecked';
  readonly detail: string;
  readonly command?: string;
  readonly missing?: readonly string[];
  readonly installed?: string;
  readonly latest?: string;
  readonly provision?: 'ready' | ProvisionProblem;
}

/**
 * 一个单元的能力结论：unit 一级只做汇总，缺什么逐条看 needs。
 */
export interface UnitCapability {
  readonly unit: string;
  readonly status: 'ok' | 'degraded' | 'missing' | 'outdated' | 'unchecked' | 'unsupported' | 'failed';
  readonly needs: readonly NeedState[];
  readonly detail?: string;
  readonly released?: boolean;
}

/**
 * 探一个单元的输入：单元 id 加它声明的 need 列表。
 */
export interface NeedProbeInput {
  readonly unit: string;
  readonly needs: readonly Need[];
}
