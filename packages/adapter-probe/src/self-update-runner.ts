import { readFileSync } from 'node:fs';
import { createNodeProcessHost, writeJsonFile } from '@dsh-workbench/shared/host';
import { runSelfUpdateSteps } from './self-update-run.js';
import type { SelfUpdateSteps } from './self-update-steps.js';

function report(line: string): void {
  process.stderr.write(`${line}\n`);
}

async function main(): Promise<number> {
  const planFile = process.argv[2];
  if (planFile === undefined) {
    report('用法：self-update-runner <plan.json>');
    return 2;
  }
  let plan: SelfUpdateSteps;
  try {
    plan = JSON.parse(readFileSync(planFile, 'utf8')) as SelfUpdateSteps;
  } catch (error) {
    report(`读不到更新计划（${planFile}）：${String(error)}`);
    return 1;
  }
  try {
    writeJsonFile(plan.markerPath, { ...plan.marker, pid: process.pid });
    const result = await runSelfUpdateSteps(plan, {
      processes: createNodeProcessHost(),
      log: report,
    });
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report(`更新中途崩了：${message}`);
    report(`救法：${plan.rescue}`);
    try {
      writeJsonFile(plan.markerPath, {
        ...plan.marker,
        state: 'failed',
        version: plan.marker.from,
        reason: 'incomplete',
        at: new Date().toISOString(),
      });
    } catch (markerError) {
      report(`连 marker 都写不下去：${String(markerError)}`);
    }
    return 1;
  }
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error) => {
    report(`更新中途崩了（没接住）：${String(error)}`);
    process.exitCode = 1;
  },
);
