---
title: 国鑫 AS4110G-D04R-G3 服务器
updated: 2026-09-26 15:18:10
date: 2026-09-26 15:18:10
description:
tags:
---

课题组去年还是前年购买了两台 8 卡 4090 48G 服务器, 在过去的一年里面可谓是故障不断. 之前我一直没有使用卡的需求, 所以说也并不关心; 但是最近我导想推进在外网的本地部署模型, 觉得上半年我让买的 Spark 太慢了满足不了科研需求. 因此这几天折腾了一下.

本文会涵盖硬件配置和调试, 暴打 BMC, 乱改 BIOS, 魔改 NVIDIA 驱动等抽象行为, 请谨慎观看.

<!-- more -->

## 硬件介绍

机器是一台国鑫 (Gooxi) AS4110G-D04R-G3 4U 10 卡服务器, [手册在此, 可在网上找到](./GooxiAS4110GServer/20230919093115938.pdf). 其安装双路 3 代可拓展至强 CPU, 我们的机器上是 8336C, 总共 64 核心 128 线程, 16 * 64G DDR4 LRDIMM, 总共 1TB 内存容量. [主板手册在此](./GooxiAS4110GServer/20231007141224278.pdf)

其系统 layout 长这样:

![Motherboard Logic Block Diagram](./GooxiAS4110GServer/MotherboardLogicBlockDiagram1-2.jpg)

可以看到这个图上面其实并没有 GPU 所在的 PCIe 位置. 为什么呢? 在网上搜索服务器的拆解图可以发现, 其 GPU 模块位于整个机箱的最前面, 引出了两根 PCIe 延长线, 每一根是 PCIe Gen4 x16, 可以插在图示的 SLOT1-10 上. (我线下验证过了, 它的主板上面真的有 10 个 slot... 好多)

GPU 模块上面有两个 PCIe 交换机, 交换芯片看上去是 PEX8747, 每一个管五块卡.

然后看图可以发现 CPU0 引出了一个 Gen4 x16, 而 CPU1 引出了两个, 因此, 如果卡间通信上有需求的话, 放到 CPU1 可以避免 UPI.

## 硬件现状

我拿到机器的时候被这个机器的硬件状况震撼了. 我们的厂家发过来的时候, 8 个 GPU 是顺着插的, 因此插在物理位置的 2-9 上. 于是 5 个 GPU 在一个交换机上放在 CPU0, 而 3 个在另一个. IB 网卡插在 CPU1 上, 可以说是既不对称又不亲和, 达到了速度的最小化.

```bash
nvidia-smi topo -m
        GPU0    GPU1    GPU2    GPU3    GPU4    GPU5    GPU6    GPU7    NIC0    NIC1    CPU Affinity    NUMA Affinity   GPU NUMA ID
GPU0     X      PIX     PIX     PIX     PIX     SYS     SYS     SYS     SYS     SYS     0-31,64-95      0               N/A
GPU1    PIX      X      PIX     PIX     PIX     SYS     SYS     SYS     SYS     SYS     0-31,64-95      0               N/A
GPU2    PIX     PIX      X      PIX     PIX     SYS     SYS     SYS     SYS     SYS     0-31,64-95      0               N/A
GPU3    PIX     PIX     PIX      X      PIX     SYS     SYS     SYS     SYS     SYS     0-31,64-95      0               N/A
GPU4    PIX     PIX     PIX     PIX      X      SYS     SYS     SYS     SYS     SYS     0-31,64-95      0               N/A
GPU5    SYS     SYS     SYS     SYS     SYS      X      PIX     PIX     NODE    NODE    32-63,96-127    1               N/A
GPU6    SYS     SYS     SYS     SYS     SYS     PIX      X      PIX     NODE    NODE    32-63,96-127    1               N/A
GPU7    SYS     SYS     SYS     SYS     SYS     PIX     PIX      X      NODE    NODE    32-63,96-127    1               N/A
NIC0    SYS     SYS     SYS     SYS     SYS     NODE    NODE    NODE     X      PIX
NIC1    SYS     SYS     SYS     SYS     SYS     NODE    NODE    NODE    PIX      X

Legend:

  X    = Self
  SYS  = Connection traversing PCIe as well as the SMP interconnect between NUMA nodes (e.g., QPI/UPI)
  NODE = Connection traversing PCIe as well as the interconnect between PCIe Host Bridges within a NUMA node
  PHB  = Connection traversing PCIe as well as a PCIe Host Bridge (typically the CPU)
  PXB  = Connection traversing multiple PCIe bridges (without traversing the PCIe Host Bridge)
  PIX  = Connection traversing at most a single PCIe bridge
  NV#  = Connection traversing a bonded set of # NVLinks

NIC Legend:

  NIC0: mlx5_0
  NIC1: mlx5_1
```

