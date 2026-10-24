import { createElement as h, useState } from 'react';
import type { SelectFieldOption } from '@dsh-workbench/shared';
import styles from './kit-preview.module.css';

import {
  ChoiceGroup,
  Field,
  FormActions,
  Link,
  SaveBar,
  SelectField,
  TextField,
} from '@dsh-workbench/shared';
import {
  IconChevronDownOutlineRegular,
  IconPlusOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';

const ENV_OPTIONS: readonly SelectFieldOption[] = [
  { value: 'prod', label: '生产环境' },
  { value: 'stage', label: '预发环境' },
  { value: 'dev', label: '开发环境' },
];

const CLOUD_OPTIONS: readonly SelectFieldOption[] = [
  { value: 'ali-prod', label: '生产集群', group: '阿里云', searchText: 'aliyun 生产 prod' },
  { value: 'ali-stage', label: '预发集群', group: '阿里云', searchText: 'aliyun 预发 stage' },
  { value: 'tencent-prod', label: '生产集群', group: '腾讯云', searchText: 'tencent 生产 prod' },
  { value: 'tencent-dev', label: '开发集群', group: '腾讯云', disabled: true, searchText: 'tencent 开发 dev' },
];

const CHOICES = [
  { value: 'small', label: '小' },
  { value: 'medium', label: '中' },
  { value: 'large', label: '大' },
];

const LONG_CHOICES = [
  {
    value: 'cn-north-prod',
    label: '华北二 · 生产集群（候选名字故意很长，看它不再被裁成一行）',
    description: '线上流量都从这里走；改动前先确认发布窗口',
  },
  {
    value: 'cn-south-stage',
    label: '华南一 · 预发集群',
    description: '灰度验证用，数据每周一清',
  },
  { value: 'cn-east-dev', label: '华东 · 开发集群' },
];

export function TextFieldDemo() {
  const [text, setText] = useState('');
  return (
    <div className={styles.stack}>
      <Field label="名字" hint="随手敲点字，看描边与焦点环">
        <TextField value={text} placeholder="例如：生产" onChange={(event) => setText(event.currentTarget.value)} />
      </Field>
      <TextField invalid value="这份填错了" onChange={() => {}} />
      <TextField value="禁用的一格" disabled onChange={() => {}} />
    </div>
  );
}

export function SelectDemo({ variant }: { readonly variant?: 'boxed' | 'ghost' }) {
  const [value, setValue] = useState('stage');
  return (
    <SelectField
      value={value}
      options={ENV_OPTIONS}
      onChange={setValue}
      {...(variant === undefined ? {} : { variant })}
      label={variant === 'ghost' ? undefined : '环境'}
      hint={variant === 'ghost' ? undefined : '展开后锚点换成搜索框，↑↓ 走游标'}
    />
  );
}

export function SelectRichDemo() {
  const [value, setValue] = useState('ali-prod');
  const [added, setAdded] = useState(0);
  return (
    <SelectField
      value={value}
      options={CLOUD_OPTIONS}
      onChange={setValue}
      label="集群"
      hint={added === 0 ? '试试点页脚那颗「新建集群…」' : `页脚接过 ${added} 次`}
      searchLabel="搜集群"
      searchPlaceholder="搜名字或别名…"
      emptyText={(query) => `没有匹配「${query}」的集群`}
      footer={{ label: '新建集群…', icon: <IconPlusOutlineRegular size={14} /> }}
      onFooter={() => setAdded((count) => count + 1)}
    />
  );
}

export function SelectStateDemo() {
  const [manual, setManual] = useState('手填的环境名');
  return (
    <div className={styles.stack}>
      <SelectField
        value="prod"
        options={ENV_OPTIONS}
        onChange={() => {}}
        disabled
        label="禁用"
      />
      <SelectField
        value=""
        options={[]}
        onChange={() => {}}
        loading
        loadingText="正在读环境…"
        label="加载中"
      />
      <SelectField
        value=""
        options={[]}
        onChange={() => {}}
        fallback={{ value: manual, onChange: setManual }}
        label="名单读不到 → 退化成手填"
      />
    </div>
  );
}

export function AppearanceDemo() {
  const [value, setValue] = useState('medium');
  return (
    <div className={styles.stack}>
      <SelectField
        value={value}
        options={CHOICES}
        onChange={setValue}
        variant="ghost"
        icon={<IconChevronDownOutlineRegular size={16} />}
        ariaLabel="尺寸"
        title="无边框变体：图标 + 当前值 + 箭头"
      />
      <SelectField
        value={value}
        options={CHOICES}
        onChange={setValue}
        selection="check"
        label="selection=check（打勾那一种）"
      />
    </div>
  );
}

export function ChoiceDemo() {
  const [single, setSingle] = useState('medium');
  const [many, setMany] = useState<readonly string[]>(['small', 'large']);
  const [long, setLong] = useState('cn-north-prod');
  return (
    <div className={styles.stack}>
      <ChoiceGroup label="尺寸" name="kit-size" options={CHOICES} value={single} onChange={setSingle} />
      <ChoiceGroup
        label="多选"
        name="kit-many"
        options={CHOICES}
        multi
        values={many}
        onChange={setMany}
      />
      <ChoiceGroup
        label="禁用"
        name="kit-off"
        options={CHOICES}
        value="small"
        onChange={() => {}}
        disabled
      />
      <ChoiceGroup
        label="无边框档"
        name="kit-ghost"
        options={CHOICES}
        variant="ghost"
        value={single}
        onChange={setSingle}
      />
      <ChoiceGroup
        label="加载中"
        name="kit-loading"
        options={[]}
        loading
        loadingText="正在读环境…"
        value=""
        onChange={() => {}}
      />
      <ChoiceGroup
        label="没得选"
        name="kit-empty"
        options={[]}
        emptyText="这个工作区还没绑定环境"
        value=""
        onChange={() => {}}
      />
      <ChoiceGroup
        label="长候选 + description"
        name="kit-long"
        options={LONG_CHOICES}
        value={long}
        onChange={setLong}
      />
    </div>
  );
}

export function FormActionsDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <div className={styles.stack}>
      <FormActions
        actions={[
          { key: 'retry', label: '重试', onClick: () => {} },
          { key: 'confirm', label: '确认', kind: 'primary', onClick: () => {} },
        ]}
      />
      <FormActions
        actions={[
          { key: 'cancel', label: '取消', onClick: () => {} },
          { key: 'remove', label: '删除', kind: 'danger', onClick: () => {} },
          { key: 'save', label: '保存', kind: 'primary', onClick: () => {} },
        ]}
      />
      <FormActions
        actions={[
          { key: 'later', label: '稍后', onClick: () => {}, disabled: true },
          {
            key: 'sync',
            label: busy ? '同步中…' : '同步',
            kind: 'primary',
            onClick: () => setBusy((on) => !on),
            busy,
          },
        ]}
      />
      <div className={styles.narrowActions}>
        <FormActions
          actions={[
            { key: 'cancel', label: '取消', onClick: () => {} },
            { key: 'delete', label: '删除环境', kind: 'danger', onClick: () => {} },
            { key: 'save', label: '保存', kind: 'primary', onClick: () => {} },
          ]}
        />
      </div>
    </div>
  );
}

export function SaveBarDemo() {
  const [busy, setBusy] = useState(false);
  return (
    <SaveBar
      busy={busy}
      labels={{ cancel: '取消', save: '保存', saving: '保存中…' }}
      onCancel={() => setBusy(false)}
      onSave={() => setBusy(true)}
    />
  );
}

export function LinkDemo() {
  return (
    <div className={styles.inline}>
      <Link href="https://example.com/report" title="外部链接：新窗口打开">
        外部报告
      </Link>
      <Link href="#kit-preview" external={false}>
        站内锚点
      </Link>
    </div>
  );
}
