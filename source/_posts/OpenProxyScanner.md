---
title: 混沌邪恶 - 一种基于 Clash 开放代理端口的稳定免费代理服务
date: 2025-03-19 11:34:17
description: 本文介绍了一种基于 Clash 开放代理端口的稳定免费代理服务的实现过程，包括技术架构、Nmap 扫描配置、Clash 配置文件生成、Telegraf 数据采集等内容，并分享了相关技术难点与解决方案。
tags:
  - 网络
  - 网络安全
---

在 {% post_link ExploitingCFW "之前的文章" %} 里我们讨论了开放代理可能带来的问题. 由于 Docker Registry 被墙了, 我又不想自己贡献自己的梯子, 又想做一个可用的 Registry Mirror, 于是我决定利用一下之前发现的问题, 于是有了这篇文章. 这篇文章讨论了实现的技术难点与解决方案. 本方案已经稳定运行了 3 个月, 代码开源于 [我的 Github 仓库](https://github.com/84634E1A607A/open_proxy_scanner).

<!-- more -->

## 基本架构

我使用了 Docker Compose 来管理各个组件. 主要有三部分:

- **Scanner**, 用于扫描开放的端口并生成 Clash Config File.
- **Clash**, 用于提供负载均衡, 检查 Upstream 是否挂了 (毕竟是拼好梯, Upstream 关闭了 / 挂了 / 无法正常使用也是常事), 根据需要访问的网站对 Upstream 进行测速并优选等服务.
- **Telegraf**, 用于汇报上行质量.

作为一个练手项目, 我拿 shell script 写了这个玩意 (纯纯折磨自己...)

## Nmap

一开始用 Nmap 确认某个端口是不是 Socks5 代理的时候, 发现 Nmap 的 `socks-open-proxy` 脚本并不会扫 7890 端口. 因此需要 Patch 一下这个 nse, 把想要扫描的端口加进去.

```Dockerfile
RUN sed -i 's/{8000, 8080}/{8000, 8080, 7890}/g' /usr/share/nmap/scripts/http-open-proxy.nse && \
    sed -i 's/{1080, 9050}/{1080, 9050, 7890}/g' /usr/share/nmap/scripts/socks-open-proxy.nse
```

## Clash

之后扫描得到结果之后, 需要构造一个 Clash 配置文件 (参考 [文档](https://en.clash.wiki/configuration/introduction.html) ), 然后用 RESTful API 通知 Clash (参考 [文档](https://en.clash.wiki/runtime/external-controller.html) ). Script 写好之后就可以不管了.

需要注意的是, Clash 会在 stdout 里面打印一坨日志 (可能是我 Log-Level silent 的姿势不对?). 你需要让 Docker 不要储存这些日志, 或者正确 Rotate 这些日志. 否则你可能会在某一天发现 100GB 的 json 日志把 / 分区干爆了... (别问我怎么知道的)

## Telegraf

我用 Telegraf 采集了 Clash 的 Proxy Latency 信息. 这个返回的是 JSON, 用 Telegraf 把这个 JSON Parse 成 InfluxData 格式还是费了我一点劲.

大概的情况如此, 在 scan.sh 里面我还设置了隔一段时间扫一次, 如果上次扫出来的活跃代理还够用那就不扫, 否则扫描; 但是最多 X 次一定会扫一次; 啥啥的. 可以自行取用 (雾).
