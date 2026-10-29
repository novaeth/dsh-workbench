import { createElement as h, useState } from 'react';
import styles from './kit-preview.module.css';
import { devSurface } from '@/shared/dev-surface';

import {
  ActivityAction,
  ActivityBlock,
  ActivityLine,
  FormRow,
  FormRows,
  LongTaskRow,
  Note,
  Row,
  Rows,
  SelectField,
  SettingsSection,
  Stack,
  TextField,
} from '@dsh-workbench/shared';
import { IconModules } from '@/shared/components/IconModules';
import {
  IconBrandMark,
  IconModuleMark,
  IconNpm,
  IconPanelScreen,
} from '@dsh-workbench/shared';
import {
  IconCodeOutlineRegular,
  IconRefreshOutlineRegular,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
import { Cell, Grid, Section } from './kit-preview-frame';

export function RowsSection() {
  return (
    <Section title="行与分组" note="Rows / Row 是键值行；Stack 只管间距；SettingsSection 是设置页那一节">
      <Grid>
        <Cell label="Rows + Row（长标签不折行，两行的值左沿对齐）">
          <Rows>
            <Row label="Application 名" value="uedyhsj" />
            <Row label="本项目服务" value="design-serverless" />
          </Rows>
        </Cell>
        <Cell label="Rows + Row（短标签）">
          <Rows>
            <Row label="环境" value="生产" />
            <Row label="集群" value="ali-prod" />
            <Row label="指纹" value="a1b2c3d4" />
          </Rows>
        </Cell>
        <Cell label="Stack（只管间距）">
          <Stack>
            <Note>第一行说明：默认 muted。</Note>
            <Note tone="problem">第二行是个问题：tone=problem。</Note>
          </Stack>
        </Cell>
        <Cell label="SettingsSection（设置页那一节）" wide>
          <div className={styles.bound}>
            <SettingsSection label="面板" title="显示">
              <Rows>
                <Row label="每页条数" value="20" />
                <Row label="自动刷新" value="开" />
              </Rows>
            </SettingsSection>
          </div>
        </Cell>
      </Grid>
    </Section>
  );
}

export function FormSection() {
  return (
    <Section
      title="表单的行"
      note="FormRows / FormRow：标签左列 + 控件（stacked 才是上下堆叠）；控件仍由调用点给 —— 这一层没有 DSL"
    >
      <Grid>
        <Cell label="FormRow（标签在左，默认）" wide>
          <div className={styles.bound}>
            <FormRows>
              <FormRow label="环境" hint="只列非生产">
                <SelectField
                  options={[
                    { value: 'test', label: '测试环境' },
                    { value: 'stage', label: '预发' },
                  ]}
                  value="test"
                  onChange={() => {}}
                />
              </FormRow>
              <FormRow label="发布分支">
                <TextField value="bgkj-test-auth" onChange={() => {}} />
              </FormRow>
            </FormRows>
          </div>
        </Cell>
        <Cell label="长标签不折行（同一组共用一个标签列；组标题通栏）" wide>
          <div className={styles.bound}>
            <FormRows>
              <p className={styles.note}>身份</p>
              <FormRow label="Application 名">
                <TextField value="bgkj-test-auth" onChange={() => {}} />
              </FormRow>
              <FormRow label="环境">
                <SelectField
                  options={[{ value: 'test', label: '测试环境' }]}
                  value="test"
                  onChange={() => {}}
                />
              </FormRow>
            </FormRows>
          </div>
        </Cell>
        <Cell label="stacked（上下堆叠）+ 禁用那一档">
          <div className={styles.bound}>
            <FormRows>
              <FormRow label="项目" layout="stacked">
                <TextField value="中台-组织权限域" onChange={() => {}} />
              </FormRow>
              <FormRow label="服务" hint="禁用时标签会压暗">
                <SelectField
                  options={[{ value: 'web', label: '前端服务' }]}
                  value="web"
                  onChange={() => {}}
                  disabled
                />
              </FormRow>
            </FormRows>
          </div>
        </Cell>
        <Cell label="出错那一档（problem 顶掉 hint，控件给 invalid）" wide>
          <div className={styles.bound}>
            <FormRows>
              <FormRow label="环境" problem="生产环境不在可发布范围内">
                <SelectField
                  options={[{ value: 'prod', label: '生产环境' }]}
                  value="prod"
                  onChange={() => {}}
                  invalid
                />
              </FormRow>
              <FormRow label="发布分支" problem="这个分支上还没有最近的构建">
                <TextField value="release/2.13" invalid onChange={() => {}} />
              </FormRow>
            </FormRows>
          </div>
        </Cell>
      </Grid>
    </Section>
  );
}

export function ActivitySection() {
  return (
    <Section title="活动流" note="ActivityBlock / ActivityLine / ActivityAction：一行一个动作，右边是时间与按钮">
      <div className={styles.panel}>
        <ActivityBlock head="今天的动作">
          <ActivityLine dot={<StateDot state="done" size={10} />} text="读了构建列表" at="2 分钟前" />
          <ActivityLine
            dot={<StateDot state="ongoing" size={10} />}
            text="正在发布"
            at="刚刚"
            actions={
              <ActivityAction label="看日志" icon={<IconCodeOutlineRegular size={14} />} onClick={() => {}} />
            }
          />
          <ActivityLine
            dot={<StateDot state="error" size={10} />}
            text="发布失败"
            at="1 小时前"
            actions={
              <ActivityAction
                label="重试"
                hint="失败的那次再跑一遍"
                icon={<IconRefreshOutlineRegular size={14} />}
                failed
                onClick={() => {}}
              />
            }
          />
        </ActivityBlock>
      </div>
    </Section>
  );
}

export function LongTaskSection() {
  return (
    <Section
      title="长任务那一行"
      note="五种状态：跑着 / 要登录 / 好了 / 失败（带步骤与原文）/ 用户按停；带 stop 的那条最右边有一颗两按确认的停止钮"
    >
      <div className={styles.stack}>
        <LongTaskRow
          status="running"
          headline="正在发布（2/3）"
          stepsTitle="步骤"
          steps={['拉代码', '构建', '发布']}
        />
        <LongTaskRow
          status="running"
          headline="正在发布（2/3）· 可以停"
          stepsTitle="步骤"
          steps={['拉代码', '构建', '发布']}
          stop={{
            onStop: () => undefined,
            label: '停止任务 发布',
            askLabel: '确认停止',
            armedLabel: '再次点击确认停止',
          }}
        />
        <LongTaskRow status="needs-login" headline="要登录腾讯云" problem="凭证过期了" />
        <LongTaskRow
          status="ok"
          headline="发布完成"
          rawTitle="原文"
          raw="ok · 12.4s"
          copyLabel="复制"
          copiedLabel="复制好了"
          links={[{ href: 'https://example.com/log', text: '日志' }]}
        />
        <LongTaskRow status="failed" headline="发布失败" problem="站点回的是 HTTP 403" />
        <LongTaskRow status="stopped" headline="发布已停止（用户按停）" />
      </div>
    </Section>
  );
}

export function IconSection() {
  const icons = [
    { label: 'IconBrandMark', node: <IconBrandMark size={20} /> },
    { label: 'IconModuleMark', node: <IconModuleMark size={20} /> },
    { label: 'IconModules', node: <IconModules size={16} /> },
    { label: 'IconPanelScreen', node: <IconPanelScreen size={16} /> },
    { label: 'IconModuleMark', node: <IconModuleMark size={16} /> },
    { label: 'IconNpm', node: <IconNpm size={16} /> },
  ];
  return (
    <Section title="外壳自己的图标" note="dsh 那一套 Icon*Regular 直接从原语拿，这几个是外壳自己画的">
      <Grid>
        {icons.map((one) => (
          <Cell key={one.label} label={one.label}>
            <span className={styles.panel}>{one.node}</span>
          </Cell>
        ))}
      </Grid>
    </Section>
  );
}

export function StripSection() {
  const [index, setIndex] = useState(0);
  const MockStrip = devSurface.Strip;
  return (
    <Section title="夹具条" note="MockStrip：只在 ?wbMock=1 下出现的那条，自己也可以摆出来">
      <MockStrip
        note="这是夹具条本身：点一下就换一个形状"
        index={index}
        onPick={setIndex}
        mocks={[
          { id: 'one', label: '一张卡' },
          { id: 'two', label: '两张卡' },
          { id: 'eight', label: '八张卡' },
        ]}
      />
    </Section>
  );
}
