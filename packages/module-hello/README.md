# @dsh-workbench/module-hello

工作台里最小的可安装模块：装上面板多一张「示例模块」卡片，卸掉就没了。

## 你会看到什么

右栏多一张「示例模块」卡片，标题下面两行说明文字。卡头有刷新钮，但这个模块没有数据源，按了只会重画。

## 装

在市场「已安装」里找到「示例模块」直接装；也可以在终端装进工作台的 profile：

```bash
dsh plugin --profile workbench add @dsh-workbench/module-hello
```

装完在当前项目的面板里勾选它，卡片才会出现。

## agent 能做什么

这个模块没有给 agent 开放工具，也没有写入通道；它只演示一张卡片怎么接进外壳。

## 数据从哪来

没有数据源：卡片上的字是模块自带的文案，不读接口、不需要登录。

## 卸

在市场里卸，或：

```bash
dsh plugin --profile workbench remove @dsh-workbench/module-hello
```

卸掉后卡片消失，不影响其他模块。

## 出问题先看

卡片没出现时，先确认当前项目的面板里勾选了「示例模块」；还是没有就重新装一次。
