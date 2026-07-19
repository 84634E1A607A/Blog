---
title: 运维笑话一则 - 我的 SSD 干掉了我的 BIOS
updated: 2026-07-19 12:41:44
date: 2026-07-18 15:17:44
description: "本文复盘服务器重启后卡在 BIOS A0 阶段并触发 #GP 异常的排障过程：故障起初被误判为 fwupdmgr 更新 UEFI CA 破坏固件，经重刷 BIOS、比对 NVRAM 与分析 SOL 日志，最终确认二手 Intel P4510 NVMe SSD 在 MOR 位被置位时触发 AMI NVMe DXE 缺陷，使 ReceiveData 函数指针异常跳转并导致崩溃；替换 NVMe DXE 后恢复启动，而最初的“服务器宕机”实际只是网络准入掉线。"
tags:
  - 运维
---

前两天我的服务器突然下线了, 但是 BMC 还在. 我本来以为他就以某些奇怪的方式死机了, 于是决定直接重启. 结果重启之后服务器音信全无, 进入 SOL 发现, BIOS 挂掉了. 考虑到当天我用 fwupdmgr 升级了服务器的 UEFI CA, 我以为是升级干烂了 BIOS. 于是请了 dolphin 先生专家号来重新刷固件. 没想到折腾了半天最后发现是我新买回来的二手九九新 SSD 干掉了我的 BIOS, 实在没绷住, 故作此.

<!-- more -->

## 前情提要

上个月, 我买了两块二手的 Intel U.2 NVMe SSD, 算是比较好的价格; 到手之后发现 SMART 几乎全新, 算是捡了个漏 (?). 当时我直接热插拔 (毕竟这玩意设计出来就是热插拔的), 能识别出来, 我就没有在意.

那天下午, fwupdmgr 提醒我有可用的更新, 把 2015 年的 UEFI CA 升级到 2026 年. 我寻思这没啥坏处, 除了时间跨度有点大, 于是欣然升级.

晚上, 我的服务器突然失联, 我登上 BMC 没看出来什么问题, 于是决定直接重启. 没想到重启之后服务器卡在 A0, SOL 输出:

```c
!!!! X64 Exception Type - 0D(#GP - General Protection)  CPU Apic ID - 00000000 !!!!
ExceptionData - 0000000000000038
RIP  - 000000000003E009, CS  - 0000000000000038, RFLAGS - 0000000000010257
RAX  - 0000000000000038, RCX - 0000000054D620B8, RDX - 0000000000000000
RBX  - 0000000000000000, RSP - 000000006BF919C8, RBP - 0000000000005198
RSI  - 0000000054D620B8, RDI - 0000000054D65818
R8   - 0000000005F5E100, R9  - 0000000000000000, R10 - 0000000000000004
R11  - 000000006BF919C0, R12 - 000000006BFAFDAC, R13 - 0000000000000001
R14  - 000000005BC01F80, R15 - 0000000080000000
DS   - 0000000000000038, ES  - 0000000000000038, FS  - 0000000000000030
GS   - 0000000000000030, SS  - 0000000000000030
CR0  - 0000000080000013, CR2 - 0000000000000000, CR3 - 000000006BE11000
CR4  - 0000000000000668, CR8 - 0000000000000000
DR0  - 0000000000000000, DR1 - 0000000000000000, DR2 - 0000000000000000
DR3  - 0000000000000000, DR6 - 00000000FFFF0FF0, DR7 - 0000000000000400
GDTR - 000000005BCE3EE0 0000000000000047, LDTR - 0000000000000000
IDTR - 00000000599B8018 0000000000000FFF,   TR - 0000000000000000
FXSAVE_STATE - 000000006BF91620
!!!! Can't find image information. !!!!
```

重启了几次也没有变化, 我就直接放弃了, 归因于 BIOS 升级失败.

## 大战 BIOS

注: 此时我们还以为是 UEFI CA 导致的起不来

于是下午我和 dolphin 去了机房开始大战. 我们先读出来了当时的 BIOS 进行了简要的比对, 感觉没什么大问题; dolphin 提议保留 NVRAM 重刷 BIOS, 于是尝试.

*Attempt 1*: 把读读出的 BIOS 的 NVRAM 区段拷贝到原厂 BIOS 对应位置刷入

*Result 1*: 失败

dolphin 认为可能是没有拔掉纽扣电池, 遂拔电池再试, 失败.

这是怎么回事呢? 我们两个都没搞明白, 于是我提议直接刷一版原来的 BIOS. 于是:

*Attempt 2*: 直接刷原厂 BIOS

*Result 2*: 成功, 进入了一开始的超级慢的 BIOS

这之后我按照 {% post_link HR650XServer "之前折腾的结果" %} 调了一遍, 这时都还能用. 整个过程中没有进入系统.

我们觉得已经大功告成了, 于是我进系统试了试, 发现可以启动. 遂把此时的固件读出来, 打算收工.

