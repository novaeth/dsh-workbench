import { createElement as h } from 'react';
import type { BoardModule, BoardModuleProps } from '@dsh-workbench/shared';
import styles from './kit-preview.module.css';

import {
  Card,
  CardHead,
  CenteredState,
  EmptyState,
  Note,
  SkeletonRows,
  StateBlock,
} from '@dsh-workbench/shared';
import { IconBrandMark, IconPanelScreen } from '@dsh-workbench/shared';
import { IconModules } from '@/shared/components/IconModules';
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  AppearanceDemo,
  ChoiceDemo,
  FormActionsDemo,
  LinkDemo,
  SaveBarDemo,
  SelectDemo,
  SelectRichDemo,
  SelectStateDemo,
  TextFieldDemo,
} from './kit-preview-controls';
import { ConfirmSection } from './kit-preview-confirm';
import { FormSurfaceSection } from './kit-preview-forms';
import { Cell, Grid, KitNav, KitNavProvider, Section } from './kit-preview-frame';
import {
  ActivitySection,
  FormSection,
  IconSection,
  LongTaskSection,
  RowsSection,
  StripSection,
} from './kit-preview-rows';

function SelectSection() {
  return (
    <Section
      title="下拉选择 SelectField"
      note="默认是常规下拉框；无边框那档要显式给 variant=ghost。展开后锚点换成搜索框，↑↓ 走游标、Enter 选中、Esc / 外点关掉"
    >
      <Grid>
        <Cell label="常规档（默认，带 label / hint）">
          <SelectDemo />
        </Cell>
        <Cell label="variant=ghost（左栏工作区那一种）">
          <SelectDemo variant="ghost" />
        </Cell>
        <Cell label="搜索 + 分组 + 禁用项 + 页脚动作">
          <SelectRichDemo />
        </Cell>
        <Cell label="禁用 / 加载中 / 名单读不到时退化成手填">
          <SelectStateDemo />
        </Cell>
        <Cell label="图标 + 当前值（无边框）与 selection=check" wide>
          <AppearanceDemo />
        </Cell>
      </Grid>
    </Section>
  );
}

function FormsSection() {
  return (
    <Section title="输入与本机选择" note="TextField 的三个态、ChoiceGroup 的单选 / 多选 / 禁用 / 无边框档 / 加载中 / 没得选 / 长候选带说明、FormActions（主操作在右、窄容器换行）、SaveBar、Link">
      <Grid>
        <Cell label="TextField（正常 / invalid / 禁用）">
          <TextFieldDemo />
        </Cell>
        <Cell label="ChoiceGroup（单选 / 多选 / 禁用 / ghost / loading / empty / description）">
          <ChoiceDemo />
        </Cell>
        <Cell label="FormActions（普通两动作 / 带 danger / busy+disabled / 窄容器换行后 primary 仍在右下角）" wide>
          <FormActionsDemo />
        </Cell>
        <Cell label="SaveBar（点保存看它转起来）">
          <SaveBarDemo />
        </Cell>
        <Cell label="Link（外链与站内）">
          <LinkDemo />
        </Cell>
      </Grid>
    </Section>
  );
}

function CardSection({ t }: { readonly t: BoardModuleProps['t'] }) {
  return (
    <Section
      title="卡片与卡头"
      note="模块卡片自己渲染 Card；外壳只在外层套 CardAnchor（display: contents）与 CardBoundary（崩了才看得见）"
    >
      <Grid>
        <Cell label="Card（整张卡）" wide>
          <div className={styles.bound}>
            <Card t={t} title="示例卡片" meta="夹具" refreshing={false} onRefresh={() => {}}>
              <Note>卡身里放什么都行：这张预览卡自己就是个例子。</Note>
            </Card>
          </div>
        </Cell>
        <Cell label="CardHead（带齿轮与平台跳转）" wide>
          <div className={styles.bound}>
            <CardHead
              t={t}
              title="卡头"
              meta="3 分钟前"
              refreshing={false}
              onRefresh={() => {}}
              gear="面板设置"
              gearOpen
              onToggleGear={() => {}}
              platform="打开平台"
              platformTitle="去平台上看看"
              platformHref="https://example.com/panel"
            />
          </div>
        </Cell>
      </Grid>
    </Section>
  );
}

function StateSection() {
  return (
    <Section title="状态与提示" note="Note / StateBlock / CenteredState / EmptyState / SkeletonRows：卡里那几种“没东西可看”的说法">
      <Grid>
        <Cell label="Note（muted 与 problem）">
          <Note>这句是说明。</Note>
          <Note tone="problem">这句是问题。</Note>
        </Cell>
        <Cell label="StateBlock（点 + 标题 + 提示 + 动作）">
          <StateBlock
            dot={<StateDot state="ongoing" size={10} />}
            title="正在读"
            hint="读回来之前这一块先这么说"
            resolving="还剩 3 秒"
          >
            <SkeletonRows rows={3} />
          </StateBlock>
        </Cell>
        <Cell label="CenteredState（大图标 / 紧凑）">
          <CenteredState
            icon={<IconPanelScreen size={32} />}
            title="这块还没接上"
            hint="接上之后这里会有数据"
            action={<Note>动作用 Note 或 Button 都行</Note>}
          />
          <CenteredState compact icon={<IconModules size={20} />} title="紧凑的那一档" />
        </Cell>
        <Cell label="EmptyState 与 SkeletonRows">
          <EmptyState text="一条都还没有" icon={<IconBrandMark size={20} />} />
          <SkeletonRows rows={2} />
        </Cell>
      </Grid>
    </Section>
  );
}

export function KitPreview({ t }: BoardModuleProps) {
  return (
    <Card
      t={t}
      title="公共组件预览"
      meta="夹具 · 只在 ?wbMock=1 下摆出来"
      refreshing={false}
      onRefresh={() => {}}
    >
      <KitNavProvider>
        <div className={styles.gallery}>
          <Note>
            这里把 <code>@dsh-workbench/shared</code> 里那套哑组件按“样式 + 交互”摆了一遍：能点的都点得动，
            能搜的都能搜。没摆的是要真实数据的那些（ApprovalDetail 要一份会话快照、CardBoundary 要一张会炸的卡 —— 那个走
            ?wbCrash=1）。
          </Note>
          <KitNav />
          <SelectSection />
          <FormsSection />
          <RowsSection />
          <FormSection />
          <FormSurfaceSection />
          <ConfirmSection />
          <CardSection t={t} />
          <StateSection />
          <ActivitySection />
          <LongTaskSection />
          <IconSection />
          <StripSection />
        </div>
      </KitNavProvider>
    </Card>
  );
}

export const KIT_PREVIEW_MODULE: BoardModule = {
  id: 'wb-kit-preview',
  titleKey: '组件预览',
  order: 999,
  View: KitPreview,
};
