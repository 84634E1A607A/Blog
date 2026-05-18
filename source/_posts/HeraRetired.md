---
title: Hera 倒闭啦! -- 将服务器搬出李兆基核心机房纪实
updated: 2026-05-18 14:39:26
date: 2026-05-17 19:01:00
description: "本文记录 Hera 服务器因李兆基核心机房腾退而被迫下架、报废并迁移服务至 CSLab 的全过程，涵盖 ESXi/vCSA 迁移受限、WireGuard 打通内网、OVF 备份、存储重排、坏盘与单盘 RAID0 风险处置、ddrescue 数据恢复、VLAN 与静态 IP 配网，以及学校域名反代审批受阻等问题，最终指出迁移工作的主要不确定性并非技术方案本身，而是跨部门流程时延。"
tags:
  - 科协
  - 流水账
---

Hera 是当年 Harry 放进李兆基核心机房的服务器, 是科协一直以来的服务核心. 这两年, 李兆基机房在学校的规划下要腾出空间给校级的新数据中心使用, 去年大概这个时候曾经通知我们搬迁, 不过后来被 Harry 大手找信息化的老师续命了一年 (当时信息化的老师似乎觉得, 这个 2018 年的服务器用不了一年就会坏了, 到时候让它自然报废即可). 但是他们不知道的是, 这些服务器没人折腾它, 在机房里面再用 5 年也不会坏的 (x). 于是上周, 我们续签的合同又到期了, 这次, 他们说什么也要求我们搬出去, 给定的期限是 5 月 15 日.

我在 5 月 11 日得知这个消息. 虽然 *理论上* 科协不归我管了, 但是看上去这一届的副主席对这件事还是不太敢动, 而 Harry 等几个老学长都指望着我 (而且他们看上去对我期望很高). 于是, fine, 那我就和下一届副主席一块搬吧.

<!-- more -->

## 背景: 服务器与服务何去何从

Hera 是一台 R730xd. 2018 年左右 Harry 把它塞进了机房, 运行 ESXi 6.7. Hera 上面有若干虚拟机, 共用一个 IP (曾经是 101.6.5.200). 托管合同是双栈的, v4 分配给了一台虚拟机作为网关; v6 分配给了 ESXi 自身用于维护. 前年, 我进机房进行了一次大维护, 将机器升级到了 ESXi 7.0, 加了两块盘, 更新了 BIOS 和 iDRAC, 终结了它一次开机 6 年的记录. 这两年, Hera 依然是一次都没有关闭过.

如果从李兆基机房搬出, Hera 的去处有两个: 要么搬进 {% post_link NewOfficeBuilding 百川楼机房 %}, 要么 ~~搬进二手市场~~ 报废. 考虑到 Hera 的 CPU 是两颗 E5 2630 v4... 显然扔进垃圾桶是更好的选择.

