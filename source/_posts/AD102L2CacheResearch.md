---
title: Research on controlling L2 cache size on AD102 GPU
updated: 2026-10-28 20:47:11
date: 2026-10-28 19:26:22
description: "An investigation into unlocking the RTX 4090's AD102 L2 cache from 72 MiB to 96 MiB. The tested software mask could only add disabled slices, no replacement override was found, and masking all slices left GPU firmware unable to complete booting after a reset. The article also discusses GA100 RIR overrides and the risks of writing unknown fuse registers."
tags:
  - 技术
---

After my previous post about {% post_link 64GigabyteBAR1on409048G "adding 64G BAR1 support on 4090 48G card" %}, dolphin made an [EFI program](https://github.com/physicsdolphin/nv-uefi-unlocker) to unlock the card, so that it can work with Windows. Some friend posted an AI generated video <a href="https://www.bilibili.com/video/BV1d6xN66ECM/" rel="noreferrer">on Bilibili</a> and it has received nearly 60k views, and 1k likes so far (as of night, 10/28/2026).

One of the comments asked whether the L2 cache can be enlarged. Given that the FP16 command issue rate can be overridden, I thought the L2 cache might be, too. So I asked Codex to run some experiments.

**TL, DR:** Codex couldn't unlock 96 MiB of L2. In the tests, the software mask added disabled slices but did not clear existing disable bits. The mask survived a PCIe function-level reset (FLR), but with every slice masked, GPU firmware (GFW) did not complete booting afterward. No changed cache capacity was measured with CUDA.

<!-- more -->

**DISCLAIMER: I'm having homework piling up so this post is mostly AI generated. Only content above this line is hand-written.**

## 72 MiB of L2

The card starts with 12 L2 controllers (LTCs) and 36 active L2 slices (LTSs). Each active slice corresponds to 2 MiB, giving 72 MiB in total. The goal was to enable another 12 slices and get 96 MiB, not just make the driver report a larger number.

The six groups of disable bits read `81 42 24 18 81 42` in hex. Each group has two LTCs, each with four possible slices; a set bit means a slice is disabled. Each LTC has one disabled slice, leaving 36 active out of 48 possible slices. The pattern is quite regular, but that doesn't tell us whether the disabled slices are physically usable.

## Opening Permissions Didn't Change the Masks

Following the earlier BAR1 work, Codex used the GPU's secure engine, SEC2, to open two L2 permission gates at `0x8200d0` and `0x8200dc`. Both changed from `0xffffff8f` to `0xffffffff`. The privileged execution completed, but writing zero to the first effective mask at `0x822900` did not change its readout. A candidate at `0x821200`, which initially matched the effective mask and might be a lower-layer configuration readout, didn't change either. Matching values alone don't establish that it is a writable fuse shadow.

The permission gates returned to their original values after an FLR. Could the write have worked briefly and then been undone by the reset? I asked Codex to test writing `0x821200` without the FLR: the permissions stayed open, but both readouts were still unchanged. They had also been unchanged before the FLR in the earlier test, so there was no observed increase for the reset to undo.

Codex then tried handing this no-FLR state to the NVIDIA driver. Initialization failed because WPR2, a protected memory region left up by the experiment firmware, was already active. Skipping the reset kept the permissions open, but this handover did not make the card usable.

## The Software Mask Only Disables

The software mask at `0x822080` did respond, providing a useful control for the writes that appeared to do nothing. For the first group, the lower-layer readout was `0x81`. Writing `0x02` to the software mask read back `0x02` and changed the effective mask at `0x822900` to `0x83`; the lower-layer readout stayed at `0x81`. Writing software zero restored the effective mask to `0x81`. Writing `0x01`, a bit already set in the lower-layer readout, read back `0x01` but left the effective mask at `0x81`.

Codex also added and removed one previously clear disable bit in each group, with the same result. For the bits and states tested, the relationship is `effective = lower-layer readout | software mask`. This entry adds disable bits; clearing the software mask only returns to the lower-layer value. It did not enable any slice already disabled there. This is a register-level result; a smaller usable cache capacity hasn't been verified with CUDA.

## No Replacement Override Found

Codex also looked for an override that could replace the lower-layer mask instead of adding disable bits. A GA100 tool identifies `0x8202e4` as an L2 override candidate. On AD102, SEC2 writes of `0` and `1` left its readout at zero and the L2 masks unchanged. Its meaning on AD102 is unknown, so this doesn't tell us whether the writes were accepted.

Another address borrowed from a different architecture, `0x8234e0`, returned an invalid-access value, and the SEC2 execution chain did not reach its completion marker after a write attempt. Codex also checked `0x820084`, a possible global override disable state based on the GA100 reference; it read `1` and did not change when the host tried to clear it. Its meaning on AD102 is unconfirmed too. None of these tests found a working L2 replacement override, but they don't rule one out.

## GPU Firmware Stalled With All L2 Slices Masked

Since the software mask could disable more slices, I wondered what would happen if we disabled all of them. I asked Codex to set the software mask of each group to `0xff`, setting every disable bit. All six effective masks then also read `0xff`: according to the masks, no L2 slices were active. Clearing the software masks before a reset restored the original readouts.

To see what happened after a reset, Codex set all six masks to `0xff` again and issued an FLR. The reset succeeded, and the masks still read `0xff` afterward. But the GPU firmware's completion field stayed at `0x1` through another 2.1 seconds of waiting. With the original masks and the same preparation and boot parameters, the field briefly read `0x1` and then reached `0x3ff`, indicating completion.

So the reset itself worked, but the firmware did not finish booting in the all-disabled test. I suspect that disabling the entire L2 cache changed the cache topology so drastically that it caused the problem. The NVIDIA driver was not loaded in this state, so Codex could not test the cache with CUDA.

There was one more difference after the FLR: the software masks retained `0xff`, but the permission gates had closed, and an immediate attempt to clear the masks failed. A controlled reboot cleared the software masks and restored the original readouts.

## RIR Can Change Fuse Readout

While looking for another way to override the L2 configuration, Codex found a [tool for the GA100-based 170HX](https://github.com/lixiangwuxian/170hx-rir-tool#measurement-status) that uses redundancy fixup records (RIR). An RIR can change the logical value read from a fuse bit without erasing the original one-time programmable bit. Unlike the software mask tested above, programming an RIR is a permanent change; the tool's author reports that its changes survive a power cycle.

The GA100 tool uses an RIR to change the readout of a global software override disable bit when needed, then reboots and applies a separate, temporary override. This is an interesting lead, but GA100's fuse layout and override rules cannot be assumed to apply to AD102. I didn't want to accidentally brick the 4090, so I didn't try programming its RIR.

## Blind Fuzzing Can Burn Fuses

**Don't blindly fuzz unknown registers. Some writes may accidentally trigger fuse programming and cause irreversible changes.**

The GA100 tool above shows why: its RIR programming code uses software writes to the fuse controller, and its author reports that the changes **survive a power cycle**. That doesn't establish the programming rules for AD102, but it does show that host software can program fuses on the 170HX without an external programmer.

For this experiment, Codex kept the large register scan read-only and limited writes to a fixed list of candidates instead of writing across unknown addresses. Codex also checked the write addresses against the GA100 tool's controller command, address, and data registers; none of the reviewed trial writes targeted them. The monitored configuration returned to its original values after recovery, but without complete before-and-after fuse dumps, that doesn't prove every permanent bit is unchanged.

I don't want to risk bricking the card, so I don't dare continue experimenting. It still needs to run vLLM anyways (
