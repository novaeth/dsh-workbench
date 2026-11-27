import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8').replaceAll('\r\n', '\n');

const VIEW = read('long-task/SchemaLongTaskView.tsx');
const CARD = read('SchemaCard.tsx');
const CARD_VIEW = read('SchemaCardView.tsx');
const EXTERNAL = read('../hooks/use-external-actions.ts');
const WIRING = read('../hooks/use-long-task.ts');
const HANDLERS = read('long-task/long-task-handlers.ts');

describe('SchemaLongTaskView：needs-human 投影成人待那一行（接线，node 环境读源码断言）', () => {
  it('★★ 旧 needs-login 那一支一个字没动：还是那条判定、那颗「去登录」', () => {
    expect(VIEW).toContain('const loginUrl = row.loginUrl;');
    expect(VIEW).toContain('row.status === \'needs-login\' && loginUrl !== undefined');
    expect(VIEW).toContain("{ label: t('longTask.login'), onOpen: () => onLogin(loginUrl) }");
    expect(VIEW).toContain('...(login === undefined ? {} : { login }),');
  });

  it('★★ 新增 onOpenUrl / onCopy，onLogin 保留', () => {
    expect(VIEW).toContain('readonly onLogin: (url: string) => void;');
    expect(VIEW).toContain('readonly onOpenUrl: (url: string) => void;');
    expect(VIEW).toContain('readonly onCopy: (text: string) => void;');
    expect(VIEW).toContain('readonly copied?: string | null | undefined;');
  });

  it('★★ 只有 needs-human 且带 intervention 才翻；其余行一个键都不多', () => {
    expect(VIEW).toContain("if (row.status !== 'needs-human' || intervention === undefined) return undefined;");
    expect(VIEW).toContain(
      [
        'const intervention = interventionOf(',
        '        row,',
        '        t,',
        '        onOpenUrl,',
        '        onCopy,',
        '        copied ?? null,',
        '        onRecheck,',
        '        rechecking,',
        '        recheckFailed,',
        '        onAnswer,',
        '        answering,',
        '        answerFailed,',
        '      );',
      ].join('\n'),
    );
    expect(VIEW).toContain('...(intervention === undefined ? {} : { intervention }),');
  });

  it('★★ label 缺省走 i18n：open-url 用 longTask.act.open，copy 用 longTask.act.copy', () => {
    expect(VIEW).toContain("label: action.label ?? t('longTask.act.open'),");
    expect(VIEW).toContain("label: copied === action.text ? t('env.copied') : action.label ?? t('longTask.act.copy'),");
  });

  it('★★ 第一个画出来的 open-url 是 primary，后面那颗让位；copy 不做主按钮', () => {
    expect(VIEW).toContain('...(primary ? { primary: true } : {}),');
    expect(VIEW).toContain('primary = false;');
    expect(VIEW).toContain('let primary = true;');
  });

  it('★★ 只放行 ^https?://：不合法就不画那颗钮（空 URL 不再有死按钮）', () => {
    expect(VIEW).toContain('const URL_PATTERN = /^https?:\\/\\//i;');
    expect(VIEW).toContain('if (!URL_PATTERN.test(action.url)) return;');
  });

  it('★ 没有 actions 也合法：只画标题（actions 键不出现）', () => {
    expect(VIEW).toContain('title: intervention.title,');
    expect(VIEW).toContain('...(actions.length === 0 ? {} : { actions }),');
    expect(VIEW).toContain('...(intervention.hint === undefined ? {} : { hint: intervention.hint }),');
  });

  it('★ 动作的 key 一行一个，onPress 调的是新回调', () => {
    expect(VIEW).toContain('key: `${row.id}:${index}:open-url`,');
    expect(VIEW).toContain('key: `${row.id}:${index}:copy`,');
    expect(VIEW).toContain('onPress: () => onOpenUrl(action.url),');
    expect(VIEW).toContain('onPress: () => onCopy(action.text),');
  });

  it('★★ 可重查的行追加「我处理完了」：key / 文案 / busy 跟 rechecking 走、onPress 调 onRecheck', () => {
    expect(VIEW).toContain('readonly onRecheck: (id: string) => void;');
    expect(VIEW).toContain('readonly rechecking: string | null;');
    expect(VIEW).toContain('readonly recheckFailed: string | null;');
    expect(VIEW).toContain('if (row.resumable === true) {');
    expect(VIEW).toContain('key: `${row.id}:handled`,');
    expect(VIEW).toContain("label: t('longTask.handled'),");
    expect(VIEW).toContain('busy: rechecking === row.id,');
    expect(VIEW).toContain('onPress: () => onRecheck(row.id),');
  });

  it('★★ recheckFailed 非空才往 intervention 上传 failed（照 stopFailed 那条）', () => {
    expect(VIEW).toContain('...(recheckFailed === null ? {} : { failed: recheckFailed }),');
  });

  it('★★ 有 fields 且 answerable 才带表单：声明照抄、submit 调 onAnswer(id, values)、failed 透传', () => {
    expect(VIEW).toContain('readonly onAnswer: (id: string, values: Readonly<Record<string, string>>) => void;');
    expect(VIEW).toContain('readonly answering: string | null;');
    expect(VIEW).toContain('readonly answerFailed: string | null;');
    expect(VIEW).toContain('const fields = intervention.fields ?? [];');
    expect(VIEW).toContain('const withForm = row.answerable === true && fields.length > 0;');
    expect(VIEW).toContain(
      [
        '...(withForm',
        '      ? {',
        '          fields,',
        '          submit: {',
        "            label: intervention.submitLabel ?? t('longTask.submit'),",
        '            busy: answering === row.id,',
        '            failed: answerFailed,',
        '            onSubmit: (values: Readonly<Record<string, string>>) => onAnswer(row.id, values),',
        '          },',
        '        }',
        '      : {}),',
      ].join('\n'),
    );
  });

  it('★★ 表单只有这一处出口：answerable 假 / 没 fields 就不会多出 fields 或 submit 键', () => {
    expect(VIEW.match(/submit:/g)).toHaveLength(1);
    expect(VIEW.match(/fields,/g)).toHaveLength(1);
    expect(VIEW).toContain('const withForm = row.answerable === true && fields.length > 0;');
  });
});

