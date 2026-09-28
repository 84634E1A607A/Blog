---
title: 只有风扇 - 调教国鑫 AS4110G-D04R-G3 服务器的风扇
updated: 2026-09-28 15:21:28
date: 2026-09-28 11:37:32
description: "本文记录对国鑫 AS4110G-D04R-G3 服务器风扇控制机制的逆向与改造：通过分析 BMC 的 IPMI 动态库、APML NetFn 与 ARMv6 执行环境，在废弃的 APML 命令中植入基于 KCS 的 In-band Shell，实现宿主机直接执行 BMC 命令；进一步利用现有 Gooxi OEM IPMI 接口控制 SYS FAN，并定位 I2C bus 13 上的 NCT7904D 风扇控制器，通过寄存器读写实现 FIB/GPU 风扇自动、手动模式及 PWM 转速控制，最终获得无需 SSH 和网络访问的完整带内 BMC 调试与风扇控制能力。"
tags:
  - 运维
  - 逆向工程
---

书接上回, 我 {% post_link GooxiAS4110GServer "暴打了我们 4090 48G 服务器的 BMC" %}. 之后, 我觉得不爽, 凭什么我没法控制机箱的 GPU 风扇? 而且, 凭什么这垃圾 BMC 的 SSH 有 sysadmin 登录可以执行 shell 命令, 而我在系统里却只能憋屈地用 ipmitool 里面的一大坨? 这太气人了! 于是乎, 我让 Agent 整了点大活, 认真调教了一下服务器的风扇.

<!-- more -->

## In-band Shell

虽然 Agent 抱怨了, 说这不就是开后门吗! 但是他还是干了.

### What to Target

既然要做 In-band Shell, 那就意味着要在 `ipmitool raw xxx` 里面塞一条能用于执行 `sh -c` 的命令. 怎么做呢? 自然能联想到, 要么加一条命令, 要么把现有的命令改一条.

BMC 的文件系统是一个三个区的 SPI Flash, 总共 30M. 其中, 大头是 `root`, 只读, 有 20M 左右, 是 BMC 的本体; 另有一个 2M 左右的只读 `www` 分区存放 BMC 网页, 能持久化写入的只有一个 960KB 的 `conf` 分区, 挂载在 `/conf` 上.

BMC 用 SysV init, 启动的时候, 先挂载 `/conf`, 然后启动 IPMIMain, 之后进入 rc3 拉起 ssh, 最后拉起 cron. 整个启动链条中, cron conf 位于配置区, 可以持久化, 且允许通过 `@reboot` 执行任意自定义命令. 也就是说, 存在一条通路, 能持久化我们想要的修改.

IPMIMain 能静态和动态加载库. 其中, 底层的分发库 `libipmimsghndlr` 在编译期链接进 IPMIMain, 而 `/usr/local/lib/ipmi/` 下存在不少动态链接库文件, IPMIMain 会依次加载, 然后根据 `/conf/BMC/IPMI.conf` 里面的配置决定是否要启用.

因此, 可以据此给出三条可能的技术路线: 首先是写一个新的 so 并注册模块; 修改一个现有的 so 增加一个命令, 或者修改一个现有的 so 覆盖一条命令.

我首先让 Agent 检查了新增动态库的可行性. Agent 指出, 由于 `/usr/local/lib/ipmi/` 目录只读, 没办法新增文件; 而 bind mount 整个文件夹则需要往 shmem 里面扔整个文件夹, 不太优雅. 同时, `rootfs` 里面写死了一个 netfn --> handler 的表, 这个表不好改, 也不容易增加项.

于是问题转向了修改哪个现成链接库.

Agent 首先选定了 `0x2a 0x00 SetDebugLevel`, 位于 `libipmipdkcmds.so`. 但是当时发现了几个问题: 其一, `0x2a` 上面还管着一些东西, 比如风扇啥的, 没那么好; 其二, 这个库的 `LOAD#1` 只读区间紧挨着 `LOAD#2` 读写区间, patch 起来有一些风险.

我当时觉得不够好. 考虑到有一个 netfn `0x39` 的系列在 host 上压根没发调用, 位于 `libipmiamioemscorpiocmds.so.2.1.0`, 我当时提出把 `0x39` 换成 `0x38` 使用. 但是在检索后发现, 尽管在 host 上无法调用, 但是在 BMC 内部, 这些 netfn 还是有 caller 的.

于是, 我把目光放在另一组 `0x36 APML` 功能上. 由于 APML 是 AMD 平台的功能, 我们是 Intel 平台, 所以这一组功能无论如何也用不上. 我让 Agent 确认, 其给出, 整组功能没有任何 caller, 可以覆盖. 而且, `libipmiapml.so.4.1.0` 这个 so 的 0x1A74 - 0x1FFF 区间是全 0, 正好给出了一段 1420B 的可以 patch 的区间.

### What to Build

我让 Agent 在这个区间里面塞了一个 "会话式 Shell 执行器", 类似交换机 SNMP 的那种: 支持四种操作, START 启动一个新命令, READ 读出 stdout / stderr, KILL 停止一个命令, STATUS 列出所有当前追踪的命令. 然后, 为了提前测试这个程序, Agent 写了一个 c 的测试器, 和一个 Python 的客户端. 这之后, 我又让 Agent 写了一个 Python 脚本 `bmc_sh` 来获得与直接用 shell 调用命令差不多的体验.

### What Agent Builds

Agent 首先手搓了一大段 ARM Assembly... 这玩意要是我写, 我至少得写一个星期:

{% fold "巨大的 Assembly 和 linker script" %}

```c
/* Link the blob at the exact virtual address of the zero cave in libipmiapml.so.4.1.0.
 * LOAD#0 has p_offset == p_vaddr == 0, so file offset == virtual address here. */
OUTPUT_FORMAT("elf32-littlearm")
OUTPUT_ARCH(arm)
ENTRY(blob_entry)

SECTIONS
{
  . = 0x1A74;
  .text : {
    *(.text*)
    *(.rodata*)
  }

  /DISCARD/ : {
    *(.ARM.exidx*)
    *(.ARM.attributes)
    *(.ARM.extab*)
    *(.comment*)
    *(.note*)
    *(.eh_frame*)
  }
}
```

