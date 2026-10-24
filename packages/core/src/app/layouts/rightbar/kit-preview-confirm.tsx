import { createElement as h, useEffect, useState } from 'react';
import type { ReactNode, SelectFieldOption } from '@dsh-workbench/shared';
import { ConfirmBar, Note, SelectField } from '@dsh-workbench/shared';
import { Cell, Grid, Section } from './kit-preview-frame';

const ENV_OPTIONS: readonly SelectFieldOption[] = [
  { value: 'prod', label: '生产环境' },
  { value: 'stage', label: '预发环境' },
];

function PickerDemo() {
  const [env, setEnv] = useState('prod');
  const production = env === 'prod';
  return (
    <ConfirmBar
      title="发布到 prod？"
      rows={[
        {
          key: 'env',
          label: '环境',
          value: <SelectField value={env} options={ENV_OPTIONS} onChange={setEnv} />,
        },
        {
          key: 'branch',
          label: '来源分支',
          value: `bgkj-test-auth → ${production ? 'main' : 'release'}`,
        },
      ]}
      problem={production ? undefined : '预发只允许从 release 发'}
      actions={[
        { key: 'cancel', label: '取消', onClick: () => {} },
        { key: 'publish', label: '发布', kind: 'primary', onClick: () => {} },
      ]}
    />
  );
}

function DangerDemo() {
  return (
    <ConfirmBar
      title="清空这个环境的绑定？"
      hint="清完之后要重新绑一次身份。要不要先问一句归调用点（这一件只画问的时候长什么样）。"
      actions={[
        { key: 'cancel', label: '取消', onClick: () => {} },
        { key: 'clear', label: '清空', kind: 'danger', onClick: () => {} },
        { key: 'clear-keep', label: '清空但保留身份', kind: 'primary', onClick: () => {} },
      ]}
    />
  );
}

function BusyDemo() {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReactNode>(undefined);
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setTimeout(() => {
      setBusy(false);
      setProblem('发布失败：站点回的是 HTTP 403');
    }, 1500);
    return () => clearTimeout(timer);
  }, [busy]);
  return (
    <ConfirmBar
      title="发布到 prod？"
      rows={[{ key: 'branch', label: '来源分支', value: 'bgkj-test-auth → main' }]}
      problem={problem}
      busy={busy}
      actions={[
        { key: 'cancel', label: '取消', onClick: () => {}, disabled: busy },
        {
          key: 'publish',
          label: busy ? '发布中…' : '发布',
          kind: 'primary',
          busy,
          onClick: () => {
            setProblem(undefined);
            setBusy(true);
          },
        },
      ]}
    />
  );
}

function NarrowDemo() {
  return (
    <div style={{ maxWidth: 'var(--wb-len-220)' }}>
      <ConfirmBar
        title="发布到 prod？"
        rows={[{ key: 'branch', label: '来源分支', value: 'bgkj-test-auth → main' }]}
        actions={[
          { key: 'cancel', label: '取消', onClick: () => {} },
          { key: 'preview', label: '预览', onClick: () => {} },
          { key: 'dry-run', label: '只试跑', onClick: () => {} },
          { key: 'publish', label: '发布', kind: 'primary', onClick: () => {} },
        ]}
      />
    </div>
  );
}

function InlineDemo() {
  return (
    <ConfirmBar
      title="清空之后要重新绑一次身份，确定吗？"
      actions={[
        { key: 'cancel', label: '取消', onClick: () => {} },
        { key: 'clear', label: '清空', kind: 'danger', onClick: () => {} },
      ]}
    />
  );
}

export function ConfirmSection() {
  return (
    <Section
      title="确认条 ConfirmBar"
      note="「先问一句再动手」那一条的形状：标题 + 说明 + 键值（值那一格可以放控件）+ 失败那句 + 动作区。要不要问归调用点。五格：普通（SelectField 进值那一格，选「预发」看失败那句）· 带 danger（破坏性动作紧挨 primary 左侧）· 忙（primary 转圈并换文案）· 窄容器（220px / 四颗动作折行后 primary 仍在右下角）· 只有标题与动作（设置页那种内联确认）"
    >
      <Grid>
        <Cell label="普通（键值两格，值那一格放 SelectField）" wide>
          <PickerDemo />
        </Cell>
        <Cell label="带 danger（一颗破坏性动作 + 一颗 primary）" wide>
          <DangerDemo />
        </Cell>
        <Cell label="忙（点「发布」：转圈、换文案、其余动作禁用；转完落出失败那句）" wide>
          <BusyDemo />
        </Cell>
        <Cell label="窄容器（220px / 四颗动作折行后 primary 仍在右下角）" wide>
          <NarrowDemo />
        </Cell>
        <Cell label="只有标题与动作（设置页那种内联确认，没有键值行）" wide>
          <InlineDemo />
        </Cell>
      </Grid>
      <Note>
        这一节的失败那句走 kit 的 <code>Note tone=&quot;problem&quot;</code>、键值走 <code>Rows</code> /{' '}
        <code>Row</code>、动作走 <code>FormActions</code> —— 三件都不在这一件里重画。
      </Note>
    </Section>
  );
}
