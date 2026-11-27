import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import {
  createDiagFileSink,
  createDiagRecorder,
  workbenchRoot,
  createNodeProcessHost,
  readUpdateJournal,
  recoverUpdateJournal,
  releaseUpdateLease,
  rewriteUpdateLease,
  writeJsonFile,
} from '@dsh-workbench/shared/host';
import type { DiagHost } from '@dsh-workbench/shared/host';
import { runSelfUpdateSteps, selfUpdateJournalPath } from './self-update-run.js';
import { reinstallProfileWhenIdle } from './self-update-reinstall.js';
import { selfUpdateBootFile, selfUpdatePaths, selfUpdateUpFile } from './self-update-plan.js';
import type { SelfUpdateSteps } from './self-update-steps.js';

function report(line: string): void {
  process.stderr.write(`${line}\n`);
}

function diagHostOfRunner(): DiagHost {
  const profile = process.env['DSH_WB_DIAG_PROFILE']?.trim() ?? '';
  const deployment = process.env['DSH_WB_DIAG_DEPLOYMENT'];
  return {
    profile: profile === '' ? 'unknown' : basename(profile),
    deployment: deployment === 'web' || deployment === 'desktop' ? deployment : 'unknown',
    pid: process.pid,
  };
}

function releaseLeaseByToken(): void {
  const token = process.env['DSH_WB_UPDATE_LEASE_TOKEN'];
  if (token === undefined || token === '') return;
  try {
    releaseUpdateLease({ root: selfUpdatePaths().dir, token, pid: process.pid });
  } catch {
    // 下次按陈旧锁接管
  }
}

function recoverJournal(plan: SelfUpdateSteps): ReturnType<typeof recoverUpdateJournal> {
  const root = dirname(plan.markerPath);
  return recoverUpdateJournal({
    file: selfUpdateJournalPath(plan),
    bootFile: selfUpdateBootFile(root),
    upFile: selfUpdateUpFile(root),
    markerPath: plan.markerPath,
    ignoreLease: true,
    log: report,
  });
}

function recoverOnSignal(plan: SelfUpdateSteps, signal: string): void {
  const recovered = recoverJournal(plan);
  if (recovered.kind === 'none') {
    report(`收到 ${signal}，没有换版日志要处理`);
    return;
  }
  if (recovered.kind === 'cleared') {
    report(
      recovered.dirty === true
        ? `收到 ${signal}，换版已经提交（日志下次再清）`
        : `收到 ${signal}，换版已经提交，日志清掉了`,
    );
    try {
      writeJsonFile(plan.markerPath, {
        ...plan.marker,
        state: 'pending-restart',
        version: recovered.to,
        at: new Date().toISOString(),
        phase: 'committed',
        committed: true,
      });
    } catch (error) {
      report(`状态文件没写成：${String(error)}`);
    }
    return;
  }
  if (recovered.kind === 'restored') {
    report(`收到 ${signal}，已经回到 ${recovered.from}`);
    return;
  }
  report(`收到 ${signal}，现场没能自动恢复：${recovered.detail}`);
  report(`救法：${plan.rescue}`);
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
    releaseLeaseByToken();
    return 1;
  }
  const leaseRoot = dirname(plan.markerPath);
  const leaseToken = process.env['DSH_WB_UPDATE_LEASE_TOKEN'];
  if (leaseToken !== undefined && leaseToken !== '') {
    rewriteUpdateLease({ root: leaseRoot, token: leaseToken, pid: process.pid });
  }
  const releaseLease = (): void => {
    if (leaseToken === undefined || leaseToken === '') return;
    releaseUpdateLease({ root: leaseRoot, token: leaseToken, pid: process.pid });
  };
  let released = false;
  const releaseOnce = (): void => {
    if (released) return;
    released = true;
    releaseLease();
  };
  const onSignal = (signal: NodeJS.Signals): void => {
    report(`收到 ${signal}`);
    try {
      recoverOnSignal(plan, signal);
    } catch (error) {
      report(`收尾没完成：${String(error)}`);
    }
    releaseOnce();
    process.exit(1);
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
  try {
    writeJsonFile(plan.markerPath, { ...plan.marker, pid: process.pid });
    const processes = createNodeProcessHost();
    const diagnosed = diagHostOfRunner();
    const diagFiles = createDiagFileSink({
      dir: join(workbenchRoot(), 'diagnostics', 'records'),
      profile: diagnosed.profile,
    });
    const result = await runSelfUpdateSteps(plan, {
      processes,
      log: report,
      diag: createDiagRecorder({ sinks: [diagFiles.sink], host: diagnosed }),
    });
    const journal = recoverJournal(plan);
    if (journal.kind === 'restored') report(`退出前按日志恢复：${journal.detail}`);
    if (journal.kind === 'kept') report(`换版现场留着：${journal.detail}`);
    if (result.ok) {
      releaseOnce();
      try {
        const outcome = await reinstallProfileWhenIdle(plan, { processes, log: report });
        if (outcome === 'pending') report('profile 重装留到下次启动前（还有窗口在用）');
      } catch (error) {
        report(`profile 重装没成：${String(error)}`);
      }
    }
    return result.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    report(`更新中途崩了：${message}`);
    report(`救法：${plan.rescue}`);
    const committed = readUpdateJournal(selfUpdateJournalPath(plan))?.state === 'committed';
    try {
      recoverJournal(plan);
    } catch (journalError) {
      report(`换版日志没处理成：${String(journalError)}`);
    }
    try {
      writeJsonFile(
        plan.markerPath,
        committed
          ? {
              ...plan.marker,
              state: 'pending-restart',
              version: plan.version,
              at: new Date().toISOString(),
              phase: 'committed',
              committed: true,
            }
          : {
              ...plan.marker,
              state: 'failed',
              version: plan.marker.from,
              reason: 'incomplete',
              at: new Date().toISOString(),
            },
      );
    } catch (markerError) {
      report(`连 marker 都写不下去：${String(markerError)}`);
    }
    return 1;
  } finally {
    releaseOnce();
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
