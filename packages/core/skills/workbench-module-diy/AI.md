# AI：要模型就用 `deps.ai`

模块要“让模型看一眼、给个结论”，只有这一个入口。不要自己去 `ctx.get('llm')`、不要自己拼内容块、
不要自己存图片——那些活在宿主里做完了（`ctx.get('llm')` 仍在，是逃生口，不是推荐路径）。

## 1 三个动词

```ts
const text = await deps.ai.ask({ prompt: '说一句' });

const verdict = await deps.ai.askJson({
  prompt: reviewPrompt,
  schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
});

const rich = await deps.ai.askRich({ prompt: 'x' });   // + usage / model / elapsedMs
```

- 除 `prompt` 外**全是可选**：加字段永远不会撞坏调用方。
- `askJson` 保证返回对象：先解析、再校验 schema，不合格**自动重试一次**，仍不合格抛
  `schema-mismatch`（`details.raw` 里有原始输出）。
- 模型默认用用户在界面上选的那个；要覆盖就 `model: { provider, model }`。

## 2 图片：直接给，别自己编码

```ts
await deps.ai.askJson({
  prompt,
  images: ['/tmp/page1.jpg', 'data:image/jpeg;base64,...', bytes],
  schema,
});
```

三种给法都行：绝对路径、data URL、`Uint8Array`。宿主会 `saveImage` 成持久附件再送进模型；
模块**看不到**附件引用这种内核词汇。

⚠️ 别按 OpenAI 的 `image_url` 自己拼内容块——dsh 的适配器只认 `{ type: 'image', attachment }`，
其余内容块会被**静默丢弃**，模型会回你“无法查看图片”，看着像模型不行。

先问能力再降级：

```ts
if (!deps.ai.supports('images')) return reject('请人工核对扫描件');
```

## 3 长任务里的模型步骤

```ts
const runs = deps.longTasks.create({
  key: 'myunit/batch',
  view: (snapshot) => ({ ... }),
  run: async ({ payload, onStep, signal }) => {
    onStep({ kind: 'info', text: '模型初审' });
    const got = await deps.ai.askJson({ prompt, images, schema, signal });
    return { ok: true, got };
  },
});
```

`signal` 一路穿到底：用户按停止，模型调用立刻中止（错误码 `aborted`）。要显示进度就传 `onStep`。

## 4 流程里的模型步骤

```ts
{
  id: 'review',
  title: '初审',
  ai: {
    prompt: { $ref: 'steps.fetch' },
    images: { $ref: 'steps.pages' },     // 求值成字符串数组
    schema: { type: 'object', properties: { verdict: { type: 'string' } } },
  },
}
```

- 结果进 `steps.<id>`；给 `schema` 得对象，否则得文本。
- `check` 会在「这一份运行时没有模型」时**起跑前**就拒，不会跑到一半才炸。
- 代码里的 `ai.ask` 与这里的 `ai` 步骤是**同一份入参**，加字段时两处同时获得。

## 5 agent（要工具时才用）

```ts
await deps.ai.agent({
  prompt: '查一下这份合同的对赌条款',
  agent: {
    tools: { allow: ['read', 'grep'], deny: ['shell'] },
    maxTurns: 4,                     // 现在会明确报 unsupported-option
  },
});
```

- 比 `ask` 重得多：起一个子 agent，有工具、有自己一轮上下文。**能用 ask 就别用 agent。**
- `tools.provide` 可以临时塞自己的函数（内部是一个桥接工具，调用结束即回收）。
- `budget: { ms }` 超时**真中止**并报 `budget-exceeded`；`budget.tokens` 目前报 `unsupported-option`。
- 还没实现的配置（`maxTurns` / `maxToolCalls` / `onTool` / `context` / `delivery` / `approval` /
  `session`）一律**明确报 `unsupported-option`**，不会装作生效。

## 6 错误码

`no-model` / `unsupported-input` / `unsupported-option` / `schema-mismatch` / `aborted` /
`timeout` / `provider` / `budget-exceeded`。

码表只增不删：**认不出的码按失败处理**，别当成功；新信息都在 `details` 里。

## 7 测试

别伪造 `ctx`：把 `deps.ai` 换成一个假实现即可（它就是个端口）。

```ts
const ai: AiPort = {
  version: 1,
  supports: () => true,
  registerAdapter: () => () => {},
  ask: async () => '好',
  askRich: async () => ({ text: '好' }),
  askJson: async () => ({ ok: true }),
  agent: async () => '好',
};
```

`aiContractTests(makePort)`（`@dsh-workbench/shared/host`）是这层的契约：任何实现都该过一遍。
