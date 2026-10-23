import { describe, expect, it, vi } from 'vitest';
import { zh } from '@dsh-workbench/shared';
import type { BundleInspectProblem, BundleSupplyState } from '@/shared/api/bundle-install';
import { ADD_MODULE_MOCKS, stateOfMock } from '../add-module-mock';
import { failureCode, failureReasonKey, problemKey, supplyKey, verdictKey } from '../add-module-text';
import type { AddModuleState } from '../use-add-module';

const dictionary = new Set(Object.keys(zh));

const PROBLEMS: readonly BundleInspectProblem[] = [
  'invalid-spec',
  'already-installed',
  'not-found',
  'not-a-package',
  'not-a-bundle',
  'not-a-module-or-plugin',
  'network',
  'unknown',
];

const SUPPLIES: readonly BundleSupplyState[] = [
  'not-a-module',
  'no-needs',
  'installed',
  'failed',
  'pending-restart',
];

describe('添加模块的夹具：只切状态，且每个状态都喂给真函数校过', () => {
  it('id 唯一、label 不为空（条上一眼能认出是哪一屏）', () => {
    const ids = ADD_MODULE_MOCKS.map((mock) => mock.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const mock of ADD_MODULE_MOCKS) expect(mock.label.trim()).not.toBe('');
  });

  it('★ 七种预检拒因一个不落（界面上的那句"为什么不行"全都能看到）', () => {
    const covered = new Set(ADD_MODULE_MOCKS.map((mock) => mock.problem?.problem));
    for (const problem of PROBLEMS) expect(covered.has(problem), problem).toBe(true);
  });

  it('★ 供给的每一种说法都有夹具（要说的话里没有没验过的分支）', () => {
    const seen = new Set(ADD_MODULE_MOCKS.map((mock) => mock.outcome?.supply.state).filter(Boolean));
    for (const state of SUPPLIES) expect(seen.has(state), state).toBe(true);
  });

  it('★ 夹具里出现的每个文案键都在字典里（夹具是"给人看的"，键错了它就白造了）', () => {
    const missing: string[] = [];
    for (const mock of ADD_MODULE_MOCKS) {
      if (mock.problem !== undefined) {
        const key = problemKey(mock.problem.problem);
        if (!dictionary.has(key)) missing.push(`${mock.id} → ${key}`);
      }
      if (mock.outcome === undefined) continue;
      const verdict = verdictKey(mock.outcome.change);
      if (!dictionary.has(verdict)) missing.push(`${mock.id} → ${verdict}`);
      const code = failureCode(mock.outcome.change);
      const reason = failureReasonKey(code);
      const generic = mock.outcome.change.application === 'failed' && code === mock.outcome.change.application;
      if (mock.outcome.change.application === 'failed' && reason === undefined && !generic) {
        missing.push(`${mock.id} → 码 ${code} 没有文案`);
      }
      if (reason !== undefined && !dictionary.has(reason)) missing.push(`${mock.id} → ${reason}`);
      if (generic && !dictionary.has('panels.market.add.reason.unknown')) missing.push(`${mock.id} → 没细码时的那句话`);
      const supply = supplyKey(mock.outcome.supply.state);
      if (supply !== undefined && !dictionary.has(supply)) missing.push(`${mock.id} → ${supply}`);
    }
    expect(missing).toEqual([]);
  });

  it('★ 状态机自洽：说是哪一屏就得有那一屏要的东西', () => {
    const wrong: string[] = [];
    for (const mock of ADD_MODULE_MOCKS) {
      if (mock.phase === 'preview' && mock.preview === undefined) wrong.push(`${mock.id} 是预览却没有预览内容`);
      if (mock.phase === 'result' && mock.outcome === undefined) wrong.push(`${mock.id} 是结果却没有结果`);
      if (mock.phase === 'idle' && mock.problem !== undefined && mock.spec.trim() === '') {
        wrong.push(`${mock.id} 说预检没过，输入框却是空的（用户改不了）`);
      }
      if (mock.outcome !== undefined && (mock.outcome.change.pendingBuilds?.length ?? 0) > 0) {
        if (mock.outcome.change.application !== 'failed') wrong.push(`${mock.id} 有待批脚本却不是失败态`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('★ 夹具模式下按钮是死的（夹具不装卸机器上的东西）', () => {
    const base = {
      spec: '',
      choice: { kind: 'default' as const, value: '' },
      custom: '',
      registryOpen: false,
      guideOpen: false,
      phase: 'idle' as const,
      choices: [],
      problem: null,
      preview: null,
      outcome: null,
      failure: null,
      builds: [],
      setSpec: vi.fn(),
      setChoice: vi.fn(),
      setCustom: vi.fn(),
      toggleRegistry: vi.fn(),
      closeRegistry: vi.fn(),
      toggleGuide: vi.fn(),
      check: vi.fn(),
      edit: vi.fn(),
      install: vi.fn(),
      cancelInstall: vi.fn(),
      removeIt: vi.fn(),
      removing: false,
    } satisfies AddModuleState;
    const mock = ADD_MODULE_MOCKS.find((item) => item.id === 'done-applied');
    expect(mock).toBeDefined();
    const state = stateOfMock(base, mock!);

    state.check();
    state.install();
    state.cancelInstall();
    state.removeIt();
    state.setSpec('x');
    state.setCustom('y');
    state.toggleGuide();
    state.edit();

    expect(base.check).not.toHaveBeenCalled();
    expect(base.install).not.toHaveBeenCalled();
    expect(base.cancelInstall).not.toHaveBeenCalled();
    expect(base.removeIt).not.toHaveBeenCalled();
    expect(base.setSpec).not.toHaveBeenCalled();
    expect(state.phase).toBe('result');
    expect(state.outcome?.change.application).toBe('applied');
  });
});