describe('open-url / copy 只有一份实现：useExternalActions 供 BlockerState 与长任务行共用', () => {
  it('★★ open：先撤上一次回跳监听，再开窗，再挂新的（回来 onRetry）', () => {
    expect(EXTERNAL).toContain('watch.current?.();');
    expect(EXTERNAL).toContain("window.open(url, '_blank', 'noopener')");
    expect(EXTERNAL).toContain('watch.current = watchLoginReturn({ onRetry: () => returnRef.current() });');
  });

  it('★★ copy：writeClipboard 成功后 1.5s 「已复制」再落回', () => {
    expect(EXTERNAL).toContain('void writeClipboard(text).then((ok) => {');
    expect(EXTERNAL).toContain('setCopied(text);');
    expect(EXTERNAL).toContain('setTimeout(() => setCopied(null), 1500);');
    expect(EXTERNAL).toContain('return { copied, open, copy };');
  });

  it('★★ 卸载时撤掉回跳监听（旧 useCardLongTasks 那条 cleanup 的责任没丢）', () => {
    expect(EXTERNAL).toContain('watch.current?.();');
    expect(EXTERNAL).toContain('watch.current = null;');
  });

  it('★★ BlockerState 那条路行为不变：copy 走 copy，open-url 走 open，run-fix/retry 原样', () => {
    expect(EXTERNAL).toContain('export function useExternalActions(');
    expect(WIRING).toContain("import { useExternalActions } from './use-external-actions';");
    expect(read('../hooks/use-blocker-actions.ts')).toContain('const external = useExternalActions(() => retryRef.current());');
  });
});