## 进机房改硬件

由于上述的问题, 部署模型的时候非常抽象 (当然这不是最抽象的). 因此我决心进机房改一下物理拓扑. 按理说, **应该把两个延长线插在 SLOT2 和 SLOT7, 网卡插在 SLOT4**, 可以获得最好的收益. 对于 8 张卡, 由于前面板上有两个不透风的梁, 插在 0,1,3,4,5,6,8,9 是最好的.

改过之后的拓扑如下:

```bash
nvidia-smi topo -m
        GPU0    GPU1    GPU2    GPU3    GPU4    GPU5    GPU6    GPU7    NIC0    NIC1    CPU Affinity    NUMA Affinity   GPU NUMA ID
GPU0     X      PIX     PIX     PIX     NODE    NODE    NODE    NODE    NODE    NODE    32-63,96-127    1               N/A
GPU1    PIX      X      PIX     PIX     NODE    NODE    NODE    NODE    NODE    NODE    32-63,96-127    1               N/A
GPU2    PIX     PIX      X      PIX     NODE    NODE    NODE    NODE    NODE    NODE    32-63,96-127    1               N/A
GPU3    PIX     PIX     PIX      X      NODE    NODE    NODE    NODE    NODE    NODE    32-63,96-127    1               N/A
GPU4    NODE    NODE    NODE    NODE     X      PIX     PIX     PIX     NODE    NODE    32-63,96-127    1               N/A
GPU5    NODE    NODE    NODE    NODE    PIX      X      PIX     PIX     NODE    NODE    32-63,96-127    1               N/A
GPU6    NODE    NODE    NODE    NODE    PIX     PIX      X      PIX     NODE    NODE    32-63,96-127    1               N/A
GPU7    NODE    NODE    NODE    NODE    PIX     PIX     PIX      X      NODE    NODE    32-63,96-127    1               N/A
NIC0    NODE    NODE    NODE    NODE    NODE    NODE    NODE    NODE     X      PIX
NIC1    NODE    NODE    NODE    NODE    NODE    NODE    NODE    NODE    PIX      X

Legend:

  X    = Self
  SYS  = Connection traversing PCIe as well as the SMP interconnect between NUMA nodes (e.g., QPI/UPI)
  NODE = Connection traversing PCIe as well as the interconnect between PCIe Host Bridges within a NUMA node
  PHB  = Connection traversing PCIe as well as a PCIe Host Bridge (typically the CPU)
  PXB  = Connection traversing multiple PCIe bridges (without traversing the PCIe Host Bridge)
  PIX  = Connection traversing at most a single PCIe bridge
  NV#  = Connection traversing a bonded set of # NVLinks

NIC Legend:

  NIC0: ibp177s0f0
  NIC1: ibp177s0f1
```

## 魔改驱动

大模型推理是一个非常消耗带宽的工作. 如果全都走 SHMEM, 那么 PCIe 交换机的上行的 x16 带宽将成为显著的瓶颈. 4090 又没有 NVLink, 因此必须使用 PCIe P2P 才能提高性能. 但是呢, 老黄刀法让 GeForce 系列没办法用 P2P.