```asm
/*
 * oem_blob.S — session-based shell executor, injected into libipmiapml.so.4.1.0
 *
 * Replaces the execution logic of netfn 0x36 (APML), cmd 0x01. Reached by overwriting the
 * first instruction of ApmlGetInterfaceVersion (file/vaddr 0xE9C) with `b 0x1A74`.
 *
 * Wire protocol (request is self-delimiting — the plugin ABI does NOT pass a request length
 * in r1, so we can never rely on it):
 *
 *   request   A5 <op> <arglen> <args...>
 *   response  cc flags sid pid[4,BE] n data[n]      (STOP/READ/KILL)
 *             cc count {sid flags}[count]           (STATUS)
 *   errors    cc only (1 byte)
 *
 *   op 0x01 START   args = shell command (arglen bytes, no NUL required)
 *   op 0x02 READ    args = sid             -> up to MAXREAD bytes + flags
 *   op 0x03 KILL    args = sid
 *   op 0x04 STATUS  args = none
 *
 *   flags: bit0 MORE (a full MAXREAD block was returned), bit1 EXITED, bit2 FAILED
 *
 * Entry ABI (derived statically and confirmed live at T0):
 *   r0 = request data ptr, r2 = response data ptr (cc goes at resp[0]), r3 = channel,
 *   lr = return address, return value in r0 = total response length INCLUDING the cc byte.
 *
 * No libc. Every primitive is a raw ARM EABI syscall (r7 = number, svc #0).
 * All internal addressing is PC-relative off r11, set at entry by `adr r11, blob_entry`.
 * r4-r11 are preserved across syscalls by the kernel and hold all live state.
 */

    .syntax unified
    .arm
    .arch armv6
    .text

/* ---- link-time layout constants (asserted by build.sh) ---- */
    .equ BLOB_VADDR,   0x1A74          /* where this blob is linked */
    .equ STATE_VADDR,  0x12C00         /* session table, from the extended LOAD#1 .memsz */

/* ---- syscalls (ARM EABI) ---- */
    .equ NR_fork,       2
    .equ NR_read,       3
    .equ NR_close,      6
    .equ NR_execve,     11
    .equ NR_kill,       37
    .equ NR_pipe,       42
    .equ NR_fcntl,      55
    .equ NR_dup2,       63
    .equ NR_wait4,      114
    .equ NR_exit_group, 248

    .equ F_SETFL,       4
    .equ O_NONBLOCK,    0x800
    .equ WNOHANG,       1
    .equ SIGKILL,       9

/* ---- protocol ---- */
    .equ MAGIC,         0xA5
    .equ OP_START,      1
    .equ OP_READ,       2
    .equ OP_KILL,       3
    .equ OP_STATUS,     4

    .equ CC_OK,         0x00
    .equ CC_BUSY,       0xC0
    .equ CC_BADCMD,     0xC1
    .equ CC_BADLEN,     0xC7
    .equ CC_SID,        0xC9
    .equ CC_FAIL,       0xCF
    .equ CC_INACTIVE,   0xD5            /* what the original cmd returned on this Intel box */

    .equ MAXCMD,        176             /* command string bytes accepted */
    .equ MAXREAD,       160             /* payload bytes per READ (8 + 160 = 168 total) */
    .equ NSLOTS,        8
    .equ FRAME,         256

/* stack frame offsets (sp-relative once the frame is allocated) */
    .equ F_FDRD,        0
    .equ F_FDWR,        4
    .equ F_BASE,        8
    .equ F_ARGV,        12
    .equ F_ENVP,        28
    .equ F_CMD,         64

    .global blob_entry
/* ------------------------------------------------------------------ */
blob_entry:
    push    {r4-r11, r12, lr}           @ 40 bytes, keeps sp 8-aligned
    sub     sp, sp, #FRAME
    mov     r10, r0                     @ r10 = request
    mov     r9,  r2                     @ r9  = response
    adr     r11, blob_entry             @ r11 = runtime base of this blob
    str     r11, [sp, #F_BASE]
    ldr     r12, .Lstate_off
    add     r11, r11, r12               @ r11 = &session table

    bl      sweep                       @ reap any children that already died

    ldrb    r4, [r10]
    cmp     r4, #MAGIC
    bne     .Lno_magic
    ldrb    r4, [r10, #1]
    cmp     r4, #OP_START
    beq     .Lstart
    cmp     r4, #OP_READ
    beq     .Lread
    cmp     r4, #OP_KILL
    beq     .Lkill
    cmp     r4, #OP_STATUS
    beq     .Lstatus
    mov     r0, #CC_BADCMD
    b       .Lret_cc

/* No magic byte: behave exactly as the command did before we took it over, so anything
 * that still pokes 0x36/0x01 out of habit sees the same answer it always got. */
.Lno_magic:
    mov     r0, #CC_INACTIVE
.Lret_cc:
    strb    r0, [r9]
    mov     r0, #1
    b       .Ldone

.Lbad_len:
    mov     r0, #CC_BADLEN
    b       .Lret_cc
.Lbad_sid:
    mov     r0, #CC_SID
    b       .Lret_cc

/* ------------------------------------------------------------------ */
/* sweep — reap any slot whose fd is already closed but whose pid lingers.
 * Slots are {u32 fd; u32 pid}, 8 bytes each; pid == 0 means free.
 * Clobbers r0-r8, r12. Preserves r9, r10, r11. */
sweep:
    mov     r4, #0
.Lsw_loop:
    add     r5, r11, r4, lsl #3
    ldr     r6, [r5, #4]                @ pid
    cmp     r6, #0
    beq     .Lsw_next
    ldr     r8, [r5]                    @ fd
    cmn     r8, #1                      @ fd == -1 ?
    bne     .Lsw_next                   @ still open -> live, leave alone
    mov     r0, r6
    mov     r1, #0
    mov     r2, #WNOHANG
    mov     r3, #0
    mov     r7, #NR_wait4
    svc     #0
    cmp     r0, r6
    bne     .Lsw_next                   @ not reaped yet, retry on a later call
    add     r5, r11, r4, lsl #3
    mov     r6, #0
    str     r6, [r5]                    @ fd  = 0
    str     r6, [r5, #4]                @ pid = 0  -> free
.Lsw_next:
    add     r4, r4, #1
    cmp     r4, #NSLOTS
    blt     .Lsw_loop
    bx      lr

/* ------------------------------------------------------------------ */
/* put_hdr — r1 = flags, r2 = sid, r3 = pid; writes the 8-byte header and returns 8. */
put_hdr:
    mov     r0, #CC_OK
    strb    r0, [r9]
    strb    r1, [r9, #1]
    strb    r2, [r9, #2]
    strb    r3, [r9, #3]                @ pid, big-endian
    lsr     r0, r3, #8
    strb    r0, [r9, #4]
    lsr     r0, r3, #16
    strb    r0, [r9, #5]
    lsr     r0, r3, #24
    strb    r0, [r9, #6]
    mov     r0, #0
    strb    r0, [r9, #7]                @ n = 0
    mov     r0, #8
    bx      lr

/* ================================================================== */
.Lstart:
    ldrb    r4, [r10, #2]               @ arglen
    cmp     r4, #0
    beq     .Lbad_len
    cmp     r4, #MAXCMD
    bhi     .Lbad_len

    @ find a free slot
    mov     r4, #0
.Lst_find:
    add     r5, r11, r4, lsl #3
    ldr     r6, [r5, #4]
    cmp     r6, #0
    beq     .Lst_found
    add     r4, r4, #1
    cmp     r4, #NSLOTS
    blt     .Lst_find
    mov     r0, #CC_BUSY
    b       .Lret_cc
.Lst_found:
    mov     r8, r4                      @ r8 = slot index

    mov     r0, sp
    mov     r7, #NR_pipe
    svc     #0
    cmp     r0, #0
    blt     .Lst_fail

    mov     r7, #NR_fork
    svc     #0
    cmp     r0, #0
    blt     .Lst_fork_fail
    beq     .Lchild
    mov     r6, r0                      @ parent: r6 = child pid

    ldr     r0, [sp, #F_FDWR]           @ close the write end
    mov     r7, #NR_close
    svc     #0

    ldr     r0, [sp, #F_FDRD]           @ read end -> O_NONBLOCK (hard requirement)
    mov     r1, #F_SETFL
    ldr     r2, .Lo_nonblock
    mov     r7, #NR_fcntl
    svc     #0

    add     r5, r11, r8, lsl #3
    ldr     r4, [sp, #F_FDRD]
    str     r4, [r5]                    @ slot.fd
    str     r6, [r5, #4]                @ slot.pid

    mov     r1, #0
    add     r2, r8, #1                  @ sid = index + 1
    mov     r3, r6
    bl      put_hdr
    b       .Ldone

.Lst_fail:
    mov     r0, #CC_FAIL
    b       .Lret_cc

.Lst_fork_fail:
    ldr     r0, [sp, #F_FDRD]           @ tidy up the pipe we just made
    mov     r7, #NR_close
    svc     #0
    ldr     r0, [sp, #F_FDWR]
    mov     r7, #NR_close
    svc     #0
    mov     r0, #CC_FAIL
    b       .Lret_cc

/* ---- child ---- */
.Lchild:
    ldr     r0, [sp, #F_FDRD]           @ drop the read end
    mov     r7, #NR_close
    svc     #0

    ldr     r0, [sp, #F_FDWR]
    mov     r1, #1
    mov     r7, #NR_dup2
    svc     #0
    ldr     r0, [sp, #F_FDWR]
    mov     r1, #2
    mov     r7, #NR_dup2
    svc     #0

    ldr     r0, [sp, #F_FDWR]
    cmp     r0, #2
    ble     .Lch_nocw
    mov     r7, #NR_close
    svc     #0
.Lch_nocw:

/* Close stdin too. It is not "1 and 2 are enough": fd 0 is the one descriptor
 * the loop below deliberately skips, and on the live box IPMIMain's fd 0 is a
 * pipe -- not the /dev/null a daemon is supposed to leave behind:
 *
 *     /proc/7573/fd/0 -> pipe:[43477]
 *
 * so a child that keeps it is a phantom holder of a daemon pipe, exactly the
 * class of leak this whole block exists to eliminate. It is also a live stdin:
 * a command that reads it (`cat` with no arguments) would block on the daemon's
 * pipe forever, and the session would sit there holding its slot until the
 * client gave up -- a hang the client cannot distinguish from a slow command.
 * Closing it makes such a read fail immediately instead. */
    mov     r0, #0
    mov     r7, #NR_close
    svc     #0

/* Close every descriptor inherited from IPMIMain. This is not tidiness.
 *
 * The daemon holds ~50 FIFOs under /var (MsgHndlrQKCS*, RcvMsgQ*, ipmiReqQ) as
 * its internal message plumbing between the KCS interface and the command
 * handler. Without this, every command we run carries copies of them across
 * exec, which breaks FIFO open/close accounting for the whole daemon:
 *
 *   - while a child lives it is a phantom holder, so the daemon's peers never
 *     see EOF and block -- "command backlog";
 *   - when a child dies it removes the last holder of an end, and whoever is
 *     writing that end takes SIGPIPE;
 *   - a child that outlives its session (an abandoned START, or an orphan left
 *     behind by an IPMIMain restart) holds them *forever*, so the backlog never
 *     clears without a BMC reboot.
 *
 * Observed on 2026-09-27/28: the daemon stopped answering the watchdog command
 * for ~59 minutes while the stack otherwise looked healthy and no mount was in
 * place. The pipe we make ourselves is handled above; everything else is this. */
    mov     r5, #3
.Lch_clfds:
    mov     r0, r5
    mov     r7, #NR_close
    svc     #0
    add     r5, r5, #1
    cmp     r5, #256
    blt     .Lch_clfds

.Lch_copy:                              @ copy the command into our frame and NUL-terminate it
    ldrb    r4, [r10, #2]               @ arglen
    add     r5, sp, #F_CMD
    add     r6, r10, #3
    mov     r2, #0
.Lch_cl:
    cmp     r2, r4
    bcs     .Lch_done
    ldrb    r3, [r6, r2]
    strb    r3, [r5, r2]
    add     r2, r2, #1
    b       .Lch_cl
.Lch_done:
    mov     r3, #0
    strb    r3, [r5, r2]

    ldr     r11, [sp, #F_BASE]          @ strings live at base + (label - BLOB_VADDR)

    ldr     r3, .Lsh_off
    add     r3, r11, r3
    str     r3, [sp, #F_ARGV+0]         @ argv[0] = "sh"
    ldr     r3, .Ldc_off
    add     r3, r11, r3
    str     r3, [sp, #F_ARGV+4]         @ argv[1] = "-c"
    str     r5, [sp, #F_ARGV+8]         @ argv[2] = command
    mov     r3, #0
    str     r3, [sp, #F_ARGV+12]        @ argv[3] = NULL

    ldr     r3, .Lenv_off
    add     r3, r11, r3
    str     r3, [sp, #F_ENVP+0]
    mov     r3, #0
    str     r3, [sp, #F_ENVP+4]

    ldr     r0, .Lshpath_off
    add     r0, r11, r0
    add     r1, sp, #F_ARGV
    add     r2, sp, #F_ENVP
    mov     r7, #NR_execve
    svc     #0

    mov     r0, #127                    @ execve failed
    mov     r7, #NR_exit_group
    svc     #0
    b       .                           @ not reached

/* ================================================================== */
.Lread:
    ldrb    r4, [r10, #2]
    cmp     r4, #1
    bne     .Lbad_len
    ldrb    r4, [r10, #3]
    cmp     r4, #0
    beq     .Lbad_sid
    cmp     r4, #NSLOTS
    bhi     .Lbad_sid
    sub     r8, r4, #1
    add     r4, r11, r8, lsl #3
    ldr     r6, [r4, #4]                @ pid
    cmp     r6, #0
    beq     .Lbad_sid
    ldr     r5, [r4]                    @ fd
    cmn     r5, #1
    beq     .Lrd_eof

    mov     r0, r5
    add     r1, r9, #8
    mov     r2, #MAXREAD
    mov     r7, #NR_read
    svc     #0
    cmp     r0, #0
    blt     .Lrd_neg
    beq     .Lrd_eof

    mov     r4, r0                      @ n
    cmp     r4, #MAXREAD
    mov     r1, #0
    moveq   r1, #1                      @ MORE
    add     r2, r8, #1
    mov     r3, r6
    bl      put_hdr
    strb    r4, [r9, #7]
    add     r0, r4, #8
    b       .Ldone

.Lrd_neg:
    cmn     r0, #11                     @ -EAGAIN: nothing ready yet, not an error
    bne     .Lrd_fail
    mov     r1, #0
    add     r2, r8, #1
    mov     r3, r6
    bl      put_hdr
    b       .Ldone
.Lrd_fail:
    mov     r1, #4                      @ FAILED
    add     r2, r8, #1
    mov     r3, r6
    bl      put_hdr
    b       .Ldone

.Lrd_eof:
    cmn     r5, #1
    beq     .Lrd_hdr                    @ already closed on a previous call
    mov     r0, r5
    mov     r7, #NR_close
    svc     #0
    add     r4, r11, r8, lsl #3
    mvn     r5, #0
    str     r5, [r4]                    @ fd = -1
    mov     r0, r6
    mov     r1, #0
    mov     r2, #WNOHANG
    mov     r3, #0
    mov     r7, #NR_wait4
    svc     #0
    cmp     r0, r6
    bne     .Lrd_hdr                    @ let sweep pick it up later
    add     r4, r11, r8, lsl #3
    mov     r5, #0
    str     r5, [r4]
    str     r5, [r4, #4]
.Lrd_hdr:
    mov     r1, #2                      @ EXITED
    add     r2, r8, #1
    mov     r3, r6
    bl      put_hdr
    b       .Ldone

/* ================================================================== */
.Lkill:
    ldrb    r4, [r10, #2]
    cmp     r4, #1
    bne     .Lbad_len
    ldrb    r4, [r10, #3]
    cmp     r4, #0
    beq     .Lbad_sid
    cmp     r4, #NSLOTS
    bhi     .Lbad_sid
    sub     r8, r4, #1
    add     r4, r11, r8, lsl #3
    ldr     r6, [r4, #4]
    cmp     r6, #0
    beq     .Lbad_sid
    ldr     r5, [r4]

    mov     r0, r6
    mov     r1, #SIGKILL
    mov     r7, #NR_kill
    svc     #0

    cmn     r5, #1
    beq     .Lkl_noclose
    mov     r0, r5
    mov     r7, #NR_close
    svc     #0
.Lkl_noclose:
    mov     r0, r6
    mov     r1, #0
    mov     r2, #WNOHANG
    mov     r3, #0
    mov     r7, #NR_wait4
    svc     #0

    add     r4, r11, r8, lsl #3
    mvn     r5, #0
    str     r5, [r4]                    @ fd = -1
    cmp     r0, r6
    bne     .Lkl_hdr
    mov     r5, #0
    str     r5, [r4]
    str     r5, [r4, #4]
.Lkl_hdr:
    mov     r1, #0
    add     r2, r8, #1
    mov     r3, r6
    bl      put_hdr
    b       .Ldone

/* ================================================================== */
.Lstatus:
    mov     r4, #0                      @ count
    mov     r5, #0                      @ index
    mov     r6, #2                      @ output cursor in resp
.Lst_l:
    add     r8, r11, r5, lsl #3
    ldr     r7, [r8, #4]
    cmp     r7, #0
    beq     .Lst_n
    add     r3, r5, #1
    strb    r3, [r9, r6]
    add     r6, r6, #1
    mov     r3, #0
    ldr     r7, [r8]
    cmn     r7, #1
    moveq   r3, #2
    strb    r3, [r9, r6]
    add     r6, r6, #1
    add     r4, r4, #1
.Lst_n:
    add     r5, r5, #1
    cmp     r5, #NSLOTS
    blt     .Lst_l
    mov     r0, #CC_OK
    strb    r0, [r9]
    strb    r4, [r9, #1]
    mov     r0, r6
    b       .Ldone

/* ================================================================== */
.Ldone:
    add     sp, sp, #FRAME
    pop     {r4-r11, r12, pc}

/* ---- PC-relative constant pool ---------------------------------- */
    .align 2
.Lstate_off:    .word STATE_VADDR - BLOB_VADDR
.Lo_nonblock:   .word O_NONBLOCK
.Lshpath_off:   .word shpath_str   - BLOB_VADDR
.Lsh_off:       .word sh_str       - BLOB_VADDR
.Ldc_off:       .word dashc_str    - BLOB_VADDR
.Lenv_off:      .word env_str      - BLOB_VADDR

shpath_str:     .asciz "/bin/sh"
sh_str:         .asciz "sh"
dashc_str:      .asciz "-c"
env_str:        .asciz "PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
```

{% endfold %}

然后它写了一个 Python 脚本 apply patch:

{% fold "很长的 Apply Patch 脚本" %}

```python
#!/usr/bin/env python3
"""
patch_lib.py — take over netfn 0x36 (APML) cmd 0x01 in libipmiapml.so.4.1.0.

Pure stdlib. Reads a pristine library, writes a patched copy, never touches the input.

    patch_lib.py IN.so BLOB.bin OUT.so
    patch_lib.py --verify PATCHED.so

Six edits, all inside the file, none of which touch a relocation, a symbol or a section header:

  0x0044  LOAD#0.p_filesz  0x01A74 -> 0x02000   absorb the 1420-byte zero cave
  0x0048  LOAD#0.p_memsz   0x01A74 -> 0x02000   (keep == filesz)
  0x0068  LOAD#1.p_memsz   0x00BAC -> 0x02000   grow .bss into RW zero pages for session state
  0x0E9C  ApmlGetInterfaceVersion prologue -> `b 0x1A74`
  0x1998  cmd 0x01 table entry reqlen 0x02 -> 0xFF (wildcard; dispatcher stops length-checking)
  0x1A74  the blob itself

Every invariant is asserted before a single byte is written. Refuses to run on anything that
does not look exactly like the library this was designed against.
"""

import hashlib
import struct
import sys

# ---- the library we expect -------------------------------------------------
E_PHOFF_EXPECT = 0x34
E_PHNUM_EXPECT = 4

LOAD0_FILESZ_OFF, LOAD0_FILESZ_OLD = 0x44, 0x01A74
LOAD0_MEMSZ_OFF, LOAD0_MEMSZ_OLD = 0x48, 0x01A74
LOAD1_MEMSZ_OFF, LOAD1_MEMSZ_OLD = 0x68, 0x00BAC
LOAD_FILESZ_NEW = 0x2000
LOAD1_MEMSZ_NEW = 0x2000

# ---- the hijack ------------------------------------------------------------
BLOB_VADDR = 0x1A74                 # where the blob is linked; == its file offset
ENTRY_INSN_OFF = 0x0E9C             # first instruction of ApmlGetInterfaceVersion
ENTRY_INSN_OLD = 0xE3A01000         # `mov r1, #0`
REQLEN_OFF = 0x1998                 # cmd 0x01 entry, +8 = reqlen
REQLEN_OLD, REQLEN_NEW = 0x02, 0xFF

CAVE_START, CAVE_END = 0x1A74, 0x2000
CAVE_SIZE = CAVE_END - CAVE_START   # 1420


def branch_word(src, dst):
    """ARM `b dst` placed at `src`."""
    delta = dst - (src + 8)
    if delta % 4:
        raise ValueError("unaligned branch target")
    if not -(1 << 25) <= delta < (1 << 25):
        raise ValueError("branch out of range")
    return 0xEA000000 | ((delta >> 2) & 0xFFFFFF)


def read_u32(b, off):
    return struct.unpack_from("<I", b, off)[0]


def fail(msg):
    print("FAIL: %s" % msg, file=sys.stderr)
    sys.exit(1)


