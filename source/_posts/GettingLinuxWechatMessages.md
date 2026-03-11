---
title: 在 Linux 上通过 GDB 在命令行中获取微信消息
updated: 2026-03-11 21:25:42
date: 2026-03-11 20:17:04
description: "本文详细记录了利用GDB调试Linux版微信（AppImage）并通过LLM辅助逆向工程，在命令行中实时获取微信消息内容的技术实践，最终形成了一套稳定的自动化监控方案并提供了完整的Python脚本与Docker封装。"
tags:
  - 逆向工程
  - 技术
---

本篇探讨了如何结合 LLM 辅助的逆向工程技术, 在 Linux 上通过 GDB 调试微信, 从而在命令行中获取微信消息的内容.

<!-- more -->

## 背景

我有一个获取微信消息内容的需求 (只读就行), 市面上能找到的各种方案要么是 Wechat Web (但是我没有), 要么是神秘 hook 而且锁定版本, 要么是 Windows 平台. 但是在查找资料的时候看到一个 [帖子](https://www.52pojie.cn/thread-1955523-1-1.html) 讲了逆向 wechat beta 1.0.0.145 版本, 通过钩子拦截某个函数入口处的调用, 从内存中获取消息内容. 现在微信的版本已经更新了很多, 但是我觉得这个思路是可行的. 由于我觉得写钩子, LD PRELOAD DLL 注入比较麻烦, 而且总觉得会被封号, 所以我选择了一个最简单粗暴的方案: 用 GDB 调试微信, 利用 GDB 的断点来自动获取消息.

## LLM 辅助的逆向工程

我们的微信是 4.1.0.16 版本的 AppImage

```sh
3df97cd6535594c256c8fa85962d407f6abca512ee8dc2828d8a082c2283c7c5  wechat-appimage.AppImage
```

使用的工具是从课题组借的 IDA Pro, [IDA Pro MCP](https://github.com/mrexodia/ida-pro-mcp) 插件和 CodeX. 尽管 LLM 常常拒绝攻击类的请求, 但是逆向似乎还在它的接受范围内, 而且甚至在有大量的逆向 context 的情况下让它分析点安全有关的东西也不是不行.

Linux AppImage 版本的微信是一个自解压的压缩包, 里面的主程序 `wechat` 是:

```sh
squashfs-root/opt/wechat/wechat: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 3.2.0, BuildID[sha1]=f8713825deff246793a1b919d22e79ae28abfc48, stripped
```

用 IDA 打开, 大概进行了 10min 的初始分析之后, IDA 得到了将近 28 万个函数. 程序整体虽然 strip 了, 但是里面有大量的调试 log 一类的字符串可以辅助分析.

我要求 CodeX 查找从 MMTLS --> 解密 --> 消息内容 --> 消息通知 的逻辑. CodeX 在干了 5min 左右之后给出了如下的调用链条:

```text
  MMTLSShortLink_HandleRecvBuf_DecryptAndDispatch
  -> plaintext consumer callback via sub_6B98AC0(a6, a1+5408)
  -> 0x498FB20 NewSync_CoDoSync
  -> 0x4992960 NewSync_HandleSyncResponseAndBuildPreNotify
  -> 0x49948D0 NewSync_ProcessStashMsgList
  -> 0x49C4DC0 NewSync_HandleIncomingMessage_PreNotify
```

在纠结了一段时间 Base Address 之后, 我决定先放弃 ASLR, 直接用 GDB 启动微信, 此时可以确认 baddr == 0x555555554000. 在 GDB 中在 `sub_6B98AC0` 打断效果不算太好, 有大量杂散调用; 这之后我尝试了 `NewSync_HandleIncomingMessage_PreNotify`, 但是会漏很多消息; 之后尝试 `NewSync_HandleIncomingMessage_PreNotify (0x499568A)` 无效, 尝试 `0x4994BEB` (在 `NewSync_ProcessStashMsgList` 函数中遍历列表, 对列表中的每个消息调用相应处理函数的循环中的一个调用) 时成功打断了. CodeX 建议

```sh
  set $msg = $rsi
  set $type = *(int *)($msg + 0x14)
  set $svrid = *(unsigned long long *)($msg + 0x50)
  set $holder = *(void **)($msg + 0x20)
  set $inner = *(void **)($holder + 0x8)
  p/x $msg
  p $type
  p/x $svrid
  p/x $holder
  p/x $inner
```

可以获取消息的类型等基本信息, 经测试基本正确, 因此可以判断这是正确的断点位置. 我又让 CodeX 研究了一下如何正确获取消息的发送者, 给一个 Python script, CodeX 给出了一大段代码 (但是已经被我弄丢了). 在 GDB 中的断点现场执行的时候, 能正确获取到消息的发送者, 消息内容等信息. 通过

```sh
commands 1
source /path/to/script.py
continue
end
```

可以让 GDB 在每次断点时自动执行这个脚本. 此时可以看到命令行中的消息文本了.

如何让这个脚本更加方便执行呢? 我让 CodeX 写了一个 one-liner 的 startup script:

```sh
gdb -p "$(pidof wechat)" -ex "python exec(open('/home/ajax/tmp/wechat/gdb_hook_wechat_messages.py').read(), {'gdb': gdb, '__name__': '__main__'}); gdb.execute('hook-wechat-messages')" -ex c
```

然后把查找 Base Address 的部分写进去, 就得到了一个可以直接运行的脚本:

```python
import os
import gdb
import re

WECHAT_PATH_HINT = os.environ.get("WECHAT_PATH_HINT", "/opt/wechat/wechat")

# 这里的 RVA 是针对性的, 应该会随着微信版本的更新而失效, 需要重新逆向确认
BP_RVA = int(os.environ.get("WECHAT_BP_RVA", "0x4994BEB"), 0)


def log(message):
    print(message, flush=True)


def path_matches(path):
    if WECHAT_PATH_HINT and WECHAT_PATH_HINT in path:
        return True
    return path.endswith("/wechat") or path.endswith("/usr/bin/wechat")


# 这里通过 info proc mappings 查找可执行文件的内存映射来找到微信的 Base Address, 以便在不同环境下都能正确计算断点地址. 第一个匹配到的路径包含 WECHAT_PATH_HINT 的 Base Address 是我们需要的地址
# ...
# 0x00003cc0007b7000 0x00003cc400000000 0x3ff849000        0x0                ---p  [anon:partition_alloc]
# 0x0000555650980000 0x0000555653f85000 0x3605000          0x0                r--p  /tmp/.mount_wechatIIbHMF/opt/wechat/wechat
# 0x0000555653f86000 0x0000555658926000 0x49a0000          0x3605000          r-xp  /tmp/.mount_wechatIIbHMF/opt/wechat/wechat
# ...
def detect_wechat_base():
    out = gdb.execute("info proc mappings", to_string=True)
    for line in out.splitlines():
        m = re.match(
            r"\s*(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s+(0x[0-9a-fA-F]+)\s+([rwxps-]+)\s+(.+)",
            line,
        )
        if not m:
            continue
        path = m.group(6).strip()
        if not path_matches(path):
            continue
        return int(m.group(1), 16)
    raise gdb.GdbError(f"failed to find wechat mapping for hint={WECHAT_PATH_HINT!r}")


def read_u8(addr):
    return int(gdb.parse_and_eval(f"*(unsigned char *)({addr})"))


def read_u32(addr):
    return int(gdb.parse_and_eval(f"*(unsigned int *)({addr})"))


def read_u64(addr):
    return int(gdb.parse_and_eval(f"*(unsigned long long *)({addr})"))


def read_ptr(addr):
    return int(gdb.parse_and_eval(f"*(void **)({addr})"))


def read_cstr(addr, max_len=4096):
    if not addr:
        return None
    inf = gdb.selected_inferior()
    data = inf.read_memory(addr, max_len).tobytes()
    end = data.find(b"\x00")
    if end >= 0:
        data = data[:end]
    return data.decode("utf-8", "replace")


def decode_wx_string(obj):
    if not obj:
        return None
    tag = read_u8(obj)
    if tag & 1:
        return read_cstr(read_ptr(obj + 0x10))
    return read_cstr(obj + 0x1)


def parse_message(msg):
    msg_type = read_u32(msg + 0x14)
    svr_id = read_u64(msg + 0x50)

    src_wrap_a = read_ptr(msg + 0x08)
    src_wrap_b = read_ptr(msg + 0x18)

    src_obj_a = read_ptr(src_wrap_a + 0x08) if src_wrap_a else 0
    src_obj_b = read_ptr(src_wrap_b + 0x08) if src_wrap_b else 0

    sender = decode_wx_string(src_obj_a) if src_obj_a else None
    talker = decode_wx_string(src_obj_b) if src_obj_b else None

    holder = read_ptr(msg + 0x20)
    inner = read_ptr(holder + 0x08) if holder else 0
    content = decode_wx_string(inner) if inner else None

    return {
        "msg": msg,
        "type": msg_type,
        "svrid": svr_id,
        "src_wrap_a": src_wrap_a,
        "src_wrap_b": src_wrap_b,
        "src_obj_a": src_obj_a,
        "src_obj_b": src_obj_b,
        "sender": sender,
        "talker": talker,
        "holder": holder,
        "inner": inner,
        "content": content,
    }


class WechatMessageBreakpoint(gdb.Breakpoint):
    def stop(self):
        try:
            msg = int(gdb.parse_and_eval("$rsi"))
            info = parse_message(msg)
            log("===WECHAT_MSG_BEGIN===")
            log(
                "("
                + f"msg=0x{info['msg']:x}, "
                + f"type={info['type']}, "
                + f"svrid=0x{info['svrid']:x}, "
                + (f"src_wrap_a=0x{info['src_wrap_a']:x}, " if info["src_wrap_a"] else "src_wrap_a=0x0, ")
                + (f"src_wrap_b=0x{info['src_wrap_b']:x}, " if info["src_wrap_b"] else "src_wrap_b=0x0, ")
                + (f"src_obj_a=0x{info['src_obj_a']:x}, " if info["src_obj_a"] else "src_obj_a=0x0, ")
                + (f"src_obj_b=0x{info['src_obj_b']:x}, " if info["src_obj_b"] else "src_obj_b=0x0, ")
                + f"sender={repr(info['sender'])}, "
                + f"talker={repr(info['talker'])}, "
                + (f"holder=0x{info['holder']:x}, " if info["holder"] else "holder=0x0, ")
                + (f"inner=0x{info['inner']:x}, " if info["inner"] else "inner=0x0, ")
                + f"content={repr(info['content'])}"
                + ")"
            )
            log("===WECHAT_MSG_END===")
        except Exception as e:
            log("===WECHAT_MSG_BEGIN===")
            log(f"(error={repr(str(e))})")
            log("===WECHAT_MSG_END===")
        return False


class HookWechatMessages(gdb.Command):
    def __init__(self):
        super(HookWechatMessages, self).__init__("hook-wechat-messages", gdb.COMMAND_USER)

    def invoke(self, arg, from_tty):
        base = detect_wechat_base()
        addr = base + BP_RVA
        WechatMessageBreakpoint(f"*0x{addr:x}")
        log(f"[wechat-msg] base=0x{base:x}")
        log(f"[wechat-msg] breakpoint=0x{addr:x}")


HookWechatMessages()
```

这样之后, 我们 attach 到微信的进程上, 就可以在命令行中看到微信消息了. 虽然这个方案比较... 重? 但是看上去还是相当稳定的. 然后我让 CodeX 写了个 Dockerfile 打了个包:

```dockerfile
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
    ca-certificates \
    dbus-x11 \
    fluxbox \
    fonts-noto-cjk \
    gdb \
    libasound2 \
    libatomic1 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libfuse2 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcb-icccm4 \
    libxcb-image0 \
    libxcb-keysyms1 \
    libxcb-render-util0 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxkbcommon-x11-0 \
    libxrandr2 \
    libxshmfence1 \
    libxss1 \
    libxtst6 \
    procps \
    psmisc \
    python3 \
    x11-utils \
    x11vnc \
    xauth \
    xvfb \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/wechat

COPY wechat-appimage.AppImage /opt/wechat/wechat-appimage.AppImage
COPY gdb_hook_wechat_messages.py /opt/wechat-hooks/gdb_hook_wechat_messages.py
COPY container/start-wechat-vnc.sh /usr/local/bin/start-wechat-vnc.sh
COPY container/attach-wechat-gdb.sh /usr/local/bin/attach-wechat-gdb.sh

RUN chmod 0755 /opt/wechat/wechat-appimage.AppImage \
 && chmod 0755 /usr/local/bin/start-wechat-vnc.sh /usr/local/bin/attach-wechat-gdb.sh \
 && mkdir -p /data

ENV DISPLAY=:0 \
    HOME=/data \
    APPIMAGE_EXTRACT_AND_RUN=1 \
    SCREEN_WIDTH=1366 \
    SCREEN_HEIGHT=768 \
    SCREEN_DEPTH=24 \
    VNC_PORT=5900 \
    WECHAT_ATTACH_TIMEOUT=180 \
    WECHAT_PROCESS_PATTERN=/(usr/bin/)?wechat([[:space:]]|$)

EXPOSE 5900

ENTRYPOINT ["/usr/local/bin/start-wechat-vnc.sh"]
```

## 结语

感觉还行? 这个输出可以导入到别的工具里面, 配合企业微信的 API 实现获取企业微信群消息并回复了. 至于这些玩意... 还在构思中, 可能还有一些 Gap 需要解决.
