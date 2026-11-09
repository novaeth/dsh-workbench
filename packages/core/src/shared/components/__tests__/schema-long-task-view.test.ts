import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HERE = new URL('../', import.meta.url);
const read = (name: string): string => readFileSync(new URL(name, HERE), 'utf8').replaceAll('\r\n', '\n');

const VIEW = read('SchemaLongTaskView.tsx');
const CARD = read('SchemaCard.tsx');
const CARD_VIEW = read('SchemaCardView.tsx');
const EXTERNAL = read('../hooks/use-external-actions.ts');
const PREVIEW = read('../../app/layouts/rightbar/kit-preview-rows.tsx');

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
    expect(CARD).toContain("import { useExternalActions } from '@/shared/hooks/use-external-actions';");
    expect(read('../hooks/use-blocker-actions.ts')).toContain('const external = useExternalActions(() => retryRef.current());');
  });
});

describe('SchemaCard / SchemaCardView：两条卡片路径都接上 openExternal 与 copyText', () => {
  it('★★ useCardLongTasks 除 openLogin 外补 openExternal / copyText / copiedText', () => {
    expect(CARD).toContain('const external = useExternalActions(longTasks.refresh);');
    expect(CARD).toContain('readonly openExternal: (url: string) => void;');
    expect(CARD).toContain('readonly copyText: (text: string) => void;');
    expect(CARD).toContain('readonly copiedText: string | null;');
    expect(CARD).toContain('copyText: external.copy,');
    expect(CARD).toContain('copiedText: external.copied,');
  });

  it('★★ 开 URL 前仍然只放行 ^https?://（旧的 openLogin 守卫没丢）', () => {
    expect(CARD).toContain('if (!/^https?:\\/\\//i.test(url)) return;');
    expect(CARD).toContain('openLogin: openExternal,');
  });

  it('★★ FrameCard 直连 SchemaLongTaskView：四个回调一起给', () => {
    expect(CARD).toContain('onLogin: openLogin,');
    expect(CARD).toContain('onOpenUrl: openExternal,');
    expect(CARD).toContain('onCopy: copyText,');
    expect(CARD).toContain('copied: copiedText,');
  });

  it('★★ ReadCard 经 SchemaCardView：props 只做加法', () => {
    expect(CARD).toContain('onLongTaskLogin: openLogin,');
    expect(CARD).toContain('onLongTaskOpenUrl: openExternal,');
    expect(CARD).toContain('onLongTaskCopy: copyText,');
    expect(CARD).toContain('longTaskCopied: copiedText,');
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
    expect(CARD).toContain('rechecking: longTasks.rechecking,');
    expect(CARD).toContain('recheckFailed: longTasks.recheckFailed,');
    expect(CARD).toContain('void longTasks.recheck(id);');
    expect(CARD).toContain('longTaskRechecking: longTasks.rechecking,');
    expect(CARD).toContain('longTaskRecheckFailed: longTasks.recheckFailed,');
    expect(CARD_VIEW).toContain('readonly longTaskRechecking?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly longTaskRecheckFailed?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly onLongTaskRecheck?: ((id: string) => void) | undefined;');
    expect(CARD_VIEW).toContain('rechecking: longTaskRechecking ?? null,');
    expect(CARD_VIEW).toContain('recheckFailed: longTaskRecheckFailed ?? null,');
    expect(CARD_VIEW).toContain('onRecheck: onLongTaskRecheck ?? (() => {}),');
  });

  it('★★ 两条路径都接上 answer：FrameCard 直给，ReadCard 经 SchemaCardView（props 只加法、缺省空回调）', () => {
    expect(CARD).toContain('answering: longTasks.answering,');
    expect(CARD).toContain('answerFailed: longTasks.answerFailed,');
    expect(CARD).toContain('void longTasks.answer(id, values);');
    expect(CARD).toContain('longTaskAnswering: longTasks.answering,');
    expect(CARD).toContain('longTaskAnswerFailed: longTasks.answerFailed,');
    expect(CARD_VIEW).toContain('readonly longTaskAnswering?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly longTaskAnswerFailed?: string | null | undefined;');
    expect(CARD_VIEW).toContain('readonly onLongTaskAnswer?:');
    expect(CARD_VIEW).toContain('answering: longTaskAnswering ?? null,');
    expect(CARD_VIEW).toContain('answerFailed: longTaskAnswerFailed ?? null,');
    expect(CARD_VIEW).toContain('onAnswer: onLongTaskAnswer ?? (() => {}),');
  });
});

describe('kit 预览画廊：六态都摆得出来，needs-human 那条带两个动作', () => {
  it('★★ 加了一条 needs-human：带 intervention 与两个动作（打开 / 复制地址）', () => {
    expect(PREVIEW).toContain('status="needs-human"');
    expect(PREVIEW).toContain("title: '去控制台点「确认发布」',");
    expect(PREVIEW).toContain("hint: '凭证过期了',");
    expect(PREVIEW).toContain("key: 'open'");
    expect(PREVIEW).toContain("key: 'copy'");
  });

  it('★★ 还留了一条没有动作的 needs-human（只画标题）与旧的 needs-login 行', () => {
    expect(PREVIEW).toContain('intervention={{ title: \'去平台重新生成 Token\' }}');
    expect(PREVIEW).toContain('<LongTaskRow status="needs-login" headline="要登录腾讯云" problem="凭证过期了" />');
  });

  it('★★ 画廊加了一条带「我处理完了」的 needs-human（可重查那一档的观感）', () => {
    expect(PREVIEW).toContain("key: 'handled', label: '我处理完了', onPress: () => undefined");
    expect(PREVIEW).toContain("hint: '点完回来按「我处理完了」',");
  });

  it('★★ 画廊再加一条带 fields（text + secret 必填）与 submit 的 needs-human（回执那一档的观感）', () => {
    expect(PREVIEW).toContain(
      "key: 'operator', label: '操作人', kind: 'text', required: true, placeholder: '你的名字'",
    );
    expect(PREVIEW).toContain("key: 'token', label: '控制台口令', kind: 'secret', required: true");
    expect(PREVIEW).toContain("submit: { label: '提交', onSubmit: () => undefined }");
  });

  it('★ 说明从「五种状态」改成覆盖新态', () => {
    expect(PREVIEW).toContain('六种状态：跑着 / 要登录（旧路）/ 等你处理（人工干预节点）');
  });
});
