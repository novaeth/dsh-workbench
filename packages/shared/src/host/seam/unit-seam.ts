import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { seamUnitEnv } from './env.js';
import { SeamError, type UnitSeamRequest, type UnitWriteScope } from './intent.js';
import type { Seam, SeamOutcome } from './run.js';

export interface UnitSeamPorts {
  readonly seam: Seam;
  readonly unit: string;
  readonly runtimeRoot: string;
  readonly declared?: readonly UnitWriteScope[] | undefined;
  readonly realHome?: string | undefined;
}

export interface UnitSeam {
  run(request: UnitSeamRequest): Promise<SeamOutcome>;
}

export function unitDataRoot(runtimeRoot: string, unit: string): string {
  return join(runtimeRoot, 'units', unit);
}

export function createUnitSeam(ports: UnitSeamPorts): UnitSeam {
  const unitRoot = unitDataRoot(ports.runtimeRoot, ports.unit);
  mkdirSync(unitRoot, { recursive: true });
  const declared = new Set<UnitWriteScope>(ports.declared ?? []);
  const env = seamUnitEnv({ runtimeRoot: ports.runtimeRoot, unitRoot, realHome: ports.realHome });

  return {
    async run(request: UnitSeamRequest): Promise<SeamOutcome> {
      const common = {
        command: request.command,
        ...(request.workdir === undefined ? {} : { workdir: request.workdir }),
        ...(request.timeoutMs === undefined ? {} : { timeoutMs: request.timeoutMs }),
        ...(request.signal === undefined ? {} : { signal: request.signal }),
        ...(request.retry === undefined ? {} : { retry: request.retry }),
      };
      if (request.scope === 'unit') {
        return ports.seam.run({
          ...common,
          intent: { kind: 'product' },
          env: { ...env, ...(request.env ?? {}) },
        });
      }
      if (!declared.has('workspace')) {
        throw new SeamError(
          'scope-not-declared',
          `${ports.unit} 的清单没有声明 host.writes 里的 workspace：要写当前工作区，先在清单里声明`,
        );
      }
      if (request.session === undefined || request.session === null) {
        throw new SeamError('workspace-unknown', `${ports.unit} 请求写工作区，但这次调用没有会话`);
      }
      return ports.seam.run({
        ...common,
        intent: { kind: 'workspace' },
        session: request.session,
        env: { ...(request.env ?? {}) },
      });
    },
  };
}
