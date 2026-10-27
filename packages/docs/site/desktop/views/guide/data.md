# 数据与设置

一句话：**会话、项目、附件三种装法共用一份；设置与插件各一份。**

| 装法 | 会话 / 项目 / 附件 | 设置 | 登录凭据 |
| --- | --- | --- | --- |
| 独立实例 | 跟 web 同一份（`~/.dsh`） | 自己一份（`:3081` 的 Settings） | 与 web 共用 |
| 装进 `dsh web` | 沿用当前 | 用 `dsh web` 的设置 | 同一份 |
| Desktop | 沿用 Desktop 的 | 用 Desktop 的设置 | 同一份 |

## 设置在哪

- 独立实例：`:3081` 的 **Settings**。想少配一遍，可以从 `dsh web` 同步已经配好的行。
- 装进 `dsh web` / Desktop：就在各自原来的设置里，工作台不多一个入口。

## 端口与实例

```bash
WORKBENCH_PORT=3091 npx @dsh-workbench/core
npx @dsh-workbench/core --profile wb2
```

`--profile` 决定用哪套**设置与运行时**（opencli、工坊、模块市场各一份）。会话和项目是共用的，
所以两个实例可以同时跑；只是别在两边同时打开同一个会话 —— dsh 会给它上跨进程写锁，另一边打不开。
项目列表是整份文件写：两边同时改项目时，以最后写的那份为准；重要改动后重启另一边再操作。

## 备份与清理

- 会话、项目、附件：在 `~/.dsh/{sessions,storages,attachments}`，跟 `dsh web` 共用。想带走就拷这三个目录。
- 工作台运行时（opencli、工坊、模块市场、自更新日志）：`~/.dsh/workbench`；别的 profile 是 `~/.dsh/<名字>`。
- 回到原样：移除插件 / 停掉实例，再删 `~/.dsh/profiles/workbench` 与 `~/.dsh/workbench`。它不会碰你的项目文件，也不会删共用的会话与项目。

:::tip 从旧版升上来的实例
旧版本把会话 / 项目 / 附件也按 profile 分过家。新版**不会**自动并；先退出所有 dsh，再跑：

```bash
dsh-workbench migrate          # 切共用根 + 并旧会话/项目/附件
dsh-workbench migrate --force  # 已经迁过一次、想再补并一次
```

只会补缺、不覆盖；旧目录保留。启动时如果看到 `dsh-workbench migrate` 提示，就是还有旧数据没迁。
更新后也可以直接在模块市场的「工作台」那一行点「迁移旧数据」，和命令行是同一条逻辑。
这条提示是非硬性的：点「不再提醒」只会收起提示，不会删旧数据；旧项目仍在旧目录，以后仍可跑 `dsh-workbench migrate`。
:::

:::tip 登录凭据是共用的
共用的是「你已经登录过这个平台」这件事，不是会话内容；会话现在也是同一份。
:::

## 换机器

装一遍、登录一次；会话和项目跟着 `~/.dsh/{sessions,storages,attachments}` 走。
模块是装出来的，重装一次比拷目录干净。
