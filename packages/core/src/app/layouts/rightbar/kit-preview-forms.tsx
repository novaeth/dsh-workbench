import { createElement as h, useEffect, useState } from 'react';
import type { FormFieldOf, ReactNode, SelectFieldOption } from '@dsh-workbench/shared';
import styles from './kit-preview.module.css';
import { Form, Note, SelectField, TextField } from '@dsh-workbench/shared';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { Cell, Grid, Section } from './kit-preview-frame';

const ENV_OPTIONS: readonly SelectFieldOption[] = [
  { value: 'prod', label: '生产环境' },
  { value: 'stage', label: '预发环境' },
  { value: 'dev', label: '开发环境' },
];

type DemoValues = { readonly env: string; readonly branch?: string };

interface DemoFieldsInput {
  readonly env: string;
  readonly branch: string;
  readonly onEnv: (next: string) => void;
  readonly onBranch: (next: string) => void;
  readonly withProblems: boolean;
  readonly branchVisible: boolean;
}

function demoFields(input: DemoFieldsInput): readonly FormFieldOf<DemoValues>[] {
  return [
    {
      key: 'env',
      label: '环境',
      hint: '只列非生产',
      value: input.env,
      onChange: input.onEnv,
      validate: input.withProblems
        ? (value) => (value === 'prod' ? '生产环境不在可发布范围内' : undefined)
        : undefined,
      control: (binding) => (
        <SelectField
          id={binding.id}
          name={binding.name}
          invalid={binding.invalid}
          disabled={binding.disabled}
          value={binding.value}
          options={ENV_OPTIONS}
          onChange={binding.onChange}
        />
      ),
    },
    {
      key: 'branch',
      label: '发布分支',
      hint: '上一次构建用的那条',
      value: input.branch,
      onChange: (next) => input.onBranch(next ?? ''),
      visible: input.branchVisible,
      validate: input.withProblems
        ? (value) => (value === '' ? '这条分支上还没有最近的构建' : undefined)
        : undefined,
      control: (binding) => (
        <TextField
          id={binding.id}
          name={binding.name}
          invalid={binding.invalid}
          disabled={binding.disabled}
          value={binding.value ?? ''}
          onChange={(event) => binding.onChange(event.currentTarget.value)}
        />
      ),
    },
  ];
}

function FormValueDemo() {
  const [env, setEnv] = useState('stage');
  const [branch, setBranch] = useState('bgkj-test-auth');
  return (
    <Form<DemoValues>
      fields={demoFields({
        env,
        branch,
        onEnv: setEnv,
        onBranch: setBranch,
        withProblems: false,
        branchVisible: true,
      })}
      onSubmit={() => {}}
      submit={{ label: '发布' }}
      cancel={{ label: '取消', onClick: () => {} }}
    />
  );
}

function FormProblemDemo() {
  const [env, setEnv] = useState('prod');
  const [branch, setBranch] = useState('release/2.13');
  return (
    <Form<DemoValues>
      fields={demoFields({
        env,
        branch,
        onEnv: setEnv,
        onBranch: setBranch,
        withProblems: true,
        branchVisible: true,
      })}
      onSubmit={() => {}}
      submit={{ label: '发布' }}
      cancel={{ label: '取消', onClick: () => {} }}
    />
  );
}

function FormBusyDemo() {
  const [env, setEnv] = useState('stage');
  const [branch, setBranch] = useState('bgkj-test-auth');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReactNode>(undefined);
  useEffect(() => {
    if (!busy) return undefined;
    const timer = setTimeout(() => {
      setBusy(false);
      setProblem('发布失败：站点回的是 HTTP 403 —— 整表那句错落在行与操作区之间');
    }, 1500);
    return () => clearTimeout(timer);
  }, [busy]);
  return (
    <Form<DemoValues>
      fields={demoFields({
        env,
        branch,
        onEnv: setEnv,
        onBranch: setBranch,
        withProblems: false,
        branchVisible: true,
      })}
      onSubmit={() => {
        setProblem(undefined);
        setBusy(true);
      }}
      submit={{ label: '发布', busyLabel: '发布中…' }}
      cancel={{ label: '取消', onClick: () => {} }}
      extra={[{ key: 'dry-run', label: '只试跑', onClick: () => {} }]}
      busy={busy}
      problem={problem}
    />
  );
}

