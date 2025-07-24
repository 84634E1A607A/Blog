Assume that I have a E5-2680v2 CPU, with 4 channels, 3 memory slots per channel. I installed 16G 2Rx8, 16G 2Rx8, 8G 2Rx4 memory into each channel. How is the physical address interleaved within one channel and across channels?

---

With your E5-2680v2 setup, the memory interleaving works at both the channel level and within each channel (rank level).

## Within-Channel Interleaving (Rank Interleaving)

Within each channel, you have three DIMMs with different configurations:
- **DIMM 0**: 16GB 2Rx8 (2 ranks)
- **DIMM 1**: 16GB 2Rx8 (2 ranks) 
- **DIMM 2**: 8GB 2Rx4 (2 ranks)

The memory controller interleaves across ranks within the channel. Since all your DIMMs are dual-rank (2Rx8/2Rx4), each channel has 6 total ranks. The interleaving typically occurs at cache line boundaries (64 bytes on x86), so consecutive 64-byte blocks alternate between ranks.

However, there's an important consideration: your DIMMs have different densities. The 8GB DIMM will be "filled up" first, after which interleaving will continue only among the remaining ranks from the 16GB DIMMs. This creates an asymmetric interleaving pattern that may impact performance.

## Cross-Channel Interleaving

Across the 4 channels, the memory controller interleaves at cache line granularity. Consecutive 64-byte cache lines are distributed across channels in a round-robin fashion:

```
Address Block 0 → Channel 0
Address Block 1 → Channel 1  
Address Block 2 → Channel 2
Address Block 3 → Channel 3
Address Block 4 → Channel 0 (cycle repeats)
```

## Combined Interleaving Pattern

The complete interleaving works hierarchically:
1. **Channel selection**: Lower address bits determine which of the 4 channels
2. **Rank selection**: Next bits select which rank within that channel
3. **Bank/row/column**: Remaining bits address within the selected rank

## Performance Impact

Your mixed DIMM configuration will result in suboptimal performance because:
- The different capacities create asymmetric interleaving
- 2Rx4 vs 2Rx8 organization differences may cause timing variations
- The memory controller can't maintain perfect load balancing across all ranks

For best performance, identical DIMMs (same capacity, organization, and timings) across all slots would be ideal.
