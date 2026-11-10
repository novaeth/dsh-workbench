import { readFileSync } from 'node:fs';
import { createNodeProcessHost } from '@dsh-workbench/shared/host';
import { runSelfUpdateSteps } from './self-update-run.js';
import type { SelfUpdateSteps } from './self-update-steps.js';

async function main(): Promise<void> {
  const planFile = process.argv[2];
  if (planFile === undefined) {
    process.stderr.write('用法：self-update-runner <plan.json>\n');
    process.exitCode = 2;
    return;
  }
  const plan = JSON.parse(readFileSync(planFile, 'utf8')) as SelfUpdateSteps;
  const result = await runSelfUpdateSteps(plan, {
    processes: createNodeProcessHost(),
    log: (line) => process.stderr.write(`${line}\n`),
  });
  if (!result.ok) process.exitCode = 1;
}

void main();