describe('SchemaCard / SchemaCardView：两条卡片路径都接上 openExternal 与 copyText', () => {
  it('★★ 读写接线收到一份共用实现里：SchemaCard 只拿 wiring.feed / open / copy', () => {
    expect(WIRING).toContain('const external = useExternalActions(feed.refresh);');
    expect(WIRING).toContain('return { feed, open, copy: external.copy, copied: external.copied };');
    expect(CARD).toContain('return useLongTaskWiring({');
    expect(CARD).toContain('const longTasks = wiring.feed;');
  });

  it('★★ 开 URL 前仍然只放行 ^https?://（旧的 openLogin 守卫没丢）', () => {
    expect(WIRING).toContain('if (!WIRING_URL_PATTERN.test(url)) return;');
    expect(WIRING).toContain('const WIRING_URL_PATTERN = /^https?:');
  });

  it('★★ FrameCard 直连 SchemaLongTaskView：回调由共用的那支一次给全', () => {
    expect(CARD).toContain('...longTaskHandlers(wiring, props.t),');
    expect(HANDLERS).toContain('onLogin: wiring.open,');
    expect(HANDLERS).toContain('onOpenUrl: wiring.open,');
    expect(HANDLERS).toContain('onCopy: wiring.copy,');
    expect(HANDLERS).toContain('copied: wiring.copied,');
  });

  it('★★ ReadCard 经 SchemaCardView：props 只做加法', () => {
    expect(CARD).toContain('const handlers = longTaskHandlers(wiring, props.t);');
    expect(CARD).toContain('onLongTaskLogin: handlers.onLogin,');
    expect(CARD).toContain('onLongTaskOpenUrl: handlers.onOpenUrl,');
    expect(CARD).toContain('onLongTaskCopy: handlers.onCopy,');
    expect(CARD).toContain('longTaskCopied: handlers.copied,');
  });

  it('★★ SchemaCardView 新 prop 可选，缺省给空回调（老调用点不炸）', () => {
    expect(CARD_VIEW).toContain('readonly onLongTaskOpenUrl?: ((url: string) => void) | undefined;');
    expect(CARD_VIEW).toContain('readonly onLongTaskCopy?: ((text: string) => void) | undefined;');
    expect(CARD_VIEW).toContain('readonly longTaskCopied?: string | null | undefined;');
    expect(CARD_VIEW).toContain('onOpenUrl: onLongTaskOpenUrl ?? (() => {}),');
    expect(CARD_VIEW).toContain('onCopy: onLongTaskCopy ?? (() => {}),');
    expect(CARD_VIEW).toContain('copied: longTaskCopied ?? null,');
  });

  it('★★ 两条路径都接上 recheck：FrameCard 直给，ReadCard 经 SchemaCardView（props 只加法、缺省空回调）', () => {
    expect(HANDLERS).toContain('rechecking: feed.rechecking,');
    expect(HANDLERS).toContain('recheckFailed: feed.recheckFailed,');
    expect(CARD).toContain('longTaskRechecking: handlers.rechecking,');
    expect(CARD).toContain('longTaskRecheckFailed: handlers.recheckFailed,');
    expect(CARD_VIEW).toContain('readonly longTaskRechecking?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly longTaskRecheckFailed?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly onLongTaskRecheck?: ((id: string) => void) | undefined;');
    expect(CARD_VIEW).toContain('rechecking: longTaskRechecking ?? null,');
    expect(CARD_VIEW).toContain('recheckFailed: longTaskRecheckFailed ?? null,');
    expect(CARD_VIEW).toContain('onRecheck: onLongTaskRecheck ?? (() => {}),');
  });

  it('★★ 两条路径都接上 answer：FrameCard 直给，ReadCard 经 SchemaCardView（props 只加法、缺省空回调）', () => {
    expect(HANDLERS).toContain('answering: feed.answering,');
    expect(HANDLERS).toContain('answerFailed: feed.answerFailed,');
    expect(CARD).toContain('longTaskAnswering: handlers.answering,');
    expect(CARD).toContain('longTaskAnswerFailed: handlers.answerFailed,');
    expect(CARD_VIEW).toContain('readonly longTaskAnswering?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly longTaskAnswerFailed?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly onLongTaskAnswer?:');
    expect(CARD_VIEW).toContain('answering: longTaskAnswering ?? null,');
    expect(CARD_VIEW).toContain('answerFailed: longTaskAnswerFailed ?? null,');
    expect(CARD_VIEW).toContain('onAnswer: onLongTaskAnswer ?? (() => {}),');
  });
});

