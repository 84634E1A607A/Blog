---
title: QUICAP - A L2 mesh VPN built on QUIC (planed)
updated: 2025-08-11 14:29:53
date: 2025-08-08 11:43:08
description: QUICAP 是一种基于 QUIC 协议构建的 Mesh VPN 方案，采用 PKI 系统进行节点鉴权，支持二层 / 三层隧道及应用层代理模式，并能自动优化路由以应对网络拓扑变更。本文分析了现有 VPN 方案的局限性，介绍了 QUICAP 的实现机制，包括 mTLS 认证、TUN/TAP 接口和双连接模式等核心技术。
tags:
  - 技术
  - 网络
---

我们用到过很多种 VPN (和混淆) 的手段. WireGuard, Tinc, OpenVPN, SSLVPN, VMess, VLESS, Xray... 它们各自有各自的优势, 但又或多或少都有一些问题. 为了一些独特 (感觉并不独特) 的需求和一些人炫技的小心思 (反正不是我就对了), 我们提出了 QUICAP - 一个基于 QUIC 隧道的, 采用 PKI 系统鉴权的, 可以方便地进行修改和混淆的, 可以同时启用或选用二层隧道 / 三层隧道或应用层代理的, 能够自动优化路由以应对拓扑变更的网状 VPN 方案.

We have utilized a variety of VPN and obfuscation solutions, including WireGuard, Tinc, OpenVPN, SSLVPN, VMess, VLESS, and Xray. Each offers distinct advantages but also presents certain limitations. To address specific requirements and enhance flexibility, we introduce QUICAP—a mesh VPN solution built on QUIC tunneling, featuring PKI-based authentication. QUICAP is designed for easy modification and obfuscation, supports both Layer 2 and Layer 3 tunneling as well as application-layer proxying, and can automatically optimize routing in response to network topology changes.



<!-- more -->

## Other VPN solutions and their issues

### WireGuard

WireGuard is a modern VPN solution integrated into the Linux kernel, recognized for its simplicity and high performance. However, WireGuard packets are easily identified by their unique header (UDP leading bytes 0x01 0x00 0x00 0x00 during the initial handshake), making them susceptible to traffic analysis and blocking. There are numerous reports of ISPs blocking WireGuard traffic, resulting in unreliable connectivity—even when endpoints are simply routers at THU and at home.

WireGuard also lacks flexibility in network topology. For example, if you have two routers available as gateways, WireGuard only allows you to route 0.0.0.0/0 traffic through one at a time via configuration, limiting routing options. Using both routers requires running two separate WireGuard instances, which is inefficient and cumbersome.

### Tinc

While WireGuard is rigid in routing, Tinc offers a flexible Layer 2 VPN solution. Once the Layer 2 tunnel is established, it behaves like a physical network interface, enabling advanced policy routing. However, Tinc introduces significant encryption overhead and relies on a peer-to-peer authentication model. Nodes can only connect if each other's public keys are present in their respective configuration files. Adding a new node requires distributing its public key to all existing nodes, which is error-prone and inconvenient.

### OpenVPN

OpenVPN is a widely adopted VPN solution supporting both Layer 2 and Layer 3 tunneling. Nevertheless, it is easily identified by its TLS handshake. The introduction of Data Channel Offload (DCO) has improved its performance, but as a mature VPN protocol, OpenVPN remains susceptible to detection and blocking.

### VMess / VLESS / Xray

To mitigate blocking, various obfuscation techniques have been developed. However, these solutions do not provide true Layer 3 tunneling (their TUN mode typically supports TCP, some support UDP, but other protocols are not handled). They function as application-layer proxies, requiring application-specific proxy settings.

Additionally, these protocols are primarily designed to circumvent censorship, not for network flexibility. Most employ a client-server architecture.

## QUIC protocol and its advantages

According to RFC 9000, QUIC is a modern transport protocol designed for secure, low-latency communication over the internet. Operating over UDP, QUIC integrates features such as multiplexed connections, seamless connection migration, and robust encryption.

As a tunneling protocol, QUIC offers several distinct benefits:

### PKI Support

QUIC natively supports Public Key Infrastructure (PKI) for authentication, enabling secure and scalable identity management. Administrators can deploy a self-signed certificate authority (CA) to issue certificates for each node, simplifying secure communication and node lifecycle management. Integration with public CAs is also possible, allowing QUICAP to leverage existing PKI frameworks.

