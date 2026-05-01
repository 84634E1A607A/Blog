---
title: QLogic QL45xxx Firmware, OEM parts and Cross Flashing
updated: 2026-05-01 16:29:37
date: 2026-04-30 11:25:06
description: "This article documents the QLogic QL45xxx 100GbE NIC cross-flashing process across Oracle, HPE, and generic QLogic firmware, explains PCI ID and NVRAM modification mechanics, provides a reproducible EEPROM/QCScli-based flashing guide for restoring 4x25GbE port-mode support, and concludes that subsystem identity rewriting plus official QLogic firmware can recover flexible 1x100G/2x50G/4x25G operation, while DAC link-up issues remain unresolved."
tags:
  - 硬件
  - 技术
  - 逆向工程
---

This article discusses QLogic QL45xxx series 100GbE NICs, with capability to breakout into 2x50GbE or 4x25GbE. It covers the OEM parts, firmware and cross flashing between different models in the series.

Related parts (QLogic/Generic subsystem):

| Model | VenID | DevID | SubVen | SubDev |
| ------- | ------- | ------- | -------- | -------- |
| FastLinQ QL45211H 25GbE | 1077 | 1656 | 1077 | E4F6 |
| FastLinQ QL45212H 25GbE | 1077 | 1656 | 1077 | E4F7 |
| FastLinQ QL45262H 25GbE | 1077 | 1656 | 1077 | E4FB |
| FastLinQ QL45000 Series 25GbE | 1077 | 1656 | 1077 | E4F8 |
| FastLinQ QL45611H 100GbE | 1077 | 1644 | 1077 | E4F8 |
| FastLinQ QL45631H 100GbE | 1077 | 1644 | 1077 | 0025 |
| Cisco QL45631HOCU 100GbE QSFP28 OCP | 1077 | 1644 | 1137 | 024E |
| Oracle QL45651HLCU 100GbE | 1077 | 1644 | 1077 | 0048 |
| QLogic single port 100GbE PCIe NIC | 1077 | 1644 | 1137 | 0257 |

HPE OEM subsystem (SubVen 1590):

| Model | VenID | DevID | SubVen | SubDev |
| ------- | ------- | ------- | -------- | -------- |
| HPE Ethernet 4x25Gb 620QSFP28 | 1077 | 1656 | 1590 | 00CF |
| HPE Synergy 6810C 25/50Gb 2-port | 1077 | 1654 | 1590 | 0223 |
| FastLinQ QL45000 Series 100GbE | 1077 | 1644 | 1590 | 00F6 |

The article is split into two main parts: a story, and a guide. The story covers how I get familiar with the cross-flashing process, and the guide aims to provide a precise, step-by-step instruction for cross-flashing QLogic QL45xxx series NICs. The guide is based on the experience gained from the story, and is intended to help others who want to perform similar cross-flashing tasks.