在魔改驱动之前, 我尝试部署了 GLM 5.3 Flash, 速度不到 1 token/s, 完全没法用.

Harry 曾经在博客上发过一篇 [如何在 5090 上启用 P2P](https://harrychen.xyz/2026/05/20/enable-gpudirect-rdma-on-rtx-5090/), 后来, 两个月前 (还挺新), 我看到 [duanyll 魔改了 Nvidia 驱动, 实现了 4090 48G 上的 P2P](https://duanyll.com/2026/7/13/4090-48G-P2P/). 按照上面的方法, 我安装了 595.71.05 版本的魔改驱动, 实现了 P2P 的支持. 但是, 在测试的时候, 还是发现了问题:

| GPU 数 / 分组 | 通信方式 | 配置 | 平均 bus bandwidth |
| --- | --- | --- | ---: |
| 4 卡，GPU 0–3 | P2P/CUMEM | `P2P_LEVEL=PIX` | **5.141 GB/s** |
| 4 卡，GPU 4–7 | P2P/CUMEM | `P2P_LEVEL=PIX` | **5.141 GB/s** |
| 8 卡，GPU 0–7 | P2P/CUMEM | `P2P_LEVEL=SYS` | **0.817 GB/s** |
| 8 卡，GPU 0–7 | SHMEM | 禁用 P2P | **4.480 GB/s** |

虽然没有数据错误, 但是 8 卡的 P2P 通信带宽非常低, 甚至不及直接使用 SHMEM. 为什么呢?

经过一些排查, 我们定位到这可能是没有打开 [Relaxed Ordering](https://techcommunity.microsoft.com/blog/azurehighperformancecomputingblog/nccl-performance-impact-with-pcie-relaxed-ordering/3660825). 我让 Codex 测试了一下, 发现, 当 PCIe 交换机上同时出现 P2P 和到 Host Bridge 上行的通信时, 由于队头阻塞, 带宽利用率骤降.

| 通信方式 | 跨 PIX 边的实际路径 | 平均 bus bandwidth |
| --- | --- | ---: |
| `P2P_LEVEL=SYS` | GPU 3→4 走交换机 P2P、7→0 跨组 P2P | **0.840 GB/s** |
| `P2P_LEVEL=PIX` | GPU 3→4 走交换机 P2P、7→0 跨组 SHM | **2.381 GB/s** |
| SHMEM | 全部走 SHM/direct/direct | **4.468 GB/s** |

因此打开 Relaxed Ordering, 打开后带宽明显改善, 利用率基本 100%. 在组内 P2P, 组间 SHM 情况下带宽最高.

| NCCL 路径 | Avg bus bandwidth | 对比不开 RO |
| --- | ---: | --- |
| `P2P_LEVEL=SYS` | 3.6315 GB/s | 约 **4.32×** |
| `P2P_LEVEL=PIX` | 5.2358 GB/s | 约 **2.20×** |
| SHMEM | 4.46901 GB/s | 基本不变 |

此时卡间通信速度允许使用 Tensor Parallel 部署模型.

## 模型部署

尝试了 GLM 5.3 Flash 和 Deepseek v4.1 Flash, GLM 5.3 Flash 单请求 MTP 5 速度约 100 token/s, 8 并发速度约 200 token/s, 16 并发峰值速度 500 token/s, KV 1.3M, 开 KV Offload 不成功, 但是 KV Pool 够用;

DeepSeek v4.1 Flash 单请求 DSpark 5 速度约 100 token/s, 8 并发速度约 300 token/s, KV 2.4M (但是得关 GPU 的 ECC Mem 不然显存不够用), Offload 256G 完全用不完.

用 claude code 开 ultracode, 速度勉强能够接受, 性能也勉强能够接受.

## 莫名重启

这台机器之前就因为莫名其妙重启返修, 修好了回来, 但是也不知道是否真的修好了. 然后某一天, 我正在调试 vLLM 的时候, 机器突然失联了. 打开 BMC 一看发现重启了, 原因未知. 让 Codex 诊断, 结果是, 他认为电源键被错误触发了. 遂决定禁用掉 Reset Button. 但是怎么才能禁用呢? BMC 网页没有相应的选项, ipmitool 也不能设置禁用前面板. 怎么办呢? 本着部署了模型就要用的原则, 我尝试分析了机器的 BIOS 和 BMC.

## 爆打 BMC

一开始我问老师要这台机器的 BMC, 老师说, BMC 不敢上网, 觉得 BMC 一旦上网秒被打穿. 我当时觉得这有些危言耸听, 但是这是后话.

### Gaining Access

在系统上重置 BMC 密码, 然后配置 BMC IP 为 169.254.0.0/16, 这样一来就可以在二层子网内访问. BMC 中有 "备份配置" 选项, 得到一个很长的文本文件. 里面可见:

```ini
[$$$/conf/shadow]
$$$DataLength=891$
sysadmin:$1$A17c6z5w$5OsdHjBn1pjvN6xXKDckq0:14386:0:99999:7:::
```

那么这是个什么 hash 呢? 直接把这一串扔进 Google, 即可得知, 这是 AMI BMC 的默认凭据, `sysadmin:superuser`. BMC 有 SSH 暴露, 用 `sysadmin` 尝试登录, 发现可用, 且进入了 Linux shell.

而这个密码又改不了 (或者说, 大家没人会想到要去改这个...), 所以 BMC 一旦暴露到公网... 就倒闭了!

### BMC Layout

BMC 是一个精简的 ARM Linux, 所有的 config 都在 /conf 里面, 是一个独立的 jffs 卷; 而 Web 页面也是独立的 jffs. 如果 /conf 没东西, 那么就自动新建 default conf. BMC 有 256M 内存 (比磁盘还大!), CPU 是 ARMv6.

Linux kernel version `Linux G3DE 3.14.17-ami #1 Tue Apr 21 09:20:40 GMT 2026 armv6l GNU/Linux`, 构建时间还挺新的, 不知道为啥一定要 Linux 3.x, 也可能是陈年技术债吧. 这里的 G3DE 是主板型号.

### 读取 BMC Flash

在 `/dev/` 里面能看到几个 mtd 设备, 我直接读取了 `/dev/mtd0 "fullpart"`, `ssh sysadmin@xxx dd if=/dev/mtd0 bs=1M > mtd0.dmp` 读取到本地, 得到了一个 32M 的文件, 经检验是 BMC Flash 的全部内容. 我将一份擦除了配置的文件放在 [此处](./GooxiAS4110GServer/BMC-anonymized.img.zst) 供研究.

### 读取 BIOS Flash

从 BMC 中可以看到一个允许与 BIOS 交互的 dev `crwxrwxrwx    1 sysadmin sysadmin  153,   0 Sep 25 11:42 /dev/host_spi_flash0`. 我让 Codex 读取了一下, 大致的流程是,

1. 打开 Host SPI 通道: 把 GPIO 202 拉高并加载 host_spi_flash_hw 模块, `/proc/mtd` 出现了 `mtd4: ... "Host SPI Flash"`，容量为 32 MiB

2. 用类似方式把 mtd4 读出到本地, 32 MiB, 78.5s

3. 拉低 GPIO

当然, 实际上我显然是用 Codex 干的, 他除了以上步骤之外, 还进行了包括但不限于首先尝试, 然后写脚本只读挂载, 然后写监控脚本如果炸了就回滚等一系列 ~~多余~~ 操作.

BIOS 的留档 [在此](./GooxiAS4110GServer/BIOS-anonymized.bin.zst)

### 逆向 BMC

那么到底有哪些可以用的指令呢? 我让上面跑的本地模型逆向了一番, 得到了 392 条指令, 其中 269 条在 IPMITool 里面没有直接的命令, 需要使用 raw 指令. 以下部分为 LLM 生成, 仅供参考.

## IPMI 命令参考

