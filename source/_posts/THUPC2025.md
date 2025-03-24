---
title: THUPC 2025 - 不知道起什么标题
date: 2025-03-22 22:57:23
tags:
  - 网络
  - 技术
  - 流水账
---

两三个星期前, 杨敬找到我, 问我有没有时间. 我当时就觉得不妙, ~~肯定没好事~~ 肯定又是什么东西要配网了 (我真不想用那一套老掉牙的思科了). 我没有拒绝 (这学期事情也不是太多吧, 你清可能也确实找不到另外一个有我这个资源, 经验和手段的人...), 于是我就糊里糊涂变成了网络负责人. THUPC *圆  满  结  束* 了, 是时候做一个总结了.

<!-- more -->

## 网络布局

```mermaid
flowchart LR

subgraph FB1["B1 弱电间"]

subgraph FB1_SW1["B1 弱电间核心交换机"]

FB1_SW1_PA["某个口"]
FB1_SW1_PB["某个口"]

end

subgraph FB1_OC["B1 光纤配线架"]
FB1_OC_TO_F3_6["B1 - 3F 光缆 11, 12 芯"]
FB1_OC_TO_F12_6["B1 - 12F 光缆 11, 12 芯"]

FB1_OC_TO_F3_6 <==> | 10G, 新增 | FB1_OC_TO_F12_6
end

end

subgraph F3["3F 弱电间"]

subgraph F3_SW2["3F 二号交换机"]
F3_SW2_P25_29_O["25 27 29 口"]
F3_SW2_P31_45_O["31 33 35 37
39 41 43 45 口
端口隔离"]
F3_SW2_P49["49 口"]
F3_SW2_P52["52 口"]
end

end

F3_307["307 墙上网口
过交换机"]
F3_307_UD["307 赛方设备
172.23.20.0/23"]

F3_307 <--> | 1G Access
VLAN 222 | F3_307_UD

F3_SW2_P25_29_O <--> | 1G Trunk
PVID 222
Allow 1 111 333 | F3_307

subgraph F3_311_312["311AB, 312AB 会议室"]
F3_311_312_D["墙上网口"]

subgraph F3_311_312_SW["交换机"]
F3_311_312_SW_P1_23["1 - 23 口
端口隔离"]
F3_311_312_SW_P24["24 口"]
end

F3_311_312_UD["3 楼比赛用电脑
172.23.12.0/22"]

F3_311_312_D <--> | 1G | F3_311_312_SW_P24
F3_311_312_SW_P1_23 <--> | 1G Access
VLAN 333 | F3_311_312_UD

end

F3_SW2_P31_45_O <--> | 1G Trunk VLAN 
1 111 222 333 | F3_311_312_D

subgraph F12["12F 弱电间"]

subgraph F12_SW2["12F 二号交换机"]
F12_SW2_P18_20_22["18 20 22口"]
F12_SW2_P24_26_28["24 26 28口"]
F12_SW2_PX["某个口"]
F12_SW2_P49["49 口"]
F12_SW2_P50["50 口"]
F12_SW2_P51["51 口"]
F12_SW2_P52["52 口"]
end

subgraph F12_SW3["12F 三号交换机"]
F12_SW3_P1_23["1 - 23 口
端口隔离"]
F12_SW3_P24["24 口"]
F12_SW3_P25["25 口"]
end

F12_SW2_P50 <==> | 二号 Access VLAN 111
10G <新增>
三号 Access VLAN 1 | F12_SW3_P25

F12_SW2_PX <-.-> | 暂时关闭
1G 原上行
Access VLAN 1 | F12_SW3_P24

end

subgraph F12_1226["1226"]
F12_1226_SW["若干交换机"]
F12_1226_UD["12 楼比赛用电脑
172.23.12.0/22"]

F12_1226_SW <--> | 1G Access 111 | F12_1226_UD
end

F12_1222["1222 墙上网口
过交换机"]
F12_1222_UD["1222 赛方设备
172.23.20.0/23"]

F12_1222 <--> | 1G Access
VLAN 222 | F12_1222_UD

subgraph F12_1224["1224"]
F12_1224_D["墙上网口"]
F12_1224_O_1["墙上光跳线盒左侧口"]
F12_1224_GW["网关"]

F12_1224_O_1 <==> | 10G | F12_1224_GW
end

F12_SW2_P18_20_22 <---> | 1G Trunk
PVID 222
Tagged 1 111 333| F12_1222
F12_SW2_P24_26_28 <---> | 1G Trunk
PVID 222
Tagged 1 111 333| F12_1224_D
F12_SW2_P51 <===> | 10G Trunk VLAN
1 111 222 333| F12_1224_O_1

FB1_SW1_PA <==> | 校园网 10G
VLAN 1| F12_SW2_P52
FB1_SW1_PB <==> | 校园网 10G
VLAN 1| F3_SW2_P52

FB1_OC_TO_F3_6 <==> | 内网 10G Trunk
VLAN 111, 222, 333| F3_SW2_P49
FB1_OC_TO_F12_6 <==> | 内网 10G Trunk
VLAN 111, 222, 333| F12_SW2_P49

F12_SW3_P1_23 <--> | 内网 1G
Access VLAN 1| F12_1226_SW

```