def check_pristine(buf, blob):
    if len(buf) < CAVE_END:
        fail("file is only %d bytes; too small to hold the cave" % len(buf))
    if buf[:4] != b"\x7fELF" or buf[4] != 1 or buf[5] != 1 or buf[18:20] != b"\x28\x00":
        fail("not a 32-bit little-endian ELF")
    if struct.unpack_from("<H", buf, 0x12)[0] != 40:
        fail("e_machine is not ARM")

    e_phoff = read_u32(buf, 0x1C)
    e_phnum = struct.unpack_from("<H", buf, 0x2C)[0]
    if e_phoff != E_PHOFF_EXPECT or e_phnum != E_PHNUM_EXPECT:
        fail("e_phoff=0x%x e_phnum=%d, expected 0x%x / %d"
             % (e_phoff, e_phnum, E_PHOFF_EXPECT, E_PHNUM_EXPECT))

    # the section header table must land exactly at EOF -- a truncated or
    # re-linked library would fail this, and the extraction is known to be lossy
    e_shoff = read_u32(buf, 0x20)
    e_shnum = struct.unpack_from("<H", buf, 0x30)[0]
    e_shentsize = struct.unpack_from("<H", buf, 0x2E)[0]
    if e_shoff + e_shnum * e_shentsize != len(buf):
        fail("section headers end at 0x%X, file is %d bytes -- truncated or wrong file"
             % (e_shoff + e_shnum * e_shentsize, len(buf)))

    # program headers must still be the 2 PT_LOADs we mapped, at the offsets we expect
    for idx, (poff, pvaddr, pfsz, pmsz) in enumerate([(0x0000, 0x0000, 0x1A74, 0x1A74),
                                                      (0x2000, 0x12000, 0x400, 0x0BAC)]):
        ph = e_phoff + idx * 32
        if read_u32(buf, ph) != 1:
            fail("phdr[%d] is not PT_LOAD" % idx)
        got = (read_u32(buf, ph + 4), read_u32(buf, ph + 8),
               read_u32(buf, ph + 16), read_u32(buf, ph + 20))
        if got != (poff, pvaddr, pfsz, pmsz):
            fail("phdr[%d] = %s, expected %s" % (idx, got, (poff, pvaddr, pfsz, pmsz)))

    for off, old, what in ((LOAD0_FILESZ_OFF, LOAD0_FILESZ_OLD, "LOAD#0 p_filesz"),
                           (LOAD0_MEMSZ_OFF, LOAD0_MEMSZ_OLD, "LOAD#0 p_memsz"),
                           (LOAD1_MEMSZ_OFF, LOAD1_MEMSZ_OLD, "LOAD#1 p_memsz")):
        got = read_u32(buf, off)
        if got != old:
            fail("%s at 0x%04X is 0x%X, expected 0x%X (already patched?)" % (what, off, got, old))

    if read_u32(buf, ENTRY_INSN_OFF) != ENTRY_INSN_OLD:
        fail("0x%04X is 0x%08X, expected 0x%08X" % (ENTRY_INSN_OFF, read_u32(buf, ENTRY_INSN_OFF), ENTRY_INSN_OLD))
    if buf[REQLEN_OFF] != REQLEN_OLD:
        fail("reqlen at 0x%04X is 0x%02X, expected 0x%02X" % (REQLEN_OFF, buf[REQLEN_OFF], REQLEN_OLD))

    # the table entry we are editing must actually be cmd 0x01 / priv 2, terminated properly
    entry = buf[0x1990:0x1990 + 16]
    if entry[0] != 0x01 or entry[1] != 0x02 or entry[10:12] != b"\xaa\xaa":
        fail("cmd 0x01 table entry looks wrong: %s" % entry.hex())

    cave = buf[CAVE_START:CAVE_END]
    if len(cave) != CAVE_SIZE:
        fail("cave is short")
    if cave != b"\x00" * CAVE_SIZE:
        fail("cave [0x%X,0x%X) is not all zeros -- refusing to overwrite" % (CAVE_START, CAVE_END))
    if len(blob) > CAVE_SIZE:
        fail("blob is %d bytes, cave holds %d" % (len(blob), CAVE_SIZE))
    if len(blob) < 4:
        fail("blob is implausibly small")


def apply(buf, blob):
    out = bytearray(buf)
    struct.pack_into("<I", out, LOAD0_FILESZ_OFF, LOAD_FILESZ_NEW)
    struct.pack_into("<I", out, LOAD0_MEMSZ_OFF, LOAD_FILESZ_NEW)
    struct.pack_into("<I", out, LOAD1_MEMSZ_OFF, LOAD1_MEMSZ_NEW)
    struct.pack_into("<I", out, ENTRY_INSN_OFF, branch_word(ENTRY_INSN_OFF, BLOB_VADDR))
    out[REQLEN_OFF] = REQLEN_NEW
    out[CAVE_START:CAVE_START + len(blob)] = blob
    return bytes(out)


def verify(buf):
    """Re-derive everything from the patched bytes and complain about anything off."""
    errs = []
    for off, want, what in ((LOAD0_FILESZ_OFF, LOAD_FILESZ_NEW, "LOAD#0 p_filesz"),
                            (LOAD0_MEMSZ_OFF, LOAD_FILESZ_NEW, "LOAD#0 p_memsz"),
                            (LOAD1_MEMSZ_OFF, LOAD1_MEMSZ_NEW, "LOAD#1 p_memsz")):
        got = read_u32(buf, off)
        if got != want:
            errs.append("%s = 0x%X, want 0x%X" % (what, got, want))

    insn = read_u32(buf, ENTRY_INSN_OFF)
    want_insn = branch_word(ENTRY_INSN_OFF, BLOB_VADDR)
    if insn != want_insn:
        errs.append("entry insn = 0x%08X, want 0x%08X" % (insn, want_insn))
    else:
        delta = (insn & 0xFFFFFF)
        if delta & 0x800000:
            delta -= 0x1000000
        target = ENTRY_INSN_OFF + 8 + (delta << 2)
        if target != BLOB_VADDR:
            errs.append("branch decodes to 0x%X, want 0x%X" % (target, BLOB_VADDR))

    if buf[REQLEN_OFF] != REQLEN_NEW:
        errs.append("reqlen = 0x%02X, want 0x%02X" % (buf[REQLEN_OFF], REQLEN_NEW))

    if buf[CAVE_START:CAVE_START + 4] == b"\x00\x00\x00\x00":
        errs.append("cave is empty -- blob was not written")
    return errs


def md5(b):
    return hashlib.md5(b).hexdigest()


def main(argv):
    if len(argv) == 3 and argv[1] == "--verify":
        buf = open(argv[2], "rb").read()
        errs = verify(buf)
        for e in errs:
            print("FAIL: %s" % e, file=sys.stderr)
        print("%s: %s  md5=%s" % ("patched OK" if not errs else "NOT PATCHED",
                                  argv[2], md5(buf)))
        return 1 if errs else 0

    if len(argv) != 4:
        print(__doc__.strip(), file=sys.stderr)
        return 2

    src, blob_path, dst = argv[1], argv[2], argv[3]
    if src == dst:
        fail("refusing to patch in place")

    buf = open(src, "rb").read()
    blob = open(blob_path, "rb").read()
    check_pristine(buf, blob)

    out = apply(buf, blob)
    errs = verify(out)
    if errs:
        fail("self-check after patching: " + "; ".join(errs))

    with open(dst, "wb") as f:
        f.write(out)

    print("src   %s  %d bytes  md5=%s" % (src, len(buf), md5(buf)))
    print("blob  %s  %d bytes" % (blob_path, len(blob)))
    print("out   %s  %d bytes  md5=%s" % (dst, len(out), md5(out)))
    print("branch 0x%04X -> 0x%04X  (%08X)" % (ENTRY_INSN_OFF, BLOB_VADDR,
                                               branch_word(ENTRY_INSN_OFF, BLOB_VADDR)))
    print("cave  0x%04X..0x%04X  %d bytes used, %d free"
          % (CAVE_START, CAVE_END, len(blob), CAVE_SIZE - len(blob)))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

{% endfold %}

然后它写了一个 arm c, 可以在 BMC 上测试 patch:

{% fold "依然很长的 C 文件来测试 patch" %}

