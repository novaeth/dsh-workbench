import type { DshHostContext, DshShell, DshToolDefinition, DshToolRegistry, DshToolRunContext } from '@dsh-workbench/shared';
import type { RecordExpect, RecordStore } from '@dsh-workbench/shared/host';
import { BROWSER_RECORD_SESSION, sessionIdOf } from '@dsh-workbench/shared/host';

import { opencliCommandOf } from '@/shared/api/host/opencli-command';
import { artifactsDirOf } from '@/shared/api/host/diy-artifacts';
import { asRecord, asText, OUTPUT, plainJson, unitsOf, workspaceOf } from './diy-context';
import { holdNotice, noticeMessage } from '@/shared/api/host/diy-debug-act';
import { readDesignOfModule } from '@/shared/api/host/diy-modules';
import { actBrowser, stopNetworkExact } from './diy-browser-act';
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
  const tools = ctx.get<DshToolRegistry>('tools');
  if (tools === undefined) {
    ctx.logger?.info?.('[dsh-workbench] 没有 tools 服务，跳过录制交接工具注册');
    return [];
  }

  const prepareTool: DshToolDefinition = {
    name: DIY_RECORD_PREPARE_TOOL,
    description:
      '开一扇浏览器窗口并顶到最前，让用户自己录一次真实的写（开窗要点头一次）。' +
      '同一时刻只有一场：已经有一场活着时它当场拒（连问都不问）—— 先 ' +
      `${DIY_RECORD_STOP_TOOL}，再重新 prepare 一场。` +
      '用户按开始/结束后用 ' +
      `${DIY_RECORD_READ_TOOL} 取那一段、${DIY_RECORD_STOP_TOOL} 收工。` +
      '用户按浮条上的「截图」不用另外点头（同一场同一屏，屏幕在开窗那一拍已经借过）—— 那张图与提交那一刻的快照一起进 ' +
      `${DIY_RECORD_DETAIL_TOOL} 的字段证据表。`,
    parameters: {
      type: 'object',
      properties: {
        unit: { type: 'string', description: '这次录的叫谁（默认 page；给了装过的 unit 就用它的名字）。' },
        url: { type: 'string', description: '那一页（用户平时看这套系统的入口；与已探明的读源同 domain）。' },
        doing: { type: 'string', description: '那一下叫什么，例：发布 / 提交（可选，默认「操作」）。' },
        expect: {
          type: 'object',
          properties: {
            method: { type: 'string', description: '想抓的那条的 HTTP 方法，例 POST（不填就按"像写的那几条"挑）。' },
            urlContains: { type: 'string', description: 'URL 里必须含的片段（不填就不筛）。' },
          },
          additionalProperties: false,
          description: '你想抓的那条长什么样。',
        },
      },
      required: ['url'],
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const { root } = await workspaceOf(ctx, exec);
      const artifactsDir = artifactsDirOf(ctx, root);
      const args = asRecord(raw);
      const asked = asText(args['unit']);
      const { units } = unitsOf(ctx, root);
      const unit = asked !== '' ? asked : 'page';
      const found = units.find((one) => one.unit === unit);
      const url = asText(args['url']);
      if (url === '') {
        throw new Error(
          '要那一页的 url（用户平时看这套系统的入口；先用 workbench_diy_recon 或问用户"你平时在哪看这个"）—— 我不猜是哪个站点。',
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
      const shell = ctx.get<DshShell>('shell');
      if (shell === undefined) throw new Error('这台机器上没有 shell 服务，开不了录制窗');
      const command = opencliCommandOf(ctx).command;
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
        const opened = await openRecordPage({ shell, command, session: BROWSER_RECORD_SESSION, url, captureFile });
        if (!opened.ok) throw new Error(opened.why);
        const armed = await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_ARM_SCRIPT]);
        const page = recordPageOf(armed.payload);
        if (!armed.ok || !page.ok) {
          throw new Error(`浮条没装上：${armed.stderr || armed.stdout || '那一页还在加载'} —— 等用户那一页站稳了再试。`);
        }
        await stopNetworkExact(shell, captureFile);
        const capture = await startRecordCapture(shell, command, BROWSER_RECORD_SESSION, captureFile);
        watchRecordFinish({ ctx, shell, command, sessionId, store, url, captureFile });
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
          text: capture ? talk : `${talk}（opencli 那条捕获没起来 —— 这次只有页面钩子）`,
        });
      } catch (error) {
        await releaseQuietly({ shell, command, session: BROWSER_RECORD_SESSION, url, captureFile });
        store.stop(sessionId, Date.now());
        throw error;
      }
    },
  };

  const readTool: DshToolDefinition = {
    name: DIY_RECORD_READ_TOOL,
    description:
      '读这一段录到的请求（用户按「结束录制」之后用）；没按开始 / 没装钩子都会说清，不假装是"没有请求"。',
    parameters: {
      type: 'object',
      properties: {
        waitMs: {
          type: 'integer',
          description: '阻塞等用户按「结束」最多这么久（毫秒，默认 0 = 立刻回；帽 15 分钟）。',
        },
      },
      additionalProperties: false,
    },
    output: OUTPUT,
    async execute(raw: unknown, exec: DshToolRunContext) {
      const shell = ctx.get<DshShell>('shell');
      if (shell === undefined) throw new Error('这台机器上没有 shell 服务，读不了录制');
      const sessionId = sessionIdOf(exec) ?? '';
      const held = store.live(Date.now());
      if (held === null) throw new Error(recordMissingText());
      if (held.sessionId !== sessionId) moveOrThrow({ ok: false, code: 'not-owner' }, held);
      const command = opencliCommandOf(ctx).command;
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
        await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_ARM_SCRIPT]);
        let step = await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT]);
        page = recordPageOf(step.payload);
        stepOk = step.ok;
        sync(page);
        while (budget > 0 && page.phase !== 'finished' && Date.now() < deadline) {
          await pauseFor(Math.min(POLL_MS, Math.max(0, deadline - Date.now())));
          step = await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT]);
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
            `录制还没结束（等了约 ${waited} 秒）：用户按了「结束」再 read 一次。`,
            `工作台 DIY：录制还没结束（等了约 ${waited} 秒）`,
          ),
        );
      }
      const state = store.live(Date.now()) ?? held;
      const ledger = state.shots;
      const capture = await captureReadOf(shell, state.captureFile);
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
        ? ['用户按「结束」时那一扇录制窗就收掉了 —— 下面是磁盘上（捕获文件）这一段的清单。']
        : [];
      const said = stepOk
        ? [readText, timedOut ? `还在录 —— 等用户按「结束」（要等就带 waitMs，帽 ${String(WAIT_CAP_MS / 60000)} 分钟）。` : '']
        : ['那一页上读不到了（那一扇录制窗可能已经关了）—— 台账与捕获文件这一段的清单照样在：', readText];
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
      '取录制这一段里某一条请求的原文：入参（request body）与出参（response body）。先用 record_read 拿清单（每条带 key），再用它挑一条 —— 清单不删条，"那一条"永远挑得到。',
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '清单里那一条的 key（原样给，含 #2 这种后缀）。' },
        index: { type: 'integer', description: '清单里的序号（0 起）；只在那一场还开着时可用。' },
        at: {
          type: 'integer',
          description: '清单里那一行的 at（毫秒时间戳）：同一个 key 跨轮会重名，带上它才钉得住是哪一次。',
        },
        unit: { type: 'string', description: '那一场已经收工、只能去读取证目录里 rec-<unit>.jsonl.last 时给。' },
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
      const artifactsDir = artifactsDirOf(ctx, root);
      const shell = ctx.get<DshShell>('shell');
      if (shell === undefined) throw new Error('这台机器上没有 shell 服务，取不了详情');
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
          `这一场录制已经不在了（收工 / 过期 / 不是你这个会话的）—— 要给一个 unit（我去取证目录读 rec-<unit>.jsonl.last），或者重新 ${DIY_RECORD_PREPARE_TOOL} 一场。`,
        );
      }
      const command = opencliCommandOf(ctx).command;
      let key = askedKey;
      let page: RecordPageRead | null = null;
      if (key === '') {
        if (index === null) throw new Error('给一个 key（清单里那一条的）或 index（清单里的序号）。');
        if (held === null) {
          throw new Error('收工之后只能用 key —— index 是"那一场清单里"的序号，这一场已经清掉了。');
        }
        page = recordPageOf(
          (await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT])).payload,
        );
        const bundle = bundleOf(await captureReadOf(shell, file), page, held);
        const row = bundle.rows[index];
        if (row === undefined) {
          throw new Error(
            `这一段清单里没有第 ${String(index)} 条（一共 ${String(bundle.rows.length)} 条）—— 先 ${DIY_RECORD_READ_TOOL} 拿一份新的清单。`,
          );
        }
        key = row.key;
        at = at ?? row.at;
        if (key === '') {
          const only = hookCallOf(page, `${row.method} ${row.url}`);
          if (only !== null) return detailOfCall(only, maxBytes);
        }
      }
      const candidates = pickAllOf(captureEntriesOf(await captureLinesWithKeyOf(shell, file, key)), key);
      const fromCapture = pickOf(candidates, key, at);
      if (fromCapture !== null) {
        return detailOfEntry(fromCapture, maxBytes, candidates.length);
      }
      const over = held === null || held.phase === 'finished';
      const livePage =
        page !== null || over
          ? page
          : recordPageOf((await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_READ_SCRIPT])).payload);
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
            ? `「${key}」不在这一场的快照原文（${file}）里 —— 这一场已经结束 / 收工，那一页也收掉了，钩子那一份问不到`
            : `「${key}」既不在这一场的快照原文（${file}）里，也不在这一页的钩子那一份里`,
        }),
      });
    },
  };

  const stopTool: DshToolDefinition = {
    name: DIY_RECORD_STOP_TOOL,
    description: '录制收工：卸浮条、停捕获、收掉那个标签、清状态（不动别的标签）。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: OUTPUT,
    async execute(_raw: unknown, exec: DshToolRunContext) {
      const shell = ctx.get<DshShell>('shell');
      if (shell === undefined) throw new Error('这台机器上没有 shell 服务，收不了工');
      const sessionId = sessionIdOf(exec) ?? '';
      const held = store.live(Date.now());
      if (held === null) throw new Error(recordMissingText());
      if (held.sessionId !== sessionId) moveOrThrow({ ok: false, code: 'not-owner' }, held);
      const command = opencliCommandOf(ctx).command;
      await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_ARM_SCRIPT]);
      const finalStep = await actBrowser(shell, command, BROWSER_RECORD_SESSION, ['eval', RECORD_STOP_SCRIPT]);
      const page = recordPageOf(finalStep.payload);
      const capture = await captureReadOf(shell, held.captureFile);
      const bundle = bundleOf(capture, page, held);
      const hookCaught = page.calls.length;
      const noBody = bodyMissingOf(bundle.merged);
      const kept = await keepCaptureOf(shell, held.captureFile);
      const cleaned = await releaseQuietly({
        shell,
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
          `收工了：${held.unit} 的「${held.action}」这一段一共 ${String(bundle.merged.length)} 条请求（页面钩子 ${String(hookCaught)} 条 · 会话捕获这一段 ${String(bundle.inside.length)} 条）。`,
          kept
            ? `原文留在 ${lastFile}（下一场 prepare 会清掉它）—— 要再看某一条用 ${DIY_RECORD_DETAIL_TOOL}（给 unit + key；同一个 key 跨轮会重名，再带上清单里那行的 at 就钉住了）。`
            : '没留下原文（这一场的捕获文件是空的或没起来）—— 要哪一条就让用户从 DevTools 复制 curl。',
          bundle.capture.round === 'fail'
            ? '（会话捕获最近一轮没跑成（opencli 那条报了错）—— 这一场可能只有页面钩子。）'
            : '',
          cleaned.tab ? '录制窗那个标签收掉了。' : '那个标签没关掉（用户自己关一下）。',
          cleaned.capture ? '' : '捕获那条没停干净（最多 15 分钟自己收工）。',
          probeCommand !== ''
            ? '这段原文可以直接落 design.json 的 writes[].probeCommand。'
            : noBody
              ? '只有方法 / URL，body 拿不到 —— 补到 body 再落 writes[].probeCommand；要体就让用户从 DevTools 复制 curl，或在用户那一页上用 _eval 里的 fetch 打一条同形的（先问过用户）。'
              : '这一段的原文是空的 —— 别硬写进 design.json。',
          '不许复现这一段（没预览档的写一次就是真的）。',
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