在这样的布局下, 我们可以以万兆的速度把 3 楼和 12 楼的设备都连接起来, 统一用一个网关管理. 不过在赛前网络调试的时候确乎是出现了一些问题. 最大的问题是自强楼的网络被系里认为是 {% post_link NewOfficeBuilding "非常重要" %}, 说什么也不让我自己调 (不给权限), 整了个信息化的老师来 (不过到头来是两个人一起调, 交叉验证的), ~~但是我俩都菜~~, 配置有一些小问题只能远程让老师救火.

### Hybrid Port

一开始, 我想折腾一下 *Hybrid Port* (其实是被各种交换机的不同叫法搞混了), 于是把到 1224 的口配成了 Hybrid 模式. 但是我似乎错误地配置了 Hybrid 模式, 最后不通 (问题: 楼层交换机我没有权限) (但是我觉得我调的是对的).

```sh
interface range Gi1/0/24
  port link-type hybrid
  port hybrid pvid vlan 222
  port hybrid vlan 1 111 333 tagged
```

后来我紧急跟老师打电话, 给改成了 Trunk 模式, 然后就通了 (但是为什么呢... 我觉得这两个是一样的啊?)

```sh
interface range Gi1/0/24
  port link-type trunk
  port trunk pvid vlan 222
  port trunk permit vlan 1 111 222 333
```

### STP

这一段是更有意思的 (更具教育意义的). 我们回看上面的图, 会看到在物理连接上面实际上有个环.

```mermaid
flowchart LR

subgraph FB1_SW1["B1 弱电间核心交换机"]
end

subgraph F3_SW2["3F 二号交换机"]
end

subgraph F12_SW2["12F 二号交换机"]
end

FB1_SW1 <==> | 校园网 10G
VLAN 1| F12_SW2
F3_SW2 <==> | 校园网 10G
VLAN 1| FB1_SW1

F3_SW2 <==> | 内网 10G Trunk
VLAN 111, 222, 333| F12_SW2

```

根据配置, 这个 "环" 由于 VLAN 选通的缘故, 并不会造成任何逻辑上的环路. *但是*, 所有交换机都开了 MSTP, 核心交换机 (STP 根) 打开了 MSTP. 由于我听说 MSTP 可以 VLAN-aware, 因此我在一开始配置的时候忽略了 STP 可能导致的问题. 周五配网的时候发现 3 楼通不了一点, 和老师打电话远程调试的时候突然发现如此. (所以搞网络这事真的没有技术全是经验x)

补充: [MSTP 确实可以 VLAN-aware](https://www.h3c.com/en/Support/Resource_Center/HK/WLAN/Access_Controller/H3C_WX3000/Technical_Documents/Configure___Deploy/Configuration_Guides/H3C_WX3000_CG-6W103/201007/685284_294551_0.htm) 但是需要额外配置 (额外配置这个有全楼断网风险, 因此当时也没有考虑).

解决方案是确认了构型没有风险后将新接的这个线的两侧端口的 STP 给禁用了.


<!--

批斗会

- 事前预案严重不足 <-- 我不管什么 DDL 啥的, 早干嘛去了
- 关键人员不在场 <-- 干啥去了?
- 试机赛管理完全混乱
- 自强楼纯纯傻逼



整体上:

- 网络没有锅
- 对机器到底长啥样的了解不够, 但是没啥大锅
- 气球有些抽象 (主要是 12 楼和 3 楼导致的) (外加激光打印机)
- 好吵 (x) 感觉脑袋大

-->