但是既然选择报废, 那么上面的服务显然不得不迁移到其他服务器上. 当时我们在网络部老人群里面短暂讨论, 决定迁移到 [CSLab](https://lab.cs.tsinghua.edu.cn/) 上. 好处是, 那边也是 ESXi 集群, 迁移起来比较方便; 那边机器也新, 性能也好, 网络也不错; 可惜当时没有多余的固定 IP, 那边机房也没有 UPS 电源, 每年倒闸都[鸡飞](https://jia.je/devops/2026/05/07/ring-dependency/)[狗跳](https://harrychen.xyz/2026/05/15/rescue-of-offline-perc-raid5-array/).

学校的官方域名由信息化统一管理, stu.cs.tsinghua.edu.cn 与 app.cs.tsinghua.edu.cn 也不例外. 学校的反代要更改解析要走比较长的流程, 大概是, 先提申请, 然后系里管信息服务的老师审批, 然后信息化的老师审批, 然后对新的 IP 地址进行自动化安全审查, 最后反代才会指向新的 IP. 这个流程的时间不好说, 短的时候一两天, 长的时候一两周. 但是距离截止日期已经只有 4 天了, 无论如何, 迁移都要抓紧开始了.

## app.cs: 先试试水

由于我已经 {% post_link 1YearNotSAST 不是科协的人了 %}, 我其实对迁移科协的服务没有什么兴趣. 不过 [THUInfo](https://app.cs.tsinghua.edu.cn) 我们这个日活量 1000+ 的应用还挂在 Hera 上面, 还是要赶紧迁移.

由于两边都是 ESXi, 理论上说, 我们可以把两边变成同一个 vCSA 的数据中心, 这样就可以进行热迁移或者方便的冷迁移了. 但是, CSLab 的 vCSA 的管理网没有 IPv6, 而 Hera 的 ESXi 又只有 IPv6, 两边硬是连不上. 于是我找信息化的老师临时要了一个 101.6.5.201 的 IP.

加入 vCSA 本身没什么难度. 考虑到 Hera 是 E5v4, CSLab 是 Naples, 保险期间, 我还是决定关机迁移. 结果迁移没有成功, 看上去, 迁移过程中 Hera 尝试访问 CSLab 的 IPv4 地址 (但是这是个内网 IP), 没有成功. 我问了问 GPT, 他建议一个 vCSA 管理的所有 ESXi 都能 *互相* 访问. 在内网和公网之间不太现实.

于是我转而选择了打通两边的内网. 我在两边的网关上打了一个 WireGuard 隧道, 用内网 IP 连接, 这次, 迁移成功了... 但是我们遇到了严重的性能问题. 在千兆的链路上 (iperf3 的单线程 TCP 轻松千兆), 迁移的速度只有 10MB/s, 迁移一个 40GB 盘的虚拟机愣是折腾了半个多小时. 我们别的虚拟机总共有 4TB 多, 照这个速度, 这个星期也迁移不完. 显然我们得想点别的办法.

Anyway, 我们在周二的时候成功把 app.cs. 迁移到了 CSLab, 并请 Unidy 学长给系里的老师请求变更 IP.

后续, 信息化的自动安全审查一定要用 IP 访问, 不带 Host Header. 我们的 IP 访问是 Nginx 444, 于是自动审查当场失败, 请求被驳回了. 我们把 IP 访问打开, 但是截至目前, 我们依然没有收到回复, 服务已经宕机好几天了, 哎, 只能等了.

## stu.cs: 并不一帆风顺

### 如何迁移?

既然我们已经知道关机迁移到性能不行, 那么下一个能干的事情就是迁移物理盘了. Hera 上面有一块 256G SSD, 两块 2TB SSD 和 3 块 4TB HDD, 如果能统统扔到 CSLab 上面, 就能直接导入虚拟机. 但是当时, Hera 上面还有不少垃圾虚拟机 (科协的旧服务, etc. 没人用), 如果能把所有虚拟机都首先搬动到 3*4T 的阵列上, 那么就能少往 CSLab 搬一点盘 (比如那个 256G 的 SSD 就是垃圾). 因此 5/12 周二晚上我让下一届副主席把网络部和联创部小朋友都薅来开了个小会, 大概得出以下迁移方案:

1. 5/13 发维护通知, 5/14 开始维护, 期间服务不稳定, 5/21 截止 (给信息化的老师留一点时间)
2. 做数据的备份和迁移, 有两种方案:
   - A:
      1. 先把已经关机的虚拟机从 Hera 上下载到 Hestia 备份, 然后把 Hera 上的已经关机的虚拟机删除
      2. 然后把开着的虚拟机都热迁移到 3*4T 阵列上
      3. 把 Hera 下架, 把 3*4T 阵列搬到 CSLab 上面
   - B:
      1. 如果机器能提前下架 (前提是出门条能开出来)
      2. 周末直接把机器拉回 308, 把盘拆下来放到 Hestia 上面拷盘
      3. 把盘搬到 CSLab 上面
3. 迁移之后去 CSLab 导入虚拟机, 配网
4. 然后给信息化老师申请变更 IP

由于预期 A.1 需要至少一天时间, 出门条也不一定能开出来, 因此我们决定先进行 A.1, 如果 B.1 能成功就切换到方案 B.

### A.1

我让下一届副主席先干着 A.1, 他用大模型写了个脚本:

```bash
#!/usr/bin/env bash
set -u

OVFTOOL="/ocean/tank/vm/ovftool/ovftool"
HOST="101.6.5.201"
USER_NAME="root"
BACKUP_DIR="/ocean/tank/vm/esxi-101.6.5.201-backup"

mkdir -p "$BACKUP_DIR"

VMS=(
  "Developing"
  "???"
)

FAILED_LIST="${BACKUP_DIR}/failed.txt"
: > "$FAILED_LIST"

for vm in "${VMS[@]}"; do
  safe_name=$(echo "$vm" | tr '/ :' '___')
  source="vi://${USER_NAME}@${HOST}/${vm}"
  target="${BACKUP_DIR}/${safe_name}.ova"

  echo
  echo "===== Backing up: ${vm} ====="
  echo "Source: ${source}"
  echo "Target: ${target}"

  if [ -f "$target" ]; then
    echo "Skip: ${target} already exists"
    continue
  fi

  cmd=(
    "$OVFTOOL"
    "--noSSLVerify"
    "--acceptAllEulas"
    "--diskMode=thin"
    "$source"
    "$target"
  )

  printf 'Running command:'
  printf ' %q' "${cmd[@]}"
  echo

  if "${cmd[@]}"; then
    echo "===== Done: ${vm} ====="
  else
    echo "===== Failed: ${vm}, continue ====="
    echo "$vm" >> "$FAILED_LIST"
  fi
done

echo
echo "All tasks finished."
echo "Failed list: $FAILED_LIST"
cat "$FAILED_LIST"
```

我当时看了半天, 这个把密码存哪里去了? 后来发现没存, 每次运行 `ovftool` 都会提示输入密码. Anyway 也不是不能用. 但是导出虚拟机的速度也不快, 也就 200Mbps. Anyway, 至少我们那些 1TB 的盘里面实际使用的不算太多, 全 0 的位置不需要导出, 从 5/13 0 点到 5/13 18 点, 我们导出了 12 台虚拟机, 1.6TB 数据. 把这些虚拟机删除之后, Hera 上的所有虚拟机的分配空间能够搬到 3*4T 的阵列上了.

### A.2

这时候我们预期总归是得周五去下机器了, 就按照方案 A 来吧. 在 Datastore 之间热迁移显然应该是一个很基本的过程, 事实也 *基本* 如此, 大部分虚拟机迁移都是用 vSphere Client 点两下的事. 但是...

#### 盘烂了...

在迁移 Accounts9 (酒井 ID, stu.cs.tsinghua.edu.cn 的核心服务) 的盘的时候...

> A fatal internal error occurred. See the virtual machine's log for more details. 2026-05-13T12:02:38.129953Z Failed to copy source (/vmfs/volumes/5ae3497c-6489ef56-7646-801844e360f2/Accounts9/Accounts9.vmdk) to destination (/vmfs/volumes/5ae34965-b55840af-55c8-801844e360f2/Accounts9 Backup/Accounts9/Accounts9.vmdk): I/O error. Failed to copy one or more disks.

我看到 IO Error 就觉得很不对劲. 我把报错发到了老人群里, Harry 回复了一个 IO. 于是我尝试 Clone 虚拟机, 依然失败.

于是我紧急备份了 Accounts9 的最新数据库, 然后由于这个虚拟机是 Debian *9*, 我实在是不敢新建一个虚拟机迁移服务, 于是我决定启动了一个 Debian Rescue 镜像, 下载了 `ddrescue`, 把这个带有 IO Error 的虚拟盘克隆了一份. (当时我还在想, *RAID1 怎么会能 IO Error 呢?*)

然后当 `ddrescue` 正在尝试克隆这个盘的时候, 我登入了 iDRAC, 就看到一大坨错误日志, 以及这是个 **单盘 RAID0**...

但是 anyway, 由于盘里面最大的文件是 12GB 的 access.log, 还有一坨日志, 数据库只有 10MB 左右, 而且当时系统运行一切正常, 我推测这些坏道都不是很重要. 因此我 `ddrescue` 之后直接把所有坏区统统填 0, 这个盘就好了... 吗?

然后我又尝试迁移, 还是 IO Error. 无所谓了, 我直接新建了一个虚拟机, 把这个 50GB 的镜像 `dd` 回去, 然后用这个虚拟磁盘替换了有坏区的盘. 这次迁移成功, 一切正常.

### A.3

干完这些事情就周四中午了. 下午没什么大事, 我去研究了一下 vCSA 的 RBAC, 看能不能给下一届副主席开个有限权限的账号 (Harry 学长十分信任我, 直接给我了一个 Admin 权限的账号, 但是我没那么大心x). 我折腾了一会, 但是感觉 RBAC 的权限粒度很神秘, 配好之后会出现诸如, 我可以把已有的虚拟机 Clone 到一个我没有权限管理的 Folder 上面然后没办法删除或者撤销... 但是不会 ()

晚上我们又开了个小会, 决定周五上午把 Hera 下架, 下午我去 CSLab 上盘.

第二天下架没什么好说的, 不过前两天 Harry 他们的 RAID 5 炸了一个阵列, 有点难绷, 但是和我们没啥关系, 不提.

### 3. 配网

周四的时候, 我让杰哥给 CSLab 单独拉了一个 VLAN, 这样我们就可以把所有东西都原样搬到这个 VLAN 上. 配网也不难, 就是把每一台虚拟机的虚拟网卡桥接到这个 VLAN. CSLab 那边没有多余的静态 IP, 我托我认识的同学找我们系里的网管老师薅了三个静态 IP, 这样我们就可以把 Hera 上的网关也搬过来了. 这之后的事情就... 是等信息化的老师审批, 但是至今也没有消息.

## 总结

再精密的计划也敌不过走流程的时间 (
