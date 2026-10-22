---
title: 500x Faster NetNTLMv1 Kernel for Hashcat
updated: 2026-10-22 09:26:22
date: 2026-10-21 19:51:21
description: "AutoResearch accelerated hashcat’s NetNTLMv1 kernel by 549× through multi-salt fusion and GPU optimizations, while upstream preparation exposed the need for broader compatibility and focused changes."
tags:
  - 技术
  - 网络安全
---

So after my last article where I {% post_link MaybeTheFastestCUDADESKernel "optimized hashcat's DES kernel" %}, dolphin became increasingly interested in how to crack NetNTLMv1 (well, surely it's because PEAP MSCHAPv2 uses this). Given that I already have a *tested* pipeline, I migrated the pipeline targeting mode 5500 (NetNTLMv1).

Headline result: 12.8TH/s rules attack with 1000 salts, versus 23.4GH/s before. Speedup is 549x.

<!-- more -->

## The Setup

The setup is similar to the previous post. DeepSeek V4.1 Flash 1017 abliterated, claude code, AKO4ALL, 4070S at 1.8GHz. This time I asked DS to consult Astra when he used up his methods.

## The Optimizations

AutoResearch ran for several days. Brief summary of optimizations done:

### Multi-salt fusion

This is the largest optimization. Let's review NetNTLMv1's dataflow:

```text
                           Password
                              |
                           UTF-16LE
                              |
                             MD4
                              |
                       NT hash (16 bytes)
                              |
                     Append 5 zero bytes
                              |
                       Split into 3 chunks
                    +---------+---------+
                    |         |         |
                  7 bytes   7 bytes   7 bytes
                 hash[0:7] hash[7:14] hash[14:16]
                                      + 5 zeros
                    |         |         |
                    +-- key expansion --+
                    |         |         |
                   K1        K2        K3
                (8 bytes, including parity bits)
                    |         |         |
                    v         v         v
                +-------+ +-------+ +-------+
   Challenge -->|  DES  | |  DES  | |  DES  |<-- Challenge
    (8 bytes)   | K1, C | | K2, C | | K3, C |    (same C)
                +-------+ +-------+ +-------+
                    |         ^         |
                    |         |         |
                    |     Challenge     |
                    v                   v
                   R1        R2        R3
                (8 bytes) (8 bytes) (8 bytes)
                    |         |         |
                    +---------+---------+
                              |
                       R1 || R2 || R3
                    NT-response (24 bytes)
```

The stock hashcat kernel has some optimizations, specifically: K3 only has a keyspace of 16 bits. So hashcat pre-computes all possible MD4 tails (2^16) and store it somewhere.

```text
  CPU preprocessing, once per target
  ---------------------------------
  Challenge + response block R3
                |
         Enumerate 2^16 tails
                |
         Store matching tail16
```

Then tails and matching salts goes into GPU:

```text
  GPU execution, repeated for each salt
  -------------------------------------
         Load candidate password
                    |
            Apply rule / mask
                    |
             Encode UTF-16LE
                    |
            Run 46 MD4 steps
                    |
         Compare candidate tail16
         with this salt's tail16
                    |
             +------+------+
             |             |
          Mismatch        Match
             |             |
           Reject    Finish MD4 steps 47-48
                           |
                    DES1 key schedule
                           |
                      Compute DES1
                           |
                    DES2 key schedule
                           |
                      Compute DES2
                           |
                     Compare digest
                           |
                      Report match

```

**Notice** that for different salts, MD4 is calculated *once per salt*, when all salts share **one unique** MD4 value. This is wasted compute power.

So, the first optimization is to **reuse** MD4 value across salts. On the CPU side,

```text
  CPU: once per target
  --------------------
  Challenge C_i + response block R3_i
                   |
         Enumerate 2^16 possible tails
                   |
         Recover expected tail16_i
                   |
  Upload all targets: {C_i, tail16_i, R1_i, R2_i}
```

Then on the GPU side,

```text
  GPU: one fused salt window
  --------------------------
  Build combined tail16 filter from the window's targets
                   |
         Generate candidate / apply rule
                   |
               UTF-16LE
                   |
         MD4 steps 1-46, ONCE per candidate
                   |
         Tail16 present in combined filter?
                   |
            +------+------+
            |             |
            No           Yes
            |             |
          Reject     Finish MD4 steps 47-48
                          |
                     Scan salt records
                          |
                Candidate tail16 == tail16_i?
                          |
                   +------+------+
                   |             |
                   No           Yes
                   |             |
                Next salt   DES1(K1, C_i)
                                 |
                            DES2(K2, C_i)
                                 |
                        Compare with R1_i, R2_i
                                 |
                           Report matches
```

Here we can see that some original optimizations are lost here, like, early rejection at MD5 round 46, and some cracked salts are still kept even after recovery. Even with those simplifications, it achieves ~20x speedup when dealing with large amount of salts.

### Tail16 indexing and early rejection

At round 2, DS found that although with 1000 salts, `Every candidate --> scan all salt tails --> verify matches` will expect less than 1% matches, while using quite a long time. So he built a shared bitmap indicating whether each tail value is possible.

```text
Every candidate --> one bitmap lookup
                        |
                     No hit --> skip candidate
                        |
                       Hit --> scan salt tails --> verify matches
```

Then, we can quickly spot that if DES1 doesn't match any, we don't have to calculate DES2:

```text
  Bitmap hit
      |
  Exact tail16 match for target i
      |
  Compute DES1
      |
  First response word matches?
      |
      +-- No  --> Skip DES2 for target i
      |
      +-- Yes --> Compute DES2 --> Final comparison
```

These two optimizations combined doubles the performance.

### DES key-schedule and register optimization

Architectural work on the GPU pipeline is mostly done now. DS moved his focus to microarchitecture.

The first obvious target is the DES core.

Before, the standard DES core generates 16 round subkeys, store them into register arrays, then read those when encrypting. Those registers are generated way too early, they have to be kept for a long time without being used.

DS scattered the key schedule state calculation over encryption rounds, generating next round's subkey just between rounds. This reduced used registers from 128 to 70 and stack frame from 576 to 80 bytes, fitting 4 resident blocks into the kernel instead of 2. This optimization yields about 40% performance gain.

### Dense survivor queues

Then, DS packed scattered survivors into fewer DES-executing warps, inside the same GPU kernel.

Previously, each warp verified its own surviving candidates:

```text
  D = lane doing DES; . = inactive lane

  Warp A: D...............................
  Warp B: ..D.............................
  Warp C: .......D........................
  Warp D: ................D...............
```

Four warps execute the DES instruction sequence. Now with a shared queue:

```text
  Sparse survivors from warps in one GPU block
                        |
               Shared-memory queue
                        |
               Assign entries to lanes
                        |
  DES warp: DDDD............................
```

One warp executes DES for these four survivors. It reduces DES warp-instruction work, giving a small 15% advantage.

### Faster CPU preprocessing

Lastly, DS concluded that the preprocessing is too slow now, and it can be made much faster. He cached all possible DES3 round keys in a 8MB block, then parallelized searching for the tail keys.

```text
  ONE-TIME CPU SETUP
  =================

  All 65,536 possible tail16 values
                  |
          Generate DES round keys
                  |
                  v
      +---------------------------+
      | Shared round-key cache    |
      |                           |
      | tail 0     -> round keys  |
      | tail 1     -> round keys  |
      | ...                       |
      | tail 65535 -> round keys  |
      |                           |
      | Total: 8 MiB              |
      +-------------+-------------+
                    |
                    | reused for every record
                    v

  FOR EACH CAPTURED LOGIN RECORD
  =============================

  Known challenge C + captured response block R3
                    |
                    v
         32 CPU workers divide the search
                    |
         Each worker tries its tail values:
                    |
                Pick tail t
                    |
         Read round keys from cache[t]
                    |
         DES-encrypt this record's C
                    |
         Does the result equal R3?
                    |
            +-------+-------+
            |               |
            No             Yes
            |               |
        Try next t     Publish matching t
                            |
                   Combine worker results
                            |
                   Filter value for GPU
```

This allowed approximately 6x faster key loading.

## The Results

I asked DS to AutoResearch a *runnable hashcat on CUDA*, so it only optimized the CUDA path. The code is filled with ugly `#ifdef`s, multi-round flags and bullshit. But anyway it compiles and runs.

All optimizations combined, it achieved 12.811 TH/s versus 23.378 GH/s, a 548.96× throughput speedup for 1000-salt rules on the RTX 4070 SUPER (under suboptimal thermal conditions). It achieved around 20 TH/s shortly when the card is cold.

## The PR

In last blog, the DES one, DS focused on whole keyspace or linear keyspace scan, making the kernel too specialized to be merged into upstream. This time, though, I tried to make it into hashcat.

The aforementioned *runnable experimental branch*'s code quality was so bad that I cannot bear it. So I asked 6.1 Sol to clean it up. It turned out that the problem was more than dirty code.

I asked codex to cleanup the kernel, and verify "the compatibility of the kernel is *no less than* the original one". Codex removed research scaffoldings, multiple redundant tags and cleaned up comments. But what's more, he discovered that CUDA kernel now fails to compile with 4097 salts window. Turns out CUDA used up its 48KB local memory when it comes to 4097 salts, so we cannot just pack arbitary numbers of salts together, there needs to be a window.

Also the original optimization is implemented and verified on CUDA only, so the OpenCL and HIP path are excluded. For a PR, though, this is insuffcient. So I asked Codex to port it to OpenCL and when running with Vec:1 it do achieve better throughput.

But even this is insufficient. PoCL (the CPU runtime) can use Vec:4 (AVX), Vec:8 (AVX2) or Vec:16 (AVX512) to speed up, and the stock setting uses Vec:4 for OpenCL on CPU and AMD / Intel dGPUs. I gave Codex a try, but it failed to convert some part of the optimization properly and the correctness checks fail.

But anyway, I managed to get [a working tree here](https://github.com/84634E1A607A/hashcat/tree/perf/netntlmv1-tail16-fusion-old) and make [a PR](https://github.com/hashcat/hashcat/pull/4997).

PRs have back and forths. Maintainers still think this AutoResearch result mixed in too many unrelated changes, and want a clean fused kernel optimization. Valid point. So I ended up removing other optimizations and only focused on the fused kernel. I asked Codex again to fix OpenCL with Vector support, and tested HIP on an MI100 card. Without optimizations, speedup is lower, but still well beyond the mainline version.

## The Lessons

AutoResearch do produce useful and good-looking results, but they are far from production / PR grade. Still need human supervision and guiding.

Codex's very *impressive* test suite sometimes do catch errors like not being able to crack 4097 hashes. They are not completely useless. But he tends to run full test suites too frequently though.

Hashcat and other *highest-performance* tools actually still have plenty of optimization potential.

Complex projects like hashcat supports multiple backends, different devices, autotune, and many other features. In theory, you can always optimize for your own need.