describe('行内可读：状态词 · 耗时 · 当前步骤 · 结构化步骤', () => {
  it('★★ 六态都有状态词，耗时按时 / 分 / 秒三档', () => {
    expect(VIEW).toContain("running: 'longTask.state.running',");
    expect(VIEW).toContain("'needs-human': 'longTask.state.needsHuman',");
    expect(VIEW).toContain("'needs-login': 'longTask.state.needsLogin',");
    expect(VIEW).toContain("stopped: 'longTask.state.stopped',");
    expect(VIEW).toContain("ok: 'longTask.state.ok',");
    expect(VIEW).toContain("failed: 'longTask.state.failed',");
    expect(VIEW).toContain("t('longTask.duration.hourMin', { h: hours, m: minutes })");
    expect(VIEW).toContain("t('longTask.duration.minSec', { m: minutes, s: seconds })");
    expect(VIEW).toContain("t('longTask.duration.sec', { s: seconds })");
  });

  it('★★ meta = 状态词 · 耗时；行的时间从 startedAt 起算，结束态算到 at', () => {
    expect(VIEW).toContain('const ended = longTaskIsLive(row.status) ? now : dayjs(row.at).valueOf();');
    expect(VIEW).toContain('const meta =');
    expect(VIEW).toContain('? `${metaOf(row, t, now)} · ${progressText}` : metaOf(row, t, now);');
    expect(VIEW).toContain('meta,');
  });

  it('★★ 计划里没开始的步骤算成 pending 交给行：按 history 的 stepId 去重', () => {
    expect(VIEW).toContain('.map((one) => one.stepId)');
    expect(VIEW).toContain('const pending = (row.plan ?? [])');
    expect(VIEW).toContain('.filter((step) => !seenSteps.has(step.id))');
    expect(VIEW).toContain('.map((step) => step.title ?? step.id);');
    expect(VIEW).toContain('...(pending.length === 0 ? {} : { pending }),');
  });

  it('★★ 密集档把步数并进 meta；两档都把 progress 与读屏名交给行', () => {
    expect(VIEW).toContain("t('longTask.progress.text', { done: row.progress.done, total: row.progress.total })");
    expect(VIEW).toContain("progressLabel: t('longTask.progress.label'),");
    expect(VIEW).toContain('...(row.progress === undefined ? {} : { progress: row.progress }),');
  });

  it('★★ 当前步骤只在 running / stopped 传（人待已有干预行，不重复）', () => {
    expect(VIEW).toContain(
      "row.status === 'running' || row.status === 'stopped' ? row.step : undefined",
    );
    expect(VIEW).toContain("...(step === undefined || step === '' ? {} : { step }),");
  });

  it('★★ 人待的点抬到 warning（与左栏一致），读屏词也跟着给', () => {
    expect(VIEW).toContain(
      "row.status === 'needs-human' || row.status === 'needs-login' ? 'warning' : undefined",
    );
    expect(VIEW).toContain('dotLabel: t(STATE_KEYS[row.status]),');
  });

  it('★★ history 原样透传，steps 也照旧给（没有 history 的旧模块回退）', () => {
    expect(VIEW).toContain('...(row.history === undefined ? {} : { history: row.history }),');
    expect(VIEW).toContain('...(row.steps === undefined ? {} : { steps: row.steps }),');
    expect(VIEW).toContain("stepsTitle: t('longTask.steps'),");
  });

  it('★ 停止请求有话说：这一趟还活着就显示「等模块确认」', () => {
    expect(VIEW).toContain("pending: t('longTask.stopPending'),");
  });

  it('★★ 紧凑档透传给行（菜单里用）', () => {
    expect(VIEW).toContain('...(dense === true ? { dense: true } : {}),');
  });

  it('★★ 没有标题时用当前步骤当标题（步骤不挂在下面），再退到 target', () => {
    expect(VIEW).toContain("const stepText = row.step ?? '';");
    expect(VIEW).toContain(
      "override?.headline ?? row.headline ?? (stepText === '' ? row.target : stepText)",
    );
  });

  it('★★ 轮询次数走词表（>1 才画，文案由视图给）', () => {
    expect(VIEW).toContain(
      "attemptLabel: (attempt: number) => t('longTask.attempt', { attempt }),",
    );
  });
});

describe('行尾链接：run 自带 + 卡片覆盖按 href 合并去重，最多三条', () => {
  it('★★ 先 run 后覆盖，同一个 href 只画一次，超过三条截断', () => {
    expect(VIEW).toContain('function linksOf(');
    expect(VIEW).toContain('for (const link of row.links ?? [])');
    expect(VIEW).toContain('for (const link of override?.links ?? [])');
    expect(VIEW).toContain('if (!URL_PATTERN.test(link.href) || seen.has(link.href)) continue;');
    expect(VIEW).toContain('links.slice(0, LONG_TASK_LINK_MAX)');
    expect(VIEW).toContain('...(links === undefined ? {} : { links }),');
  });
});

describe('行内落位：rows 上的 longTaskTarget 把那一趟长任务拴在它自己那一行下面', () => {
  const ROW_CONTRACT = readFileSync(
    new URL('../../../../../shared/src/components/card/board-module.ts', import.meta.url),
    'utf8',
  );

  it('★★ 行契约多一个可选 longTaskTarget（旧行不写就不变）', () => {
    expect(ROW_CONTRACT).toContain('readonly longTaskTarget?: string | undefined;');
  });

  it('★★ 同一 target 只画一次：行内拿走，底部就不再重复', () => {
    expect(CARD_VIEW).toContain('const target = item.longTaskTarget;');
    expect(CARD_VIEW).toContain('const placed = target === undefined ? undefined : longTaskOf?.(target);');
    expect(CARD_VIEW).toContain("return placed === undefined ? row : h(Fragment, { key: item.key }, row, placed);");
    expect(CARD_VIEW).toContain('.map((row) => row.longTaskTarget)');
    expect(CARD_VIEW).toContain('runs.filter((row) => !placedTargets.has(row.target))');
  });
});
