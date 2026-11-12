import type { DshHostContext, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import type { RecordExpect, RecordStore } from '@dsh-workbench/shared/host';
import { sessionIdOf, seamOf } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION } from '@dsh-workbench/shared/host';

import { cliCommandOf } from '@dsh-workbench/shared/host';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { asRecord, asText, OUTPUT, plainJson, unitsOf, workspaceOf } from './diy-context';
import { holdNotice, noticeMessage } from '@/shared/api/host/diy-debug-act';
import { readDesignOfModule } from '@/shared/api/host/diy-modules';
import { actBrowser } from './diy-browser-act';
import { stopLiveCapture } from '@/shared/api/host/diy-capture-live';
import { openRecordPage } from './diy-record-open';
import { RECORD_ARM_SCRIPT, RECORD_READ_SCRIPT, RECORD_STOP_SCRIPT } from './diy-record-scripts';
import { captureEntriesOf, pickAllOf, pickOf } from './diy-record-capture';
import {
  bodyMissingOf,
  filterTextOf,
  moveOrThrow,
  probeCommandOf,
  recordMissingText,
  recordPageOf,
  recordTalkOf,
  renderRecordDetail,
  renderRecordRead,
} from './diy-record-text';
import type { RecordPageRead } from './diy-record-text';
import { DIY_RECORD_DETAIL_TOOL, DIY_RECORD_PREPARE_TOOL, DIY_RECORD_READ_TOOL, DIY_RECORD_STOP_TOOL } from '../unit';
import {
  DETAIL_MAX_BYTES,
  POLL_MS,
  WAIT_CAP_MS,
  bundleOf,
  captureFileOf,
  captureLinesWithKeyOf,
  captureReadOf,
  detailOfCall,
  detailOfEntry,
  foreignDomainText,
  hookCallOf,
  keepCaptureOf,
  lastCaptureFileOf,
  pauseFor,
  releaseQuietly,
  startRecordCapture,
  waitOf,
  watchRecordFinish,
} from './diy-record';

