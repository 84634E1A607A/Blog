---
title: 装 Arch Linux!
date: 2025-05-03 22:52:59
description: 
tags:
  - 技术
  - Linux
---

在听说 Linux 6.12 内核支持 Lunar Lake 之后, 我第一时间就给我的电脑安装了 Arch Linux 和 Windows 的双系统. 当时是为了用 Monitor Mode 的 WiFi {% post_link TsinghuaSecure "打 Tsinghua-Secure" %} . 随着 Linux Kernel 发展到 6.14, 对 Lunar Lake 的支持已经比较完善了, 之前的一些奇怪的卡顿等现象已经得到了修复. 正巧最近看 Windows 又不爽了 (主要是因为 Windows 常常是我搞开发的最大阻碍), 碰上五一放假有一点时间, 我就手痒痒决定来给 Windows 扬了.

<!-- more -->

## 为什么是 Arch Linux

关于发行版的选择, 主要的考虑有以下几点:

我平常用得最多的是 Linux Mint, 她很丝滑, 平常也没什么问题, 几乎不用配置, 反正能用. 之所以不选主要是现在 Linux Mint 的主线内核是 Linux 6.8; Hardware Enablement Kernel 确实是更新, 但也是 6.11, 并没有对 Lunar Lake 的支持. Debian 和 Ubuntu 因为同样的原因被毙掉了.

其次, 我想折腾一下 LUKS + TPM 的全盘加密的安全策略, 而这个玩意似乎并不那么简单, 对于一个自动安装的 Linux, 万一安装程序不支持, 那反而不如手动按教程装.

然后我就去逛了一圈, 发现身边的用 Linux 的人不是 Ubuntu 就是 Arch Linux. 再加上我电脑上本来已经装 Arch Linux 试过一遍错了, 遂选择 Arch.