```c
/* harness.c -- offline verifier for the patched libipmiapml.so.4.1.0.
 *
 * Freestanding: no libc, raw ARM EABI syscalls, so the only shared objects this
 * process pulls in are the patched library and its own dependencies -- resolved
 * by the BMC's ld-2.19.so at load time exactly as IPMIMain would resolve them.
 * The dynamic linker maps and relocates the enlarged LOAD segments for real.
 *
 * It then walks g_APML_CmdHndlr to the cmd 0x01 entry and calls our handler with
 * synthetic requests. IPMIMain is never involved: if this process dies, nothing
 * else on the box notices.
 *
 * Build (on the host, for the BMC):
 *   arm-linux-gnueabi-gcc -march=armv6 -marm -mfloat-abi=soft -Os -ffreestanding \
 *       -fno-builtin -fno-stack-protector -nostdlib -nostartfiles -o harness \
 *       harness.c libipmiapml.so.oem \
 *       -Wl,--dynamic-linker=/lib/ld-linux.so.3 -Wl,-rpath,/var/tmp -Wl,-e,_start
 */

typedef unsigned char u8;
typedef unsigned int u32;
typedef unsigned long ulong;

/* ---- raw EABI syscalls -------------------------------------------------- */
static inline long sys3(long n, long a, long b, long c)
{
    register long r7 __asm__("r7") = n;
    register long r0 __asm__("r0") = a;
    register long r1 __asm__("r1") = b;
    register long r2 __asm__("r2") = c;
    __asm__ volatile ("svc #0" : "+r"(r0) : "r"(r7), "r"(r1), "r"(r2) : "memory");
    return r0;
}
#define SYS_WRITE      4
#define SYS_OPEN       5
#define SYS_NANOSLEEP  162
#define SYS_EXIT_GROUP 248

static long wr(const void *buf, unsigned n) { return sys3(SYS_WRITE, 1, (long)buf, n); }

static void sleep_ms(long ms)
{
    static long ts[2];
    ts[0] = ms / 1000;
    ts[1] = (ms % 1000) * 1000000L;
    sys3(SYS_NANOSLEEP, (long)ts, 0, 0);
}

static void _exit(int code) { sys3(SYS_EXIT_GROUP, code, 0, 0); for (;;) {} }

/* ---- tiny output helpers ------------------------------------------------ */
static unsigned slen(const char *s) { unsigned n = 0; while (s[n]) n++; return n; }
static void puts_(const char *s) { wr(s, slen(s)); }

static void puthex(unsigned v, int digits)
{
    static char buf[16];
    for (int i = digits - 1; i >= 0; i--) { buf[i] = "0123456789abcdef"[v & 0xF]; v >>= 4; }
    wr(buf, digits);
}
/* Decimal without a single division: ARMv6 has no divide instruction, so `% 10`
 * would emit a libgcc call, and `-nostdlib` means libgcc is not there to answer
 * it. Subtracting powers of ten keeps the harness self-contained. */
static void putdec(long v)
{
    static const unsigned long P[10] = { 1, 10, 100, 1000, 10000, 100000,
                                         1000000, 10000000, 100000000, 1000000000 };
    static char buf[24];
    unsigned long u;
    int i = 0, started = 0;

    if (v < 0) { puts_("-"); u = (unsigned long)(-v); } else { u = (unsigned long)v; }

    for (int k = 9; k >= 0; k--) {
        int d = 0;
        while (u >= P[k]) { u -= P[k]; d++; }
        if (d || started || k == 0) { buf[i++] = (char)('0' + d); started = 1; }
    }
    wr(buf, (unsigned)i);
}

/* ---- symbols exported by the patched library ---------------------------- */
extern int GetLibMetaInfo(void **out);
extern u8 g_APML_CmdHndlr[];

/* libopenapml.so.3 leaves g_BMCInfo undefined and expects the *hosting
 * executable* to supply it -- in situ that is IPMIMain, which exports a
 * 0x1633B0-byte object at 0x3c430 (the BMC shared-memory block). The dynamic
 * linker refuses to start any process where it cannot be bound, which is why a
 * bare harness dies with "undefined symbol: g_BMCInfo" before reaching main.
 *
 * A zeroed stand-in is sufficient here: the blob reaches the kernel through raw
 * svc instructions and calls into libopenapml exactly zero times, so nothing
 * ever reads these bytes. It lands in .bss, costing no file size. */
u8 g_BMCInfo[0x1633B0];

/* Same story: libopenapml references this through five plain R_ARM_ABS32
 * literals (no size check, no copy relocation). On the real box it is supplied
 * by libipmihalhw.so. Only the loader ever touches it here. */
u32 g_HALI2CHandle;

typedef int (*hdlr_t)(void *req, unsigned r1, void *resp, unsigned chan);

static hdlr_t find_cmd(u8 cmd, u8 *reqlen_out)
{
    u8 *p = g_APML_CmdHndlr;
    for (unsigned i = 0; i < 64; i++, p += 16) {
        u32 h = (u32)p[4] | ((u32)p[5] << 8) | ((u32)p[6] << 16) | ((u32)p[7] << 24);
        if (!h) return 0;                       /* terminator entry */
        if (p[0] == cmd) { *reqlen_out = p[8]; return (hdlr_t)h; }
    }
    return 0;
}

static const char HEXD[] = "0123456789abcdef";

/* Print a response buffer: header fields then the payload, text and hex. */
static void dump_resp(const char *tag, u8 *r, int len, int show_payload)
{
    if (len <= 0) { puts_("      (return value <= 0)\n"); return; }
    puts_("      "); puts_(tag);
    puts_(": cc=");  puthex(r[0], 2);
    puts_(" flags="); puthex(r[1], 2);
    puts_(" sid=");   puthex(r[2], 2);
    puts_(" pid=");   puthex(r[3], 2); puthex(r[4], 2); puthex(r[5], 2); puthex(r[6], 2);
    puts_(" n=");     putdec(r[7]);
    puts_(" len=");   putdec(len);
    puts_("\n");
    if (!show_payload || len <= 8) return;

    int n = len - 8;
    puts_("      text | ");
    for (int i = 0; i < n; i++) {
        u8 c = r[8 + i];
        if (c == '\n') { puts_("\\n"); }
        else if (c == '\r') { puts_("\\r"); }
        else if (c == '\t') { puts_("\\t"); }
        else if (c >= 0x20 && c < 0x7f) { wr(&c, 1); }
        else { puthex(c, 2); }
    }
    puts_("|\n");
}

/* ---- requests ----------------------------------------------------------- */
static u8 req[512];
static u8 resp[1024];

static int call(hdlr_t h, int reqlen, const char *tag, int show_payload)
{
    /* r1 is deliberately not an input -- the ABI ignores it, and our request is
     * self-delimiting via req[2], so the request length is never read from r1. */
    for (int i = 0; i < (int)sizeof resp; i++) resp[i] = 0xEE;
    int len = h(req, 0, resp, 0);
    dump_resp(tag, resp, len, show_payload);
    return len;
}

/* Build "A5 <op> <arglen> <args...>" */
static int build(u8 op, const char *args, unsigned alen)
{
    req[0] = 0xA5; req[1] = op; req[2] = (u8)alen;
    for (unsigned i = 0; i < alen && i < sizeof req - 3; i++) req[3 + i] = (u8)args[i];
    return 3 + alen;
}

static void run_shell(hdlr_t h, const char *cmd)
{
    puts_("    START \""); puts_(cmd); puts_("\"\n");
    int l = build(0x01, cmd, slen(cmd));
    if (call(h, l, "START", 0) <= 0) return;
    if (resp[0] != 0x00) { puts_("      -> start refused, aborting this session\n"); return; }

    u8 sid = resp[2];
    int exited = 0;
    for (int round = 0; round < 200 && !exited; round++) {
        req[0] = 0xA5; req[1] = 0x02; req[2] = 1; req[3] = sid;
        int len = call(h, 4, "READ", 1);
        if (len <= 0) break;
        if (resp[0] != 0x00) break;
        if (resp[7] == 0) { sleep_ms(20); }
        if (resp[1] & 0x02) exited = 1;         /* bit1 = exited */
    }

    req[0] = 0xA5; req[1] = 0x03; req[2] = 1; req[3] = sid;
    call(h, 4, "KILL", 0);
}

static int run(void)
{
    puts_("== step 1: registration metadata via GetLibMetaInfo ==\n");
    void *meta = 0;
    int rc = GetLibMetaInfo(&meta);
    puts_("   GetLibMetaInfo -> "); putdec(rc); puts_("  meta=");
    puthex((u32)(ulong)meta, 8); puts_("\n");
    if (!meta) { puts_("   FAIL: null meta\n"); return 1; }

    u8 *m = (u8 *)meta;
    puts_("   feature  = \""); wr(m, slen((char *)m)); puts_("\"\n");
    puts_("   table    = \""); wr(m + 0x100, slen((char *)(m + 0x100))); puts_("\"\n");
    puts_("   +0x280 type = "); puthex(m[0x280], 2);
    puts_("   +0x281 netfn = "); puthex(m[0x281], 2);
    if (m[0x281] != 0x36) puts_("   *** netfn is not 0x36 ***");
    puts_("\n   g_BMCInfo stand-in at "); puthex((u32)(ulong)g_BMCInfo, 8);
    puts_(" (libopenapml's requirement, satisfied by the harness)\n\n");

    puts_("== step 2: locate cmd 0x01 in g_APML_CmdHndlr ==\n");
    u8 reqlen = 0;
    hdlr_t h = find_cmd(0x01, &reqlen);
    puts_("   handler="); puthex((u32)(ulong)h, 8);
    puts_("  reqlen="); puthex(reqlen, 2);
    if (!h) { puts_("   FAIL: cmd 0x01 not found\n"); return 1; }
    if (reqlen != 0xFF) {
        puts_("\n   *** reqlen is not 0xFF -- the wildcard patch did NOT take.\n");
        puts_("   *** Any request longer than "); putdec(reqlen);
        puts_(" bytes would be rejected with cc=0xC7.\n");
        return 1;
    }
    puts_("  (wildcard, as patched)\n\n");

    puts_("== step 3: hijack must be live, and the default answer must be unchanged ==\n");
    req[0] = 0x00; req[1] = 0x00;
    int l = call(h, 2, "no-magic", 0);
    if (l <= 0 || resp[0] != 0xD5) {
        puts_("   *** expected cc=0xD5 (what ApmlGetInterfaceVersion returned before\n");
        puts_("   *** the takeover). Something else answered -- stop and investigate.\n");
        return 1;
    }
    puts_("   cc=0xD5 exactly as before the patch -- our code is in the path and\n");
    puts_("   the untouched case still behaves like the original.\n\n");

    puts_("== step 4: STATUS ==\n");
    build(0x04, "", 0);
    call(h, 3, "STATUS", 0);
    puts_("\n");

    puts_("== step 5: real exec through /bin/sh ==\n");
    run_shell(h, "id");
    run_shell(h, "echo one; echo two; echo three");
    run_shell(h, "cat /proc/mtd 2>/dev/null | head -3");
    puts_("\n");

    /* A command must not inherit our descriptors. This is not cosmetic: in situ
     * the parent is IPMIMain, which holds ~50 FIFOs under /var as its internal
     * message plumbing, and a child carrying copies of them across exec breaks
     * FIFO open/close accounting for the whole daemon (see oem_blob.S). Here we
     * open a few descriptors first so there is unambiguously something to leak,
     * then ask the child what it can see. Expected: exactly 0, 1 and 2. */
    puts_("== step 5b: the child must not inherit our descriptors ==\n");
    {
        int f1 = (int)sys3(SYS_OPEN, (long)"/etc/passwd", 0, 0);
        int f2 = (int)sys3(SYS_OPEN, (long)"/etc/hostname", 0, 0);
        int f3 = (int)sys3(SYS_OPEN, (long)"/proc/mtd", 0, 0);
        puts_("   harness deliberately holds fds ");
        putdec(f1); puts_(", "); putdec(f2); puts_(", "); putdec(f3); puts_("\n");
        puts_("   none of those numbers may appear below:\n");
        /* Probe each fd with `[ -e ]` rather than listing /proc/self/fd. Globbing
         * that directory opens a directory fd, which the shell then reports as a
         * descriptor that is not actually inherited -- it contaminated the first
         * run of this test. `[ -e /proc/self/fd/N ]` stats a single path and
         * opens nothing. */
        run_shell(h, "for i in 3 4 5 6 7; do [ -e /proc/self/fd/$i ] && "
                     "printf 'LEAK fd %s ' $i; done; echo done");
    }
    puts_("\n== step 5c: the child must not keep a live stdin ==\n");
    {
        /* fd 0 is the one descriptor the close-all loop deliberately skips, so it
         * needs its own proof. On the live box IPMIMain's fd 0 is a pipe, not
         * /dev/null, so a child that keeps it is a phantom holder of a daemon
         * pipe -- and a command that reads stdin would block on it forever. */
        run_shell(h, "[ -e /proc/self/fd/0 ] && echo STDIN-OPEN || echo stdin-closed");
        run_shell(h, "cat; echo 'cat-returned-'$?");
    }
    puts_("\n");

    puts_("== step 6: argument-length edge cases ==\n");
    {
        /* arglen larger than the bytes actually present: the blob must refuse
         * rather than read past the request buffer. */
        req[0] = 0xA5; req[1] = 0x01; req[2] = 0xFF; req[3] = 'x';
        call(h, 4, "arglen=255-but-1-byte", 0);
        /* arglen = 0: an empty shell command. */
        build(0x01, "", 0);
        call(h, 3, "empty-command", 0);
    }
    puts_("\n== step 7: unknown op ==\n");
    {
        build(0x7E, "", 0);
        call(h, 3, "op=0x7E", 0);
    }

    puts_("\nHARNESS_DONE\n");
    return 0;
}

void _start(void)
{
    _exit(run());
}
```

{% endfold %}

然后是 BMC 重启的时候用于持久化改动的 shell script:

{% fold "在 /conf/crontab 里面引用的 sh" %}

```sh
#!/bin/sh
# bmc_oem_apply.sh -- re-apply the OEM in-band channel at boot.
#
# Installed at /conf/bmc_oem_apply.sh (0755) and invoked from /conf/crontab by
#     @reboot sysadmin /conf/bmc_oem_apply.sh
#
# Why cron and not init: cron's @reboot runs at rc3 S89, which is after both
# rcS S22ipmistack (so IPMIMain is already running on the *pristine* library) and
# rc3 S16ssh (so SSH is up before we touch anything). That ordering is the whole
# safety argument: this hook can only ever replace a working stack, never prevent
# one from starting. If it fails, the BMC boots normally with the vendor library
# and SSH available.
#
# Never writes flash. The only filesystem change is a bind mount over the target
# path, which is exactly what makes this survivable: reverting is `umount`.
#
# This file must not block boot, so it does no interactive waiting and logs
# everything to a RAM disk instead of stdout.

TGT=/usr/local/lib/libipmiapml.so.4.1.0
SRC=/conf/libipmiapml.so.oem
HELPER=/conf/nct7904
LOG=/var/tmp/bmc_oem_apply.log

# `sum` is the only checksum on this image (no md5sum/sha1sum/cksum/cmp).
EXPECT_SUM="56518    11"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >>"$LOG"; }

log "=== bmc_oem_apply start ==="
log "src=$SRC tgt=$TGT"

# --- sanity: refuse to touch anything unless the payload is exactly right -----
if [ ! -f "$SRC" ]; then
    log "FAIL: $SRC missing -- leaving the vendor library in place"
    exit 0
fi
S=$(sum "$SRC")
if [ "$S" != "$EXPECT_SUM" ]; then
    log "FAIL: $SRC sum=$S expected=$EXPECT_SUM -- refusing to apply"
    exit 0
fi
log "payload sum OK ($S)"

# Is it already applied? (e.g. this script run twice, or a manual deploy)
if grep -q " $TGT " /proc/mounts; then
    log "already mounted; nothing to do"
    exit 0
fi

# --- stop the daemon so the mount can be swapped ------------------------------
# Required, not tidiness: a bind mount over a file cannot be detached while a
# process has it mapped, and the daemon maps this library.
killall -1 IPMIMain 2>/dev/null || true
i=0
while [ $i -lt 30 ]; do
    sleep 1
    [ -z "$(ps | grep '[I]PMIMain' | awk '{print $1}')" ] && break
    i=$((i + 1))
done
if [ -n "$(ps | grep '[I]PMIMain' | awk '{print $1}')" ]; then
    killall -9 IPMIMain 2>/dev/null || true
    sleep 2
fi
log "daemon stopped after ${i}s"

# --- mount a copy, never the source path itself ------------------------------
# Mounting $SRC directly would make /conf/libipmiapml.so.oem the live inode, so
# any future write to that file would edit the library under the running daemon.
# Copy to a fresh inode first; then the payload file stays inert.
NEW=/var/tmp/libipmiapml.so.boot
cp "$SRC" "$NEW"
chmod 644 "$NEW"
if ! mount -o bind "$NEW" "$TGT"; then
    log "FAIL: mount failed; daemon left stopped -- SSH is up, recover by hand"
    # Try to leave the box in a working state even so.
    /usr/local/bin/IPMIMain --daemonize --reg-with-procmgr </dev/null >>/var/tmp/ipmimain.out 2>&1
    exit 0
fi
if ! grep -q " $TGT " /proc/mounts; then
    log "FAIL: mount did not take"
    exit 0
fi
log "mounted $NEW -> $TGT"

# --- bring the daemon back, detached ----------------------------------------
# The redirect matters: a daemon started without it inherits this script's
# stdio. cron's stdio is harmless, but keeping the habit makes this safe to run
# by hand over SSH too, where an un-redirected launch makes the session hang
# holding the daemon's output pipe.
/usr/local/bin/IPMIMain --daemonize --reg-with-procmgr </dev/null >>/var/tmp/ipmimain.out 2>&1

NEWPID=""
i=0
while [ $i -lt 60 ]; do
    sleep 1
    NEWPID=$(ps | grep '[I]PMIMain' | awk '{print $1}')
    [ -n "$NEWPID" ] && break
    i=$((i + 1))
done
if [ -z "$NEWPID" ]; then
    log "FAIL: IPMIMain did not come back -- SSH is up"
    exit 0
fi
log "IPMIMain pid=$NEWPID after ${i}s"

# --- verify the mapping device, not the filename -----------------------------
# A `grep libipmiapml /proc/pid/maps` line reads identically for the pristine
# flash file and a patched bind mount. The device distinguishes them: tmpfs is a
# bind mount, anything else is the read-only cramfs original.
M=$(grep libipmiapml /proc/$NEWPID/maps 2>/dev/null)
if echo "$M" | grep -q ' 00:0b '; then
    log "OK: daemon mapped a tmpfs library (patched)"
else
    log "FAIL: daemon did NOT map a tmpfs library; rollback or investigate"
    log "$M"
fi

# --- the helper is optional; the channel does not depend on it ---------------
if [ -x "$HELPER" ]; then
    log "helper present and executable: $HELPER"
else
    log "helper $HELPER missing or not executable (channel still works)"
fi

log "=== bmc_oem_apply done ==="
exit 0
```

{% endfold %}

当然, Agent 还写了很多临时脚本, 这里就不赘述了.

最后, Agent 写了本地的客户端

{% fold "本地客户端" %}

