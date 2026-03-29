---
title: What happens when root user UID is not 0?
updated: 2026-03-29 22:27:30
date: 2026-03-29 20:43:19
description: "This post examines a deliberately misconfigured Debian system where the account named root is separated from UID 0, showing that many Linux tools implicitly rely on both assumptions at once; the conclusion is that breaking this convention causes inconsistent privilege handling, permission errors, and rapid system instability."
tags:
 - Linux
---

As we know, the default PoC of DirtyCOW overwrites `/etc/passwd` and [changed the username of root user to `toor`](https://github.com/firefart/dirtycow/blob/75242ef4a92b02e6ea0e6062147d62632fdeca1b/dirty.c#L47). This raises a question: What happens if the `root` user UID is not 0, while another user has UID 0?

Recently, to fool someone, I started a new VM and tested this. It went wild and the VM quickly became quite a mess. So in this article, I will share some results and thoughts.

<!-- more -->

## The wording

Before we dive into the funny details, let's clarify the wording. In this article, I will refer to the user with UID 0 as root user (root without quotes), and the user with username `root` as `root` user (`root` with quotes). The root user's name is `rot`.

I actually have destroyed the VM before I write this blog, so I am now spinning up another one.

## The user

The first thing is to rename user `root` to `rot`. To do this (ChatGPT strongly recommends against this), I changed the root line in `/etc/passwd`, `/etc/shadow`, `/etc/group`, and `/etc/gshadow` to `rot`. (The root password is `root`. Don't waste time to crack the yescrypt hash.)

```text
rot:x:0:0:rot:/rot:/bin/bash
```

```text
rot:$y$j9T$1NSCrFmr9Sszgg/.Ml2Bq1$i3eTIq.NecSgIBEPWzWarhvCsGjwIlqDHWQvakG6aPA:20286:0:99999:7:::
```

```text
rot:x:0:
```

```text
rot:*::
```

Then, to further mess up the system, I tried to create a new user with name `root`, and the UID is not 0.

```bash
root@debian:~# /usr/sbin/useradd -m -s /bin/bash root
useradd: user 'root' already exists
```

The first weird thing comes up: I cannot create a new user with name `root`, even though the `root` user does not exist in `/etc/passwd` anymore. To make sure the `root` prefix in the bash prompt is not the cause, I logged out and ran `su` again.

```bash
skyworks@debian:~$ su
Password:
su: Authentication failure
```

**Key Takeaway**: `su` on Debian Trixie (and other modern Linux distributions) defaults to user with name `root`, instead of user with UID 0. (See [GitHub util-linux](https://github.com/util-linux/util-linux/blob/8ecb24ae653c1329b34746e9ac8415f428ba33cb/login-utils/su-common.c#L109))

```c
/* The user to become if none is specified.  */
#define DEFAULT_USER "root"
```

The man page says,

> When called with no user specified, su defaults to running an interactive shell as root.

The `root` is literal.

## The root

Unable to create a new user with name `root`, I rebooted the VM.

After reboot, I tried to log in with SSH as the newly created `rot` user. Doesn't work.

**Key Takeaway**: SSHD AllowRootLogin compares the UID of the user, not the username.

Out of curiosity, I tried to run `su` from `rot` user shell. It actually works! You land in `rot` user and the log says:

```text
Mar 29 21:26:09 debian su[1503]: (to root) rot on pts/1
Mar 29 21:26:09 debian su[1503]: pam_unix(su:session): session opened for user root(uid=0) by skyworks(uid=0)
```

That means, even though the `root` user does not exist, there is still a shadow entry for `root` pointing to UID=0, and `su` can still find it and switch to it if you are already root (this bypasses the password check). However, if you are not root, since there is no `root` user in `/etc/passwd`, you cannot switch to it because the password check will always fail.

**Key Takeaway**: A shadow entry with UID=0 still exists in PAM with the name `root`, and it can be switched to.

Still unable to create user `root`, I added a new user manually. Looks like this completely breaks the system. Now:

**Key Takeaway**: When there is a user with name `root` while its UID is not 0, it takes precedence over the shadow entry.

`su` now switches to this `root` user, and `sudo CMD` also switches to this one. `sudo su` actually asks for the password twice, one for the user running `sudo`, and one for the `su` command, because `sudo`ed user `root` is not root. AND, the result, you are in `root` user.

```bash
skyworks@debian:~$ sudo su
[sudo] password for skyworks:
Password:
root@debian:/home/skyworks$
```

## The mess

Things begin to get really weird now. First thing is, after rebooting, `/root` is owned by root (UID=0) now. Who set it?

And journalctl is spammed with failures of `cupsd`:

```log
Mar 29 21:53:01 debian CRON[1409]: pam_unix(cron:session): session opened for user rot(uid=0) by rot(uid=0)
Mar 29 21:53:01 debian CRON[1411]: (rot) CMD (    echo 1)
Mar 29 21:53:01 debian cron[1412]: 2026-03-29 21:53:01 Exim configuration file /var/lib/exim4/config.autogenerated has the wrong owner, group, or mode
Mar 29 21:53:01 debian CRON[1409]: (rot) MAIL (mailed 2 bytes of output but got status 0x0001 from MTA
                                   )
Mar 29 21:53:01 debian CRON[1409]: pam_unix(cron:session): session closed for user rot
```

The `/var/lib/exim4/config.autogenerated` is owned by `root`, not `rot`.

```bash
rot@debian:/home/skyworks# ls -al /var/lib/exim4/
total 60
drwxr-xr-x 1 rot  rot           124 Mar 29 21:49 .
drwxr-xr-x 1 rot  rot           580 Mar 29 20:57 ..
-rw-r--r-- 1 rot  rot             4 May 17  2025 berkeleydbvers.txt
-rw-r----- 1 root Debian-exim 25450 Mar 29 21:22 config.autogenerated
-rw-r----- 1 root Debian-exim 25450 Mar 29 21:49 config.autogenerated.tmp
```

And cups log is also spammed with:

```log
W [29/Mar/2026:21:56:45 +0800] Notifier for subscription 20 (dbus://) went away, retrying!
E [29/Mar/2026:21:56:45 +0800] File \"/usr/lib/cups/notifier/dbus\" has insecure permissions (0100755/uid=996/gid=996).
```

Looks like linux system utilities and services are really confused about the root user. Maybe some just assume the root user is always UID=0.

## The upgrade

I ran `apt upgrade` to see if it can *fix* the system. Well, it F**ed It eXtremely up. VMWare Tools looks broken with permission issues

```log
Mar 29 22:02:18 debian VGAuthService[11576]: ServiceFileVerifyFileOwnerAndPerms: uid mismatch for /var/lib/vmware/VGAuth/aliasStore (want 996, found 0)
Mar 29 22:02:18 debian VGAuthService[11576]: Alias store directory '/var/lib/vmware/VGAuth/aliasStore' has incorrect owner or permissions.  Any Aliases currently stored in '/var/lib/vmware/VGAuth/aliasStore' will not be available for au
thentication.
```

And `sudo` is broken with:

```bash
adb@debian:~$ sudo su
sudo: /usr/bin/sudo must be owned by uid 0 and have the setuid bit set
adb@debian:~$ ls -al /usr/bin/sudo
-rwsr-xr-x 1 root root 306456 Feb 12 03:22 /usr/bin/sudo
```

Who make sudo owned by `root`? Then I checked `/usr/bin` folder, only to find out that ALL binaries that are upgraded are now owned by `root`!

```bash
rot@debian:/home/skyworks# ls -al /lib/systemd/systemd
-rwxr-xr-x 1 root root 133504 Sep  4  2025 /lib/systemd/systemd
```

And... after several reboots, more and more services are broken with permission issues.

**Key Takeaway**: Don't mess with the root user!
