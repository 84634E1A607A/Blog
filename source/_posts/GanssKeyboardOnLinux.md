---
updated: 2025-03-23 00:48:09
title: 买了个机械键盘 - GANSS (高斯) GS3104T Pro on Linux (我 F1 炸了!)
date: 2025-03-12 18:56:26
description: 本文记录了在 Linux 系统上配置 GANSS GS3104T Pro 机械键盘的过程，分析了 F1 键失效的原因，并提供了解决方案及相关调试经验。
tags:
  - 技术
  - Linux
---



自从我用过了机械键盘, 把工位搬到 FIT 楼丢失了机械键盘的 Access 后, 我就无比想念机械键盘, 觉得之前用的罗技的入门级无线键鼠套装简直就是脑残. 每一次敲击的手感都不太一样, 有时候觉得按下去了但是卡了一下, 就没有成功按下去. 因此我十分绷不住, 遂花 250 元购买了 GANSS GS3104T Pro. (为什么要强调这个型号呢? 欸 🤪) 到货之后开始测试, 本来觉得不错, 结果打开 Keyboard Test 网页之后发现 F1 怎么没用? 故作此.



<!-- more -->



## TL, DR:

```sh
echo 0 > /sys/module/hid_apple/parameters/fnmode

# To make change persistent
echo "options hid_apple fnmode=0" | tee /etc/modprobe.d/hid_apple.conf
update-initramfs -u
```



## 客服是不会的

我先去问了一下客服, 但淘宝的客服对于这些莫名其妙的问题 (尤其是 Linux 有关) 一贯是一问三不知的. 不过客服确实是给了一个链接, 官网有说明书 (主要是为了方便配置这个键盘的各种灯光功能) 和固件 (但是是 Exe 所以要 Windows 刷写).



## 初步定位

于是在 Linux 上无效, 我转而去 Windows 上刷固件. 在 Windows 上, 这个键盘的功能是正常的. 这至少排除了硬件问题 (毕竟我还没确认收货, 万一真的有硬件问题当然是马上退货). 刷完固件之后还是不行, 我只好开始了漫长 (3h 左右) 的 Debug 过程. 首先, 我们确认了这是一个 Linux 有关的, 大概率是驱动问题.



## Scancode

对于键盘这类输入设备而言, 我们有好几种码. 首先是最底层的扫描码 (Scancode), 我用 Wireshark 抓 USB RAW 包确认了它的 F1 键和正常键盘 F1 键返回的扫描码看上去是一样的, 都是 `0x7003a`. 但是用 `evtest` 命令得到的结果显示, 首先, 系统收到了正确的扫描码; 但是紧接着认为按下的键是 `BRIGHTNESS_DOWN` 降低亮度这个键.

```text
Event: time 1741778594.217509, -------------- SYN_REPORT ------------           
Event: time 1741778595.588414, type 4 (EV_MSC), code 4 (MSC_SCAN), value 7003a 
Event: time 1741778595.588414, type 1 (EV_KEY), code 224 (KEY_BRIGHTNESSDOWN), value 1
```

于是我去问 GPT 和 DeepSeek. 两个的回答里面都提到了让我把这个键盘的 USB VendorID 啥的记录一下, 然后去 hwdb 里面改默认映射.

我于是检查了 journal, 插入键盘的记录如下:

```journal
Mar 12 19:25:50 Ajax-PC kernel: usb 3-1: new full-speed USB device number 7 using xhci_hcd
Mar 12 19:25:50 Ajax-PC kernel: usb 3-1: New USB device found, idVendor=05ac, idProduct=024f, bcdDevice= 1.05
Mar 12 19:25:50 Ajax-PC kernel: usb 3-1: New USB device strings: Mfr=1, Product=2, SerialNumber=0
Mar 12 19:25:50 Ajax-PC kernel: usb 3-1: Product: GS3104T PRO
Mar 12 19:25:50 Ajax-PC kernel: usb 3-1: Manufacturer: HFD
Mar 12 19:25:50 Ajax-PC kernel: input: HFD GS3104T PRO as /devices/pci0000:00/0000:00:1c.0/0000:04:00.0/usb3/3-1/3-1:1.0/0003:05AC:024F.0015/input/input59
Mar 12 19:25:51 Ajax-PC kernel: apple 0003:05AC:024F.0015: input,hidraw0: USB HID v1.11 Keyboard [HFD GS3104T PRO] on usb-0000:04:00.0-1/input0
Mar 12 19:25:51 Ajax-PC kernel: apple 0003:05AC:024F.0016: Fn key not found (Apple Wireless Keyboard clone?), disabling Fn key handling
Mar 12 19:25:51 Ajax-PC kernel: input: HFD GS3104T PRO as /devices/pci0000:00/0000:00:1c.0/0000:04:00.0/usb3/3-1/3-1:1.1/0003:05AC:024F.0016/input/input60
Mar 12 19:25:51 Ajax-PC kernel: apple 0003:05AC:024F.0016: input,hiddev0,hidraw1: USB HID v1.11 Keyboard [HFD GS3104T PRO] on usb-0000:04:00.0-1/input1
Mar 12 19:25:51 Ajax-PC kernel: apple 0003:05AC:024F.0017: hiddev1,hidraw2: USB HID v1.11 Device [HFD GS3104T PRO] on usb-0000:04:00.0-1/input2
Mar 12 19:25:51 Ajax-PC mtp-probe[23552]: checking bus 3, device 7: "/sys/devices/pci0000:00/0000:00:1c.0/0000:04:00.0/usb3/3-1"
Mar 12 19:25:51 Ajax-PC mtp-probe[23552]: bus: 3, device: 7 was not an MTP device
Mar 12 19:25:51 Ajax-PC systemd-logind[1352]: Watching system buttons on /dev/input/event4 (HFD GS3104T PRO)
Mar 12 19:25:51 Ajax-PC systemd-logind[1352]: Watching system buttons on /dev/input/event5 (HFD GS3104T PRO)
Mar 12 19:25:51 Ajax-PC mtp-probe[23575]: checking bus 3, device 7: "/sys/devices/pci0000:00/0000:00:1c.0/0000:04:00.0/usb3/3-1"
Mar 12 19:25:51 Ajax-PC mtp-probe[23575]: bus: 3, device: 7 was not an MTP device

```

眼尖的已经发现了, 这里出现了 **`apple 0003:05AC:024F.0016: Fn key not found (Apple Wireless Keyboard clone?), disabling Fn key handling`**. 同时 `evtest` 给出

```text
Input driver version is 1.0.1
Input device ID: bus 0x3 vendor 0x5ac product 0x24f version 0x111
Input device name: "HFD GS3104T PRO"
```

而我并没有意识到这意味着什么.

于是把 bus, vendor, product 丢给 DS 让他生成 hwdb 文件. DS 在思考的时候也蹦出一个 Apple. 我拿到了生成的文件之后 Apply 配置, 重启, 发现问题依旧. 此时我被绕进去了, 导致错失良机 (?).



## Hwdb 怎么不管用

这时候我就发现, 怎么修改 hwdb 不管用呢? 我照葫芦画瓢改了我正常键盘的映射, 结果是管用的. 这就更奇怪了!

这时候我 ~~就~~ 才开始猜想, 一定是什么驱动和这个键盘打架了. 我问 GPT 能不能让 Linux 觉得这个键盘是罗技的, 但是 GPT 说不行, 因为 USB Vendor ID 改不了. 那一定是什么乱糟糟的东西优先级比 Udevd 低 (所以后执行了) 给这个覆写了. 那么是什么呢? 我又去问 GPT, 可能是什么东西和 hwdb 起冲突了导致不生效. ChatGPT 给了一坨东西, 其中就包括 `hid_apple` 模块. 我想着, 这玩意和 Apple 半毛钱关系没有, 这怎么能冲突的了啊, 于是 `lsmod | grep apple`, 怎么还真有🤨? 于是 `rmmod hid_apple`, 我键盘怎么没了🧐? 于是 modprobe, 怎么回来了?????

结果还真是 Linux 把这个键盘当苹果键盘了... 而苹果键盘有个 Fn 键, Linux 驱动觉得这个键是默认按下的, F1 就被 `hid_apple` 驱动给 map 到 BRIGHTNESSDOWN 了. 知道这个之后就好说了, 有:

```sh
ls /sys/module/hid_apple/parameters/
fnmode  iso_layout  swap_ctrl_cmd  swap_fn_leftctrl  swap_opt_cmd
```

于是

```sh
echo 0 > /sys/module/hid_apple/parameters/fnmode

# To make change persistent
echo "options hid_apple fnmode=0" | tee /etc/modprobe.d/hid_apple.conf
update-initramfs -u
```



## 为啥要有这篇文章

问就是我上网搜没搜到方案, 于是需要造福一下后人 (雾)

其实是键盘刚到想打点字感受一下手感

(Ganss 能不能给我打钱 (不是))



## P.S.

`lsusb`:

```text
Bus 003 Device 008: ID 05ac:024f Apple, Inc. Aluminium Keyboard (ANSI)
```

