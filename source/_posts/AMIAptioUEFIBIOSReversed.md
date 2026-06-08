---
title: AMI Aptio UEFI BIOS Reversed
updated: 2026-06-08 14:16:38
date: 2026-06-08 11:07:00
description: "本文围绕一份 AMI Aptio UEFI BIOS Debug Build 的逆向过程展开，概述其 32MB 固件中约 440 个 PE 模块的结构划分、与 Aptio Community Edition 及厂商私有模块的对应关系，并重点记录基于 IDA、MCP、Claude Code Subagent 与容器化 harness 构建自动化逆向平台的实践；结论是，当前 LLM Agent 已能胜任单个二进制分析，但在大规模、多模块、长上下文与外部工具异常场景下仍缺乏稳定的完成度评估、错误归因、子任务监控和外围服务理解能力。"
tags:
  - 技术
  - 逆向工程
---

前几天我在 {% post_link HR650XServer %} 里面提到, 我发现我的服务器的 BIOS 是个 Debug Build, 里面有一些嵌入的调试信息和 debug print. 由于最近逆向是我的老本行 (你别问为什么), 我就用我的神秘逆向工具平台把这个 BIOS 给统统逆了. 不过吧... 你要说有什么有趣的发现, 我还没那么多时间去看 (实在是太多了), 我也不好说到底逆向有多么成功, 但是 Anyway, 还是写一篇短文介绍一下.

<!-- more -->

## 固件总览

一个 32M 的 BIOS 里面有 440 个左右的 PE 文件, 每一个都是独立的可执行的模块. AMI 开源了部分的 [Aptio Community](https://github.com/opencomputeproject/OCP-OSF-Aptio_Community_Edition) 的代码, 里面包含了部分模块.

首先一个让我感到惊讶的是, Aptio BIOS 的编译环境是 Windows, Visual Studio. Community Edition 现在的构建指南里面用的是 VS2019 或者 VS2015, 而我这份用的是 VS2015.

为什么不是 Linux 呢? GPT 说这是 "自古以来", 也就是, 搞 UEFI 的几个厂商一直以来都是用 MSVC + EDK II, 所以他们的验证用的都是 MSVC, 能确保在 MSVC 上面能正确构建, 而懒得管 Linux 的构建. 同时, UEFI 规范里面的每一个二进制也是 PE 格式 (不是 ELF) (虽然交叉编译也不是什么难事).

我们把逆向出来的文件划分成了和 EDK 里面差不多的构型: 首先是多个 Pkg (package), 然后每个 Pkg 里面有多个子文件夹 (可以认为是子包), 然后叶子节点是模块, 可能是 PEI / DXE / SMM 等. 部分 Pkg 与 Community 版本的有一定的对应关系, 而部分没有 (看上去是 AMI Proprietary 和 Lenovo 自己开发的).

反编译后的源码在 [某神秘组织的 GitBucket 上面](https://gitbucket.skyw.top/ajax/AMI-Aptio-BIOS-Reversed). 东西非常的多, 我说实话不知道从哪里说起, 所以我就不说了 x

## 逆向工具

由于我使用了一些盗版软件, 我就不把我的整个平台发出来了. 大致的情况是, 一开始的时候, 我们需要去逆向一些该死的 MUSL 的二进制文件. 我自己实在是看不懂, 所以我只好求助于 LLM. 当时, 我找到了一个 IDA Pro 的插件 [ida-pro-mcp](https://plugins.hex-rays.com/mrexodia/ida-pro-mcp), 可以把 Claude Code (当时我还在用 GLM 4.7) 接进去让它分析. 当时的 Agent 能力还没有那么强, 在一个比较大的二进制里面, 他前后找两下就找不着北了.

后来, 随着大模型能力不断提升, 单次 session 能完成的任务有所升级, 但是还是不那么好用. 后来我们课题组薅到了一个 DeepSeek 的不限量的 API, Token 不要钱了, 我就认真构思了一下如何设计 Agent 平台 (现在叫 harness? 不知道我理解对了没有) 来实现自动化的逆向分析. 于是借助 Claude Code 里面的 Skill, Subagent, Hook 等功能, 我折腾出来了一个容器化的逆向分析平台.

大体上, 这个平台的初始化的时候, 告诉主 Agent 他是一个 Manager Agent, 要求他少自己干活, 多把活分出去给 Subagent 干; 然后, 告诉他逆向分析应该先干什么后干什么, 再给一堆 subagent, 把每一个步骤应该怎么做封装为一个 subagent 来干. 一开始我折腾这个平台的时候 Claude Code 还没有 `/goal` 功能, 于是采用了定时 `/loop` 提醒主 Agent 的方式让主 Agent 干活.

后来随着 Claude Code 的功能完善, 这个平台也不断调整, subagent 逐渐丰富, 然后 DeepSeek v4 Flash 发布之后这个平台感觉就得心应手, 能对单个二进制很好逆向.

但是这个 BIOS 里面有 440 个二进制文件... 就需要主 Agent 想办法以文件为单位自动打开 IDA, 自动分析然后自动保存. 现在 ida-pro-mcp 已经有打开新的二进制文件的功能, 但是感觉 LLM 不是很能理解这个流程, 出现了: 1. 主 Agent 打开了 8 个二进制文件, 打算分配给各个 subagent; 2. 各个 subagent 发现自己的 MCP 里面没有打开文件, 于是要么调用 MCP 又打开一遍, 要么开始使用神秘的 shell 脚本来打开 IDA, 然后就完全乱套了; 3. 中途不知道谁把 IDA crash 了, 然后 IDA 在 `/tmp/ida` 里面留下 core dump, 后面的 IDA 打开的时候会弹一个提示, 卡在 GUI 交互上面, 导致 agent 不知道发生了什么 (只知道 IDA 没有正确打开), 然后就更加乱套. 后来我干脆在 CLAUDE.md 里面加了一句, 不允许 subagent 调用 MCP, 只允许使用 `curl` 直接调用 MCP 的 REST API; 同时要求主 Agent 直接告诉 subagent MCP 的端口, 总算是缓解了这个问题.

然后, 我本来打算让 Agent 不得用机械化的方式把 IDA 里面的一大坨导出, 而必须生成一个好的 `.c` 文件; 但是 subagent 好像不是很听, 最后项目里面还是有大量的 `.c` 里面是一堆 json. Anyway 最终看上去是把大部分的二进制逆向了.

从中得出的结论是, 当前的 LLM 对大型项目的自动化看上去没那么好, 主要的问题是他们有点 "懒", 在多轮 compact 之后, 总会倾向于认为自己完成了目标, 不乐意继续干活. 或者说, 在更大型的 harness 工程上, 我们要先找到几个能评价完成度的指标, 或者比较有机械性的能让 agent 知道哪里还没完成的脚本, 才能 push agent 一直干活.

此外, 外部调用的异常也容易让 agent confuse, 导致错误归因或者错误决策. 如何才能让 agent 像人一样搞清楚究竟发生了什么, 可能还需要读屏幕等的能力 (但是问题又来了, 这样 context length 就更不够了).

总结, 现在的 Agent a. 需要知道 compact 的存在并想办法让他能自动让 compact 更高效; b. 主 agent 缺少实时监控子 agent 并修正错误的能力 (codex 可以做到, 但是流程大致是我手动 review subagent, 然后告诉主 agent 应该怎么做, 主 agent 再去修正 subagent 的行为); c. 需要更好的理解 MCP 等外围服务的能力. 但是这些能力是不是过于高级了? 或者需要更好的基座模型来支持? 或者需要 Claude Code 等平台来实现? 或者在平台上可以实现? 不确定.