但是仍然有些拿不准, 然后 Hash 妹妹给我发了一个知乎问答 [家长们，你们认为孩子沉迷游戏严重还是沉迷Linux严重呢？](https://www.zhihu.com/question/668039071), 但是尽管如此我还是要装 (bushi). 她极力推荐了 OpenSUSE (但是说实话我基本没见过有人用), 但是我最后还是选择了 Arch (或许下次有时间试试).



## 确保安全地安装

这里其实有几层意思.

一个是, 我要确保我自己的安全和工作效率, 也就是说, 万一我安装大失败, 我必须能够在较快的时间内迅速回滚到 Windows. 解决方案十分的简单啊, 我直接买了一块盘, 把原来的盘拆下来就好.

一个是, 我要确保我的新系统是安全的, 即我要正确设置 LUKS 加密, Secure Boot 保护我的未加密的 BootLoader, 然后记得我自己的主密码, 同时正确设置 TPM, 免得每次开机输密码 (这几个加起来约等于 BitLocker).

一个是, 我要确保我的安装的周围的环境是安全的, 不会出现奇怪的问题导致大爆炸, 安装失败. 这件事十分困难, 尤其是装到一半 308 电费恰巧用完了...



## 关于如何配置 LUKS, Secure Boot 和 TPM

大体上的配置方式就是按照安装教程来的. [官方的教程](https://wiki.archlinux.org/title/Dm-crypt/Encrypting_an_entire_system) 是 *对* 的, 但是我感觉有些大坑. 首先是别看中文教程, 它可能比英文的要旧...... 然后在这个教程里面, 我本来是打算按照 [LVM on LUKS](https://wiki.archlinux.org/title/Dm-crypt/Encrypting_an_entire_system#LVM_on_LUKS) 装, 由于第一次装没成功, 装第二次的时候用了 [LUKS on a partition with TPM2 and Secure Boot](https://wiki.archlinux.org/title/Dm-crypt/Encrypting_an_entire_system#LUKS_on_a_partition_with_TPM2_and_Secure_Boot), 后来捣鼓了一阵子之后成功了, 就懒得再动了.

整体的解决方案如下 (初始状态把 Secure Boot 关了):

1. 分出 EFI 分区, 然后剩下一个分区全盘加密 LUKS, 分区类型用 `8304`, 这样 Systemd-Boot 可以自动找到这个分区来启动. (不过我还是选择了手动指定, 主要是因为一开始找不到 Rootfs).

2. 给 LUKS 挂载上去之后格式化为 btrfs (对, 这也是新东西, 之前我是用的 ext4), 然后挂载

3. 然后在 "Configuring mkinitcpio" 里面写到, 

   > If using the default busybox-based initramfs, add the `keyboard` and `encrypt` hooks to [mkinitcpio.conf](https://wiki.archlinux.org/title/Mkinitcpio.conf). If you use a non-US console keymap or a non-default console font, additionally add the `keymap` and `consolefont` hooks, respectively.
   >
   > ```
   > HOOKS=(base udev autodetect microcode modconf kms keyboard keymap consolefont block encrypt filesystems fsck)
   > ```
   >
   > If using a systemd-based initramfs, instead add the `keyboard` and `sd-encrypt` hooks. If you use a non-US console keymap or a non-default console font, additionally add the `sd-vconsole` hook.
   >
   > ```
   > HOOKS=(base systemd autodetect microcode modconf kms keyboard sd-vconsole block sd-encrypt filesystems fsck)
   > ```
   >
   > [Regenerate the initramfs](https://wiki.archlinux.org/title/Regenerate_the_initramfs) after saving the changes. See [dm-crypt/System configuration#mkinitcpio](https://wiki.archlinux.org/title/Dm-crypt/System_configuration#mkinitcpio) for details and other hooks that you may need.

   这里给几个有变动的东西加粗了. 但是实际上在默认情况下的 HOOKS 和两者 *都不一样*, 而且和把所有加粗的东西去掉的情况 *也不一样*. 于是我当时是懵的. 同时由于我不敢随意删现有的钩子, 本着 "各个钩子 *应该* 是兼容的" 的想法, 我把能加的钩子都加上了. 但是实际上 **`udev` 和 `systemd` 这两个钩子是不兼容的**, 两个都加 **没有兼容性提示**, 但是 systemd 不 work, 实际上是用 busybox 模式启动的. 在这样的情况下, `sd-encrypt` 钩子也不生效, 启动的时候没有 LUKS 解密的 prompt. 后来删掉 udev 钩子之后 mkinitcipo 的时间显著变长了, 这些钩子才生效.

4. 改成 UKI 模式启动, 生成 UKI 镜像, 安装 Systemd-Boot

5. 按照正常方式装完, **但是** 要额外安装包括 `intel-ucode`, `btrfs-progs` 等几个包 (别忘了)

6. 重启, 开 Secure Boot, 进 Setup Mode, 开始进行 Secure Boot 的初始化. 按照 [Assisted process with sbctl](https://wiki.archlinux.org/title/Unified_Extensible_Firmware_Interface/Secure_Boot#Assisted_process_with_sbctl) 的方法新建 Secure Boot CA, 把需要签名的都签上

7. 再重启, 这时候 Secure Boot 应该生效了, 然后按 [Enrolling the TPM](https://wiki.archlinux.org/title/Dm-crypt/Encrypting_an_entire_system#Enrolling_the_TPM) 设置 TPM (但是这其实是不完全安全的, 参考[Bypassing disk encryption on systems with automatic TPM2 unlock](https://oddlama.org/blog/bypassing-disk-encryption-with-tpm2-unlock/), 解决方案参考 [Arch Wiki](https://wiki.archlinux.org/title/Systemd-cryptenroll#Trusted_Platform_Module), 要求 TMP PCR 15 为 0 即可. 此时解密后 PCR 15 改变, 密钥随即失效.)



## 我 TPM 差点炸了...

在写前面一条的时候, 我打算按照标准操作做一下, 于是使用

```sh
systemd-cryptenroll /dev/nvme0n1p2 --wipe-slot=empty --tpm2-device=auto --tpm2-pcrs=7+15:sha256=0000000000000000000000000000000000000000000000000000000000000000
```

然后提示我输密码. 我输了密码发现怎么不对!!! 此时我很慌, 突然想起上次 enroll 的时候 `--wipe-slot=all` 了, 给我把密码干没了, 现在只能用 TPM 进去了. 好在一开始 Enroll 的时候没有绑定 PCR, 所以现在是可以正常解锁的. 经过短时间的搜索之后放弃, 查文档有 `--unlock-tpm2-device auto` 尝试从 TPM 解锁, 遂速速重新建立 Recovery Key

```sh
systemd-cryptenroll --recovery-key /dev/nvme0n1p2 --unlock-tpm2-device
```

然后执行

```sh
systemd-cryptenroll /dev/nvme0n1p2 --wipe-slot=empty --tpm2-device=auto --tpm2-pcrs=7+15:sha256=0000000000000000000000000000000000000000000000000000000000000000 --unlock-tpm2-device auto
```

此后再次尝试使用 TPM 解锁失败, 说明 PCR 正确生效.



## 桌面环境

然后基本可用之后就开始选择桌面环境了. ada 给我强推了 [niri](https://github.com/YaLTeR/niri), 我先装了这个. 不过吧, 装上去之后发现有一坨问题, 包括但不限于

- 很多符号是框框, 因为没装 `noto-fonts-emoji` 和 `ttf-fonts-awesome`, 符号没有对应的字符
- 亮度按键和音量按键用不了, 不知道是不是少装了什么插件
- ......

而这些都不是 Blocking Issue. 后来发现的 Blocking Issue 是, 我想用 Wayland (不然 150% 或者 175% 缩放太折磨了),  但即便我加了一坨参数, 我的 VSCode 里面还是出不来中文字, Typora 也是. 在搜索解决方案无果后, 我放弃了, 安装了 KDE Plasma. 而 KDE 在原生解决了一些问题之后又带来了一些新的问题, 主要是 KDE 啥都想管而我不确定它到底管什么, 于是出现了我额外安装的软件和 KDE 抢夺控制权的奇怪问题. 这是后话.



## 睡眠和休眠

接下来的最重要的事情是睡眠和休眠, 毕竟是笔记本, 睡眠还是十分重要的. 我的 UEFI 汇报了对 mem_sleep 中 s2idle 和 deep 的支持. deep (s3) 更省电, 所以我 Prefer deep. 于是我需要测试 deep 是否可用. 结果是不可用 - 只要开 deep, 睡眠后电脑就再也无法唤醒. 中间还有个插曲, tlp (电源管理软件) 自动覆盖了离店状态下用 deep 睡眠, 导致对 sysfs 的修改不生效, 在 /etc/systemd/sleep.conf 的修改也不生效, 害我调试了半天.

确认 deep 无法使用且 s2idle 可用后, 下一步是休眠. 休眠需要 swapfile 或 swap 分区. 显然我现在只有 swapfile 一种选择. 好在对于 btrfs + systemd boot, 在比较新的时候的支持已经相当好, 创建一个 swapfile 之后往 fstab 里面一写, 别的啥也不用干就能自动识别并使用了. 在简单测试无误之后我就进入了下一步.

睡眠后休眠 (suspend-then-hibernate) 是一个更好的选择, 在 Windows 的支持很好, 盒盖先睡眠, 如果 30min 你没用电脑, 电脑会自动 Wakeup 并进入休眠状态. 我在 systemd 里面配置好之后测试, 结果第二天早上起来发现电脑并没有休眠. 一想, 又是 KDE 接管了. 于是去网上查 KDE 怎么改这个, 网上说

>  you have the *checkbox* "**While asleep, hibernate after a period of inactivity**".

对, 我找到的资料都说这是一个 CheckBox. 于是我打开电源选项找了半天, 没有这个 CheckBox...

然后我很生气, 又去刨了一遍, 才发现有一个 DropDownList, prompt 是

> When sleeping, enter: [Standby]

点一下 Standby 会弹出第二个选项是 "Standby, then hibernate". 我真无语. 换过来之后有时候会出现醒过来之后 KDE 卡死的情况... 考虑到 32GB 内存本来休眠就有点狗屎, 我干脆放弃休眠了.

另外, 从休眠中唤醒的时候我的键盘的背光还出现了失控的现象, 后来发现需要重载 asus-nb-wmi 内核模块才能恢复. 应该是从休眠中恢复是一个 Blocking 的过程, 导致键盘背光驱动挂起超时了.



## Btrfs

然后是 Btrfs. 用都用了, 不自动快照啥的显得很没面子 (不是). 记得 swapfile 要单独扔进一个 subvolume 不然会影响快照. 然后用 snapper 就行. 我把 /home 单独拆出来一个 subvolume, 这样万一滚炸了啥的不用回滚 /home; 万一误删文件或者啥的也不用回滚 / (虽然大多数时候并不需要回滚, 直接挂载之后把东西找回来就行).

但是 snapper 创建了一个 cron job; 但是 Arch Linux 默认是没有 cron 的, 于是要先安装 anacron. (说实话, 我很不喜欢这种行为, 这和悬垂依赖有什么区别???) 就是装了不知道为啥用不了, 还得一个个 debug. 还有经典装很多 Daemon 都不自动启用.

然后对于可能需要的 rebalance 操作, 我的目前做法是没管 (笑).



## 电源管理和性能调节

然后是例行的 tlp 时间, 也没啥好讲的, 就是调一调离电性能. 唯一要说的是 ` CPU_DRIVER_OPMODE_ON_BAT=active`, 因为改成 passive 之后实在是太慢了 ()



## 备份大聪明

然后弄完之后就要考虑恢复重要数据和开发环境了. 之前想了想发现唯一重要的数据疑似是 .ssh 文件夹里面的一堆私钥, 别的都可有可无. 于是我当时 tar 了 .ssh 和我的内网 VPN 文件 /etc/tinc (别问, 问就是 Windows 上的 Kali 虚拟机) 然后发到了我的 PC 上, 想着重装完了再 scp 下来就行.

**那我问你: *重装完了你怎么连上你的台式机呢我请问了?***

然后我就愉快地前往 Microsoft Account 复制了 Bitlocker 恢复密钥, 然后解密并 recover 了我的登录台式机的私钥, 然后拿我的开了密码登录的服务器当跳板连到我的台式机, 然后把备份文件下载了下来 (抽象完了属于是).



## 和 Electron 斗智斗勇

最后遇到的一些问题还是输入法, 基于 Elecrton 的输入法在 Electorn 上面用不了, 总是要加参数

```sh
--enable-wayland-ime --ozone-platform=wayland
```

然后 Mailspring 加了参数还爆炸打不开了, 最后也用不了输入法. 不管啦 (((



## 尾声 (?)

目前看来纯 Linux 还是比 Windows 套 Linux 好用多了xs, 至少大部分米奇妙妙小工具我都能无缝安装. 摄像头, 麦克风, 扬声器都能用 (可惜禁用摄像头那个键用不了, 不过平常也不用就是)