DISCLAIMER: Cross flashing firmware can be risky (and involves soldering the EEPROM chip), and, if done incorrectly, can brick / permanently damage the device (especially when you're not good at soldering). MAKE REALLY SURE THAT YOU UNDERSTAND THE RISKS, AND I AM NOT RESPONSIBLE FOR ANY DAMAGE THAT MAY OCCUR.

<!-- more -->

## The Preface

Currency in this blog is CNY. At the time written, 1 USD is about 6.9 CNY.

I didn't record the process along the way, the story part is based on: my memory; ChatGPT / Codex history; browser history; files generated along the way; some notes I took during the process. There may be some inaccuracies, but I will try my best to make it as accurate as possible.

PCI vendor ID + device ID + subsystem vendor ID + subsystem device ID is used to identify a specific model of PCIe device, later in the article, I may refer to a model directly and precisely with the four-ID tuple, like "`1077:1656:1590:00CF`".

If you are uninterested in the story, skip [here](#The-Guide).

## The Story

We have a small server room, with a bunch of R730s and R630s. Half a year ago, I discovered that second-hand Dual Port 25GbE NICs (Part number: 0R887V) are *pretty* cheap (~40 yuan each), so we bought quite a few of them and upgraded the servers' NICs to 25GbE capable. However, 25Gb switch is still expensive and we don't have one, so we we have been using the 25GbE NICs in 10GbE mode.

Recently, I found in *some yellow second-hand app* that HPE 4x25GbE QSFP28 NIC is about 300 yuan each, with 3m QSFP28 breakout DAC cable about 200 yuan. This is... at least affordable now, so as an experiment, I bought one, and tried to use it on my HR650X server to serve NFS and internal traffic.

When I bought the NIC, the seller said that the card was recognized as one single 100GbE port on Windows and warned me that returning the card is not acceptable. Some risk, but tolerable. With some quick research, I concluded that I should be able to switch the card to 4x25GbE mode in UEFI BIOS.

When the card arrived, though, things were not as expected. The card is recognized as one single 100Gb port (QLogic 1x100g QL45651HLCU-OR_CNA); it does have a UEFI option ROM, but the "Port Mode" option is missing. So, no easy way to switch the card to 4x25GbE mode. Fine. Have to go the hard way.

### Force-flashing

After some search and ChatGPT search, I found some materials about the card and the firmware. (I wasn't aware of the fact that this card had been cross-flashed before yet.)

- [HPE Official Product Page](https://support.hpe.com/connect/s/product?kmpmoid=1009001484&language=en_US), has manual, driver, firmware, etc. In case the link is gone, the latest extracted firmware bundle MBI is at [ql_hp_ah_mbi_8.35.09.bin.7z](QL45xxxFirmwareCrossFlash/ql_hp_ah_mbi_8.35.09.bin.7z) and [ql_hp_bb_mbi_8.35.09.bin.7z](QL45xxxFirmwareCrossFlash/ql_hp_bb_mbi_8.35.09.bin.7z).

I downloaded the firmware flash tool (in RPM format), tried to extract it (with the help of Codex), and ran the flash tool. It failed directly, saying that "no supported card found". Since it doesn't expose a card selection option, it is effectively useless. The only thing it told me was that the card was not in the "Totally fine" state.

Then I looked up QLogic's official site (QLogic acquired by Cavium, then acquired by Marvell, some docs are gone / third-party), found:

- [QLogic 45000 series user's guide, mirror](https://device.report/m/704b56e5a0617df82cbf772e750d7e2770963d2dfc132d4a648a98b9df68c7a1.pdf), [local copy](QL45xxxFirmwareCrossFlash/marvell-fastlinq-45000-user-guide.pdf)
- [QCScli user guide, Dell OEM](https://dl.dell.com/manuals/all-products/esuprt_data_center_infra_int/esuprt_data_center_infra_network_adapters/qlogic-adapters_users-guide9_en-us.pdf), [local not copy](QL45xxxFirmwareCrossFlash/marvell-qcs-cli-user-guide.pdf)
- [QCSCli local copy, rpm](QL45xxxFirmwareCrossFlash/QCS-CLI-40.0.84.0-0.x86_64.rpm) and [ReadmeLnx](QL45xxxFirmwareCrossFlash/QCSCLI_ReadmeLnx.txt)

With the QCSCLI tool, I discovered (actually, *Codex* discovered) that the card was identified as "Oracle_Oceanus_QL45651HLCU_1x100g", an Oracle OEM part.

So now the gap was clear: **the card was flashed with Oracle firmware**. To switch it back to HPE firmware, I needed to cross-flash the card.

The direct instinct was to get a raw NVRAM binary and flash it in. *However*, I cannot find anything *looks like* (e.g. 1048576 bytes long) a raw NVRAM binary in the firmware bundle or online. Inside the bundle were two what Codex identified as *Multi-Bootable Information (MBI) Files*. The sizes suggested that they were not raw NVRAM, but, as the name suggested, bundle of smaller components that can be flashed to different segments of the NVRAM, depending on the card model. So the problem spec became: **how to force flash HPE's MBI to the card with Oracle's MBI in it**.

At first, I tried to use QCScli to flash it. As expected, it failed, saying that the MBI was not compatible with the card. ~~Lazy to debug myself,~~ I asked Codex to find out what was wrong. Codex found that the MBI had a header that specified the supported models (see the previous "related parts" table, that was extracted from there), and of course, the Oracle OEM part was not in the supported model list of the HPE MBI.

Then there went four possible ways: One was to modify the MBI file's header to include the part; the second was to modify QCScli to bypass the check and force flasing; the third was to spoof the card's identity with BPF / custom module to make it look like a supported model; the fourth was to solder the EEPROM chip, dump the NVRAM, change the card's reported model and make it really looks like a supported one.

The first way failed quick because the MBI file was either signed or with checksum, modifying the header made QCScli complain about no valid MBI found. The second way went on for quite a while, before Codex bypassed all the checks, QCScli flashed *part* of the MBI but not all of it, and the card went into a weird state where the UEFI OPROM was gone but the card was still recognizable as the Oracle OEM part. (Afterwards, I concluded that the MBI file had multiple comeponents with each targeting different PCI subsystem. Maybe the OPROM had widest compatibility so it got flashed --> *OPROM was updated*, but other parts didn't match the card's subsystem, so they were not flashed --> *other parts were not updated*. Now the OPROM didn't match the firmware's version, so I guess it got skipped.)

As for the third way, initially I asked Codex to force QCScli to think the card was `1077:1656:1590:00CF`. To my surprise, Codex rejected (I'm not sure what security measure was triggered, but after GPT 5.4 xhigh made a toolcall, it was directly rejected with some AI-generated response about "impersonation is not allowed") the request and refused to do it. Later on, I suddenly realized that maybe a custom kernel module would help, but that's too late.

### Soldering Back-and-forth

Actually... there was another way, using [This lower-level flash tool](QL45xxxFirmwareCrossFlash/lnxfwnx2-x86_64.sdk.tgz) to read out the NVRAM directly; but it required an out-of-box qede kernel module (the in-box one doesn't work), that module source targeted Linux 4.19 while I was on Arch linux, Linux 6.19... I tried to compile it, but gcc generated more than 10 errors, and Every time Codex fixed one, some more poped up. Not wanting to install CentOS Stream 7, I just gave up on this way.

So things finally went the hard way. As I am *very not good* at soldering, I asked [physicsdolphin](https://aquarium.skyw.top/) to help me. The process went like:

- Soldering the EEPROM chip (it was a 8M MXIC one) off the board (he complained that the packaging was awful for soldering, and he replaced the WSON-8 package with a SOIC-8 one, which was much easier to solder. Anyway it worked just as well).
- Dumping the NVRAM with CH341A programmer
- Modifying the dumped NVRAM
- Flashing the modified NVRAM back to the chip, verify it
- Soldering the chip back to the board

The modification process was pretty like trial-and-error. It went several rounds, each round making some progress.

Overall goal: **Change the PCI identity from `1077:1644:1077:0048` to `1077:1656:1590:00CF`**.

Note: Each round's modification was based on the previous round's result, so the changes were cumulative. For example, if I changed `1644` to `1656` in round 1, then in round 2, I would start with the NVRAM that already had `1656`, and make further changes on top of that.

#### Round 1: Try to identify the mapping between NVRAM content and PCI subsystem

I first searched for UEFI signature "PCIR" in the dumped NVRAM, I found NONE. Codex reminded me to try searching "RICP", and there was 3. Looks like the NVRAM was stored **big-endian every 4 bytes**.

I searched for `16 44 10 77`, found one at `0x2c5044`, one at `0x2d1620`. I replaced them with `16 56 10 77`.

I searched for `10 77 00 48`, found 3 near-identical segments at `0x25c050`, `0x25e050`, `0x345050`. I replaced them with `15 90 00 CF`.

Dolphin soldered the chip back, and the card was *gone* - but was recognized in `lspci`.

The tuple became: `1590:1644:1077:00CF`. So anyway, we then knew how to change subsystem device ID and PCI vendor ID. Vendor ID was changed accidentally so the card was not recognized as a QLogic one. Still cannot flash it. What's more, the `1644` --> `1656` change didn't take effect.

#### Round 2: Continue to identify the mapping

Then I swapped the two segments:

`0x2c5044` and `0x2d1620`: `16 56 10 77` --> `16 56 15 90`

`0x25c052`, `0x25e052`, `0x345052`: `15 90 00 CF` --> `10 77 00 CF`

After the swap, the card was recognized as `1077:1644:1077:00CF`, the 100GbE port was back, but still cannot flash. Now we know the former segment was irrelevant.

#### Round 3: Cross-flash to HPE 1x100GbE card

Then I realized that with the big-endian order, `0x25c050` is actually:

```text
78 6e 10 77 00 CF 10 77 01 09 53 00 28 28 28 28 (Big-endian)
77 10 6e 78 77 10 CF 00 00 53 09 01 28 28 28 28 (Little-endian)
```

And the `10 77 00 CF` part crossed the 4-byte boundary, the latter `00 CF 10 77` part should control subsystem device ID and vendor ID, while the former `78 6e 10 77` part controls the vendor ID. Device ID remains unknown.

An idea came to my mind: HPE has `1077:1644:1590:00F6` as a valid product, why don't I try to change the card to that?

So I changed `0x25c054`, `0x25e054`, `0x345054`: `00 CF 10 77` --> `00 F6 15 90`.

It worked as expected, the card was recognized as `1077:1644:1590:00F6`, and QCScli accepted the card and HPE's MBI, the card was flashed to HPE firmware. I have the full firmware [here](QL45xxxFirmwareCrossFlash/ajax_100G_hpe.bin.7z) in case anyone needs it. The card was working, but still in 100GbE mode, no option to switch to 4x25GbE.

#### Round 4: Try to cross-flash to 4x25GbE

Now the focus turned to the device ID. I searched for `16 44`. Codex concluded that while other segments looked like noise, the one around `0x2c6990` and `0x38f990` looked like lookup table.

```text
c3 10 e8 c1 16 35 16 34 16 44 16 36 16 56 16 54
e4 f6 16 66 80 70 80 73 75 42 00 00 20 3d 20 73
```

I suspected this was where the device function gets mapped to device ID (`1635` --> Don't know; `1634` --> 40GbE; `1644` --> 100GbE; `1636` --> Don't know; `1656` --> 25GbE; `1654` --> Don't know; `1666` --> SR-IOV), so I changed `16 44` to `16 56`.

The outcome was... really surprising. The card was recognized as `1077:1634:1077:1634`, and qede failed (of course, the card was not really a 40GbE one). I tried to flash a 40GbE MBI, but QCScli didn't recognize the card at all.

This revealed a deeper, more severe and more fundamental problem: If QCScli relies on qede, and qede relies on PCI device ID to identify the card and fails when the device ID is wrong, then **no matter how I change NVRAM, even if I get `1656` in the device ID, QCScli will still fail to flash the card, because qede will fail to recognize the card**.

Really bad news right? I thought about it and slept on it. The next day, I recalled that the official firmware has "Port Mode" option in UEFI, which should change the device ID at runtime gracefully. So the goal changed to: **Flash the card with QLogic's MBI**. I targeted `1077:1644:1077:E4F8` because `1077:1656:1077:E4F8` was also in the supported list.

#### Round 5: Cross-flash to QLogic firmware

Routinely, I changed the configuration segment and flashed the card. Things went smoothly, and I flashed QLogic's MBI to the card.

Then, in the OPROM, "Port Mode" option was back, and I could switch to 4x25GbE mode. The card was switched to 4x25GbE successfully, until I found that my DAC breakout cable was not working (that was a different story, though).

The official QLogic firmware is at [here](QL45xxxFirmwareCrossFlash/ajax_4x25G.bin.7z)

#### Round 6: Cross-flash to HPE firmware

I suspected that the OPROM was slightly different, so anyway, I changed the OPROM subvendor/device ID to `1590:00CF`, flashed the card, and used HPE's MBI to flash the card again.

Now the card was in HPE firmware (**finally!!!**). It turned out that the OPROM was emptier than the QLogic one, and some functions were missing. Anyway, it didn't fix the DAC cable issue. Maybe someday I'll flash it back to QLogic firmware again to gain more functionality.

The HPE firmware (that should had been shipped with the card, but actually cost me a lot of effort to get it) is at [here](QL45xxxFirmwareCrossFlash/ajax_4x25G_hpe.bin.7z).

### DAC Cable Issue

I haven't yet solved the DAC cable issue. The problem is that the data link layer won't come up when I plug in the DAC cable. The QSFP28 module is:

```yml
        Identifier                                : 0x11 (QSFP28)
        Extended identifier                       : 0x00
        Extended identifier description           : 1.5W max. Power consumption
        Extended identifier description           : No CDR in TX, No CDR in RX
        Extended identifier description           :  High Power Class (> 3.5 W) not enabled
        Power set                                 : Off
        Power override                            : Off
        Connector                                 : 0x23 (No separable connector)
        Transceiver codes                         : 0x80 0x00 0x00 0x00 0x00 0x00 0x00 0x00
        Transceiver type                          : 100G Ethernet: 100G Base-CR4 or 25G Base-CR CA-L
        Encoding                                  : 0x00 (unspecified)
        BR Nominal                                : 25500Mbps
        Rate identifier                           : 0x00
        Length (SMF)                              : 0km
        Length (OM3)                              : 0m
        Length (OM2)                              : 0m
        Length (OM1)                              : 0m
        Length (Copper or Active cable)           : 3m
        Transmitter technology                    : 0xa0 (Copper cable, unequalized)
        Attenuation at 2.5GHz                     : 5db
        Attenuation at 5.0GHz                     : 7db
        Attenuation at 7.0GHz                     : 5db
        Attenuation at 12.9GHz                    : 7db
        Vendor name                               : OEM
        Vendor OUI                                : 00:00:00
        Vendor PN                                 : AB9989-33424C00-
        Vendor rev                                : E
        Vendor SN                                 : HQ21010600009
        Date code                                 : 210107
        Revision Compliance                       : SFF-8636 Rev 2.5/2.6/2.7
        Module temperature                        : 0.00 degrees C / 32.00 degrees F
        Module voltage                            : 0.0000 V
```

And the SFP28 one is:

```yml
        Identifier                                : 0x03 (SFP)
        Extended identifier                       : 0x04 (GBIC/SFP defined by 2-wire interface ID)
        Connector                                 : 0x21 (Copper pigtail)
        Transceiver codes                         : 0x01 0x00 0x00 0x00 0x00 0x84 0x80 0xfd 0x0b
        Transceiver type                          : Extended: 100G Base-CR4 or 25G Base-CR CA-L
        Encoding                                  : 0x00 (unspecified)
        BR Nominal                                : 25750MBd
        Rate identifier                           : 0x00 (unspecified)
        Length (SMF)                              : 0km
        Length (OM2)                              : 0m
        Length (OM1)                              : 0m
        Length (Copper or Active cable)           : 3m
        Length (OM3)                              : 0m
        Passive Cu cmplnce.                       : 0x01 (SFF-8431 appendix E [SFF-8472 rev10.4 only])
        Vendor name                               : OEM
        Vendor OUI                                : 00:00:00
        Vendor PN                                 : AB9989-33424C00-
        Vendor rev                                : 6
        Option values                             : 0x00 0x00
        BR margin max                             : 0%
        BR margin min                             : 0%
        Vendor SN                                 : HQ21010600009
        Date code                                 : 210107
```

Both modules are recognized, but the data link layer won't come up, regardless of auto-negotiation settings, speed, duplex, etc.

```yml
Settings for ens5f2:
        Supported ports: [ FIBRE ]
        Supported link modes:   1000baseKX/Full
                                25000baseCR/Full
                                50000baseCR2/Full
                                100000baseCR4/Full
                                10000baseCR/Full
        Supported pause frame use: Symmetric Receive-only
        Supports auto-negotiation: No
        Supported FEC modes: Not reported
        Advertised link modes:  1000baseKX/Full
                                25000baseCR/Full
                                50000baseCR2/Full
                                100000baseCR4/Full
                                10000baseCR/Full
        Advertised pause frame use: No
        Advertised auto-negotiation: No
        Advertised FEC modes: Not reported
        Link partner advertised link modes:  1000baseKX/Full
                                             25000baseCR/Full
                                             50000baseCR2/Full
                                             100000baseCR4/Full
                                             10000baseCR/Full
        Link partner advertised pause frame use: No
        Link partner advertised auto-negotiation: No
        Link partner advertised FEC modes: Not reported
        Speed: Unknown!
        Duplex: Unknown! (255)
        Auto-negotiation: off
        Port: Direct Attach Copper
        PHYAD: 0
        Transceiver: internal
        Supports Wake-on: d
        Wake-on: d
        Current message level: 0x00000000 (0)

        Link detected: no

Settings for ens9f1np1:
        Supported ports: [ Backplane ]
        Supported link modes:   1000baseKX/Full
                                10000baseKR/Full
                                25000baseCR/Full
                                25000baseKR/Full
                                25000baseSR/Full
        Supported pause frame use: Symmetric
        Supports auto-negotiation: Yes
        Supported FEC modes: None        RS      BASER
        Advertised link modes:  25000baseCR/Full
                                25000baseKR/Full
                                25000baseSR/Full
        Advertised pause frame use: Symmetric
        Advertised auto-negotiation: Yes
        Advertised FEC modes: Not reported
        Speed: Unknown!
        Duplex: Unknown! (255)
        Auto-negotiation: on
        Port: Direct Attach Copper
        PHYAD: 0
        Transceiver: internal
        Supports Wake-on: g
        Wake-on: d
        Link detected: no (Autoneg, No partner detected)
```

GPT suspects that the QLogic card supports None / FC FEC only, while the DAC cable requires RS FEC, but I have no way to verify it.

## The Guide

Based on the experience gained from the story, here is a guide for cross-flashing QLogic QL45xxx series NICs:

Things to prepare:

- HPE firmware MBI; [local copy](QL45xxxFirmwareCrossFlash/ql_hp_bb_mbi_8.35.09.bin.7z), full supported model list [here](QL45xxxFirmwareCrossFlash/ql_bb_mbi_8.59.01_supported_pci_tuples.txt)
- QLogic firmware MBI; [local copy](QL45xxxFirmwareCrossFlash/ql_bb_mbi_8.59.01.bin.7z), full supported model list [here](QL45xxxFirmwareCrossFlash/ql_hp_bb_mbi_8.35.09_supported_pci_tuples.txt)
- QCScli tool; [local copy](QL45xxxFirmwareCrossFlash/QCS-CLI-40.0.84.0-0.x86_64.rpm)
- A compatible card with solderable EEPROM chip (e.g. MXIC 8M) / or if you want to use CentOS Stream 7 and the out-of-box qede module, I didn't test that. Comments are welcome.
- Soldering kit + programmer (e.g. CH341A) if you want to do the soldering way.

And if you just want the final firmware without going through the process, here you go:

**BE CAREFUL!** MAC addresses and serial number and other things are in the NVRAM, I didn't scrub them in the firmware I uploaded, so if you flash the firmware directly, you may end up with duplicate MAC addresses and serial numbers.

- [HPE 100GbE firmware](QL45xxxFirmwareCrossFlash/ajax_100G_hpe.bin.7z)
- [QLogic 4x25GbE firmware](QL45xxxFirmwareCrossFlash/ajax_4x25G.bin.7z), use this to switch freely among 1x100G, 2x50G, 4x25G modes.
- [HPE 4x25GbE firmware](QL45xxxFirmwareCrossFlash/ajax_4x25G_hpe.bin.7z)

The full process is:

- Solder the EEPROM chip off the board, dump the NVRAM with programmer. The EEPROM chip is under the heatsink, on the right-bottom corner if you hold the card with the heatsink facing you and the PCIe connector down. It should be an 8M (25Q64xxx) chip.
- Based on your current PCIe tuple, find the corresponding segment: `10 77 {2 bytes Subsystem Device ID like 00 CF} {2 bytes Subsystem Vendor ID like 10 77}`. There should be 3 - 5 matches.
- Change the Subsystem Device ID and Subsystem Vendor ID to what you want, for example, `10 77 00 CF 15 90` --> `10 77 E4 F8 10 77`. Change ALL of them.
- Flash the modified NVRAM back to the chip, verify it; then solder the chip back to the board.
- With QCScli, run `list phyadapters` to find your card, run `select x` to select it, then run `upgrade -mbi /path/to/mbi` to flash the card.
- Reboot and it should be good to go. You can share your binary and experience in the comments if you want to.
