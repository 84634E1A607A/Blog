---
updated: 2025-03-23 00:48:09
title: Two Examples Tackling UsrMerge
date: 2024-01-20 18:10:57
description: This post discusses two usrmerge issues encountered during upgrades from Debian 9 to Debian 12 and Ubuntu 20.04 LTS to 22.04 LTS, detailing the problems caused by a statically linked `/bin/cp` and duplicate `ld-linux-x86-64.so.2` files, along with solutions and workarounds.
tags:
  - 技术
  - 运维
---

Several days ago I encountered two separate usrmerge issues on different OSes. One upgrading from Debian 9 to Debian 12; the other upgrading from Ubuntu 20.04 LTS to Ubuntu 22.04 LTS. I solved them both, and here's what I did.

<!-- more -->

## Cannot close fd bug due to staticly-linked /bin/cp

That very Debian 9 has a statically-linked cp command, and the following sub-procedure failed, as `ldd /bin/cp` should return an error. I've submitted [a bug report](https://bugs.debian.org/cgi-bin/bugreport.cgi?bug=1061178) to usrmerge package about this bug. If `/bin/cp` is statically linked, this check may be bypassed.

```perl
sub early_conversion_files {
	open(my $fh, '-|', 'ldd /bin/cp');
	my @ldd = <$fh>;
	close $fh;
	...
```

**Update**: The problem seems to be quite specific. `/bin/cp` is dynamically linked in Debian 10-12, and the script didn't report an error when `/bin/cp` is statically linked. It could be Debian 9 using a too low version of ldd that behaves differently.

---

## Both `/lib64/ld-linux-x86-64.so.2` and `/usr/lib64/ld-linux-x86-64.so.2` exist bug

There're reports of this bug. If you *have* renamed *any* of the two files, your Linux cannot run any dynamically linked program. Including `ln`, `mv` and `cp`. But there *is* some way back.

- If you have a USB stick with Linux installer image, just use it and make `/lib64/ld-linux-x86-64.so.2` a **symbolic** link of `/usr/lib64/ld-linux-x86-64.so.2`. Hard link will not solve the issue.
- If, unfortunate like me, I do not have physical access to the server at the time, but fortunately I'm **in a root shell**, you can use **`busybox`** or other **statically-linked** binary to move that shared library back, or create a symbolic link. On Ubuntu 22.04 LTS, busybox is statically linked. (However, on Debian, it is dynamically linked so other approaches may be taken.) 

After making a symbolic link, reinstall usrmerge and the bug should be worked around.
