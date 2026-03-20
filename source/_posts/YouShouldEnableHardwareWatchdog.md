---
title: You SHOULD Enable Hardware Watchdog
updated: 2026-03-20 11:26:51
date: 2026-03-20 09:46:59
description: "This article explains what hardware watchdogs are, how platform, ACPI, and IPMI watchdogs are exposed and configured on Linux systems, and where their recovery boundary lies. Its conclusion is that, if supported and correctly configured, a hardware watchdog should generally be enabled, especially on remote or unattended machines."
tags:
 - 运维
---

Recently I discovered that {% post_link HR650XServer "my server" %} has a hardware watchdog. I investigated a bit and found that it is actually quite common for servers / routers to have a hardware watchdog exposed. You SHOULD enable it if you have one, especially when you are remote and cannot easily access the machine.

<!-- more -->

A hardware watchdog is an **independent** timer that expects periodic confirmation that the system is still healthy. *If* that confirmation stops, it assumes the system has failed and forces operation (often a restart) so service can recover automatically.

I have long known that hardware watchdogs exist, but I thought they were only for embedded devices (like MCUs, STM32 / MSP430, Arduino, etc). I knew that some workstation motherboards have one, but earlier I assumed that it was troublesome. (Months ago when [Dolphin](https://aquarium.skyw.top/) was setting up a Windows workstation, he turned on the hardware watchdog, only to find the system resetting every few minutes. We didn't suspect the watchdog of being the culprit at first, and it took us a while to realize that Windows was not feeding the dog. We had to disable the watchdog to get the workstation working.)

Until recently, when I was surfing the web and Hacker News, an idea suddenly struck me, that maybe I should check if my server supports hardware watchdog. I don't remember why I thought of that, but anyway, I went on and did some research.

## Types of hardware watchdog

Based on how the watchdog is exposed to the operating system, there are several common types:

- **Platform watchdog**: The most common type, shipped within PCH or SoC, like [Intel's](https://uefi.org/sites/default/files/resources/Watchdog%20Descriptor%20Table.pdf), [AMD's](https://github.com/torvalds/linux/blob/master/drivers/watchdog/sp5100_tco.c).
- **ACPI watchdog**: Exposed via ACPI, with WDAT table. Platform watchdogs can also be exposed via ACPI.
- **IPMI watchdog**: For servers with BMC and IPMI, the watchdog is often exposed via IPMI.

Other types include dedicated watchdog chips, but they are more common in embedded devices (and ARM ones).

## How to enable them

Well... check UEFI settings first. Sometimes watchdog is disabled by default and has to be enabled manually. Sometimes, though, the settings are hidden and in case you REALLY want to enable it, you have to use some obsecure means, like, decoding the UEFI firmware, find the NVRAM variable position, and use RU.efi to set it manually.

For example on my server:

```text
kernel: iTCO_wdt iTCO_wdt: unable to reset NO_REBOOT flag, device disabled by hardware/BIOS
```

The Intel TCO watchdog is disabled, and I can't enable it via UEFI settings. Luckily, it has an IPMI watchdog so I don't have to break into the UEFI firmware to enable it.

```text
# ipmitool mc watchdog get
Watchdog Timer Use:     SMS/OS (0x44)
Watchdog Timer Is:      Started/Running
Watchdog Timer Logging: On
Watchdog Timer Action:  Hard Reset (0x01)
Pre-timeout interrupt:  None
Pre-timeout interval:   0 seconds
Timer Expiration Flags: None (0x00)
Initial Countdown:      300.0 sec
Present Countdown:      261.8 sec
```

For my software router, the watchdog is enabled by default.

## Startup timeout

Watchdogs are normally NOT started by default, it works only after the system starts feeding it. In some cases where the system fails on early boot, there is chance that the watchdog isn't even started, and the system freezes without the watchdog ever triggering.

To fill this gap, some UEFI / BMC implementations support "startup timeout". The watchdog is started by default, and if the system fails to start within the timeout, it is doomed. (But beware! If you forget to configure the OS to feed the dog, you'll end up wondering why your machine keeps rebooting every few minutes.)

## How to configure them

ACPI and platform watchdogs are often auto-detected and routed to `/dev/watchdog` in Linux. IPMI watchdogs are a bit different, there exists a kernel module `ipmi_watchdog`, but it isn't automatically loaded. Have to add it to `/etc/modules` to make it load at boot, and the remaining work is identical.

You have 2 options to configure them:

- Use `watchdog` daemon. `watchdog` daemon can monitor various system health indicators, like CPU load, memory usage, disk health, etc. If any of the indicators goes beyond a certain threshold, it will stop feeding the watchdog, causing it to trigger a reset.

- Use systemd. Or, just use systemd's built-in watchdog support. In `/etc/systemd/system.conf`, set `RuntimeWatchdogSec` to non-zero and systemd will automatically feed the watchdog as long as the system is responsive.

For me, I just use systemd's built-in watchdog support. It's simple and works well enough.

## WHY using it, though?

I'll tell some stories.

Once upon a time, I tried to run zmap or something on my router, and when I realized that the memory pressure was too high, it was too late. The system stopped responding, and while I am at school, that router was at home. I had to ask my parents to power cycle the router for me after they got home from work. Were the watchdog enabled, the router would have restarted and recovered.

Another several times, when Dolphin tuned memory of my PC too aggressively, the system freezed without I knowing it. When I found that I cannot connect to the machine, I had to go to the machine and press the reset button. Were the watchdog enabled, I could have just realized that the machine had rebooted, without riding my bike from the northmost of the campus to the southmost.

## What it can't do

That's another story. Watchdog can reboot / reset the machine, when the machine *can still start*. If the machine stuck in some strange state where it cannot even start, the watchdog won't help.

## Conclusion

Watchdog is a fail-safe. Watchdog is the last resort. There are reasons to enable it, are there reasons not to? So you SHOULD enable it if you have one, it doesn't cost you anything, and it can save you a lot of trouble when things go wrong.
