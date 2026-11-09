import { INSTALL_TIMEOUT_MS } from '@dsh-workbench/shared/host';
import {
  diagnoseInstallFailure,
  installWriteProblem,
  PlanStepError,
  planStepText,
  productWrite,
  runPlan,
} from '@dsh-workbench/shared/host';
import type { PluginPlanStep, Seam, SupplyPort } from '@dsh-workbench/shared/host';
import { installError } from './market-install-error';

export interface InstallRunDeps {
  readonly seam?: Seam | undefined;
  readonly supply: SupplyPort;
}

export interface InstallRunner {
  run(line: string, optional?: boolean): Promise<void>;
  runAll(steps: readonly PluginPlanStep[]): Promise<void>;
}

export function createInstallRunner(deps: InstallRunDeps): InstallRunner {
  function commandStep(line: string, optional: boolean): PluginPlanStep {
    return optional ? { kind: 'run', line, optional: true } : { kind: 'run', line };
  }

  async function runAll(steps: readonly PluginPlanStep[]): Promise<void> {
    const { seam, supply } = deps;
    if (seam === undefined) {
      throw new Error('没有执行缝（shell 服务不可用），装 / 卸做不了。');
    }
    try {
      await runPlan(steps, {
        seam,
        intent: productWrite(),
        timeoutMs: INSTALL_TIMEOUT_MS,
        check: (step) => {
          if (step.kind !== 'run') return;
          const blocked = installWriteProblem({ command: step.line, fallback: supply.modules.isolatedRoot() });
          if (blocked !== undefined) throw installError(blocked);
        },
      });
    } catch (error) {
      if (!(error instanceof PlanStepError)) throw error;
      throw installError(
        diagnoseInstallFailure({
          command: planStepText(error.step),
          exitCode: error.exitCode,
          output: error.output,
          fallback: supply.modules.isolatedRoot(),
        }),
      );
    }
  }

  async function run(line: string, optional = false): Promise<void> {
    await runAll([commandStep(line, optional)]);
  }

  return { run, runAll };
}
