---
title: 给 4090 48G 增加 64G BAR1 支持
updated: 2026-10-25 01:10:31
date: 2026-10-25 00:12:31
description: "本文记录为改装版 RTX 4090 48G 显卡解锁 64 GiB BAR1 的过程。基于 GPU Booter 漏洞获取的 SEC2 高权限，在 NVIDIA 驱动加载前直接写入 CYA、CFG 寄存器，使显卡报告 64 GiB BAR1 支持；随后重分配 BAR 资源与 PCIe 桥预取窗口，解决原有 32 GiB 窗口导致的 ENOSPC 错误，最终实现完整的 64 GiB BAR1 地址空间分配，并可配合解锁 P2P 的驱动启用 PCIe P2P，实际性能收益尚未确定。"
tags:
  - 技术
---

今天惊闻 [神人成功解锁 RTX 30 系显卡 FP16/BF16 算力](https://www.hkepc.com/27069/%E7%A5%9E%E4%BA%BA%E6%88%90%E5%8A%9F%E8%A7%A3%E9%8E%96_RTX_30_%E7%B3%BB%E5%88%97%E9%A1%AF%E7%A4%BA%E5%8D%A1_FP16BF16_%E7%AE%97%E5%8A%9B_%E5%AF%A6%E6%B8%AC%E6%95%88%E8%83%BD%E6%9A%B4%E5%A2%9E%E9%80%BE_80%25), 仓库位于 [GitHub](https://github.com/Zagitta/gpu-unlock), 在让 DeepSeek 检查怎么做到的时候他找到了今天发布的 [4090 版本](https://github.com/JustAResearcher/gpu-unlock-ada), 震惊瘫坐. 考虑到之前 {% post_link GooxiAS4110GServer "折腾组里服务器的时候因为 4090 48G 的 BAR1 只有 32G 而不得不使用魔改驱动" %}, 如果能直接让 GPU 支持 64G BAR1, 问题就迎刃而解了. 于是让 Codex 一通分析, 真的成功解锁了 64G BAR1, 仓库开源于 [GitHub](https://github.com/84634E1A607A/gpu-unlock-4090-48g-64g-bar1), 成为了 *第一个*(应该吧) 允许 4090 48G 显卡运行于 64G BAR1 的人.

<!-- more -->

**TL, DR:** 在 NVIDIA 驱动加载前, 利用 SEC2 高权限 payload 向 CYA (`BAR0 + 0x88724`) 写入 `0x30`, 向 CFG (`BAR0 + 0x88dcc`) 写入 `0x8000000a`，开放 64 GiB BAR1; 再经 FLR 校验并重排 PCIe 桥窗口, 为每张卡分配完整的 64 GiB 地址空间.

## 相关阅读

最有价值的研究文章实际上是当年破解 170HX 的时候, [GitHub 上对 170HX 研究的仓库](https://github.com/Consensus-Protocol/cmp170hx/wiki), 这里面详细讲解了他们是如何利用 Booter 的一个缓冲区溢出漏洞, 构造 ROP, 进而取得任意寄存器写的权限的. **这是后续所有改动的基础**. 这玩意还有一篇论文, [A Canary in the Crypto Mine: Defeating Stack Protection in a GPU Secure Coprocessor](https://doi.org/10.5281/zenodo.20916111)

这里面的 Wiki 很长, 有一篇 [知乎文章](https://zhuanlan.zhihu.com/p/2073756134234765056) 对其有简要介绍.

这篇论文显然引出了一个问题: **这个漏洞可以获取任意寄存器的搞特权级的写权限**, 那么, 这个漏洞的影响有多大呢? 又有多有用呢?

[gpu-unlock](https://github.com/Zagitta/gpu-unlock) 这个仓库显然给出了部分答案: 这个漏洞在整个 30 系显卡上都可用, 且通过漏洞, 可以解锁 FP16 算力, 让显卡的 FP16 算力翻倍.

紧接着, 在 AI 极大加速逆向的今天, 仅仅一天之后, [gpu-unlock-ada](https://github.com/JustAResearcher/gpu-unlock-ada) 已经逆向了 40 系显卡的 Booter, 同样复现了 ROP 获取了 40 系显卡的任意寄存器特权写权限. 同理, 其解锁了 40 系显卡的 FP16 / BF16 算力.

## 改 BAR1

既然本质上获取的是寄存器特权写权限, 那么, 控制显卡操作系统汇报的可用 BAR1 空间的寄存器是否也可写呢? 我让 Codex 进行了一些探索.

NVIDIA 的某些设置寄存器的写权限所需的特权级是可以配置的, 这些配置寄存器的写特权级也可以配置. 在能买到的 GPU 中, 一般这些特权级是 3, 也就是, 只有在 Booter / SEC2 环境下才能写入. 而对于这些解锁, 他们一般的做法是在 SEC2 中把对应的特权级配置寄存器 PLM 从 `0xffffff8f` 改成 `0xffffffff`, 然后在 Host 环境下写入对应的功能.

Codex 先尝试了这条路线, 他把可能与 BAR1 有关的寄存器都写了, 但是重启之后发现控制 BAR1 的 CYA/CFG 寄存器写入仍然被忽略.

后来, 我干脆让 Codex 在 SEC2 特权级直接写了 CYA/CFG 寄存器, 向 CYA (`BAR0 + 0x88724`) 写入 `0x30`, 向 CFG (`BAR0 + 0x88dcc`) 写入 `0x8000000a`. 这样之后, 卡的 BAR1 就可以报告 64G 支持了.

## 改桥

但是, 改过 64G BAR1 之后, Linux 并不能直接分配 64G 的虚拟地址映射. 这是因为, 一开始 PCIe 协商时候, GPU 只报告了最高 32G BAR1 支持, 因此此时 PCIe 桥已经初始化并按照最大 32G BAR1 分配了地址. 在 initramfs 阶段运行这个解锁程序扩容 BAR1 之后, 桥上地址空间没有自动重分配, 因此装不下 64G BAR1, 会提示 ENOSPC.

因此, 需要 trigger 一次重分配. 可以关闭 GPU 的 Memory Decode, 调用 `pci_release_resource()` 释放 BAR1, BAR3 和桥上的旧预取窗口, 设置 ReBAR 为 64G 之后 `pci_assign_resource()` 分配新地址, 进而在整棵树上分配新的 BAR 地址. 然后, 将这些新地址写入桥的配置, 即可实现完整重分配.

在分配了 64G BAR1 之后, 不再需要特殊的处理即可用解锁 P2P 的驱动开启 PCIe P2P. (不过, 性能提升未知, 可能没那么大.)
