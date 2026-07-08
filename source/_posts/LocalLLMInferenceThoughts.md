---
title: 本地部署大模型有感
updated: 2026-07-08 12:57:34
date: 2026-07-07 16:54:46
description: "本文基于 H100 集群与 DGX Spark 部署 GLM、DeepSeek、Qwen 等大模型的实践，梳理 SGLang 与 vLLM 在 TP、EP、DPA、PD 分离及 KV Cache 调度中的性能与稳定性问题，并讨论 Claude Code 到 OpenAI 兼容端点的桥接成本；结论是，除非受数据隔离、合规或特殊预算约束，本地推理通常不具备优于云端模型服务的投入产出比。"
tags:
  - 流水账
---

这些日子一直在大战大模型. 实验室有一些 H100 但是在物理隔离的内网; 而外面, 我缠着我导采购了两台 DGX Spark. 前后折腾了有两三个月, 预期还得再折腾一两年. 但是无论如何, 折腾了这么久, 加上 Hacker News 上面也时不时有一些讨论, 还是想写点吐槽一下.

但是总之结论: 别干, 除非有什么不可告人的情况.

<!-- more -->

## vLLM 大战 SGLang

一开始的时候我们想部署 GLM 5, 我在智谱上工的牛马同学跟我说, 一定要用 SGLang 部署, 他们内部就是这么部署的. 于是我就上了贼船, 大战了两个多月的 SGLang.

现在的大模型都是 MoE 模型. 在部署的时候, 一张卡显然是放不下, 那么如何在多卡部署呢? 非常简单地说, 有三个参数控制:

- Tensor Parallelism: 把模型的一层切成好几份, 放在不同的卡上面, 一起推理. 这个最简单, 但是对卡间的带宽和时延要求比较高.
- Pipeline Parallelism: 把模型的不同层放在不同的卡上面, 数据依次通过这些卡. 这当然能部分解决带宽的问题, 但是既然是流水线, 那么调度就成为了大问题, 如果调度不好, 利用率就很低.
- Data Parallelism: 这个最简单, 把模型直接复制几份, 各自跑各自的. *但是我 16 张卡都放不下模型, 我咋复制*

然后, 对于多专家模型, 还有一个东西:

- Expert Parallelism: 把模型的不同专家放在不同的卡上面. 但是 MoE 模型每个 Token 都可能激活不同的专家, 在各个卡间传输 Token 也需要不少带宽.

对于推理, 还有一个叫 DP Attention 的东西, 他可以让 8 块卡上各自有自己的 KV Cache, 形似 8 个 DP; 而所有的 DP 共用模型的 MoE 部分, 这部分做 Expert Parallel.