**重启, 卒**......?

为什么呢? 我们怀疑是 fwupdmgr 在启动过程中捣乱 (虽然我觉得相当不可能). 于是

*Attempt 3*: 直接刷原厂 BIOS, 又调了一遍参数, 这次我们进入 U 盘的 Arch Linux 安装盘, 把 fwupdmgr 卸载了, 重启.

*Result 3*: 进入 Arch Linux 是好的, 重启进系统也是好的, 这次我看了 Kernel 日志, 没有任何异常.

**重启, 又卒**...???

在我以为难道是没有重建 initramfs 的时候, dolphin 觉得, A0 的时候感觉像是 Enumerate Boot Device 的时候爆炸了. 于是我下载了最新的 SOL Log. 正巧这次我忘记关 BIOS 的调试模式了, 启动的日志里面有大量的调试信息, 能看到:

```c
AMI NVMe BUS Driver.Start(65CEBA30)[PciRoot(0x1)/Pci(0x2,0x0)/Pci(0x0,0x0)]=[25;78HA0[9;63HSuccess
DiskIoDxe.Start(65B3158C)[PciRoot(0x1)/Pci(0x2,0x0)/Pci(0x0,0x0)/NVMe(0x1,3D-E3-83-40-8B-44-1B-00)]=Success
PartitionDxe.Start(65B2B678)[PciRoot(0x1)/Pci(0x2,0x0)/Pci(0x0,0x0)/NVMe(0x1,3D-E3-83-40-8B-44-1B-00)]=Not Found
FAT File System Driver.Start(658705CC)[PciRoot(0x1)/Pci(0x2,0x0)/Pci(0x0,0x0)/NVMe(0x1,3D-E3-83-40-8B-44-1B-00)]=Unsupported
AMI NVMe BUS Driver.Start(65CEBA30)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)]=[25;78HA0[9;63HSuccess
DiskIoDxe.Start(65B3158C)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)]=Success
PartitionDxe.Start(65B2B678)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)]=Success
DiskIoDxe.Start(65B3158C)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)/HD(1,GPT,1BC1B1C1-B7A4-4299-9649-51BE296450D0,0x800,0x1E8000)]=Success
PartitionDxe.Start(65B2B678)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)/HD(1,GPT,1BC1B1C1-B7A4-4299-9649-51BE296450D0,0x800,0x1E8000)]=Not Found
FAT File System Driver.Start(658705CC)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)/HD(1,GPT,1BC1B1C1-B7A4-4299-9649-51BE296450D0,0x800,0x1E8000)]=Success
DiskIoDxe.Start(65B3158C)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)/HD(2,GPT,B38C9080-E84D-4F16-ADFA-26E07FE7B5B9,0x1E8800,0x6FA9928F)]=Success
PartitionDxe.Start(65B2B678)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)/HD(2,GPT,B38C9080-E84D-4F16-ADFA-26E07FE7B5B9,0x1E8800,0x6FA9928F)]=Not Found
FAT File System Driver.Start(658705CC)[PciRoot(0x1)/Pci(0x3,0x0)/Pci(0x0,0x0)/NVMe(0x1,00-00-00-00-00-00-00-00)/HD(2,GPT,B38C9080-E84D-4F16-ADFA-26E07FE7B5B9,0x1E8800,0x6FA9928F)]=Unsupported
AMI PCI Bus Driver.Start(65B039DC)[PciRoot(0x2)]=[25;78H92[9;63HAlready started
AMI PCI Bus Driver.Start(65B039DC)[PciRoot(0x3)]=[25;78H92[9;63HAlready started
AMI PCI Bus Driver.Start(65B039DC)[PciRoot(0x6)]=[25;78H92[9;63HAlready started
AMI PCI Bus Driver.Start(65B039DC)[PciRoot(0x7)]=[25;78H92[9;63HAlready started
AMI NVMe BUS Driver.Start(65CEBA30)[PciRoot(0x7)/Pci(0x1,0x0)/Pci(0x0,0x0)]=[25;78HA0[9;63H!!!! X64 Exception Type - 0D(#GP - General Protection)  CPU Apic ID - 00000000 !!!!
ExceptionData - 0000000000000038
```

我的 BIOS 在枚举到 PCIe Root 7 的 NVMe 设备的时候抛异常. Root 7 应该在 CPU2 上, 我突然想起来我的二手 SSD -- 我装上去之后好像从来没有重启过.

于是我拔掉了那两块 SSD, 过了.

于是问题变成两个:

1. 为什么这个 SSD 会导致我的 BIOS 崩溃?
2. 怎么修呢?

探寻崩溃的原因并不紧急, 让我的服务器正常启动才是当务之急. dolphin 的神秘小工具标识, 整个 BIOS 除了 NVRAM 区段都是有校验的, 改了恐怕会导致无法启动. 但是 Debug Log 并不这么说:

