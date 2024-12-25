---
title: Setting up Software Router for my Dorm
date: 2024-02-28 10:22:04
tags: 网络, 技术
---

近期手痒痒还是想让寝室里的网能有宽带 500M 的下载速度的同时不需要用 SSLVPN 连接校园网. 因此我买了一个 6 网口的软路由 (问就是不想用单臂路由) 并尝试进行了配置.

<!-- more -->

## 需求分析

首先我们来看我自己的需求 (愿景):

### 网络现状

校园网有 **公网 IPv4**, 可以用于开放端口, DDNS, 但是由于寝室的网太垃圾了 (百兆墙线), 也不够稳定, 所以尽量少用; 且校园网 IPv6 只有 DHCPv6 的一个地址.

宽带网有 **/64 的公网 IPv6 后缀** 可以分发, 但是 v4 只有私网地址且访问校园网要 VPN. 同时宽带有 500M 的稳定网速.

### 路由计划

对所有的 Client:

- 分配宽带获取的 IPv6 公网地址
- 对大多数流量从宽带走
- 对校园网流量从校园网走, 免得 VPN
- 接入科协的 Tinc / 家里的 IPsec, 对这些流量路由过去
- 添加 UPnP 服务以实现种子等服务可以从校园网地址 (v4 公网) 访问; 对应的出流量要走校园网

### 脚本运行

要能在上面跑点爬虫啥的

---

## 系统架构

为了以上的需求, 我设计了几个可能的系统架构:

- OpenWRT + Docker, OpenWRT 作为物理系统, Docker 上面可以运行脚本. 优点: 配置比较直观; 缺点: 不好本地管理且 OpenWRT 的 Linux 版本实在有点低, 功能也不全.
- ESXi + OpenWRT + Debian, ESXi 作为虚拟化的系统. 优点: 虚拟化之后可以灵活分配资源; 缺点: 虚拟化的性能损失, 对接口的控制较弱
- Debian 软路由. 优点: 高度可定制; 缺点: 很难配置
- Debian + VBox OpenWRT. 优点: GUI, 方便配置; 缺点: 看上去还好

所以后来我选择了最后一种方案. 先装了 KDE 的 Debian, 然后装 VirtualBox 和 OpenWRT 虚拟机. 然后我就遇到了乱七八糟的问题. 放在后面.

---

## 初次尝试

为啥叫 *初次* 尝试呢? 显然是因为失败了. 首先安装了 Debian KDE, 然后在上面装了 VirtualBox, 在虚拟机里面装了 OpenWRT. 一切都那么的丝滑, 直到开始配置 OpenWRT.

我的软路由有 6 个网口, 我采用了 eth0 接宽带, eth1 接校园网, eth2 接路由器 (AP 模式), eth3 接我的台式机, eth4/5 空着当 LAN 口的方式. (其实也可以把台式机的有线网接在路由器上面, 这样就不用配置网桥了, 但是这样不 elegant). 这就要求 eth2~5 四个网口要在机器里面形成一个 **网桥**.

