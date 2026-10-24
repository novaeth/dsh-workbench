# 领域文档

工程技能探索代码库前，按这里读本仓的领域文档。

## 动手前先读

- **`CONTEXT.md`**（仓根）：本项目的词表，只放这个项目自己的词。
- **`private-docs/docs/adr/`**：要动的区域涉及的 ADR 先读（`0001-*.md` …）。它在私有子仓里；
  没有权限就跳过，**不要**假装读过。
- **`ARCHITECTURE.md`**：层序、两个运行时、槽位与数据通路的结构地图。不是 ADR，但改结构前先看。

这些文件不存在时**安静跳过**：不要提示缺失，也不要先建议创建。`/domain-modeling`
（经 `/grill-with-docs`、`/improve-codebase-architecture` 到达）只在术语或决策真定下来时懒创建。

## 布局：单上下文

一个 `CONTEXT.md` 加一份 ADR 目录。`packages/*` 共用这一份词表，不按包拆上下文：

    /
    ├── CONTEXT.md
    ├── ARCHITECTURE.md
    └── private-docs/docs/adr/        ← 私有子仓；ADR 只在这里，不另起 docs/adr/

## 用词表的词

输出里点到一个领域概念（工单标题、重构提案、假设、测试名）时，用 `CONTEXT.md` 里定义的词，
不要漂到词表明确说 _Avoid_ 的同义词。

需要的概念词表里还没有，这是个信号：要么你在发明这个项目不用的词（重新想），
要么是真的缺（记下来交给 `/domain-modeling`）。

## 标记 ADR 冲突

输出和已有 ADR 相矛盾时，明着说出来，不要默默覆盖：

> _与 ADR-0007 矛盾，但值得重开，因为……_