```text
BootGuardPei.Entry(FFDCD58C)
Processor does not support Boot Guard.
```

也就是说, 虽然 BIOS 声明了要校验, 但是似乎并没有东西真的按照声明去校验它. (考虑到这甚至是一个调试版本的 BIOS, 似乎也并不奇怪) 于是 dolphin 大刀阔斧, 把 BIOS 里面与 NVMe 有关的 DXE 全删了, 然后手动插入了网上一个能找到的 NVMe DXE.

*Attempt 4*: 刷入修改过的 BIOS, 又折腾了一遍调参

*Result 4*: 看上去成功了, 不过 A0 显示的菜单里面不再有识别到的 NVMe 磁盘了

至此, 至少修好了能开机了.但是有些问题依然没有解决.

## 发作原因?

为什么初次启动不会崩溃, 进入 U 盘的 Arch 之后不会崩溃, 第一次进我的盘的系统也不崩溃, 只有进入过系统之后重启才会出问题?

我让 Codex 大战了这几个固件, 得到了以下结论... Codex 以 "可能存在安全风险" 为理由拒绝了请求. 于是在 CodeX 中道崩殂之后我把它未竟的事业扔给了 GLM-5.2:

首先他发现有问题的 BIOS 和原厂版本所有的 **可执行部分并无区别**, 也就是说, 故障应该是 BIOS 中本身的 bug, 被系统更改了 NVRAM 之后触发. 借用 GLM 的话, 这是一个 **被持久状态(MOR)暴露出来的潜伏内存损坏 bug**, 而不是 MOR 本身写坏了什么东西.

事故来源于尝试从错误的内存地址 `0x3E009` 取指, 这个地址由 NVMe DXE 的 `call qword ptr [namespace + 0x10A0]` 装入. 这本身应该是一个函数调用 `ReceiveData` 的指针, 但是实际上它被什么东西覆写了, 而且, 多次触发异常的值是完全一致的.

回溯调用栈和控制流, 可以看出如果想要执行到这里需要一个条件: MOR bit 0 被置位. 至于为啥, 我也不知道. MOR (Memory Overwrite Request) 是一项用于内存安全的功能, 如果 bit 0 被置位的话, 那么 BIOS 应该在下一次重启时清空所有的内存 (全部填 0). 但是这一版 AMI BIOS 的 NVMe DXE 有一个额外的神秘逻辑: 如果这个比特被设置并且磁盘 OACS bit 0 报告了 Security Send/Receive 支持, 那么会尝试调用 `ReceiveData` 尝试 Reset 这些支持的设备. GPT 给出的解释如下:

MOR 常常代表一次 Warm Reset, 此时 NVMe 设备可能未经过断电重置, 因此磁盘的锁定状态可能没有被清除. 因此, 对于支持 TCG 的设备, NVMe DXE 会尝试调用 `ReceiveData` 来 Reset 这些设备.

```text
MOR asserted
    │
    ├─ Clear host DRAM/caches
    │
    └─ For each storage device supporting security commands:
           Security Receive, protocol 00h
                    │
                    ├─ TCG reset protocol supported → issue TPer Reset
                    └─ Not supported / error       → do nothing further
```

于是在有这两块 P4510 的情况下, 只要 MOR bit 0 被置位, NVMe DXE 就会尝试调用 `ReceiveData`, 然后爆炸. 至于这个函数指针为什么会变成 `0x3E009` 这个奇怪的地址, 说实话, 我没搞明白, GLM-5.2 也没搞明白.

这么一番折腾之后, 我又得寄希望于 GPT 了... 但是还是天天 Additional Security Check, 动不动就不给回复.

但是 GPT 还是找到了一些踪迹: 位于 `0x3E000` 的指令是 `CpuMpDxe` 的 `AP Startup Trampoline`:

```asm
0x3E000 +0: 66 8B E8    ; 误按 64 位执行时，把原 RAX 的低 16 位写进 BP
        +3: 8C C8       ; RAX <- CS = 0x38
        +5: 8E D8       ; DS  <- 0x38
        +7: 8E C0       ; ES  <- 0x38
0x3E009 +9: 8E D0       ; 尝试 SS <- 0x38，#GP(0x38)
```

那么是谁把这个函数的地址改成了 `0x3E000` 呢? 真不知道. Codex 又觉得这个问题 "Security Related" 拒绝回答. 至于 GLM-5.2... 他没搞明白, 但是最终他觉得这是一个内存 UAF 之类的问题. Anyway, 反正最后能开机了, 我就懒得再找安全问题了.

## 笑话

修好之后我去看了上次 "崩溃" 的 journal, 发现崩溃的原因是... 掉准入了. 我要是去看一眼网络在线列表, 也就不会关机了, 那么这个雷就会继续埋着到某一天发作. 但是无论怎么说, 现在这问题解决了. 就是 fwupdmgr 背了锅, 害得我们一开始没有找对方向.