function FormNarrowDemo() {
  const [env, setEnv] = useState('stage');
  const [branch, setBranch] = useState('bgkj-test-auth');
  return (
    <div style={{ maxWidth: 'var(--wb-len-220)' }}>
      <Form
        fields={demoFields({
          env,
          branch,
          onEnv: setEnv,
          onBranch: setBranch,
          withProblems: false,
          branchVisible: true,
        })}
        onSubmit={() => {}}
        submit={{ label: '发布' }}
        cancel={{ label: '取消', onClick: () => {} }}
        extra={[
          { key: 'reset', label: '重置', onClick: () => {} },
          { key: 'preview', label: '预览', onClick: () => {} },
          { key: 'delete', label: '删除环境', kind: 'danger', onClick: () => {} },
        ]}
      />
    </div>
  );
}

function FormVisibleDemo() {
  const [env, setEnv] = useState('stage');
  const [branch, setBranch] = useState('');
  const [branchVisible, setBranchVisible] = useState(true);
  const [submitted, setSubmitted] = useState<readonly string[] | null>(null);
  return (
    <div className={styles.stack}>
      <Form
        fields={demoFields({
          env,
          branch,
          onEnv: setEnv,
          onBranch: setBranch,
          withProblems: true,
          branchVisible,
        })}
        onSubmit={(values) => setSubmitted(Object.keys(values))}
        submit={{ label: '发布' }}
        cancel={{ label: '取消', onClick: () => setSubmitted(null) }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => setBranchVisible((on) => !on)}
      >
        {branchVisible ? '把「发布分支」那格关掉（visible: false）' : '再打开那一格'}
      </Button>
      <Note>
        {branchVisible
          ? '「发布分支」那格现在是空的：点一次「发布」看它红 —— 关掉那格（上面那颗钮）再点，红与那句错一起消失。'
          : submitted === null
            ? '那格已经关掉：它不渲染、不校验、不参与「第一处错误」；点「发布」能过。'
            : `关着那格提交成功了，回到 onSubmit 的键只有：${submitted.join(' / ')}。`}
      </Note>
    </div>
  );
}

export function FormSurfaceSection() {
  return (
    <Section
      title="整张表单 Form"
      note="Form 是「面」那一层：fields 配置进，行排布、错误位置与时机、提交阻断、第一处错误带进视口、操作区全归它（调用点没有摆操作区的口子）。五格：正常两格带 hint · 点一次「发布」看有错那一格（红 + 那句错 + 标签变红）· busy（提交钮转圈并换 busyLabel，其余控件与动作一起禁用；转完落出整表那句错）· 窄容器（220px 里五颗动作折行后 primary 仍在右下角，整张表单在容器里纵向满宽）· 动态渲染（visible: false 的那格不渲染 / 不校验 / 不进 values）"
    >
      <Grid>
        <Cell label="正常两格（SelectField + TextField，带 hint）" wide>
          <div className={styles.bound}>
            <FormValueDemo />
          </div>
        </Cell>
        <Cell label="有错（点一次「发布」：一格红 + 那句错 + 标签变红）" wide>
          <div className={styles.bound}>
            <FormProblemDemo />
          </div>
        </Cell>
        <Cell label="busy（提交钮转圈，其余控件与动作一起禁用）" wide>
          <div className={styles.bound}>
            <FormBusyDemo />
          </div>
        </Cell>
        <Cell label="窄容器（220px / 五颗动作：操作区折行后 primary 仍在右下角，表单纵向满宽）" wide>
          <FormNarrowDemo />
        </Cell>
        <Cell label="动态渲染（visible: false 那格整格当不存在）" wide>
          <div className={styles.bound}>
            <FormVisibleDemo />
          </div>
        </Cell>
      </Grid>
    </Section>
  );
}