```python
#!/usr/bin/env python3
"""
ipmi_oem.py -- host-side client for the OEM in-band channel.

Wire format (request):  A5 <op> <arglen> <args...>
Wire format (response): <flags> <sid> <pid:4 LE> <n> <data:n>     (START/READ/KILL)
                        <count> <sid> <flags> [x count]           (STATUS)

Slot table is 8 slots of {u32 fd; u32 pid}, 8 bytes each; pid==0 means free.
START takes the lowest free slot, so sids are reused after a session is reaped:
a sid reappearing is reuse, not a ghost.

Note the missing completion code. The handler writes cc into resp[0] and returns
the total length including it, but the shipping PDK dispatcher consumes resp[0]
as the completion code and forwards only resp[1..]. ipmitool reports that cc
out-of-band (and exits non-zero), so a non-zero cc arrives here as an exception,
never as data. Measured on the box, not assumed:

    START "id"  ->  harness len=8   wire 7 bytes  (00 01 2e 12 00 00 00)

Read as cc-preserved that is flags=01 sid=0x2e pid=0x12000000; read as
cc-stripped it is flags=00 sid=01 pid=4654 -- and the next START gives sid=02
pid=4656, which is what sequential forked children look like. Hence this parser.

Ops: 0x01 START, 0x02 READ, 0x03 KILL, 0x04 STATUS.

    ipmi_oem.py run '<shell command>'
    ipmi_oem.py status
    ipmi_oem.py nct-read  <reg> [--bank N]
    ipmi_oem.py nct-write <reg> <val> [--bank N]
"""

import argparse
import os
import subprocess
import sys
import time

MAGIC = 0xA5
NETFN_CMD = ["0x36", "0x01"]

OP_START, OP_READ, OP_KILL, OP_STATUS = 0x01, 0x02, 0x03, 0x04

FLAG_MORE, FLAG_EXITED, FLAG_STAT, FLAG_FAIL = 0x01, 0x02, 0x04, 0x08

HDR = 7                     # flags + sid + pid(4) + n

CALL_TIMEOUT = 15.0         # bound on ONE ipmitool invocation; see _raw()


class OemError(RuntimeError):
    pass


def _raw(args, timeout=CALL_TIMEOUT):
    """Send one request, return the response data bytes (cc already stripped).

    The per-call timeout is not optional. `ipmitool` blocks indefinitely when
    the BMC's IPMI interface stops answering, and run()'s own deadline is only
    tested *between* calls -- so one wedged call would hang this client forever,
    its finally would never run, and the session's slot and pipe fd would stay
    held inside IPMIMain permanently. That is how a transient backlog becomes a
    permanent one, and it is exactly the state the channel must never enter.
    Bounding every call here is what makes the outer deadline real.
    """
    cmd = ["sudo", "ipmitool", "-I", "open", "raw"] + NETFN_CMD + \
          ["0x%02x" % (b & 0xFF) for b in args]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise OemError("no response within %.0fs (ipmitool blocked -- "
                       "the channel is wedged)" % timeout)
    out = (p.stdout or "").strip()
    err = (p.stderr or "").strip()
    try:
        return bytes.fromhex(out.replace(" ", ""))
    except ValueError:
        raise OemError((err or out).strip() or "ipmitool returned no data")


def start(cmd):
    b = cmd.encode()
    if len(b) > 255:
        raise OemError("command is %d bytes, the arglen field holds 255" % len(b))
    d = _raw([MAGIC, OP_START, len(b)] + list(b))
    if len(d) < HDR:
        raise OemError("short START response: %s" % d.hex())
    if d[0] & FLAG_FAIL:
        raise OemError("START refused (flags=0x%02x)" % d[0])
    return d[1]


def read(sid):
    d = _raw([MAGIC, OP_READ, 1, sid])
    if len(d) < HDR:
        raise OemError("short READ response: %s" % d.hex())
    return d[0], d[7:7 + d[6]]


def kill(sid):
    """KILL answers with the cc alone, so a success yields no data bytes at all."""
    d = _raw([MAGIC, OP_KILL, 1, sid])
    return d[0] if d else 0x00


def status():
    """[(sid, flags), ...] for the live slots only (free slots are not listed)."""
    d = _raw([MAGIC, OP_STATUS, 0])
    if len(d) < 1:
        raise OemError("short STATUS response")
    count, rest = d[0], d[1:]
    if len(rest) < count * 2:
        raise OemError("truncated STATUS: count=%d but %d bytes" % (count, len(rest)))
    return [(rest[i * 2], rest[i * 2 + 1]) for i in range(count)]


def run(cmd, timeout=30.0, quiet=False):
    """Run a command to completion and return its output.

    Guarantees the slot is released. Reaching EOF frees it; every other way out
    of this function (timeout, transport error, caller exception) KILLs it.
    That matters: a session that is never read and never killed holds one of the
    8 slots and its pipe read-end fd inside IPMIMain forever, and eight of those
    wedge START with 0xC0 until the daemon is restarted. Measured, not assumed.
    """
    sid = start(cmd)
    exited = False
    buf = bytearray()
    t0 = time.time()
    try:
        while True:
            if time.time() - t0 > timeout:
                raise OemError("timeout after %.1fs" % timeout)
            flags, chunk = read(sid)
            buf += chunk
            if flags & FLAG_EXITED:
                exited = True
                break
            if not chunk:
                time.sleep(0.02)
            if not quiet:
                sys.stderr.write(".")
                sys.stderr.flush()
        return bytes(buf)
    finally:
        if not quiet:
            sys.stderr.write("\n")
        if not exited:
            try:
                kill(sid)
            except OemError:
                pass


# ---- NCT7904D helper passthrough -------------------------------------------

# The blob execs with a fixed PATH that contains neither /var/tmp nor /conf,
# so the helper must be named by absolute path.
NCT_BIN = os.environ.get("NCT7904_BIN", "/conf/nct7904")


def nct_read(reg, bank=0):
    out = run("%s --bus 13 --addr 0x2d --bank %d --read 0x%02x" % (NCT_BIN, bank, reg))
    return out.decode(errors="replace").strip()


def nct_write(reg, val, bank=0):
    out = run("%s --bus 13 --addr 0x2d --bank %d --write 0x%02x 0x%02x"
              % (NCT_BIN, bank, reg, val))
    return out.decode(errors="replace").strip()


def main(argv):
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="what", required=True)

    p = sub.add_parser("run", help="run a shell command in a session")
    p.add_argument("command")
    p.add_argument("--timeout", type=float, default=30.0)

    sub.add_parser("status", help="dump the session table")

    p = sub.add_parser("nct-read")
    p.add_argument("reg", type=lambda s: int(s, 0))
    p.add_argument("--bank", type=lambda s: int(s, 0), default=0)

    p = sub.add_parser("nct-write")
    p.add_argument("reg", type=lambda s: int(s, 0))
    p.add_argument("value", type=lambda s: int(s, 0))
    p.add_argument("--bank", type=lambda s: int(s, 0), default=0)

    a = ap.parse_args(argv[1:])

    try:
        if a.what == "run":
            sys.stdout.buffer.write(run(a.command, a.timeout))
        elif a.what == "status":
            s = status()
            print("%d live slot(s)" % len(s))
            for sid, flags in s:
                print("  sid=%d flags=0x%02x%s" % (sid, flags,
                      " (fd closed, awaiting reap)" if flags & 2 else ""))
        elif a.what == "nct-read":
            print(nct_read(a.reg, a.bank))
        elif a.what == "nct-write":
            print(nct_write(a.reg, a.value, a.bank))
    except OemError as e:
        print("OEM error: %s" % e, file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
```

{% endfold %}

和简单的 wrapper script `bmc_sh`:

{% fold "bmc_sh 'echo cmd here runs on BMC'" %}

```python
#!/usr/bin/env python3
"""bmc_sh -- run a shell command on the BMC as root, in-band.

    sudo bmc_sh 'id; uname -a'
    sudo bmc_sh --timeout 60 'cat /var/log/messages | tail -20'

The command goes out over KCS as netfn 0x36 (APML) cmd 0x01, whose execution
logic the patched libipmiapml replaces. No SSH, no network. On the BMC it runs
as /bin/sh -c '<command>', as uid 0.

RUN IT WITH sudo. The script does not escalate on its own -- `sudo ipmitool
-I open` needs the privilege, and the raw KCS device /dev/ipmi0 is root-only,
so without it ipmitool fails with "Could not open device at /dev/ipmi0".

Self-contained on purpose -- stdlib only, it does not import ipmi_oem and does
not call any other script here, so it can be copied out on its own:

    sudo install -m 0755 bmc_sh /usr/local/sbin/

THINGS TO KNOW BEFORE YOU RELY ON IT
------------------------------------
1. THE EXIT CODE IS NOT AVAILABLE. The wire protocol has no field for it -- the
   blob reaps the child with wait4(..., NULL) -- so a command that fails still
   looks like success here (exit 0). If you need the status, ask the shell to
   print it:      sudo bmc_sh 'false; echo rc=$?'
2. THE COMMAND IS LIMITED TO 176 BYTES. That is the blob's own ceiling
   (oem_blob.S: MAXCMD), not 255. Longer commands are refused here, before they
   reach the BMC, with the actual byte count. Workaround for anything bigger:
   put the script on the BMC once (e.g. /var/tmp/x.sh) and call that.
3. DO NOT USE '&'. KILL signals the direct child only, not the process group. A
   backgrounded grandchild keeps the pipe's write end open, so READ never sees
   EOF and this tool waits until its timeout and then reports failure.
4. IT IS SLOW -- ABOUT 1.2 KB/s. The BMC returns at most 160 payload bytes per
   READ (oem_blob.S: MAXREAD), one round trip each, so a 4 KB file takes ~4 s
   and a 40 KB one needs --timeout 60 or more. Raising --timeout does not make
   it faster; it only stops a long fetch from being killed.

The command string is passed through verbatim -- quotes, $VAR and backticks all
reach the BMC's shell as written. Quote it on your side to protect it from YOUR
shell: bmc_sh 'echo $PATH' not bmc_sh "echo $PATH".

Output is written to stdout BYTE FOR BYTE -- nothing is appended, stripped or
translated, so `sudo bmc_sh 'cat /path/file' > local` gives you exactly that
file, and a command whose output has no trailing newline leaves your prompt on
the same line, just as ssh would.
"""

import argparse
import re
import subprocess
import sys
import os
import time

MAGIC = 0xA5
OP_START, OP_READ, OP_KILL = 0x01, 0x02, 0x03
FLAG_EXITED, FLAG_FAIL = 0x02, 0x08

HDR = 7                     # flags, sid, pid(4), n
MAXCMD = 176                # blob's ceiling; NOT 255
CALL_TIMEOUT = 15.0         # bound on ONE ipmitool call, seconds

# Completion codes the blob can answer with, for a readable error.
CC = {0xC0: "all 8 session slots are in use -- something is leaking sessions",
      0xC1: "the BMC says: bad command",
      0xC7: "the BMC says: bad request length",
      0xC9: "the BMC says: no such session",
      0xCF: "the BMC says: the operation failed",
      0xD5: "the BMC says: request inactive"}


class Err(RuntimeError):
    pass


def raw(args, timeout=CALL_TIMEOUT):
    """One request/response. Returns the response data bytes.

    The timeout is not optional: ipmitool blocks forever when the BMC's IPMI
    interface stops answering, and a wedged client never reaches its cleanup,
    leaking a session slot inside IPMIMain.
    """
    cmd = ["ipmitool", "-I", "open", "raw", "0x36", "0x01"] + \
          ["0x%02x" % (b & 0xFF) for b in args]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise Err("no answer from the BMC in %.0fs -- channel wedged?" % timeout)
    except FileNotFoundError as e:
        raise Err("cannot run ipmitool: %s" % e)
    out = (p.stdout or "").strip()
    err = (p.stderr or "").strip()
    if not out:
        raise Err(err or "ipmitool returned nothing")
    try:
        return bytes.fromhex(out.replace(" ", ""))
    except ValueError:
        m = re.search(r"rsp=0x([0-9a-fA-F]{2})", out)
        if m:
            cc = int(m.group(1), 16)
            raise Err(CC.get(cc, "the BMC refused the request (cc=0x%02x)" % cc))
        raise Err("unexpected reply from ipmitool: %r" % out)


def start(cmd):
    b = cmd.encode()
    if not b:
        raise Err("empty command")
    if len(b) > MAXCMD:
        raise Err("command is %d bytes but the BMC's blob accepts at most %d.\n"
                  "Shorten it, or put a script on the BMC and call that."
                  % (len(b), MAXCMD))
    d = raw([MAGIC, OP_START, len(b)] + list(b))
    if len(d) < HDR:
        raise Err("short START reply: %s" % d.hex())
    if d[0] & FLAG_FAIL:
        raise Err("START refused (flags=0x%02x)" % d[0])
    return d[1]


def read(sid):
    d = raw([MAGIC, OP_READ, 1, sid])
    if len(d) < HDR:
        raise Err("short READ reply: %s" % d.hex())
    return d[0], d[7:7 + d[6]]


def release(sid):
    """KILL, then READ once more.

    KILL alone does not free the slot -- the slot is released when a READ hits
    EOF (the blob closes the pipe and marks it free there). A session that is
    killed but never read again stays live in the table forever, holding one of
    the 8 slots, and eight of those wedge every later START with 0xC0 until the
    daemon is restarted. The extra READ is what actually reclaims it.
    """
    try:
        raw([MAGIC, OP_KILL, 1, sid])
    except Err:
        return
    try:
        read(sid)
    except Err:
        pass


def run(cmd, timeout):
    sid = start(cmd)
    exited = False
    buf = bytearray()
    t0 = time.time()
    try:
        while True:
            if time.time() - t0 > timeout:
                raise Err("still running after %.0fs (killed)" % timeout)
            flags, chunk = read(sid)
            buf += chunk
            if flags & FLAG_EXITED:
                exited = True
                break
            if not chunk:
                time.sleep(0.02)
        return bytes(buf)
    finally:
        if not exited:
            release(sid)


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="bmc_sh",
        description="Run a shell command on the BMC as root, over the in-band "
                    "IPMI channel (no SSH). Run it under sudo.",
        epilog="Exit status is 0 if the command ran and its output was "
               "retrieved, 1 on a transport problem. The CHILD's exit code is "
               "not available over this protocol -- see the header comment.")
    ap.add_argument("command", nargs="?", metavar="COMMAND",
                    help="shell command, run as /bin/sh -c '<COMMAND>' on the BMC")
    ap.add_argument("--timeout", type=float, default=30.0, metavar="N",
                    help="give up (and kill) after N seconds (default: 30)")
    a = ap.parse_args(argv)
    if not a.command:
        ap.error("no command given")
    if os.geteuid() != 0:
        sys.stderr.write("bmc_sh: must run as root -- try: sudo bmc_sh %s\n"
                         % ("'%s'" % a.command.replace("'", "'\\''")
                            if len(a.command) < 60 else "'...'"))
        return 1

    try:
        out = run(a.command, a.timeout)
    except Err as e:
        sys.stderr.write("bmc_sh: %s\n" % e)
        return 1
    sys.stdout.buffer.write(out)
    sys.stdout.buffer.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

{% endfold %}

### The Outcome

于是, 我们可以在 Host 上愉快调试 BMC 了!

```sh
$ sudo bmc_sh id
uid=0(sysadmin) gid=0(sysadmin) groups=0(sysadmin)
$ sudo bmc_sh uptime
 06:46:19 up 12:56,  0 users,  load average: 2.38, 2.33, 2.34
