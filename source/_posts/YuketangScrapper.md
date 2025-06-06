---
updated: 2025-03-23 00:48:09
title: 网课课件是好东西 - 雨课堂爬虫
date: 2025-01-10 18:18:04
description: 本文记录了开发雨课堂爬虫的全过程，包括从扫码登录到课程列表爬取、PPT 和回放解析与下载、ffmpeg 硬编码加速、多线程与多进程支持等技术实现，详细探讨了爬虫逻辑、错误处理、并行化设计及跨平台优化，并分享了应对不同课程类型和接口问题的解决方案。
tags:
  - 技术
---

两三年前的一场疫情确乎改变了许多. 网课便是十分重要的一部分. 在我高一的时候, 我就和 [Nico](https://www.lozumi.com) 一起折腾过 [高中的网课回放](https://www.lozumi.com/archives/338/). 到了大学之后发现大学的课疑似更多了, 好多课没时间上, 有些课感觉可以上但没必要专门为了它选. 于是就有了一个大胆的计划.

<!-- more -->



与高中的时候每节课之后抓包相比, 这次的爬虫就要显著地城市化了. 具体来说, 我们实现了从扫码登录, 爬取课程列表, 提示用户选择要爬取的课程, 解析课程 PPT 和回放, 爬取回放, 压制回放, 下载并合并 PPT 等全套的流程, 同时引入了基础的错误处理支持, 多线程下载的支持, Windows 和 Linux 原生加速的支持, ffmpeg 硬编码加速的可选支持, 多进程的实验性支持等等.

这个仓库也还有不少不足的地方, 主要是我没啥时间写代码, 很多东西是不会编程只会写 prompt 的 [行健同学](https://github.com/physicsdolphin) 写的. 我实在是看不上, 但是终于考完试的我疑似也懒得改了, 于是就这样吧, 反正也不是不能用.



## 框架总览

雨课堂的数据接口给我的 *第一感觉* 是十分规整的. 爬虫的逻辑也是十分清晰的. 进去之后, 有两个接口

```text
https://{YKT_HOST}/v2/api/web/courses/list?identity=2
https://{YKT_HOST}/v2/api/web/classroom_archive
```

可以分别获取未归档和已归档的课程基础信息. 拼接起来之后, 对于每一节 *课* ( *Course* ), 可以通过课程接口获取里面的 *活动 (Activity)*.

```text
https://{YKT_HOST}/v2/api/web/logs/learn/{course['classroom_id']}?actype=-1&page=0&offset=500&sort=-1
```

但是你猜这个接口为什么既有 `page` 字段又有 `offset` 字段? 因为 `offset` 字段的实际含义是 **PageSize**...

这时我隐约感到不妙.

接下来, 对于每一个活动, 会有一个 Type 字段标明类型. 如 `14` 代表教学活动 (Lesson), `6` 代表公告, 等.

爬虫的逻辑也还算简单, 对于每一种活动类型, 进去把获取 PPT 的地方和获取回放的接口找出来, 来个请求, 就可以爬取了.



## 提高效率

这时候就要考虑两件事了. 第一是爬虫是一个在几乎每一行都可能抛异常的代码 (谁知道服务器会不会抽风返回不正确的东西), 这样一来就不得不大 try except; 但是爬虫又是一个需要能被正确中断的代码, 在调用下载器等事情的时候要能正确中断, 清除副作用, 是个问题. 同时, 单线程对于下载和压制来说都对资源的利用效率极其低下. 我们不得不在各个层面上并行化, 以缩短爬取的时间.

第一个能想到的就是 **以课程 / 活动为粒度并行化**. 即, 利用线程池的技术把每一个课程 / 活动作为一个线程. 这件事有好处也有副作用. 好处是确实提高了吞吐量, 坏处是多线程使得线程间调度成为了必须考虑的问题. 我能写得明白, 但是 Prompt Engineer 就拿他没辙了. 因为 ChatGPT 确实写不明白线程调度和同步... 另外, 这样做感觉 **不够优雅**, 而且资源利用率有时候也不高, 因为下载和下载总是堆在一起, 而这时候 GPU 就没活干了.

当然, 我觉得更优雅的方式是类似 **流水线**. 即, 我们把爬虫分成若干个阶段, 每个阶段安排若干个 Worker, 阶段间用管道通信 ~~(造机造的)~~.

```text
分析器 ---下载任务--- 下载器 ---压制任务--- 压制器
      ---PPT任务--- PPT下载器+合成器
```

**但是**: 这样的线程间协调通信压力就更大了... 尤其是当一个 `Ctrl+C` 按下去, 有大量的逻辑需要完成.

不过以上都是美好的设想. 由于 ChatGPT 写这玩意没有一点章法, 整个代码的质量堪称大粪, 我都懒得改. 所以现在的并行化方法实际上是多开几个实例, 让每一个的下载内容没有重叠.



## 粪

我最开始是按照我自己的雨课堂写的爬虫. 但是我 22 年才入学, 当时的雨课堂已经是 v2 了, 而里面的课程 API 已经是 v3 了. 我们在爬其它人的课程的时候, 遇到了大量的问题, 比如 `Type 15` (慕课), `Type 3` (v1 API), `Type 2` (课件), 等等. 我也用了各种神奇的技术来解决这些问题.

### v1 API

这个和 v3 API 本身没啥区别, 但是 v1 的课的回放常常是 m3u8 文件. 这就需要一个高性能的 m3u 下载器. 于是某人直接在仓库里面贴了个 exe 文件... (我不理解, 但我大受震撼.) 而 Linux 这边我似乎没找到什么好方法,  干脆就让 ffmpeg 自己取得了.

### 慕课

慕课也没什么特殊的, 唯一的问题是它的视频有多个清晰度. 需要解析出最高清晰度再下载. 慕课的每个清晰度的视频是个 *列表*, 但是里面感觉永远只有一项. 不知道是谁的问题. 万一哪一个多项了, 爬虫又得爆炸.

### 课件

这个是最灵车的一类. 雨课堂的课件并不是图片的叠加, 而是... 类似 HTML 一样, 每页有若干个元素, 每个元素又有若干个属性, 里面可能还混杂着视频... 因此, 找出里面的视频还算是相对简单, 而下载 PPT 就阴间至极.

不过也有应对之法. 雨课堂的网页上有个打印 PPT 的页面. 用一下 selenium 把课件传进去, 直接调用浏览器的下载 API 看上去是可行的. 有些小 Tricky, 但是确实能用.



## 总结

这个爬虫说难不难, 但是确实有些作用. 好像没什么需要总结的.