### Integrated Encryption

All data transmitted via QUIC is encrypted by default, ensuring confidentiality and integrity without the need for additional encryption layers. This reduces overhead and enhances performance.

### Multiplexing

QUIC allows multiple independent streams within a single connection, which is ideal for our use case. Data frames can carry Layer 2 or Layer 3 traffic, while dedicated streams can handle control messages. Application-layer proxies can also be implemented over QUIC streams, providing flexible and efficient communication.

### Connection Migration

QUIC supports connection migration, allowing sessions to persist even when a node's IP address changes (e.g., due to network transitions). This ensures continuous connectivity and resilience in dynamic network environments.

### Datagram Support

Although QUIC is primarily stream-oriented, it also supports datagrams. This capability enables the transmission of raw packets (such as ARP requests) without establishing a stream, and without flow control or retransmission. This is particularly advantageous for tunneling scenarios, as it avoids issues related to double congestion control.

### HTTP/3 Obfuscation

QUIC serves as the transport layer for HTTP/3, making it challenging for traffic analysis tools to distinguish between VPN tunneling and standard web traffic. By leveraging Server Name Indication (SNI), QUICAP can further emulate legitimate web traffic, significantly enhancing obfuscation and resistance to detection.

## QUICAP Name

The name QUICAP encompasses several concepts: QUIC-encapsulation, referring to the encapsulation of Layer 2 or Layer 3 traffic within QUIC; QUIC-TAP, denoting the use of TAP interfaces for Layer 2 tunneling; and QUIC UP, highlighting QUIC as a universal protocol for tunneling. This name reflects QUICAP’s core principles of encapsulation, flexibility, and performance.