$ sudo bmc_sh "uname -a"
Linux G3DE 3.14.17-ami #1 Tue Apr 21 09:20:40 GMT 2026 armv6l GNU/Linux
```

## SYS FAN

系统风扇相对非常简单 -- BMC 里面已经有现成的命令了. 直接让 Agent 写一个 wrapper 就行

{% fold "sysfan" %}

```python
#!/usr/bin/env python3
"""sysfan -- fan mode and duty for the mainboard fans (Gooxi OEM netfn 0x2a).

    sudo sysfan status      current mode + all 8 channels: duty and RPM
    sudo sysfan auto        hand the fans back to the automatic curve
    sudo sysfan manual      stop the automatic loop, duty frozen where it is
    sudo sysfan set 40      manual mode + drive ALL EIGHT channels at 40%

The FIB counterpart of this is `fibfan`. The difference matters: the FIB fans
have no IPMI command at all, so fibfan has to drive the NCT7904D chip over the
in-band channel. These mainboard fans DO have one -- Gooxi netfn 0x2a -- so this
script is nothing but a thin wrapper around `ipmitool raw`. It does not use the
0x36 channel, does not talk to the BMC's shell, and has no session code. No SSH,
no network.

RUN IT WITH sudo. The script does not escalate on its own: the raw KCS device
/dev/ipmi0 is root-only, so without sudo ipmitool fails with "Could not open
device at /dev/ipmi0".

Self-contained on purpose -- stdlib only, it does not import anything else
here, so it can be copied out on its own:

    sudo install -m 0755 sysfan /usr/local/sbin/

WHAT IT CONTROLS.  Eight PWM channels, indices 0-7, which the BMC reports as
FAN1-FAN8. Only FAN1-FAN4 are actually populated; 5-8 accept a duty and have no
fan to spin, so their readings stay at 0. 'set' writes all eight together and
takes no channel index -- same idea as fibfan driving both FANCTL channels.

Note the duty byte is the percentage AS A NUMBER, not a 0-255 fraction:
100% is 0x64 and 76% is 0x4c, straight out of the register. That is the opposite
of fibfan, where the chip wants (pct*255+50)//100. Here 0x64 would be 100 and
0x4c would be 76 -- do not carry the fibfan formula over.

THINGS THIS WILL NOT TELL YOU, AND THINGS IT WILL DO TO YOUR MACHINE
-------------------------------------------------------------------
* 'manual' and 'set' STOP THE AUTOMATIC THERMAL CONTROL for FAN1-FAN4. While
  they are off, CPU and GPU heat will NOT raise these fans. There is no timeout
  guardian: it stays off until you run 'sysfan auto'.
* Unlike fibfan (which writes a chip register), this does NOT survive a BMC
  cold reset: after `mc reset cold` the mode reads back 01 (automatic) and the
  duties return to the curve. So it is persistent across a host reboot, but a
  BMC reset quietly undoes it.
* Below 20% a fan may fail to start; below 3% one that is already running may
  stall. A stalled fan makes the BMC log a `FanN Presence | Device Absent`
  assertion in the SEL. That is expected here, not a fault.
* Register readback is NOT proof the fans changed speed. To see the real effect
  use the BMC's own sensor layer, a genuinely independent path:
      sudo ipmitool -I open sensor | grep -E '^FAN[1-8]'
  Give the tach ~45s to settle; 'set' writes and returns without waiting.
* No readback verification is done after a write. That is deliberate for this
  family of wrapper scripts -- use 'sysfan status' when you want to look.
* Only indices 0-3 have fans behind them. 4-7 are written anyway so the whole
  group moves together; there is no evidence they drive anything.
"""

import argparse
import os
import re
import subprocess
import sys

RAW = ["ipmitool", "-I", "open", "raw", "0x2a"]
TIMEOUT = 15.0              # bound on ONE ipmitool call, seconds
NCH = 8                     # PWM channels the BMC reports

# Completion codes, for a readable error instead of ipmitool's one-liner.
CC = {0xC0: "the BMC is busy (cc=0xc0)",
      0xC1: "the BMC says: invalid command -- 0x2a/0x09 is refused while the "
            "mode byte is 01 (automatic); run 'sysfan manual' first",
      0xC7: "the BMC says: bad request length",
      0xC9: "the BMC says: parameter out of range",
      0xD5: "the BMC says: request not accepted"}


class Err(RuntimeError):
    pass


def raw(*b, timeout=TIMEOUT):
    """One `ipmitool ... raw 0x2a ...`. Returns the data bytes as a list.

    The three shapes ipmitool actually produces here, measured on this host:
      data reply        stdout = hex bytes,                      rc 0
      no-data reply     stdout = a bare newline ("0x62", "0x09"), rc 0
      refused           stdout empty, message on STDERR,         rc 1
    So an empty stdout is NOT an error -- it is the normal shape of a write
    command. The exit status is what separates that from a refusal.
    """
    cmd = RAW + ["0x%02x" % (x & 0xFF) for x in b]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise Err("no answer from the BMC in %.0fs -- is IPMI wedged?" % timeout)
    except FileNotFoundError as e:
        raise Err("cannot run ipmitool: %s" % e)
    out = (p.stdout or "").strip()
    err = (p.stderr or "").strip()
    if p.returncode != 0:
        m = re.search(r"rsp=0x([0-9a-fA-F]{2})", err + " " + out)
        if m:
            cc = int(m.group(1), 16)
            raise Err(CC.get(cc, "the BMC refused the request (cc=0x%02x)" % cc))
        raise Err(err or out or "ipmitool exited %d with no message" % p.returncode)
    if not out:
        return []                       # success, and the reply carries no data
    try:
        return [int(t, 16) for t in out.split()]
    except ValueError:
        raise Err("unexpected reply from ipmitool: %r" % out)


def get_mode():
    """0x2a/0x61 -> one byte. 01 is automatic; anything else is not."""
    d = raw(0x61)
    if len(d) < 1:
        raise Err("short mode reply: %s" % d)
    return d[0]


def get_fans():
    """0x2a/0x08 0xff -> [(duty_pct, rpm, valid), ...] for all 8 channels.

    Fixed 27-byte reply, independent of the request:
      [0] channel count (08), [1] invalid bitmap (bit i = channel i's RPM is
      not trustworthy), [2] constant 0xff, then 8 x 3 bytes of
      (duty, rpm_low, rpm_high) -- RPM is 16-bit little-endian.
    """
    d = raw(0x08, 0xFF)
    n = d[0] if d else 0
    if len(d) < 3 + 3 * n:
        raise Err("short fan reply (%d bytes, expected %d): %s"
                  % (len(d), 3 + 3 * n, " ".join("%02x" % x for x in d)))
    bmp = d[1]
    return [(d[3 + 3 * i], d[4 + 3 * i] | (d[5 + 3 * i] << 8),
             not (bmp >> i) & 1) for i in range(n)]


def cmd_status():
    m = get_mode()
    print("Gooxi 0x2a fan control (mainboard fans)")
    print("  mode   : 0x%02x  %s" % (
        m, "AUTOMATIC (the curve drives the fans)" if m == 0x01
        else "manual / not automatic (the curve is off)"))
    for i, (duty, rpm, valid) in enumerate(get_fans()):
        if valid:
            print("  FAN%-2d  : duty %3d%% (0x%02x)  %6d RPM"
                  % (i + 1, duty, duty, rpm))
        else:
            print("  FAN%-2d  : duty %3d%% (0x%02x)       -   (no reading)"
                  % (i + 1, duty, duty))
    print("\nFor the sensor layer's own view (an independent path):")
    print("  sudo ipmitool -I open sensor | grep -E '^FAN[1-8]'")


def cmd_mode(which):
    if which == "auto":
        raw(0x62, 0x01)
        print("automatic: the BMC's curve is driving FAN1-FAN8 again. Duty will "
              "be recomputed within seconds; give the tach ~45s to settle.")
    else:
        raw(0x62, 0x00)
        print("manual: the automatic loop is off, duty frozen at its current "
              "value.")
        print("Nothing will raise FAN1-FAN4 for heat until 'sysfan auto'.")