export function registerRecordTools(ctx: DshHostContext, store: RecordStore): readonly (() => void)[] {
  const tools = ctx.get('tools') as DshToolRegistry | undefined;
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过录制交接工具注册');
    return [];
  }

  const prepareTool: DshToolDefinition = {
    name: DIY_RECORD_PREPARE_TOOL,
    description:
      '打开浏览器窗口并置于最前，让用户录制一次真实写入（打开窗口需批准）。' +
      '同一时刻只允许一场录制；已有录制时直接拒绝，需先 ' +
      `${DIY_RECORD_STOP_TOOL} 再 prepare 一场。` +
      '开始或结束后用 ' +
      `${DIY_RECORD_READ_TOOL} 读取该段，用 ${DIY_RECORD_STOP_TOOL} 结束录制。` +
      '浮条「截图」无需另行批准：页面在打开窗口时已获授权，截图与提交快照一起进入 ' +
      `${DIY_RECORD_DETAIL_TOOL} 的字段证据表。`,
    parameters: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: '本次录制名称（默认 page；给已安装的 unit 则用其名称）。' },
        url: { type: 'string', description: '该页面（用户访问系统的入口；与已探明的读源同 domain）。' },
        doing: { type: 'string', description: '本次操作名称，如发布 / 提交（可选，默认「操作」）。' },
        expect: {
          type: 'object',
          properties: {
            method: { type: 'string', description: '要捕获的那条请求的 HTTP 方法，例如 POST（不填则按"类似写入的请求"挑选）。' },
            urlContains: { type: 'string', description: 'URL 中必须包含的片段（不填则不筛选）。' },
          },
          additionalProperties: false,
          description: '要捕获的请求特征。',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const artifactsDir = artifactsDirOf(root);
      const args = asRecord(raw);
      const asked = asText(args['unit']);
      const { units } = unitsOf(ctx, root);
      const unit = asked !== '' ? asked : 'page';
      const found = units.find((one) => one.unit === unit);
      const url = asText(args['url']);
      if (url === '') {
        throw new Error(
          '需要该页面的 url（用户平时访问这套系统的入口；请先用 workbench_diy_recon，或询问用户平时在哪里查看）。我不猜测站点。',
        );
      }
      const foreign =
        found === undefined || found.dir === '' ? '' : foreignDomainText(readDesignOfModule(found.dir), url);
      if (foreign !== '') throw new Error(foreign);
      const doing = asText(args['doing']) || '操作';
      const rawExpect = asRecord(args['expect']);
      const method = asText(rawExpect['method']).toUpperCase();
      const urlContains = asText(rawExpect['urlContains']);
      const expect: RecordExpect | null = method === '' && urlContains === '' ? null : { method, urlContains };
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法打开录制窗口');
      const command = cliCommandOf(ctx);
      const sessionId = sessionIdOf(exec) ?? '';
      const held = store.live(Date.now());
      const captureFile = captureFileOf(artifactsDir, unit);
      moveOrThrow(
        store.begin({
          sessionId,
          workspace: root,
          unit,
          name: found?.name ?? unit,
          url,
          title: '',
          action: doing,
          expect,
          captureFile,
          now: Date.now(),
        }),
        held,
      );

      try {
        const opened = await openRecordPage({ seam, command, session: BROWSER_RECORD_SESSION, url, captureFile });
        if (!opened.ok) throw new Error(opened.why);
        const armed = await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_ARM_SCRIPT]);
        const page = recordPageOf(armed.payload);
        if (!armed.ok || !page.ok) {
          throw new Error(`浮条安装失败：${armed.stderr || armed.stdout || '页面仍在加载'}。请等用户页面加载完成后再试。`);
        }
        stopLiveCapture(captureFile);
        const capture = await startRecordCapture(seam, command, BROWSER_RECORD_SESSION, captureFile);
        watchRecordFinish({ ctx, seam, command, sessionId, store, url, captureFile });
        const talk = recordTalkOf();
        return plainJson({
          workspace: root,
          ok: true,
          wrote: false,
          phase: page.phase,
          site: url,
          session: BROWSER_RECORD_SESSION,
          capture,
          captureFile,
          size: page.calls.length,
          talk,
          text: capture ? talk : `${talk}（捕获未启动，本次只有页面钩子）`,
        });
      } catch (error) {
        await releaseQuietly({ seam, command, session: BROWSER_RECORD_SESSION, url, captureFile });
        store.stop(sessionId, Date.now());
        throw error;
      }
    },
  };

  const readTool: DshToolDefinition = {
    name: DIY_RECORD_READ_TOOL,
    description:
      '读取本次录制到的请求（用户按「结束录制」后使用）。未按开始或未安装钩子时都会说明，不会误报为"没有请求"。',
    parameters: {
      type: 'object',
      properties: {
        waitMs: {
          type: 'integer',
          description: '等待用户按「结束」的最长时间（毫秒，默认 0 = 立即返回，上限 15 分钟）。',
        },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法读取录制');
      const sessionId = sessionIdOf(exec) ?? '';
      const held = store.live(Date.now());
      if (held === null) throw new Error(recordMissingText());
      if (held.sessionId !== sessionId) moveOrThrow({ ok: false, code: 'not-owner' }, held);
      const command = cliCommandOf(ctx);
      const budget = waitOf(asRecord(raw)['waitMs']);
      const opened = budget === 0 ? 0 : Date.now();
      const deadline = opened + budget;
      const sync = (page: ReturnType<typeof recordPageOf>) => {
        if (page.ok && page.phase === 'recording' && page.t0 !== null) {
          if (store.live(Date.now())?.phase === 'armed') store.started(sessionId, page.t0, Date.now());
        }
        if (page.ok && page.phase === 'finished' && page.t1 !== null) {
          if (store.live(Date.now())?.phase === 'armed' && page.t0 !== null) {
            store.started(sessionId, page.t0, Date.now());
          }
          if (store.live(Date.now())?.phase === 'recording') store.finished(sessionId, page.t1, Date.now());
        }
      };
      const over = held.phase === 'finished';
      let stepOk = true;
      let page = recordPageOf(undefined);
      if (!over) {
        await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_ARM_SCRIPT]);
        let step = await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT]);
        page = recordPageOf(step.payload);
        stepOk = step.ok;
        sync(page);
        while (budget > 0 && page.phase !== 'finished' && Date.now() < deadline) {
          await pauseFor(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
          step = await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT]);
          const next = recordPageOf(step.payload);
          if (next.ok) page = next;
          sync(page);
        }
      }
      const timedOut = !over && budget > 0 && page.phase !== 'finished';
      const waitedMs = opened === 0 ? 0 : Date.now() - opened;
      if (timedOut) {
        const waited = String(Math.round(budget / 1000));
        holdNotice(
          sessionId,
          noticeMessage(
            `录制尚未结束（已等待约 ${waited} 秒）。请用户按「结束」后再调用 read。`,
            `工作台 DIY：录制尚未结束（已等待约 ${waited} 秒）`,
          ),
        );
      }
      const state = store.live(Date.now()) ?? held;
      const ledger = state.shots;
      const capture = captureReadOf(state.captureFile);
      const bundle = bundleOf(capture, page, state);
      const hookCaught = page.calls.length;
      const nav = page.href !== '' && page.here !== '' && page.href !== page.here;
      const noBody = bodyMissingOf(bundle.merged);
      const readText = renderRecordRead({
        phase: stepOk ? (page.ok ? page.phase : state.phase) : state.phase,
        armed: over ? true : stepOk ? page.ok : true,
        hookCaught,
        rows: bundle.rows,
        merged: bundle.merged.length,
        capturedLines: bundle.entries.length,
        capturedInSegment: bundle.inside.length,
        capturedOutside: bundle.outside,
        capturedTotalLines: capture.totalLines,
        capturedTruncated: capture.truncated,
        capturedTailLimit: capture.tailLimit,
        dropped: page.dropped,
        nav,
        filter: filterTextOf(state.expect),
        captureRound: bundle.capture.round,
        shots: ledger,
        beats: state.beats,
        beatMs: state.beatMs,
      });
      const note = over
        ? ['用户按「结束」后录制窗口已关闭。以下为磁盘上（捕获文件）该段的清单。']
        : [];
      const said = stepOk
        ? [readText, timedOut ? `仍在录制。请等用户按「结束」（需要等待时传入 waitMs，上限 ${String(WAIT_CAP_MS / 60000)} 分钟）。` : '']
        : ['该页面上已无法读取（录制窗口可能已关闭）。台账与捕获文件中的该段清单仍然保留：', readText];
      const text = [...note, ...said].filter((one) => one !== '').join('\n');
      return plainJson({
        ok: stepOk && page.ok,
        phase: state.phase,
        t0: state.t0,
        t1: state.t1,
        rows: bundle.rows,
        dropped: page.dropped,
        captureLines: bundle.entries.length,
        capturedInSegment: bundle.inside.length,
        capturedOutside: bundle.outside,
        capturedTotalLines: capture.totalLines,
        capturedTruncated: capture.truncated,
        hookCaught,
        noBody,
        nav,
        shots: ledger,
        beats: state.beats,
        beatMs: state.beatMs,
        waitedMs,
        timedOut,
        text,
      });
    },
  };

  const detailTool: DshToolDefinition = {
    name: DIY_RECORD_DETAIL_TOOL,
    description:
      '读取本次录制中某条请求的原文（request / response body）。先用 record_read 取清单（每条带 key），再挑一条；清单不删条。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '清单中该条的 key（原样传入，含 #2 后缀）。' },
        index: { type: 'integer', description: '清单序号（从 0 开始）；仅在录制进行时可用。' },
        at: {
          type: 'integer',
          description: '清单中该行的 at（毫秒时间戳）；同一 key 跨轮重名，带上即可定位。',
        },
        unit: { type: 'string', description: '录制已结束、只能读 rec-<unit>.jsonl.last 时提供。' },
        maxBody: {
          type: 'integer',
          description: `入参 / 出参各自最多回多少字符（默认 ${String(DETAIL_MAX_BYTES)}，0 = 不限）。`,
        },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const artifactsDir = artifactsDirOf(root);
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法读取详情');
      const args = asRecord(raw);
      const unit = asText(args['unit']);
      const askedKey = asText(args['key']).trim();
      const rawIndex = args['index'];
      const index = typeof rawIndex === 'number' && Number.isFinite(rawIndex) ? Math.floor(rawIndex) : null;
      const rawAt = args['at'];
      let at = typeof rawAt === 'number' && Number.isFinite(rawAt) ? Math.floor(rawAt) : null;
      const rawMax = args['maxBody'];
      const maxBytes =
        typeof rawMax === 'number' && Number.isFinite(rawMax) && rawMax >= 0 ? Math.floor(rawMax) : DETAIL_MAX_BYTES;
      const sessionId = sessionIdOf(exec) ?? '';
      const held = store.live(Date.now());
      if (held !== null && held.sessionId !== sessionId) moveOrThrow({ ok: false, code: 'not-owner' }, held);
      const file =
        held !== null ? held.captureFile : unit === '' ? '' : lastCaptureFileOf(captureFileOf(artifactsDir, unit));
      if (file === '') {
        throw new Error(
          `本次录制已不存在（已结束、已过期，或不属于当前会话）。请提供 unit（我会从取证目录读取 rec-<unit>.jsonl.last），或重新 ${DIY_RECORD_PREPARE_TOOL} 一场。`,
        );
      }
      const command = cliCommandOf(ctx);
      let key = askedKey;
      let page: RecordPageRead | null = null;
      if (key === '') {
        if (index === null) throw new Error('请提供 key（清单中该条的 key）或 index（清单中的序号）。');
        if (held === null) {
          throw new Error('结束之后只能使用 key：index 是"该场清单中"的序号，本场清单已清除。');
        }
        page = recordPageOf(
          (await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT])).payload,
        );
        const bundle = bundleOf(captureReadOf(file), page, held);
        const row = bundle.rows[index];
        if (row === undefined) {
          throw new Error(
            `该段清单中没有第 ${String(index)} 条（共 ${String(bundle.rows.length)} 条）。请先调用 ${DIY_RECORD_READ_TOOL} 获取最新清单。`,
          );
        }
        key = row.key;
        at = at ?? row.at;
        if (key === '') {
          const only = hookCallOf(page, `${row.method} ${row.url}`);
          if (only !== null) return detailOfCall(only, maxBytes);
        }
      }
      const candidates = pickAllOf(captureEntriesOf(captureLinesWithKeyOf(file, key)), key);
      const fromCapture = pickOf(candidates, key, at);
      if (fromCapture !== null) {
        return detailOfEntry(fromCapture, maxBytes, candidates.length);
      }
      const over = held === null || held.phase === 'finished';
      const livePage =
        page !== null || over
          ? page
          : recordPageOf((await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT])).payload);
      const call = livePage === null ? null : hookCallOf(livePage, key);
      if (call !== null) return detailOfCall(call, maxBytes);
      return plainJson({
        ok: true,
        found: false,
        key,
        text: renderRecordDetail({
          found: false,
          where: '',
          method: '',
          url: '',
          status: 0,
          ct: '',
          at: 0,
          request: '',
          response: '',
          headers: '',
          requestFullSize: 0,
          responseFullSize: 0,
          requestSizeExact: false,
          responseSizeExact: false,
          ambiguous: 0,
          source: '',
          maxBytes,
          note: over
            ? `「${key}」不在该场录制的快照原文（${file}）中。该场录制已结束，页面也已关闭，无法从页面钩子读取。`
            : `「${key}」既不在该场录制的快照原文（${file}）中，也不在该页面的钩子记录中。`,
        }),
      });
    },
  };

  const stopTool: DshToolDefinition = {
    name: DIY_RECORD_STOP_TOOL,
    description: '结束录制：卸载浮条、停止捕获、关闭该标签、清除状态（不影响其他标签）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const seam = seamOf(ctx);
      if (seam === undefined) throw new Error('这台机器上没有 shell 服务，无法结束录制');
      const sessionId = sessionIdOf(exec) ?? '';
      const held = store.live(Date.now());
      if (held === null) throw new Error(recordMissingText());
      if (held.sessionId !== sessionId) moveOrThrow({ ok: false, code: 'not-owner' }, held);
      const command = cliCommandOf(ctx);
      await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_ARM_SCRIPT]);
      const finalStep = await actBrowser(seam, command, BROWSER_RECORD_SESSION, ['eval', RECORD_STOP_SCRIPT]);
      const page = recordPageOf(finalStep.payload);
      const capture = captureReadOf(held.captureFile);
      const bundle = bundleOf(capture, page, held);
      const hookCaught = page.calls.length;
      const noBody = bodyMissingOf(bundle.merged);
      const kept = keepCaptureOf(held.captureFile);
      const cleaned = await releaseQuietly({
        seam,
        command,
        session: BROWSER_RECORD_SESSION,
        url: held.url,
        captureFile: held.captureFile,
      });
      store.stop(sessionId, Date.now());
      const probeCommand = probeCommandOf(bundle.merged);
      const lastFile = lastCaptureFileOf(held.captureFile);
      return plainJson({
        ok: true,
        phase: 'idle',
        rows: bundle.rows,
        lastFile: kept ? lastFile : '',
        dropped: page.dropped,
        captureLines: bundle.entries.length,
        capturedInSegment: bundle.inside.length,
        capturedOutside: bundle.outside,
        hookCaught,
        noBody,
        probeCommand,
        cleaned: { ...cleaned, hook: page.ok && page.unhooked },
        text: [
          `录制已结束：${held.unit} 的「${held.action}」该段共 ${String(bundle.merged.length)} 条请求（页面钩子 ${String(hookCaught)} 条；会话捕获该段 ${String(bundle.inside.length)} 条）。`,
          kept
            ? `原文保留在 ${lastFile}（下一场 prepare 会清除）。如需查看某一条，请使用 ${DIY_RECORD_DETAIL_TOOL}：提供 unit + key；同一个 key 跨轮会重名，再带上清单中该行的 at 即可准确定位。`
            : '未保留原文（本场捕获文件为空或捕获未启动）。如需某一条，请让用户从 DevTools 复制 curl。',
          bundle.capture.round === 'fail'
            ? '（会话捕获最近一轮未成功，本场可能只有页面钩子。）'
            : '',
          cleaned.tab ? '录制窗口的标签已关闭。' : '该标签未关闭，请用户手动关闭。',
          cleaned.capture ? '' : '捕获进程未完全停止（最多 15 分钟自动结束）。',
          probeCommand !== ''
            ? '这段原文可以直接写入 design.json 的 writes[].probeCommand。'
            : noBody
              ? '只有方法 / URL，无法获取 body。请先补全 body，再写入 writes[].probeCommand。如需请求体，请让用户从 DevTools 复制 curl，或在用户页面上用 _eval 中的 fetch 发送一条同形请求（先征得用户同意）。'
              : '本段原文为空，请勿写入 design.json。',
          '不要重放这段请求：没有预览模式时，写入一次即为真实写入。',
        ]
          .filter((one) => one !== '')
          .join('\n'),
      });
    },
  };

  return [
    tools.register(prepareTool),
    tools.register(readTool),
    tools.register(detailTool),
    tools.register(stopTool),
  ];
}