以 GLM 5.2 为例, [SGLang](https://docs.sglang.io/cookbook/autoregressive/GLM/GLM-5.2) 和 [vLLM](https://recipes.vllm.ai/zai-org/GLM-5.2) 的推荐都是:

- 如果想要最快的响应, 应该用 TP, 同时开投机解码
- 平衡模式下, 用 DP Attention + Expert Parallel, 同时少开一点投机解码
- 最高吞吐的模式下, 用 DP Attention + Expert Parallel, 不开投机解码

### 高吞吐?

那么多高的吞吐才算是高吞吐呢? 虽然说有几张 H100, 能本地部署 GLM 5.2 已经算是很富裕了, 但是 SGLang 说的高吞吐和我当时理解的高吞吐似乎差距还是很大.

DPA 有一个特性, 一个 Worker 要么在 Prefill, 要么在 Decode; 而一个 DPA Group 里面的所有 Worker 必须处在同一个阶段. 也就是说, H100 需要 16 卡能跑起来 GLM 5.2, 如果使用 EP + DPA 的模式, 那么 16 卡 **要么都在 Prefill, 要么都在 Decode**.

问题来了, 我们在上面跑的负载主要是 Codex 一类的 Agentic 负载, 对于每一个请求 (假设只有这一个请求), Prefill 大概需要 10s, Decode 大概需要 20s. 如果我现在有 16 个 Agent 在跑, 会出现什么问题呢?

为了这篇博客我让 Codex 做了这么一个模拟 DPA 的展示, 应该能勉强说明问题.

我们给出一个 *简化的模型* 来解释发生了什么. 不妨假设, 一个 DPA Group 里面所有 DP 每 0.25s 做一次统一的 Prefill / Decode 决策 (实际上可能更长), 默认只要有请求需要 Prefill 就进入 Prefill 模式 (看上去 SGLang 在没有那么多请求的时候确实是这么做的), 否则才 Decode. 所有 Agent 从 T0 开始工作 (这比较符合 Claude Code 等 Agent Swarm, 主 Agent 一批工具调用生成一堆 Subagent 的场景), 每个 Agent 会跑 30-80 轮; 每轮新增 1k-10k input tokens, 生成 500-1500 output tokens (这里, 实际情况下有的能输出 30k tokens), 一轮结束后等待 0-3s 再开始下一轮. 每个 DP 有独立 KV Cache, 默认容量是 250k tokens; 路由策略可以选择 Pinned DP, Round-robin 或 Random. Pinned DP 表示 Agent 总是回到同一个 DP, Round-robin 表示请求按顺序轮流分给各个 DP, Random 表示每轮随机路由. Agent 完成或被 kill 后释放自己的 KV Cache; 只有容量压力下挤掉仍可能继续运行的 Agent 才算 eviction.

<link rel="stylesheet" href="dpa-simulation/dpa-simulation.css">
<div
  class="dpa-sim"
  data-gpus="16"
  data-agents="32"
  data-context="200000"
  data-kv="250000"
  data-prefill-rate="3000"
  data-decode-rate="50"
  data-routing="pinned"
  data-scheduler="prefill"
  data-seed="20260707"
></div>
<script defer src="dpa-simulation/dpa-simulation.js"></script>

在 16 GPU 的情况下, 会发现, 即使使用良好的 Pin DP 的路由策略, 且对于所有的 worker 总是选择等待 Prefill 或 Decode 的更多的那一边, GPU 的利用率也只有 50%. 如果换成默认的 Round-robin + Prefill 优先, GPU 的利用率甚至只有 10%. 所以即便这玩意是所谓 "高吞吐", 实际用起来... 还是非常慢. 而且, 32 个 Agent 按照模拟, 总共用时 314 分钟......

问题在什么地方呢? 看图会发现前面一段还是发绿, 表示 Decode 多; 而到了后面就发黄了, 大家都在 Waiting. 那么为什么后面都在 Waiting 呢? 因为出现了严重的 **缓存雪崩** 的问题. 当一个 DP 的 KV Cache 不足以容纳两个不同的 Agent 时, 这两个 Agent 会互相挤掉对方的 KV Cache, 造成频繁的 eviction, 而后缓存命中率直线下降, 每一次请求的 Prefill 时间明显变长, 而后所有的 DP 都等 Prefill.

这一部分程度上大概是 H100 80G 显存的问题 -- 显存比较小, 每个 DP 的 KV Cache 不够多. *假设* 是 8 张 160G 显存的卡, 那么效果其实会好很多... 吗?

<link rel="stylesheet" href="dpa-simulation/dpa-simulation.css">
<div
  class="dpa-sim"
  data-gpus="8"
  data-agents="32"
  data-context="200000"
  data-kv="600000"
  data-prefill-rate="10000"
  data-decode-rate="150"
  data-routing="pinned"
  data-scheduler="prefill"
  data-seed="20260707"
></div>
<script defer src="dpa-simulation/dpa-simulation.js"></script>

虽然也没那么好, 但是至少还是好一些的. (可以看到后面还是出现了缓存雪崩的问题)

所以 **到底高吞吐高在哪里呢?** 我觉得答案应该是 P-D 分离, 即, 将卡的总数扩大一倍, 比如变成 32 张卡, 其中 16 张卡专门做 Prefill, 16 张卡专门做 Decode, Prefill 完之后把 KV Cache 整个转移给 Decode 的卡. 这样固然听上去好, 但是... 我上哪去找另外 16 张卡呢? 而且我曾经用 SGLang 尝试过 DeepSeek V4 Flash 的 PD 分离部署, 结果... SGLang 有神秘的 Bug, 一段时间之后, SGLang 觉得 Decode 的 KV Cache 都满了 (即便 Decode 完全是空闲的, 没有任何在跑的请求), 整个阻塞了.

所以 SGLang 啊... 正如我的一些朋友吐槽, 他 "只有 Verified Recipe 能跑, 别的都是坏的". 但是偏偏到了 GLM 5.2 / DeepSeek V4 之后, H100 已经从可选的卡列表里面消失了, 只剩下 H200 / B200 / B300 这些.

### 低吞吐?

那我是什么时候放弃了 "高吞吐" 的呢? 是 GLM 5.2 的时候. 当时我破罐子破摔, 实在懒得折腾 EP 了, (其实是因为 GLM 5.2 更大一点, 有 EP 的情况下上下文连 200K 都开不出来, 实在是用不成), 就直接拿 16 TP 跑了. 跑起来之后, 我也打了点高并发, 发现, 虽然缓存雪崩的问题依然存在 (KV 就这么大, 我也没办法), 但是整体的速度反而变快了. 所以算了不管了, 能用就行得了 (

### 3 机?

今天突发奇想, 如果有 24 卡呢? 结果发现, GLM 5.2 的张量除三除不尽, 当场倒闭. 这下连找卡的事情都省去了.

### vLLM 如何呢

众所周知, SGLang 的性能一般比 vLLM 好... 所以既然现在 SGLang 能用, 我看还是不要动他...

其实我也简要折腾过一点, 但是确实是... SGLang 跑不起来的 vLLM 也经常出锅, 至于 SGLang 能跑起来的... 我要你 vLLM 何用 (

## 克劳德大战 OAI

好不容易把 SGLang / vLLM 部署上去了, 接下来赶到的是 DSB Claude Code. SGLang 提供的端点是 OpenAI compatible, 这也是大部分 Harness 的默认选择. 但是 A\ 就是要搞点事情, CC 只能用 Anthropic compatible 的端点. 于是一定要有一个能把 CC 请求转换成 OAI 的中间层. 问题来啦!

我们亲爱的 LiteLLM 的 A\ 转 OAI 感觉有锅, 如果开了 CC 的 Thinking Mode, 有概率出现什么第一个 Token 不是 Thinking Token 的神秘问题;

我们亲爱的 vLLM 的 A\ 转 OAI [也有锅](https://github.com/vllm-project/vllm/issues/44000), 因为 tnnd A\ 的请求格式居然半途更改, 往 "messages" 里面塞了一些 system prompt;

然后我们亲爱的 claude-code-router 当时也有锅, 当时他桥接 Token Counting 请求时候有问题, 导致 CC 总觉得自己使用了 0 Token 而不能触发 Auto Compact, 最后超出上下文倒闭.

最后我只好自己搓了一个 [claude-code-router-py](https://github.com/84634E1A607A/claude-code-router-py) 来桥接 A\ 和 OAI. 随着前面我尝试 EP, 我还给这个 router 添加了 Metrics, Logging, 多 Upstream, DP Pinning 支持, 以及 Consistent Hashing 部分内容来使得每个 Subagent 能稳定路由到同一个 DP. 当然, 随着现在我放弃了 EP, 这个 router 可以变得简单一些了 (但是懒得管了).

## DGX Spark

上个月我发现了 DGX Spark, 上网简要搜索, 发现似乎能部署 V4 Flash, 能完成基本的任务. 鉴于他可以放在外网, 可以免受光盘挪动数据的折腾, 我就把它发给了我导. 恰逢我导有些资金即将收回, 于是他赶紧采购了两台外加连接线.

到手后, 改了一下 BIOS, 更新了一下系统, 尝试启动 Debian 来备份磁盘, 卡死, 然后原本的系统也挂了.

按照官方文档刷入了最新的系统, 活了, 尝试在单机部署 Qwen3.6-35B-A3B 和 Qwen3.6-27B, 感觉还行.

然后找了一个 GitHub 仓库, 让 Codex 检查了没啥问题, 用它 (用 vLLM, 这玩意我就不指望 SGLang 能用了) 部署了 DeepSeek V4 Flash, 单 Request 40 token/s, 4 并发约 130 token/s, 速度感觉还行. 鉴于 V4 这个月要发正式版, 可以期待一下.

## 话说回来...

但是 DeepSeek V4 Flash 也不是一个非常强的模型 -- 我当然希望外面也有 GLM 5.2 能用. 但是比起 200 万的 H200, 我看这个 7 万的两个 DGX Spark 还是有些可取之处吧 (

可是 Flash 的 token 就跟不要钱一样, 要不是不让用, 谁能拒绝一天花不了 30 的 V4 Pro 和 Flash 呢...?

所以啊, 感觉还是, 除非不得不本地推理, 否则真没有本地推理的必要 ()