def cmd_set(pct):
    raw(0x62, 0x00)                 # 0x09 is refused while the mode byte is 01,
                                    # so leave automatic first -- one step, no
                                    # way to silently no-op.
    for i in range(NCH):
        try:
            raw(0x09, i, pct)
        except Err as e:
            raise Err("channel %d (FAN%d) failed after %d of %d were written: %s"
                      % (i, i + 1, i, NCH, e))
    print("all %d channels manual at %d%% (duty 0x%02x)"
          % (NCH, pct, pct))
    if pct < 20:
        print("WARNING: below 20%% a fan may not start; below 3%% one already "
              "running may stall (SEL 'Device Absent').")
    print("Persistent until 'sysfan auto' or a BMC cold reset. Check the tach "
          "after ~45s:")
    print("  sudo ipmitool -I open sensor | grep -E '^FAN[1-8]'")


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="sysfan",
        description="Mainboard fan mode and duty, wrapping the Gooxi OEM "
                    "netfn 0x2a raw commands. Run it under sudo.",
        epilog="'manual' and 'set' stop the automatic thermal control for "
               "FAN1-FAN4 with no timeout, though a BMC cold reset undoes it. "
               "Register readback does not prove the fans changed -- check "
               "'ipmitool sensor | grep FAN'.")
    sub = ap.add_subparsers(dest="cmd")

    sub.add_parser("status", help="show the mode and all 8 duty/RPM rows")
    sub.add_parser("auto", help="0x2a/0x62 01 -- back on the automatic curve")
    sub.add_parser("manual", help="0x2a/0x62 00 -- stop the automatic loop")

    p_set = sub.add_parser("set", help="manual mode, all 8 channels at N percent")
    p_set.add_argument("pct", type=int, metavar="N", help="1-100")

    a = ap.parse_args(argv)
    if a.cmd is None:
        ap.print_help()
        return 2
    if a.cmd == "set" and not 1 <= a.pct <= 100:
        ap.error("percentage must be 1-100 (0 stops the fans)")
    if os.geteuid() != 0:
        sys.stderr.write("sysfan: must run as root -- try: sudo sysfan %s\n"
                         % " ".join(argv if argv is not None else sys.argv[1:]))
        return 1

    try:
        if a.cmd == "status":
            cmd_status()
        elif a.cmd in ("auto", "manual"):
            cmd_mode(a.cmd)
        else:
            cmd_set(a.pct)
    except Err as e:
        sys.stderr.write("sysfan: %s\n" % e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

{% endfold %}

## FIB FAN

但是 GPU 风扇就没那么容易了. GPU 风扇在传感器列表里面有读数, 但是 IPMI 里面没有暴露可以设置的接口. 我让 Agent 去查查, 经过一番寻找, 他 probe 到, 位于 i2c bus 13 0x2d 位置一颗 NCT7904D 风扇控制芯片, 其 BANK 3 温度曲线为 25/30/34/37°C → 40/60/75/90%, 推测为机箱的出风温度.

由于前面已经实现了 Shell 访问, 我就懒得让他再 patch library 了. Agent 写了一个 c 文件 (对, 这所有的 c 文件都不依赖 stdlib, 全是 raw syscall... 太离谱了)

{% fold "NCT7904.c" %}

```c
/*
 * nct7904.c -- NCT7904D register access for the 161 BMC (Gooxi GC2600PMT).
 *
 * Freestanding ARM binary: no libc, raw EABI syscalls. This is not cleverness
 * for its own sake -- a statically linked glibc build is ~548 KB, and /conf is
 * jffs2 with ~624 KB free and mountall.sh doubling real usage to /bkupconf, so
 * the libc build could not be persisted. This one is a few KB.
 *
 * Talks to /dev/i2c-N directly through I2C_RDWR, so it does not depend on AMI's
 * /usr/local/bin/i2c-test being present or unchanged. (It is present -- that
 * assumption in the plan was wrong, another artifact of the lossy rootfs
 * extraction -- and it is used as a cross-check oracle, not as a dependency.)
 *
 * Register model is Nuvoton's: a bank selector at 0xff, then a 1-byte register
 * address within the selected bank. Read and write are issued as one combined
 * I2C transaction (no STOP between register address and data), which is what
 * the chip expects.
 *
 * Guardian discipline, carried over from the 2026-09-25 FIB_FAN work:
 *
 *   - identity verified before anything else (0x7a == 0x50, 0x7b == 0xc5)
 *   - the entry bank is saved and restored on every exit path
 *   - every bank switch is read back and verified before use
 *   - every write is read back and verified
 *   - reads never write except the bank selector, which is restored
 *
 * Usage:
 *   nct7904 --identity
 *   nct7904 [--bus 13] [--addr 0x2d] [--bank B] --read  REG
 *   nct7904 [--bus 13] [--addr 0x2d] [--bank B] --write REG VAL
 *   nct7904 [--bus 13] [--addr 0x2d] [--bank B] --dump  FIRST LAST
 *
 * Build:
 *   arm-linux-gnueabi-gcc -march=armv6 -marm -mfloat-abi=soft -Os -ffreestanding \
 *       -fno-builtin -fno-stack-protector -nostdlib -nostartfiles -static \
 *       -o nct7904 nct7904.c
 */

typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;

/* ---- raw EABI syscalls -------------------------------------------------- */
static inline long sys3(long n, long a, long b, long c)
{
    register long r7 __asm__("r7") = n;
    register long r0 __asm__("r0") = a;
    register long r1 __asm__("r1") = b;
    register long r2 __asm__("r2") = c;
    __asm__ volatile ("svc #0" : "+r"(r0) : "r"(r7), "r"(r1), "r"(r2) : "memory");
    return r0;
}

#define SYS_write      4
#define SYS_open       5
#define SYS_ioctl      54
#define SYS_exit_group 248

#define O_RDWR   2

/* ---- output ------------------------------------------------------------- */
/* write(2) can return a short count (the pipe into IPMIMain is only 64 KB) and
 * can be interrupted. Discarding the return value loses exactly the messages
 * this tool exists to report -- a failed verification, a bank that would not
 * restore -- so loop until it is all out, and retry EINTR. */
static void wr(int fd, const char *s, unsigned n)
{
    while (n) {
        long r = sys3(SYS_write, fd, (long)s, n);
        if (r == -4)                 /* EINTR */
            continue;
        if (r <= 0)
            return;
        s += r;
        n -= (unsigned)r;
    }
}

static void putsn(int fd, const char *s)
{
    unsigned n = 0;
    while (s[n]) n++;
    wr(fd, s, n);
}

static const char HEXD[] = "0123456789abcdef";

/* "0x" + two hex digits */
static void put_hex2(int fd, long v)
{
    char b[4];
    b[0] = '0'; b[1] = 'x';
    b[2] = HEXD[(v >> 4) & 0xf];
    b[3] = HEXD[v & 0xf];
    wr(fd, b, 4);
}

/* ARMv6 has no divide instruction and -nostdlib means no libgcc to supply
 * __aeabi_uidivmod, so decimal conversion subtracts powers of ten instead. */
static const unsigned long P10[10] = { 1, 10, 100, 1000, 10000, 100000,
                                       1000000, 10000000, 100000000, 1000000000 };

static int utoa(unsigned long v, char *out)
{
    int i = 0, started = 0, k;
    for (k = 9; k >= 0; k--) {
        int d = 0;
        while (v >= P10[k]) { v -= P10[k]; d++; }
        if (d || started || k == 0) { out[i++] = (char)('0' + d); started = 1; }
    }
    return i;
}

static void put_dec(int fd, long v)
{
    char b[12];
    int n;
    if (v < 0) { wr(fd, "-", 1); v = -v; }
    n = utoa((unsigned long)v, b);
    wr(fd, b, n);
}

/* finish() is the ONLY way this program exits. The bank selector at 0xff is
 * shared with the BMC's own sensor monitoring, so every exit path -- including
 * the error paths, which is where this was originally wrong -- must restore it.
 * Routing die()/fail()/usage() through here is what makes that structural
 * rather than a thing each call site has to remember. */
static void restore_entry_bank(void);
static void finish(int code) __attribute__((noreturn));

static void die(const char *what)
{
    putsn(2, "nct7904: ");
    putsn(2, what);
    putsn(2, "\n");
    finish(2);
    for (;;) {}
}

static void fail(const char *what)
{
    putsn(2, "nct7904: ");
    putsn(2, what);
    putsn(2, "\n");
    finish(1);
    for (;;) {}
}

/* ---- i2c ---------------------------------------------------------------- */
#define I2C_SLAVE 0x0703
#define I2C_RDWR  0x0707
#define I2C_M_RD  0x0001

struct i2c_msg {
    u16 addr;
    u16 flags;
    u16 len;
    u8 *buf;
};

struct i2c_rdwr_ioctl_data {
    struct i2c_msg *msgs;
    u32 nmsgs;
};

#define REG_VENDOR 0x7a
#define REG_CHIP   0x7b
#define REG_BANK   0xff
#define VENDOR_ID  0x50
#define CHIP_ID    0xc5

static int fd = -1;
static int g_addr = 0x2d;
static int entry_bank = -1;
static int bank_stuck = 0;
static int g_bus = 13;

static void nct_open(void)
{
    char path[32];
    int i = 0;
    const char *pre = "/dev/i2c-";

    while (pre[i]) { path[i] = pre[i]; i++; }
    i += utoa((unsigned long)(g_bus < 0 ? 0 : g_bus), path + i);
    path[i] = 0;

    fd = (int)sys3(SYS_open, (long)path, O_RDWR, 0);
    if (fd < 0)
        die("cannot open the i2c bus");
    if (sys3(SYS_ioctl, fd, I2C_SLAVE, g_addr) < 0)
        die("I2C_SLAVE failed");
}

/* One combined transaction: register address out, one byte back in. */
static int nct_read(int reg, int *val)
{
    u8 rb = (u8)(reg & 0xff), vb = 0;
    struct i2c_msg m[2];
    struct i2c_rdwr_ioctl_data d;

    m[0].addr = (u16)g_addr; m[0].flags = 0;        m[0].len = 1; m[0].buf = &rb;
    m[1].addr = (u16)g_addr; m[1].flags = I2C_M_RD; m[1].len = 1; m[1].buf = &vb;
    d.msgs = m; d.nmsgs = 2;

    if (sys3(SYS_ioctl, fd, I2C_RDWR, (long)&d) < 0)
        return -1;
    *val = vb;
    return 0;
}

static int nct_write(int reg, int val)
{
    u8 b[2];
    struct i2c_msg m;
    struct i2c_rdwr_ioctl_data d;

    b[0] = (u8)(reg & 0xff);
    b[1] = (u8)(val & 0xff);
    m.addr = (u16)g_addr; m.flags = 0; m.len = 2; m.buf = b;
    d.msgs = &m; d.nmsgs = 1;

    return sys3(SYS_ioctl, fd, I2C_RDWR, (long)&d) < 0 ? -1 : 0;
}

static int read_or_die(int reg)
{
    int v;
    if (nct_read(reg, &v) < 0)
        die("register read failed");
    return v;
}

static void verify_identity(void)
{
    int vendor, chip;
    if (nct_read(REG_VENDOR, &vendor) < 0 || nct_read(REG_CHIP, &chip) < 0)
        fail("cannot read identity -- is an NCT7904D on this bus?");
    if (vendor != VENDOR_ID || chip != CHIP_ID) {
        putsn(2, "nct7904: identity mismatch: 0x7a=");
        put_hex2(2, vendor);
        putsn(2, " (want 0x50), 0x7b=");
        put_hex2(2, chip);
        putsn(2, " (want 0xc5)\n");
        finish(1);
        for (;;) {}
    }
}

static void save_entry_bank(void)
{
    if (entry_bank < 0)
        entry_bank = read_or_die(REG_BANK);
}

/* Unconditional: the entry bank is restored on every exit path, including after
 * an explicit write to 0xff. Leaving the chip on a different bank than we found
 * it is the one way this tool can disturb the BMC's own monitoring, which reads
 * sensor registers through this same selector. */
static void restore_entry_bank(void)
{
    int now;
    if (entry_bank < 0)
        return;
    if (nct_read(REG_BANK, &now) == 0 && now == entry_bank)
        return;
    if (nct_write(REG_BANK, entry_bank) < 0 ||
        nct_read(REG_BANK, &now) < 0 || now != entry_bank)
        bank_stuck = 1;
}

static void finish(int code)
{
    restore_entry_bank();
    if (bank_stuck) {
        putsn(2, "nct7904: could not restore the entry bank\n");
        code = 3;
    }
    sys3(SYS_exit_group, code, 0, 0);
    for (;;) {}
}

/* Selecting a bank the chip is already on is a no-op, deliberately: the write
 * to 0xff is the only moment this tool is visible to the BMC's own monitoring
 * thread, which reads sensor registers through the same selector. Writing it
 * when nothing needs to change would widen that window for no reason. */
static void select_bank(int bank)
{
    int now;
    save_entry_bank();
    if (nct_read(REG_BANK, &now) == 0 && now == (bank & 0xff))
        return;
    if (nct_write(REG_BANK, bank & 0xff) < 0)
        die("bank write failed");
    if (nct_read(REG_BANK, &now) < 0)
        die("bank readback failed");
    if (now != (bank & 0xff)) {
        putsn(2, "nct7904: bank switch did not take: wrote ");
        put_hex2(2, bank & 0xff);
        putsn(2, ", read ");
        put_hex2(2, now);
        putsn(2, "\n");
        finish(1);
        for (;;) {}
    }
}

/* ---- argument parsing ---------------------------------------------------- */
/* Strict: a value must be entirely numeric. Returning 0 for "xyz" -- which is
 * what this used to do -- means a typo silently retargets the operation at
 * register 0, address 0, or bus 0 instead of failing. On a fan controller that
 * is not a cosmetic difference. Bails on absurd magnitudes so the accumulate
 * cannot overflow before the range check sees it. */
static int parse_int(const char *s, int *ok)
{
    int v = 0, neg = 0, any = 0;
    *ok = 0;
    if (*s == '-') { neg = 1; s++; }
    if (s[0] == '0' && (s[1] == 'x' || s[1] == 'X')) {
        s += 2;
        for (;; s++) {
            int c = *s, d;
            if (c >= '0' && c <= '9') d = c - '0';
            else if (c >= 'a' && c <= 'f') d = c - 'a' + 10;
            else if (c >= 'A' && c <= 'F') d = c - 'A' + 10;
            else break;
            if (v > 0x0FFFFFF) break;      /* leaves trailing digits -> rejected */
            v = v * 16 + d;
            any = 1;
        }
    } else {
        for (; *s >= '0' && *s <= '9'; s++) {
            if (v > 0x0FFFFFF) break;
            v = v * 10 + (*s - '0');
            any = 1;
        }
    }
    if (!any || *s != 0)
        return 0;
    *ok = 1;
    return neg ? -v : v;
}

/* Parse and range-check one argument. Returns -1 (without touching *out) if the
 * text is not a number or is outside [lo,hi]. */
static int arg_int(const char *s, int lo, int hi, int *out)
{
    int ok, v = parse_int(s, &ok);
    if (!ok || v < lo || v > hi)
        return -1;
    *out = v;
    return 0;
}

static int streq(const char *a, const char *b)
{
    while (*a && *a == *b) { a++; b++; }
    return *a == *b;
}

static void usage(void)
{
    putsn(2, "usage: nct7904 [--bus N] [--addr A] [--bank B] <op>\n"
              "  --identity\n"
              "  --read  REG\n"
              "  --write REG VAL\n"
              "  --dump  FIRST LAST\n");
    finish(2);
    for (;;) {}
}

int main(int argc, char **argv)
{
    int bank = -1, reg = 0, val = 0, first = 0, last = 0;
    int do_identity = 0, do_read = 0, do_write = 0, do_dump = 0;
    int i = 1;

    /* Arguments are fully parsed and range-checked BEFORE any hardware is
     * touched, so a bad argument can never half-apply an operation and then
     * fail -- which on a fan controller means never leaving a fan part-set. */
    while (i + 1 < argc) {
        if (streq(argv[i], "--bus")) {
            if (arg_int(argv[i + 1], 0, 63, &g_bus) < 0)
                die("bad --bus (want 0..63)");
            i += 2;
        } else if (streq(argv[i], "--addr")) {
            if (arg_int(argv[i + 1], 0x03, 0x7f, &g_addr) < 0)
                die("bad --addr (want 0x03..0x7f)");
            i += 2;
        } else if (streq(argv[i], "--bank")) {
            if (arg_int(argv[i + 1], 0, 0xff, &bank) < 0)
                die("bad --bank (want 0..255)");
            i += 2;
        } else break;
    }

    if (i < argc && streq(argv[i], "--identity") && i + 1 == argc) {
        do_identity = 1;
    } else if (i < argc && streq(argv[i], "--read") && i + 2 == argc) {
        if (arg_int(argv[i + 1], 0, 0xff, &reg) < 0)
            die("bad register (want 0..255)");
        do_read = 1;
    } else if (i < argc && streq(argv[i], "--write") && i + 3 == argc) {
        if (arg_int(argv[i + 1], 0, 0xff, &reg) < 0)
            die("bad register (want 0..255)");
        if (arg_int(argv[i + 2], 0, 0xff, &val) < 0)
            die("bad value (want 0..255)");
        do_write = 1;
    } else if (i < argc && streq(argv[i], "--dump") && i + 3 == argc) {
        if (arg_int(argv[i + 1], 0, 0xff, &first) < 0 ||
            arg_int(argv[i + 2], 0, 0xff, &last) < 0)
            die("bad --dump range (want 0..255 each)");
        if (first > last)
            die("--dump FIRST must not exceed LAST");
        do_dump = 1;
    } else {
        usage();
    }

    nct_open();
    verify_identity();
    save_entry_bank();

    if (do_identity) {
        int vendor = read_or_die(REG_VENDOR);
        int chip = read_or_die(REG_CHIP);
        int b = read_or_die(REG_BANK);
        putsn(1, "vendor="); put_hex2(1, vendor);
        putsn(1, " chip=");  put_hex2(1, chip);
        putsn(1, " bank=");  put_hex2(1, b);
        putsn(1, " bus=");   put_dec(1, g_bus);
        putsn(1, " addr=");  put_hex2(1, g_addr);
        putsn(1, " OK\n");
    } else if (do_read) {
        if (bank >= 0) select_bank(bank);
        put_hex2(1, read_or_die(reg));
        putsn(1, "\n");
    } else if (do_write) {
        int back;
        if (bank >= 0) select_bank(bank);
        if (nct_write(reg, val) < 0)
            die("register write failed");
        back = read_or_die(reg);
        if (back != (val & 0xff)) {
            putsn(2, "nct7904: write did not stick: wrote ");
            put_hex2(2, val & 0xff);
            putsn(2, ", read back ");
            put_hex2(2, back);
            putsn(2, "\n");
            finish(1);
            for (;;) {}
        }
        putsn(1, "wrote "); put_hex2(1, val & 0xff);
        putsn(1, " to ");   put_hex2(1, reg & 0xff);
        putsn(1, ", read back "); put_hex2(1, back);
        putsn(1, "\n");
    } else if (do_dump) {
        int r;
        if (bank >= 0) select_bank(bank);
        for (r = first; r <= last; r++) {
            put_hex2(1, r & 0xff);
            putsn(1, " ");
            put_hex2(1, read_or_die(r));
            putsn(1, "\n");
        }
    }

    finish(0);          /* restores the bank; code 3 if it would not restore */
}

/* argc/argv are on the stack at entry; grab them before anything else runs. */
__attribute__((naked, noreturn)) void _start(void)
{
    __asm__ volatile (
        "ldr r0, [sp]\n"
        "add r1, sp, #4\n"
        "bl  main\n"
        "mov r7, #248\n"
        "svc #0\n"
    );
}
```

{% endfold %}

然后写了一个与 SYSFAN 类似的 Python 脚本来 invoke:

{% fold "fibfan" %}

```python
#!/usr/bin/env python3
"""fibfan -- automatic/manual control of the FIB fans.

    sudo fibfan status          what the controller is doing right now
    sudo fibfan mode            just the auto/manual state
    sudo fibfan mode auto       hand the fans back to the automatic curve
    sudo fibfan mode manual     take them off the curve, duty frozen where it is
    sudo fibfan set 40          manual mode + drive BOTH channels at 40%

This is the FIB counterpart of the SYSFAN procedure (netfn 0x2a): same idea --
switch a fan group between automatic and manual, then set a percentage -- but
the FIB fans have no IPMI command, so it goes to the NCT7904D over I2C instead.
The path is: this host -> KCS -> netfn 0x36 cmd 0x01 -> /conf/nct7904 on the
BMC -> I2C bus 13 addr 0x2d. No SSH, no network.

RUN IT WITH sudo. The script does not escalate on its own: `ipmitool -I open`
needs root and the raw KCS device /dev/ipmi0 is root-only, so without sudo
ipmitool fails with "Could not open device at /dev/ipmi0".

Self-contained on purpose -- stdlib only, it does not import ipmi_oem and does
not call bmc_sh, so it can be copied out on its own:

    sudo install -m 0755 fibfan /usr/local/sbin/

WHAT IT CONTROLS.  Bank 3 register 0x00 is a bitmap that maps temperature
source T1 onto the two fan-control outputs:
    bit0 set -> FANCTL1 (Bank3 0x10) follows the curve, clearest -> FIB_FAN1/2/3
    bit1 set -> FANCTL2 (Bank3 0x11) follows the curve, cleared  -> FIB_FAN7/8/9/10
0x03 = both automatic (normal), 0x00 = both manual. 'set' drives both together;
FANCTL3/4 (0x12/0x13) have no populated fans and are never touched.

THINGS THIS WILL NOT TELL YOU, AND THINGS IT WILL DO TO YOUR MACHINE
-------------------------------------------------------------------
* 'set' PERSISTENTLY DISABLES THERMAL CONTROL for those 7 fans. The duty stays
  where you put it, through heat and through reboots, until you run
  'fibfan mode auto'. There is no timeout and no guardian. Do not leave it
  manual and walk away.
* Every manual write makes the BMC log a lower-non-recoverable assertion /
  deassertion pair in the SEL. A long manual session = a lot of SEL churn.
  That is expected, not a fault.
* Register readback is NOT proof the fans changed speed. To see the actual
  effect, look at the BMC's own sensor view:
      sudo ipmitool -I open sensor | grep FIB_FAN
  Note 'set' writes the duty and returns; the tach takes some seconds to settle.
* Percentages are quantised to 1/255. 75% becomes 0xbf (74.9%), because
  255*0.75 = 191.25 rounds down. The chip's own curve constant for "75%" is
  0xc0 (75.29%) -- so if you are reproducing a bench reading, expect that 1-LSB
  difference and do not read it as a bug.
* 0% is refused: duty 0x00 stops the fans. The usable range is 1..100.
"""

import argparse
import os
import re
import subprocess
import sys
import time

# ---- in-band channel (same ~30 lines as bmc_sh, kept local on purpose) -----

MAGIC = 0xA5
OP_START, OP_READ, OP_KILL = 0x01, 0x02, 0x03
FLAG_EXITED, FLAG_FAIL = 0x02, 0x08

HDR = 7
MAXCMD = 176                # blob's ceiling, not 255
CALL_TIMEOUT = 15.0

CC = {0xC0: "all 8 session slots are in use -- something is leaking sessions",
      0xC1: "the BMC says: bad command",
      0xC7: "the BMC says: bad request length",
      0xC9: "the BMC says: no such session",
      0xCF: "the BMC says: the operation failed",
      0xD5: "the BMC says: request inactive"}


class Err(RuntimeError):
    pass


def raw(args, timeout=CALL_TIMEOUT):
    cmd = ["ipmitool", "-I", "open", "raw", "0x36", "0x01"] + \
          ["0x%02x" % (b & 0xFF) for b in args]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise Err("no answer from the BMC in %.0fs -- channel wedged?" % timeout)
    except FileNotFoundError as e:
        raise Err("cannot run ipmitool: %s" % e)
    out = (p.stdout or "").strip()
    err = (p.stderr or "").strip()
    if not out:
        raise Err(err or "ipmitool returned nothing")
    try:
        return bytes.fromhex(out.replace(" ", ""))
    except ValueError:
        m = re.search(r"rsp=0x([0-9a-fA-F]{2})", out)
        if m:
            cc = int(m.group(1), 16)
            raise Err(CC.get(cc, "the BMC refused the request (cc=0x%02x)" % cc))
        raise Err("unexpected reply from ipmitool: %r" % out)


def release(sid):
    """KILL then READ once -- KILL alone does not free the slot, only a READ
    that sees EOF does, and a killed-but-never-read slot stays live in the
    8-entry table until the daemon restarts."""
    try:
        raw([MAGIC, OP_KILL, 1, sid])
    except Err:
        return
    try:
        raw([MAGIC, OP_READ, 1, sid])
    except Err:
        pass


def run(cmd, timeout=30.0):
    b = cmd.encode()
    if not b:
        raise Err("empty command")
    if len(b) > MAXCMD:
        raise Err("internal error: helper command is %d bytes (max %d)"
                  % (len(b), MAXCMD))
    d = raw([MAGIC, OP_START, len(b)] + list(b))
    if len(d) < HDR:
        raise Err("short START reply: %s" % d.hex())
    if d[0] & FLAG_FAIL:
        raise Err("START refused (flags=0x%02x)" % d[0])
    sid = d[1]

    exited = False
    buf = bytearray()
    t0 = time.time()
    try:
        while True:
            if time.time() - t0 > timeout:
                raise Err("the BMC did not finish in %.0fs" % timeout)
            d = raw([MAGIC, OP_READ, 1, sid])
            if len(d) < HDR:
                raise Err("short READ reply: %s" % d.hex())
            flags, chunk = d[0], d[7:7 + d[6]]
            buf += chunk
            if flags & FLAG_EXITED:
                exited = True
                break
            if not chunk:
                time.sleep(0.02)
        return buf.decode(errors="replace")
    finally:
        if not exited:
            release(sid)


# ---- the NCT7904D helper --------------------------------------------------

# The blob execs with a PATH containing neither /conf nor /var/tmp, so the
# helper must be named by absolute path. The address is passed explicitly
# rather than relying on the helper's defaults.
NCT = "/conf/nct7904 --bus 13 --addr 0x2d"


def nct(*op):
    cmd = "%s %s" % (NCT, " ".join(op))
    out = run(cmd).strip()
    if "fail" in out.lower() or not out:
        raise Err("helper said: %r" % out)
    return out


def rd(reg):
    return int(nct("--bank", "3", "--read", "0x%02x" % reg), 0)


def wr(reg, val):
    # The helper writes and reads back itself; 'wrote 0xNN to 0xNN, read back
    # 0xNN' is its own discipline, not something this script re-checks.
    return nct("--bank", "3", "--write", "0x%02x 0x%02x" % (reg, val))


def to_byte(pct):
    """Percent -> duty byte, rounded half up. NOT round(): that is banker's
    rounding and gives 76 for 30% instead of the intended 77."""
    return (pct * 255 + 50) // 100


# ---- the outputs we speak about -------------------------------------------

# bit of Bank3 0x00 -> (label, register, what it drives)
CH = [(0x01, "FANCTL1", 0x10, "FIB_FAN1/2/3"),
      (0x02, "FANCTL2", 0x11, "FIB_FAN7/8/9/10")]

MAPPING_HINT = {0x00: "both channels MANUAL -- no thermal control",
                0x01: "FANCTL1 manual, FANCTL2 automatic",
                0x02: "FANCTL1 automatic, FANCTL2 manual",
                0x03: "both channels AUTOMATIC (normal)"}


def decode_map(v):
    return MAPPING_HINT.get(v, "unexpected value -- treat with suspicion")


def cmd_status():
    dump = nct("--bank", "3", "--dump", "0x00 0x13")
    reg = {}
    for line in dump.splitlines():
        f = line.split()
        if len(f) == 2 and f[0].startswith("0x"):
            reg[int(f[0], 16)] = int(f[1], 16)
    if 0x00 not in reg:
        raise Err("could not parse the dump: %r" % dump)

    print("Bank 3 (NCT7904D, bus 13 addr 0x2d)")
    print("  0x00 T1 mapping : 0x%02x  %s" % (reg[0x00], decode_map(reg[0x00])))
    for bit, label, r, fans in CH:
        auto = bool(reg[0x00] & bit)
        v = reg.get(r)
        if v is None:
            print("  0x%02x %-8s: (not read)" % (r, label))
        else:
            print("  0x%02x %-8s: 0x%02x = %5.1f%%  %-8s  -> %s"
                  % (r, label, v, v * 100.0 / 255.0,
                     "auto" if auto else "MANUAL", fans))
    m = reg.get(0x08)
    print("  0x08 loop mode  : %s"
          % ("(not read)" if m is None else
             {0x02: "0x02 open-loop PWM duty (normal)"}.get(
                 m, "0x%02x -- unexpected" % m)))
    print("\nFor real RPM: sudo ipmitool -I open sensor | grep FIB_FAN")


def cmd_mode(which):
    if which is None:
        v = rd(0x00)
        print("0x00 T1 mapping : 0x%02x  %s" % (v, decode_map(v)))
        for bit, label, r, fans in CH:
            print("  %-8s: %s  (bank3 0x%02x -> %s)"
                  % (label, "auto" if v & bit else "MANUAL", r, fans))
        return
    if which == "auto":
        wr(0x00, 0x03)
        print("automatic: FANCTL1/2 back on the T1 curve. Duty will be recomputed "
              "by the chip within a few seconds; give the tach ~90s to settle.")
    else:
        wr(0x00, 0x00)
        print("manual: FANCTL1/2 off the curve, duty frozen at its current value.")
        print("Nothing will raise the speed for heat until 'fibfan mode auto'.")


def cmd_set(pct):
    b = to_byte(pct)
    # Clear the mapping FIRST. While a T1 bit is still set the chip overwrites
    # 0x10/0x11 from its curve within seconds (measured: 0x8e -> 0x99 with
    # nobody writing), so a duty written under an auto bit is silently undone.
    wr(0x00, 0x00)
    for _, label, r, fans in CH:
        wr(r, b)
    print("both channels manual at %d%% (duty 0x%02x = %.1f%%): %s"
          % (pct, b, b * 100.0 / 255.0, ", ".join(f[3] for f in CH)))
    print("Persistent until 'fibfan mode auto'. Check the tach after ~45s:")
    print("  sudo ipmitool -I open sensor | grep FIB_FAN")


def main(argv=None):
    ap = argparse.ArgumentParser(
        prog="fibfan",
        description="FIB fan auto/manual mode and manual duty, via the in-band "
                    "channel to /conf/nct7904 on the BMC. Run it under sudo.",
        epilog="'set' disables thermal auto-control for FIB_FAN1/2/3 and 7-10 "
               "until 'mode auto'. Register readback does not prove the fans "
               "changed -- check 'ipmitool sensor | grep FIB_FAN'.")
    sub = ap.add_subparsers(dest="cmd")

    sub.add_parser("status", help="show the mapping and the FANCTL duty registers")

    p_mode = sub.add_parser("mode", help="show or change the auto/manual mode")
    p_mode.add_argument("which", nargs="?", choices=["auto", "manual"],
                        help="omit to just show the current mode")

    p_set = sub.add_parser("set", help="manual mode, both channels at N percent")
    p_set.add_argument("pct", type=int, metavar="N", help="1-100")

    a = ap.parse_args(argv)
    if a.cmd is None:
        ap.print_help()
        return 2
    if a.cmd == "set" and not 1 <= a.pct <= 100:
        ap.error("percentage must be 1-100 (0 stops the fans)")
    if os.geteuid() != 0:
        sys.stderr.write("fibfan: must run as root -- try: sudo fibfan %s\n"
                         % " ".join(argv if argv is not None else sys.argv[1:]))
        return 1

    try:
        if a.cmd == "status":
            cmd_status()
        elif a.cmd == "mode":
            cmd_mode(a.which)
        else:
            cmd_set(a.pct)
    except Err as e:
        sys.stderr.write("fibfan: %s\n" % e)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
```

{% endfold %}

如此便实现了手动控制 GPU 风扇.

## 感受...

这年头 Agent 太能写了... 我只需要给出一些方向, 把 plan 看好了, 剩下的一切都不用管, 自然而然就能完成... 唯一的问题反倒是要定期让 Agent 清理大量 defensive 代码, 保持代码的简洁性.

Anyway, 我可以给 GPU Fan 拉满了!