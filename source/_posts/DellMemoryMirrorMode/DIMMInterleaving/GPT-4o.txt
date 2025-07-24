Assume that I have a E5-2680v2 CPU, with 4 channels, 3 memory slots per channel. I installed 16G 2Rx8, 16G 2Rx8, 8G 2Rx4 memory into each channel. How is the physical address interleaved within one channel and across channels?

---

With an **Intel Xeon E5-2680 v2 (Ivy Bridge-EP)** system using a **quad-channel memory controller** (4 channels, each with 3 DIMM slots), and with the following DIMM configuration per channel:

* 1× 16 GB 2Rx8
* 1× 16 GB 2Rx8
* 1× 8 GB 2Rx4

Here’s how **physical address interleaving** works both *within a channel* and *across channels*.

---

## 🔧 Architectural Background

The **E5-2680 v2**:

* Supports **quad-channel DDR3 memory**.
* Memory is interleaved **across channels**, **within channels**, and potentially **across DIMMs**, depending on memory mode and population.
* Uses a **memory controller that supports address interleaving at multiple granularities**: channel interleaving, rank interleaving, and bank interleaving.
* Physical address space is interleaved in order to **maximize bandwidth and minimize latency**.

---

## 🧠 DIMM Population

You installed in *each* channel:

* **Slot 0**: 16 GB 2Rx8
* **Slot 1**: 16 GB 2Rx8
* **Slot 2**:  8 GB 2Rx4

So per channel:
→ Total = **40 GB**,
→ Total system memory = **160 GB** (4 channels × 40 GB).

---

## 🔄 Address Interleaving Across Channels

The Ivy Bridge-EP memory controller supports **channel interleaving** at a cache-line granularity (typically 64 bytes).

### ✅ Channel Interleaving:

When **memory sizes are balanced across channels**, the controller will interleave **consecutively increasing cache-line addresses across channels**.

**Example:**

```
Phys Addr   → Channel
0x0000_0000 → Channel 0
0x0000_0040 → Channel 1
0x0000_0080 → Channel 2
0x0000_00C0 → Channel 3
0x0000_0100 → Channel 0
...
```

This provides **maximum memory bandwidth**, since multiple channels can be accessed in parallel.

### ✅ Rank Interleaving:

Each DIMM may contain one or more **ranks** (a rank is a set of DRAM chips accessed in parallel). You have:

* 2Rx8 = dual-rank DIMM
* 2Rx4 = dual-rank DIMM

So each channel has **6 ranks** (2 + 2 + 2). The memory controller can interleave across ranks as well (rank interleaving), further improving parallelism.

---

## 🔄 Address Interleaving Within a Channel

Inside a channel, addresses may be interleaved across **DIMMs/ranks** and **banks**.

### ✅ DIMM Interleaving:

Intel’s controller will usually interleave memory accesses between DIMMs *if the sizes are equal*, but in this case you have unequal sizes (16 GB vs. 8 GB). This leads to **non-uniform interleaving**.

So:

* The two 16 GB 2Rx8 DIMMs will likely be interleaved first.
* The 8 GB 2Rx4 will be used **after the others are filled**, or used for **NUMA fallback** or for **non-interleaved (non-optimized) regions**.

---

## 🧭 Summary of Interleaving Behavior

| Level      | Interleaving Type      | Behavior in Your Setup                                                                  |
| ---------- | ---------------------- | --------------------------------------------------------------------------------------- |
| Channels   | Channel interleaving   | ✅ Enabled; physical addresses are interleaved across all 4 channels at cache-line level |
| DIMMs      | DIMM/rank interleaving | ⚠️ Partial; likely only between the two 16 GB DIMMs. The 8 GB DIMM is used sequentially |
| Banks      | Bank interleaving      | ✅ Enabled; standard for DDR3 memory, improves concurrency                               |
| NUMA nodes | NUMA node interleaving | ✅ If multiple CPUs are populated; each socket maps a range of physical memory           |

---

## 🧪 Tools to Confirm at Runtime

On Linux:

* `numactl --hardware` – Show memory layout per NUMA node.
* `dmidecode -t memory` – Show DIMM slot population.
* `lstopo` (from `hwloc`) – Visual memory topology.
* `perf mem` – Measure memory latency and bandwidth per address region.

---

## 📝 Final Notes

* The 16G + 16G will dominate interleaving; the 8G per channel may not participate in fine-grained interleaving.
* Uneven DIMM sizes can cause **non-uniform memory access latencies**.
* To **optimize interleaving**, consider using **identical DIMMs per channel** (e.g., 3× 16G per channel).
* But overall, with 40 GB/channel and all channels populated, **channel interleaving will still occur across all 4 channels**, giving good performance.

Let me know if you want help analyzing your real system's interleaving using Linux tools.