The code repo of QUICAP is at: [Github](https://github.com/84634E1A607A/quicap)

(Note: The following specifications describe intended features and planned implementations. Actual development is ongoing, and these details represent our goals rather than completed work.)
(P.S. As a side project, chances are that QUICAP will stop being maintained actively if we lose interest.)

---

## QUICAP 点对点

首先, 我们考虑一个点对点的 QUICAP 方案. 我们先不管多节点间如何路由.

作为一个点对点的隧道, 我们需要解决的主要问题是认证和传输.

### mTLS 认证

QUICAP 使用 PKI 系统进行认证. 一个 QUICAP 网络由一个受信任的 CA 证书 (可以是自签名的, 也可以是在 PKI 系统中由受信任的 CA 颁发的) 作为根证书, 其为每个节点颁发一个节点证书. 在分发时, 每个节点生成自己的 CSR, 并将其发送给 CA 进行签名. 签名完成即代表获得入网权限.

每个节点都配置仅信任 CA 证书. 当建立连接时, QUICAP 会验证对方的证书是否由受信任的 CA 签发, 并检查证书的有效性 (包括过期时间和撤销状态). 只有通过验证的节点才能建立连接.

如果有混淆的需求, QUICAP 可以在连接未提供客户端证书时伪装成 HTTP/3 流量.

```mermaid
graph TD
    CA[CA] -->|签发证书| Node1[节点1]
    CA -->|签发证书| Node2[节点2]

    subgraph NODES[节点网络]
        Node1
        Node2
        Node1 <-->|验证证书| Node2
    end
```

### TUN/TAP 接口

QUICAP 使用 TUN/TAP 接口接入 Linux 网络栈. 其中, 通过 TUN 接口, QUICAP 可以处理三层隧道的数据包, 而通过 TAP 接口, QUICAP 可以处理二层隧道的数据报.

### 双连接模式

为了简便起见, QUICAP 的两个节点之间会建立两个 QUIC 连接, 每个节点各自以自己为客户端向对方发起 QUIC 连接. 如果有一方的 IP 地址未知 (如在 NAT 后), 则建立一个 QUIC 连接.

```mermaid
graph TD
    subgraph N1[节点1, IP 2001:db8::1]
      N1S["服务端
      UDP 8000"]
      N1C["客户端
      动态高端口"]
    end

    subgraph N2[节点2, IP 2001:db8:1::1]
      N2S["服务端
      UDP 8080"]
      N2C["客户端
      动态高端口"]
    end

    N1C -->|建立连接| N2S
    N2C -->|建立连接| N1S
```

若两个连接均建立, 则 QUICAP 偏好使用客户端连接进行数据传输; 否则若只有一个连接建立, 则使用该连接进行数据传输.

### No-Carrier 状态

若一个节点上的 QUIC 连接全部断开, 则该节点对应的 TUN/TAP 接口进入 No-Carrier 状态, 以防 Linux 网络栈继续发送数据包到该接口. 此功能可选开启.

### 数据包路由

在点对点模式下, 我们不需要处理多节点间的路由问题. QUICAP 只需将接收到的数据包直接发送到对端节点的 QUIC 连接上即可. 在整个过程中的数据包流向如下:

```mermaid
graph TD
N1NS[节点 1 的网络栈] -->|发送数据包| N1TUN[TUN/TAP 接口]
subgraph QUICAP1[节点 1 QUICAP]
    N1TUN -->|封装| N1C[QUIC 客户端]
end

N1C -->|QUIC 数据包| N2S[QUIC 服务端]

subgraph QUICAP2[节点 2 QUICAP]
    N2S -->|解封装| N2TUN[TUN/TAP 接口]
end

N2TUN -->|发送数据包| N2NS[节点 2 的网络栈]
```

### MTU 问题

我们考虑这个隧道的 MTU 问题. QUICAP 的 MTU 由物理链路 MTU, QUIC 头部共同决定.

我们的物理链路 MTU 一般是 1500, 但也有 1492 的 PPPoE 等情况存在. QUICAP 需要具有 MTU 发现的功能, 以便在建立连接后确认 TUN/TAP 接口的 MTU. QUIC 的短头部由 5 字节的必选头部和最长 20 字节的连接 ID 构成, 之后有不超过 5 字节的帧头部. 此外, QUIC 连接建立在 IPv4 UDP (28 字节) 或 IPv6 UDP (48 字节) 上, 需要减去这些头部的长度. 因此, QUICAP 的 MTU 可能只有 1420 字节左右.

为了减小开销, 我们可以采取以下策略:

- 在连接建立之后尽快协商更短的连接 ID (如 2 字节), 以减小 QUIC 头部的长度;
- 在 QUIC 连接建立后, 主动探测实际的链路 MTU, 并动态修改 TUN/TAP 接口的 MTU;

如果 MTU 设置不正确, 则可能导致 QUIC 数据包被分片, 显著降低性能. 可选的, 我们可以在 QUICAP 中检测报文大小, 对可能导致 QUIC 分片的报文按照其 DF 位返回 ICMP 错误, 以便上层应用能够调整报文大小.

### Happy-Eyeballs

QUICAP 计划支持 Happy-Eyeballs, 但是不仅仅是 v6 优先的简单策略. 我们希望 QUICAP 同时尝试建立两个连接, 并根据 QUIC 估计的 RTT 来选择更高速的连接进行数据传输.

可能会有人问, 为什么不 v6 优先呢? 因为...

```sh
ajax@l ~> ping h.aajax.top -6 -c 3
PING h.aajax.top (240e:368:81a:9556:13ff:4af1:fdae:1ff3) 56 data bytes
64 bytes from 240e:368:81a:9556:13ff:4af1:fdae:1ff3: icmp_seq=1 ttl=41 time=174 ms
64 bytes from 240e:368:81a:9556:13ff:4af1:fdae:1ff3: icmp_seq=2 ttl=41 time=173 ms
64 bytes from 240e:368:81a:9556:13ff:4af1:fdae:1ff3: icmp_seq=3 ttl=41 time=173 ms

--- h.aajax.top ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 173.259/173.440/173.789/0.246 ms

PING h.aajax.top (219.140.112.49) 56(84) bytes of data.
64 bytes from 219.140.112.49: icmp_seq=1 ttl=50 time=24.9 ms
64 bytes from 219.140.112.49: icmp_seq=2 ttl=50 time=24.4 ms
64 bytes from 219.140.112.49: icmp_seq=3 ttl=50 time=24.3 ms

--- h.aajax.top ping statistics ---
3 packets transmitted, 3 received, 0% packet loss, time 2003ms
rtt min/avg/max/mdev = 24.269/24.528/24.926/0.285 ms
```
别问我为什么从学校到我家的 IPv6 的延迟搞得好像跨过了太平洋一样.

## QUICAP 交换机

由于 QUICAP 期望允许自由的节点加入与离开网络, 我们需要动态维护网络的拓扑. 这个 "动态" 类似于 Ad-Hoc 网络. 我们计划采用类似 Ad-Hoc 网络的方式进行数据报交换:

考虑一个广播包, 我们将其编号并发送到所有的邻居结点. 每个节点收到广播包后, 检查包的编号是否已处理过: 如果未处理过, 则将其转发到所有邻居节点, 并记录该包的源 MAC 地址与入口; 如果已处理过, 则忽略该包. 类似交换机的 MAC 地址表. 这样一来, 广播包可以在网络中传播, 使得每个节点收到的第一个包都通过延迟最小的路径到达, 此时路径最优. 当一个单播包到达一个节点时, 该节点会检查包的目的 MAC 地址是否在其 MAC 地址表中: 如果在, 则将包转发到对应的出口; 如果不在, 则直接丢弃. 同时, 单播包的源 MAC 地址会被记录到 MAC 地址表中, 以便后续包能够正确转发.

考虑以下拓扑结构:
```mermaid
graph LR
    N1[节点 1]
    N2[节点 2]
    N3[节点 3]
    N4[节点 4]
    N5[节点 5]

    N1 <-->|10ms| N2
    N2 <-->|15ms| N3
    N1 <-->|20ms| N3
    N2 <-->|12ms| N4
    N3 <-->|8ms| N4
    N3 <-->|18ms| N5
    N4 <-->|10ms| N5
```

从节点 1 发送一个广播包, 则:

```mermaid
graph LR
    N1[节点 1]
    N2[节点 2]
    N3[节点 3]
    N4[节点 4]
    N5[节点 5]

    N1 --o|10ms| N2
    N2 x--x|15ms| N3
    N1 --o|20ms| N3
    N2 --o|12ms| N4
    N3 x--x|8ms| N4
    N3 x--x|18ms| N5
    N4 --o|10ms| N5
```

这种模式的优势在于实现较为简便. 对于可能存在的节点间连接中断的问题, QUICAP 可以在发生连接中断时清理 MAC 地址表中的对应条目. 但是这似乎并不完全可靠, 此时可能有候选的线路可以使用. 当然, 可以在泛洪时记录多个可选的路径, 以便在中断时尝试; 但这可能带来更大的开销和可能的环路问题. 另外, 在这种模式下, 广播包会在网络中大量复制 (会发送约网络边数 * 2 次), 可能导致拥塞.

总之, 没想好 ()

QUICAP 同时有控制信道, 在发生连接中断时, 可以通过控制信道通知其他节点, 及时清理 MAC 地址表中的对应条目. 这样可以避免因连接中断导致的交换错误; 但是如果链路不稳定, 则将导致 MAC 地址表频繁更新, 可能导致路由不稳定.

---

## 一些后续

一开始, 我们这个项目的目标之一是实现一个能绕过审查的隧道 (甚至可以说这是主要目标, 因为否则, WireGuard 也不是不能用). 在完成 P2P 隧道的基础功能联通之后, 我尝试了在学校和一个新加坡的机器上测试, 但是结果十分不尽人意. QUIC 隧道在 Handshakee 建立之后 1s 内即被阻断, 基本上说, 只有 0RTT 的那两个包能过来.

我们一开始的 QUIC 连接是没有 SNI 的. 考虑到添加 SNI 可能有用, 我们做了尝试, 但是在 ~3min 之后又被阻断了. 考虑到 [Exposing and Circumventing SNI-based QUIC Censorship of the Great Firewall of China](https://gfw.report/publications/usenixsecurity25/en/) 里面提出, 在 Src Port < Dst Port 的情况下不会阻断, 而现在的事实是已经修复. 同时, 不在黑名单中的 SNI 现在也会被阻断 (这应该是主动探测导致的).

由于以上原因外加我们不打算把与 DPI 斗智斗勇作为主要目标, 我们打算把 QUICAP 先扔一边去, 等到以后再说吧 ().

有点虎头蛇尾, 但是, Side Project 是这样 (