我们检查 [VirtualBox 的 Bridged Networking 文档](https://www.virtualbox.org/manual/ch06.html#network_bridged), 里面提到

> With bridged networking, Oracle VM VirtualBox uses a device driver on your *host* system that filters data from your physical network adapter.
>
> This enables Oracle VM VirtualBox to intercept data from the physical network and inject data into it, effectively creating a new network interface in software.

也就是说这个 "网桥" 是通过驱动的方式 "桥接" 的, 并非一个真正的与操作系统的网桥等效的桥. 因此如果桥接到的那个网口 (或者网桥) 上没有介质连接 (NO-CARRIER), 那么操作系统就不会尝试向它发包, 于是乎只有后面接了一些东西, 本机才能使用虚拟机提供的网络.

那么如果我们将这个 "桥" 桥接到一个网桥上呢? 我们考虑 [网桥的介质情况](https://superuser.com/a/1725894/1870153), 当网桥的任何一个接口都没有接东西的时候, 网桥是 NO-CARRIER 状态, 也就是说 LAN 口至少要有一个接入的设备, 我的 Debian 才能通过 OpenWRT 上网. 这肯定是达不到我的预期的.

但是 VirtualBox 的文档里还提到:

> Even though TAP interfaces are no longer necessary on Linux for bridged networking, you *can* still use TAP interfaces for certain advanced setups, since you can connect a VM to any host interface.

也就是说我们可以新建一个 TAP 设备并让 VirtualBox 通过标准的方式 *桥接* 到这个设备, 此时 TAP 设备的状态是有链接的 (UP), 那么整个网桥也就 UP 了. 后来通过这样的方式我成功让宿主机上了网.

有人就要问了, 那为啥后来还是放弃了呢? 因为宿主机好不容易上了网, 我那笔记本接了条网线上去, 发现获取不到 IP, 这边有发包, 那边用 WireShark 抓包收不到包 (就是这么诡异). 我开了单播包转发和广播包转发也没用, 莫名其妙; 并且一开始的时候我做虚拟化 (方案 2) 是为了防止我把宿主机玩坏了彻底断网, 这个方案似乎没法防止这一点, 倒是用 VirtualBox 跑的问题更多了. 所以我干脆放弃, 用方案 3 了.

---

## 网络配置

### IPv4

装好没有桌面环境的纯净 Debian 之后, 接下来要确定 PPPoE 和校园网用什么工具管理. 在之前我给 {% post_link StudentFestivalNetwork '学生节' %} 和科协的其他设备配网的时候, 用的都是 ifupdown 的那一套东西, 说实话我觉得不太好用而且有些陈旧了; 而且那一套没办法配置 PPPoE 网络, 需要写 [一大堆配置文件](https://wiki.debian.org/PPPoE) 或者用 [pppoeconf](https://manpages.debian.org/bullseye/pppoeconf/pppoeconf.8.en.html).

现代的图形化的 Linux (不管是 Debian 还是 Arch 还是啥的) 用的基本上是 NetworkManager, 因此我这次也决定用 NetworkManager 统一配置整个网络了, 和之前的很不一样.

由于这套工具有一个叫 `nmtui` 的 TUI 界面, 因此进行设置的时候还是很方便的. 新建一个网桥把 eth2-5 桥接起来并设置静态 IP 作为 LAN, 再新建一个 Connection 设置动态 IP 接入校园网, 再新建一个 PPP 连接用默认设置填上宽带用户名和密码就好了 (吗?)

然后我们考虑 LAN 方向, 之前看到 isc-dhcp-server 停止维护了, 希望我们用 dnsmasq 取代. 因此我这次就使用 dnsmasq 配置了 DHCPv4, 没什么特别的地方, 就是在配置文件里面改改.

### IPv6

LAN IPv6 就很阴间了 (又是 IPv6!!!). 学校的网用 nmcli DHCPv6 干脆拿不到地址 (啊对真的拿不到, 我按照 [学长的指南](https://pwe.cat/zijing-dhcpv6/) 改了还是获取不到), 在 [自服务-准入在线列表](https://usereg.tsinghua.edu.cn/main.php) 里面可以看到系统分配了一个诡异的含有大量 `ff` 的 `2402:f000:****:****:****:ffff:ffff:****` 地址, 把这个地址以静态方式放到校园网接口的 IPv6 里面 ~~能用~~ 根本不能用. *(所以这是怎么来的?)*

校园网只给了一个 IPv6 地址, 但是宽带有一整个 `/64` 段用来 SLAAC. 因此, 我们不给局域网的设备分配需要 NAT6 的 ULA.

然后宽带网的网络接口 `pppx` (一般是 `ppp0` 但是也不一定) 会给一个 `100.64.0.0/10` 里面的私网地址和一个 `2409:*::/64` 的 IPv6 段用于 Prefix Delegation. 非常让人头疼的是, Debian 里面 (不像 OpenWRT) 没有一个可以自动进行 Prefix Delegation 的工具. 我需要在 PPPoE 连接之后手动把获取到的地址段放到 LAN 上面. 为此我参考 [Debian Wiki](https://wiki.debian.org/IPv6PrefixDelegation) (这还是个 ifupdown 的实现) 写了个 NetworkManager 脚本 ~~(RFC? 不存在的)~~:

由于 RA-PD 可能会更改前缀, 我写了一些废话 (因为似乎 radvd 本身就有 [对应的可能的处理](https://manpages.debian.org/testing/radvd/radvd.conf.5.en.html#DeprecatePrefix) 和 [参考](https://community.ui.com/questions/Solution-for-client-losing-IPv6-connectivity-after-PPPoE-re-assign-the-new-prefix/4d6c5132-5f54-492c-a47a-b576182157fe#answer/9f11553b-7d2a-44b0-9271-26e3b3410f4d),  (也不完全一样?)).

{% fold "/etc/NetworkManager/dispatcher.d/50-ppp-ipv6-prefix-delegation" %}

```python
#! /usr/bin/python3

import subprocess
import sys

interface = sys.argv[1]
action = sys.argv[2]

# 在 DHCPv6 有变化时执行
if action != "dhcp6-change": exit(0)

if not interface.startswith("ppp"): exit(0)

print("Prefix delegation for", interface)

addr_output = subprocess.check_output(["ip", "-6", "addr", "show", interface]).decode("latin-1").splitlines()

import re

obsolete_prefixes = []

for line in addr_output:
    # 对 GUA 地址
    match = re.search("24[0-9a-f:]*/\d+", line)
    if match == None: continue

    import ipaddress
    ip = ipaddress.ip_network(match[0], strict=False)
    prefix = ip.network_address

    # 把旧地址置 deprecated
    old_addr = subprocess.check_output(["ip", "-6", "addr", "show", "lan-bridge"]).decode("latin-1").splitlines()
    for l in old_addr:
        match = re.search("24[0-9a-f:]*/\d+", l)
        if match == None: continue

        # Delete the same prefix so we can add it back later
        if match[0] == str(prefix)+"1/64":
            subprocess.check_output(["ip", "-6", "addr", "delete", match[0], "dev", "lan-bridge"])

        # Mark deprecated
        else:
            subprocess.check_output(["ip", "-6", "addr", "change", match[0], "dev", "lan-bridge", "preferred_lft", "0", "valid_lft", "120"])
            obsolete_prefixes.append(ipaddress.ip_network(match[0], strict=False))

    # 把新 Prefix 放到接口上
    subprocess.check_output(["ip", "-6", "addr", "add", str(prefix)+"1/64", "dev", "lan-bridge", "metric", "100"])

    # Re-construct /etc/radvd.conf
    # 用新的前缀 SLAAC
    radvd_conf = f"""# Configuration generated by {sys.argv[0]}
interface lan-bridge {{
    AdvSendAdvert on;
    MinRtrAdvInterval 3;
    MaxRtrAdvInterval 30;
    prefix {prefix}/64 {{
      AdvOnLink on;
      AdvAutonomous on;
      AdvRouterAddr on;
    }};
"""

    for obsolete_prefix in obsolete_prefixes:
        # 弃用旧的前缀
        radvd_conf += f"""
    prefix {obsolete_prefix} {{
      AdvOnLink on;
      AdvAutonomous on;
      AdvRouterAddr on;
      AdvPreferredLifetime 0;
      AdvValidLifetime 120;
    }};
"""

    radvd_conf += f"""
}};
"""

    # 写 /etc/radvd.conf, 重启 radvd
    with open("/etc/radvd.conf", "w") as conf:
        conf.write(radvd_conf)

    subprocess.check_output(["service", "radvd", "restart"])
```

{% endfold %}

总之现在 PPPoE 重新拨号之后下面能获取到新的 Prefix 并正确弃用旧的了. (不过还有不小改进空间)

### 路由

这一切的一切折腾完之后, 发现所有的流量全都从校园网走. 怎么回事呢? `ip r` 显示校园网的 [metric](https://unix.stackexchange.com/questions/708881/what-is-an-ip-route-metric-how-do-i-change-it) 比宽带要低一点. 所以手动更改 metric 使得校园网更高. 这时候流量默认从宽带走了.

然后针对 [校内 IP](https://thu.services/services/#ip_1), 在校园网获得 IPv4 地址的时候增加路由即可.

```python
for subnet in ["166.111.0.0/16", "101.5.0.0/16", "101.6.0.0/16", "59.66.0.0/16", "183.172.0.0/16", "183.173.0.0/16", "118.229.0.0/20"]:
    subprocess.run(["ip", "r", "add", subnet, "via", gateway, "metric", "120"])
```

至于 IPv6 嘛, 我觉得这就是个迷, 折腾了一下午的 DHCPv6 都没得地址, 还因为重新连接的次数过多被学校把 MAC 封了. 解决方案: 不要啦!

*3 月 4 日更新*:

经过几天的测试, 校园网的 IPv6 在 Linux 下获取需要几个条件:

- 首先在拿到 v4 之后 check 下 [自服务](usereg.tsinghua.edu.cn), 如果里面的 IPv6 是 `::`, 那么你可以用 dhclient 拿到动态 v6; 如果里面莫名其妙地分配了地址, 那么你可以尝试把那个静态地址输进去看看能不能用 (大概率不行, 因为此时不自动设置 RA, 你可能需要手动设置路由, 设置了也不一定能用)
- 不要开 Prefix Delegation - 学校不响应
- 不是所有的 DHCP 客户端都能 100% 成功

### 防火墙

IPv6 的防火墙懒得设置了 (虽然这不好). IPv4 就是常规的, 对校园网开放 22, 对宽带不开放, 只允许向外新建连接. 后续还有什么再说. UPnP 似乎不是很安全, 所以暂时先放一下, 不如手操.

### 还是路由

在几天之后, 我突发奇想要把 SSH 弄到高端口方便从外面访问. 不过我并没有直接改 SSH 配置, 而是写了一行 iptables 把 2222 重定向到 22 了. 结果你猜咋地? 连不上. 我当时隐约觉得还是路由出问题了, 但是没搞明白究竟是什么问题. 后来一想, 我从校外访问它, 它的回包从宽带走, 宽带来个 NAT, 这不就炸了 (公网原地址被改写了)? 抓包检查, 确实是这样. SYN 在 enp3s0, SYN+ACK 就从 ppp0 走了. 对于这种情况我们需要按照 **原地址** 更改路由策略, 用 `ip rules`.

```shell
ip rule add from source_ip table campus
ip route add via gateway_ip table campus
```

使得 Linux 自动将所有发送自校园网公网 IP 的流量从校园网发出去, 此时从校外访问就通了. (换句话说, 之前几天的公网 IP 就是个摆设喽? 不应该罢)

### 稳定性问题

在此状况下, 我发现了一些稳定性问题.

首先是 Network Manager 的 PPPoE 似乎不会自动更新 Delegated Prefix, 在一天左右之后网就断了, 需要重启. 然后是学校的见鬼 IPv6. 为了解决这个问题, 我放弃了 Network Manager 转而使用比较新的 dhcpcd, 其支持自动 Prefix Delegation (省下来一个脚本), 能正常获取所有的 v4 和 v6. 剩下的就是路由了, 使用 [`dhcpcd-run-hooks`](https://manpages.ubuntu.com/manpages/trusty/man8/dhcpcd-run-hooks.8.html) 可以挂载用户脚本. 需要注意的是:

- 脚本的运行是直接扔进 shell 执行的, `#! /usr/bin/python3` 不起作用.

- 脚本的 `stdout` 和 `stderr` 都不知道重定向到哪里去了, 所以输出获取不到 (导致我一直以为这东西坏了)

- `dhcpcd` 的服务配置文件 `/etc/systemd/system/multi-user.target.wants/dhcpcd.service` 提到

  ```
  ProtectSystem=strict
  ReadWritePaths=/var/lib/dhcpcd /run/dhcpcd /etc/wpa_supplicant /etc/dhcpcd.conf /etc/resolv.conf
  ```

  故输出的 log 文件必须在这几个目录 (或者改一下这个文件也行). 这样调整之后至少不会三个小时断一次网了, 稳定性有待继续考查.

*3 月 12 日 更新*

### DDNS, tinc

通过 [一个 Docker 脚本](https://github.com/sanjusss/aliyun-ddns) 实现了自动的阿里云域名的 DDNS, 然后配置了 tinc 以在任何地方访问 (并拿到能用的公网 IP 地址和宿舍台式机的 WOL).

### 又是路由

在配置的时候发现 IPv6 从校内 ping 不通, 经过检查, 和之前的问题相似, 这次是因为 `2402:f000::/32` 被默认从校园网路由并进行了 NAT6. 解决方案也相似, 强制源地址为宽带 `2409::` 的流量从宽带走.

但是校内 ping Prefix Delegation 的 IPv6 也不通... 原因同上, 但由于 PD 出来的地址是 GUA, 本身就需要选择路由, 不能一道切, 所以需要考虑通过 conntrack 路由.

 *3 月 17 日更新*

又到了一周周末. 本周用网还是很顺利的, 周末我收拾了一下上面提到的 IPv6 路由问题, 顺面更改了一下 DDNS 的策略.

首先是 IPv6 的路由, 我们对所有从 ppp0 进来的新连接检查原地址, 如果是学校的就对 **连接** 打上标记 *(而不是数据包!)*. 然后我们检查所有从内网发过来的包, 如果对应的连接被打上了标记, 我们就把这些 **数据包** 打上标记. 

```
-A PREROUTING -i ppp0 -s 2402:f000::/32 -m conntrack --ctstate NEW -j CONNMARK --set-xmark 0x2402
-A PREROUTING -i lan-bridge -d 2402:f000::/32 -j CONNMARK --restore-mark
```

然后在路由的时候, 我们检查数据包上的标记, 如果有, 我们就从 ppp0 出去.

```
ip -6 rule add fwmark 0x2402 table 9
ip -6 route add default dev ppp0 table 9
```

这样 IPv6 就完全通啦~ 然后我研究了一下 ppp0 上的 IPv6 地址, 发现既然我们已经有 Prefix Delegation 了, 没必要弄一个没啥用的地址. 因此我在 `dhcpcd.conf` 里面关闭了 ppp0 上的 SLAAC, 同时将 DNS 解析到了内网网关上. 鉴于现在 IPv6 能通过 DNS 查到, 顺面配置一下防火墙就很自然了.

这之后我尝试通过域名访问 SSH, 结果在内网挂了... 似乎是因为它把这玩意给 forward 给学校了... 看来 IPv4 这边也还是用 conntrack 比较好.

