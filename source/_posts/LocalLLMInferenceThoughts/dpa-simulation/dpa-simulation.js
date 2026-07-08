(function () {
  "use strict";

  const TICK_SECONDS = 0.25;
  const STATE_LABELS = {
    prefill: "Prefill",
    decode: "Decode",
    waiting: "Waiting",
    idle: "Idle",
    killed: "Killed"
  };
  const STATE_COLORS = {
    prefill: "var(--dpa-prefill)",
    decode: "var(--dpa-decode)",
    waiting: "var(--dpa-waiting)",
    idle: "var(--dpa-idle)",
    killed: "var(--dpa-killed)"
  };

  function mulberry32(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6d2b79f5;
      let t = value;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function intBetween(random, min, max) {
    return Math.floor(random() * (max - min + 1)) + min;
  }

  function clampInt(value, min, max, fallback) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function clampFloat(value, min, max, fallback) {
    const number = Number.parseFloat(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function formatTokens(value) {
    if (value >= 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    return `${Math.round(value)}`;
  }

  function formatPct(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function formatSeconds(value) {
    if (value >= 60) return `${(value / 60).toFixed(1)}min`;
    return `${value.toFixed(1)}s`;
  }

  function normalizeRouting(value) {
    if (value === "pinned" || value === "round-robin" || value === "random") return value;
    return "pinned";
  }

  function readConfig(root) {
    const params = new URLSearchParams(window.location.search);
    const read = (name, fallback) => params.get(`dpa_${name}`) || root.dataset[name] || fallback;
    return {
      dpCount: clampInt(read("gpus", "16"), 1, 64, 16),
      agentCount: clampInt(read("agents", "16"), 1, 256, 16),
      contextLength: clampInt(read("context", "200000"), 1000, 2000000, 200000),
      kvCapacity: clampInt(read("kv", "250000"), 1000, 2000000, 250000),
      prefillRate: clampFloat(read("prefillRate", "3000"), 1, 100000, 3000),
      decodeRate: clampFloat(read("decodeRate", "50"), 1, 10000, 50),
      routing: normalizeRouting(read("routing", "pinned")),
      scheduler: read("scheduler", "prefill"),
      seed: clampInt(read("seed", "20260707"), 1, 2147483647, 20260707)
    };
  }

  function createAgent(id, random) {
    return {
      id,
      totalRounds: intBetween(random, 30, 80),
      nextReadyTick: 0,
      round: 0,
      contextTokens: 0,
      active: null,
      killed: false,
      completedRounds: 0,
      totalLatencyTicks: 0,
      totalWaitTicks: 0
    };
  }

  function createRequest(agent, dpId, tick, config, random, events) {
    const inputTokens = intBetween(random, 1000, 10000);
    const outputTokens = intBetween(random, 500, 1500);
    const promptTokens = agent.contextTokens + inputTokens;
    const maxContext = Math.min(config.contextLength, config.kvCapacity);

    if (promptTokens > maxContext) {
      killAgent(agent, tick, `prompt ${formatTokens(promptTokens)} > limit ${formatTokens(maxContext)}`, events);
      return null;
    }
    if (promptTokens + outputTokens > maxContext) {
      killAgent(agent, tick, `context ${formatTokens(promptTokens + outputTokens)} > limit ${formatTokens(maxContext)}`, events);
      return null;
    }

    return {
      id: `${agent.id}-${agent.round}`,
      agentId: agent.id,
      round: agent.round + 1,
      dpId,
      createdTick: tick,
      startedTick: null,
      inputTokens,
      outputTokens,
      promptTokens,
      cachedTokens: 0,
      prefillTotal: 0,
      prefillRemaining: 0,
      decodeTotal: outputTokens,
      decodeRemaining: outputTokens,
      decodedTokens: 0,
      waitTicks: 0,
      phase: "prefill"
    };
  }

  function killAgent(agent, tick, reason, events) {
    if (agent.killed) return;
    agent.killed = true;
    agent.active = null;
    events.push({ type: "kill", tick, agentId: agent.id, text: `Agent ${agent.id} killed: ${reason}` });
  }

  function chooseDp(agentId, config, random) {
    if (config.routing === "pinned") return agentId % config.dpCount;
    if (config.routing === "round-robin") {
      const dpId = config.routingCursor % config.dpCount;
      config.routingCursor += 1;
      return dpId;
    }
    return intBetween(random, 0, config.dpCount - 1);
  }

  function cacheTotal(dp) {
    let total = 0;
    dp.cache.forEach((entry) => {
      total += entry.tokens;
    });
    return total;
  }

  function reusableCacheEntry(dp, request) {
    let best = null;
    dp.cache.forEach((entry, key) => {
      if (entry.status !== "completed" || entry.agentId !== request.agentId) return;
      if (!best || entry.round > best.entry.round || entry.lastAccessTick > best.entry.lastAccessTick) {
        best = { key, entry };
      }
    });
    return best;
  }

  function cachedTokensFor(dp, request) {
    const activeEntry = dp.cache.get(request.id);
    if (activeEntry) return Math.min(activeEntry.tokens, request.promptTokens + request.outputTokens);
    const reusable = reusableCacheEntry(dp, request);
    return Math.min(reusable?.entry.tokens || 0, request.promptTokens);
  }

  function projectedKvAfterStart(dp, request) {
    const reservation = request.promptTokens + request.outputTokens;
    return cacheTotal(dp) + Math.max(0, reservation - cachedTokensFor(dp, request));
  }

  function writeActiveCache(dp, request, tick, reusableKey = null) {
    if (reusableKey && reusableKey !== request.id) dp.cache.delete(reusableKey);
    dp.cache.set(request.id, {
      requestId: request.id,
      agentId: request.agentId,
      round: request.round,
      tokens: request.promptTokens + request.outputTokens,
      lastAccessTick: tick,
      phase: request.phase,
      status: "active"
    });
  }

  function completeRequestCache(dp, request, tick) {
    const entry = dp.cache.get(request.id);
    if (!entry) return;
    entry.lastAccessTick = tick;
    entry.phase = "completed";
    entry.status = "completed";
  }

  function evictCacheEntry(dp, key, entry, tick, events, reason) {
    dp.cache.delete(key);
    events.push({
      type: "evict",
      tick,
      dpId: dp.id,
      agentId: entry.agentId,
      text: `DP ${dp.id} evicted Agent ${entry.agentId} round ${entry.round} ${reason} (${formatTokens(entry.tokens)} tokens)`
    });
  }

  function evictCompletedUntilFit(dp, request, tick, config, events) {
    const reusable = reusableCacheEntry(dp, request);
    const protectedKey = reusable?.key || null;
    while (projectedKvAfterStart(dp, request) > config.kvCapacity) {
      let victim = null;
      dp.cache.forEach((entry, key) => {
        if (entry.status !== "completed" || key === protectedKey) return;
        if (!victim || entry.lastAccessTick < victim.entry.lastAccessTick) victim = { key, entry };
      });
      if (!victim) break;
      evictCacheEntry(dp, victim.key, victim.entry, tick, events, "to admit a new request");
    }
    return reusableCacheEntry(dp, request);
  }

  function selectPhase(dps, scheduler) {
    const countReady = (phase) =>
      dps.reduce((sum, dp) => sum + dp.active.filter((request) => request.phase === phase).length, 0);
    const prefillReady = countReady("prefill");
    const decodeReady = countReady("decode");
    if (scheduler === "decode") {
      if (decodeReady > 0) return "decode";
      if (prefillReady > 0) return "prefill";
      return "idle";
    }
    if (scheduler === "ready") {
      if (prefillReady === 0 && decodeReady === 0) return "idle";
      if (decodeReady > prefillReady) return "decode";
      return "prefill";
    }
    if (prefillReady > 0) return "prefill";
    if (decodeReady > 0) return "decode";
    return "idle";
  }

  function snapshotCaches(dps) {
    return dps.map((dp) => {
      const entries = Array.from(dp.cache.values())
        .map((entry) => ({
          requestId: entry.requestId,
          agentId: entry.agentId,
          round: entry.round,
          tokens: entry.tokens,
          lastAccessTick: entry.lastAccessTick,
          phase: entry.phase,
          status: entry.status
        }))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "active" ? -1 : 1;
          return b.tokens - a.tokens;
        });
      return { dpId: dp.id, usedTokens: cacheTotal(dp), entries };
    });
  }

  function enqueueReadyAgents(agents, dps, tick, config, random, events) {
    agents.forEach((agent) => {
      if (agent.killed || agent.active || agent.round >= agent.totalRounds) return;
      if (agent.nextReadyTick > tick) return;
      const dpId = chooseDp(agent.id, config, random);
      const request = createRequest(agent, dpId, tick, config, random, events);
      if (!request) return;
      agent.active = request;
      dps[dpId].queue.push(request);
    });
  }

  function startQueuedRequests(dps, tick, config, events) {
    dps.forEach((dp) => {
      dp.kvBlockedRequest = null;
      while (dp.queue.length > 0) {
        const request = dp.queue[0];
        const reusable = evictCompletedUntilFit(dp, request, tick, config, events);
        const projectedKv = projectedKvAfterStart(dp, request);
        if (projectedKv > config.kvCapacity) {
          request.waitTicks += 1;
          request.kvBlockedTicks = (request.kvBlockedTicks || 0) + 1;
          dp.kvBlockedRequest = request;
          break;
        }
        dp.queue.shift();
        request.startedTick = tick;
        request.cachedTokens = Math.min(reusable?.entry.tokens || 0, request.promptTokens);
        request.prefillTotal = request.promptTokens;
        request.prefillRemaining = Math.max(0, request.prefillTotal - request.cachedTokens);
        request.phase = request.prefillRemaining > 0 ? "prefill" : "decode";
        request.kvBlockedTicks = request.kvBlockedTicks || 0;
        dp.active.push(request);
        writeActiveCache(dp, request, tick, reusable?.key || null);
        if (request.cachedTokens === 0) {
          events.push({
            type: "miss",
            tick,
            dpId: dp.id,
            agentId: request.agentId,
            text: `DP ${dp.id} cache miss for Agent ${request.agentId}`
          });
        }
      }
    });
  }

  function finishDecode(dp, request, agents, tick, config, random, events) {
    const agent = agents[request.agentId];
    agent.round += 1;
    agent.completedRounds += 1;
    agent.contextTokens = request.promptTokens + request.outputTokens;
    agent.totalLatencyTicks += tick - request.createdTick + 1;
    agent.totalWaitTicks += request.waitTicks;
    dp.active = dp.active.filter((activeRequest) => activeRequest.id !== request.id);
    completeRequestCache(dp, request, tick);

    const maxContext = Math.min(config.contextLength, config.kvCapacity);
    if (agent.contextTokens > maxContext) {
      killAgent(agent, tick, `context ${formatTokens(agent.contextTokens)} > limit ${formatTokens(maxContext)}`, events);
      return;
    }

    agent.active = null;
    if (agent.round < agent.totalRounds) {
      agent.nextReadyTick = tick + Math.ceil(intBetween(random, 0, 3000) / 1000 / TICK_SECONDS);
    }
  }

  function runSimulation(config) {
    const random = mulberry32(config.seed);
    config.routingCursor = 0;
    const agents = Array.from({ length: config.agentCount }, (_, id) => createAgent(id, random));
    const dps = Array.from({ length: config.dpCount }, (_, id) => ({ id, queue: [], active: [], cache: new Map(), kvBlockedRequest: null }));
    agents.__dps = dps;

    const ticks = [];
    const stats = {
      stateTicks: { prefill: 0, decode: 0, waiting: 0, idle: 0, killed: 0 },
      prefillTokens: 0,
      decodeTokens: 0,
      cacheMisses: 0,
      evictions: 0,
      kills: 0
    };

    for (let tick = 0; ; tick += 1) {
      const events = [];
      enqueueReadyAgents(agents, dps, tick, config, random, events);
      startQueuedRequests(dps, tick, config, events);
      const phase = selectPhase(dps, config.scheduler);
      const dpStates = [];

      dps.forEach((dp) => {
        const phaseRequests = dp.active.filter((request) => request.phase === phase);
        const waitingRequests = dp.active.filter((request) => request.phase !== phase);
        const visibleActive = phaseRequests[0] || waitingRequests[0] || null;
        const visibleRequest = visibleActive || dp.kvBlockedRequest;
        let state = "idle";
        let waitReason = null;

        if (phaseRequests.length > 0) {
          state = phase;
          phaseRequests.slice().forEach((request) => {
            if (phase === "prefill") {
              const amount = Math.min(request.prefillRemaining, config.prefillRate * TICK_SECONDS);
              request.prefillRemaining -= amount;
              stats.prefillTokens += amount;
              if (request.prefillRemaining <= 0) {
                request.phase = "decode";
                writeActiveCache(dp, request, tick);
              }
            } else if (phase === "decode") {
              const amount = Math.min(request.decodeRemaining, config.decodeRate * TICK_SECONDS);
              request.decodeRemaining -= amount;
              request.decodedTokens += amount;
              stats.decodeTokens += amount;
              writeActiveCache(dp, request, tick);
              if (request.decodeRemaining <= 0) {
                finishDecode(dp, request, agents, tick, config, random, events);
              }
            }
          });
        } else if (waitingRequests.length > 0) {
          state = "waiting";
          waitReason = "phase lock";
          waitingRequests.forEach((request) => {
            request.waitTicks += 1;
          });
        } else if (dp.kvBlockedRequest) {
          state = "waiting";
          waitReason = "KV capacity";
        }

        stats.stateTicks[state] += 1;
        dpStates.push({
          dpId: dp.id,
          state,
          waitReason,
          phase: visibleRequest ? visibleRequest.phase : null,
          agentId: visibleRequest ? visibleRequest.agentId : null,
          round: visibleRequest ? visibleRequest.round : null,
          activeCount: dp.active.length,
          prefillRemaining: visibleActive ? Math.max(0, visibleActive.prefillRemaining) : 0,
          decodeRemaining: visibleActive ? Math.max(0, visibleActive.decodeRemaining) : 0,
          promptTokens: visibleRequest ? visibleRequest.promptTokens : 0,
          cachedTokens: visibleRequest ? cachedTokensFor(dp, visibleRequest) : 0,
          queueDepth: dp.queue.length
        });
      });

      events.forEach((event) => {
        if (event.type === "miss") stats.cacheMisses += 1;
        if (event.type === "evict") stats.evictions += 1;
        if (event.type === "kill") stats.kills += 1;
      });

      ticks.push({
        tick,
        time: tick * TICK_SECONDS,
        phase,
        states: dpStates,
        caches: snapshotCaches(dps),
        events: events.slice()
      });

      const allDone = agents.every((agent) => agent.killed || (agent.round >= agent.totalRounds && !agent.active));
      const queuesEmpty = dps.every((dp) => dp.queue.length === 0 && dp.active.length === 0);
      if (allDone && queuesEmpty) break;
    }

    const completedRounds = agents.reduce((sum, agent) => sum + agent.completedRounds, 0);
    const killedAgents = agents.filter((agent) => agent.killed).length;
    const totalLatencyTicks = agents.reduce((sum, agent) => sum + agent.totalLatencyTicks, 0);
    const totalWaitTicks = agents.reduce((sum, agent) => sum + agent.totalWaitTicks, 0);
    const totalWorkerTicks = ticks.length * config.dpCount || 1;

    return {
      config,
      agents,
      ticks,
      stats,
      summary: {
        totalSeconds: ticks.length * TICK_SECONDS,
        completedRounds,
        killedAgents,
        utilization: (stats.stateTicks.prefill + stats.stateTicks.decode) / totalWorkerTicks,
        waiting: stats.stateTicks.waiting / totalWorkerTicks,
        idle: stats.stateTicks.idle / totalWorkerTicks,
        prefillShare: stats.stateTicks.prefill / totalWorkerTicks,
        decodeShare: stats.stateTicks.decode / totalWorkerTicks,
        evictions: stats.evictions,
        avgLatency: completedRounds > 0 ? (totalLatencyTicks / completedRounds) * TICK_SECONDS : 0,
        avgWait: completedRounds > 0 ? (totalWaitTicks / completedRounds) * TICK_SECONDS : 0,
        roundsPerMinute: ticks.length > 0 ? completedRounds / ((ticks.length * TICK_SECONDS) / 60) : 0
      }
    };
  }

  function renderShell(root, config) {
    root.innerHTML = `
      <div class="dpa-sim__panel">
        <div class="dpa-sim__title">
          <h4>DPA phase lock simulator</h4>
        </div>
        <div class="dpa-sim__controls">
          ${numberField("gpus", "GPU / DP count", config.dpCount)}
          ${numberField("agents", "Agent count", config.agentCount)}
          ${numberField("context", "Context Length", config.contextLength)}
          ${numberField("kv", "KV tokens / DP", config.kvCapacity)}
          ${numberField("prefillRate", "Prefill tokens/s", config.prefillRate)}
          ${numberField("decodeRate", "Decode tokens/s", config.decodeRate)}
          <div class="dpa-sim__field">
            <label for="dpa-scheduler">Scheduler</label>
            <select id="dpa-scheduler" name="dpa-scheduler" data-field="scheduler" aria-label="Scheduler policy">
              <option value="prefill">Prefill first</option>
              <option value="decode">Decode first</option>
              <option value="ready">More ready workers</option>
            </select>
          </div>
          ${numberField("seed", "Seed", config.seed)}
          <div class="dpa-sim__field">
            <label for="dpa-routing">Routing</label>
            <select id="dpa-routing" name="dpa-routing" data-field="routing" aria-label="Routing policy">
              <option value="pinned">Pinned DP</option>
              <option value="round-robin">Round-robin</option>
              <option value="random">Random</option>
            </select>
          </div>
          <div class="dpa-sim__field">
            <label>&nbsp;</label>
            <button class="dpa-sim__button" type="button" data-action="run">Run simulation</button>
          </div>
        </div>
        <div class="dpa-sim__metrics" data-role="metrics"></div>
        <div class="dpa-sim__legend">
          ${legendItem("prefill")} ${legendItem("decode")} ${legendItem("waiting")} ${legendItem("idle")}
        </div>
        <div class="dpa-sim__timeline-wrap">
          <svg class="dpa-sim__timeline" data-role="timeline" role="img" aria-label="DPA worker timeline"></svg>
        </div>
        <div class="dpa-sim__time-window" data-role="time-window">
          <div class="dpa-sim__window-labels">
            <span data-role="window-start">0s</span>
            <span data-role="window-end">0s</span>
          </div>
          <div class="dpa-sim__window-track" data-role="window-track">
            <div class="dpa-sim__window-fill" data-role="window-fill"></div>
            <button class="dpa-sim__window-handle" type="button" data-handle="start" aria-label="Drag window start"></button>
            <button class="dpa-sim__window-handle" type="button" data-handle="end" aria-label="Drag window end"></button>
          </div>
        </div>
        <div class="dpa-sim__inspector">
          <div class="dpa-sim__tick-controls">
            <button type="button" data-action="prev" aria-label="Previous tick">&lt;</button>
            <strong data-role="tick-label">Tick 0</strong>
            <label class="dpa-sim__sr-only" for="dpa-tick-slider">Select tick</label>
            <input id="dpa-tick-slider" name="dpa-tick-slider" type="range" min="0" max="0" value="0" data-role="tick-slider" aria-label="Select tick">
            <button type="button" data-action="next" aria-label="Next tick">&gt;</button>
          </div>
          <div class="dpa-sim__hint" data-role="phase-label"></div>
          <div class="dpa-sim__kv-grid" data-role="kv-grid"></div>
          <div class="dpa-sim__events" data-role="events"></div>
        </div>
      </div>
    `;
    root.querySelector("[data-field='scheduler']").value = config.scheduler;
    root.querySelector("[data-field='routing']").value = config.routing;
  }

  function numberField(name, label, value) {
    return `
      <div class="dpa-sim__field">
        <label for="dpa-${name}">${label}</label>
        <input id="dpa-${name}" name="dpa-${name}" type="number" inputmode="numeric" data-field="${name}" value="${value}" aria-label="${label}">
      </div>
    `;
  }

  function legendItem(state) {
    return `
      <span class="dpa-sim__legend-item">
        <span class="dpa-sim__swatch" style="background:${STATE_COLORS[state]}"></span>${STATE_LABELS[state]}
      </span>
    `;
  }

  function readFormConfig(root, previous) {
    const value = (field) => root.querySelector(`[data-field='${field}']`);
    return {
      dpCount: clampInt(value("gpus").value, 1, 64, previous.dpCount),
      agentCount: clampInt(value("agents").value, 1, 256, previous.agentCount),
      contextLength: clampInt(value("context").value, 1000, 2000000, previous.contextLength),
      kvCapacity: clampInt(value("kv").value, 1000, 2000000, previous.kvCapacity),
      prefillRate: clampFloat(value("prefillRate").value, 1, 100000, previous.prefillRate),
      decodeRate: clampFloat(value("decodeRate").value, 1, 10000, previous.decodeRate),
      routing: normalizeRouting(value("routing").value),
      scheduler: value("scheduler").value,
      seed: clampInt(value("seed").value, 1, 2147483647, previous.seed)
    };
  }

  function renderMetrics(root, result) {
    const summary = result.summary;
    const metrics = [
      ["Effective utilization", formatPct(summary.utilization)],
      ["Waiting", formatPct(summary.waiting)],
      ["Prefill / Decode", `${formatPct(summary.prefillShare)} / ${formatPct(summary.decodeShare)}`],
      ["Eviction / Killed", `${summary.evictions} / ${summary.killedAgents}`],
      ["Completed rounds", `${summary.completedRounds} (${summary.roundsPerMinute.toFixed(1)}/min)`],
      ["Avg latency / wait", `${formatSeconds(summary.avgLatency)} / ${formatSeconds(summary.avgWait)}`]
    ];
    root.querySelector("[data-role='metrics']").innerHTML = metrics
      .map(([label, value]) => `<div class="dpa-sim__metric"><span>${label}</span><strong>${value}</strong></div>`)
      .join("");
  }

  function segmentsForDp(result, dpId, viewStart, viewEnd) {
    const segments = [];
    let current = null;
    for (let tickIndex = viewStart; tickIndex <= viewEnd; tickIndex += 1) {
      const tick = result.ticks[tickIndex];
      const state = tick.states[dpId].state;
      const agentId = tick.states[dpId].agentId;
      const key = `${state}:${agentId ?? "none"}`;
      if (!current || current.key !== key) {
        current = { key, state, agentId, start: tick.tick, end: tick.tick + 1 };
        segments.push(current);
      } else {
        current.end = tick.tick + 1;
      }
    }
    return segments;
  }

  function renderTimeline(root, result, onSelectTick) {
    const svg = root.querySelector("[data-role='timeline']");
    const viewStart = result.viewStartTick ?? 0;
    const viewEnd = result.viewEndTick ?? Math.max(0, result.ticks.length - 1);
    const visibleTicks = Math.max(1, viewEnd - viewStart + 1);
    const width = Math.max(780, root.querySelector("[data-role='timeline']")?.clientWidth || 780);
    const rowHeight = 22;
    const labelWidth = 54;
    const top = 22;
    const height = top + result.config.dpCount * rowHeight + 26;
    const tickWidth = (width - labelWidth - 12) / visibleTicks;
    const lines = [];
    const startTime = result.ticks[viewStart]?.time || 0;
    const endTime = (result.ticks[viewEnd]?.time || 0) + TICK_SECONDS;

    lines.push(
      `<svg class="dpa-sim__timeline" data-role="timeline" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="DPA worker timeline">`
    );
    lines.push(`<text x="${labelWidth}" y="13" fill="currentColor" opacity="0.65" font-size="11">${formatSeconds(startTime)}</text>`);
    lines.push(`<text x="${width - 70}" y="13" fill="currentColor" opacity="0.65" font-size="11">${formatSeconds(endTime)}</text>`);

    for (let dpId = 0; dpId < result.config.dpCount; dpId += 1) {
      const y = top + dpId * rowHeight;
      lines.push(`<text x="8" y="${y + 14}" fill="currentColor" opacity="0.75" font-size="11">DP ${dpId}</text>`);
      lines.push(`<rect x="${labelWidth}" y="${y + 3}" width="${width - labelWidth - 12}" height="14" fill="currentColor" opacity="0.055"/>`);
      segmentsForDp(result, dpId, viewStart, viewEnd).forEach((segment) => {
        const segmentStart = Math.max(segment.start, viewStart);
        const segmentEnd = Math.min(segment.end, viewEnd + 1);
        const x = labelWidth + (segmentStart - viewStart) * tickWidth;
        const w = Math.max(1, (segmentEnd - segmentStart) * tickWidth);
        lines.push(
          `<rect x="${x.toFixed(2)}" y="${y + 3}" width="${w.toFixed(2)}" height="14" fill="${STATE_COLORS[segment.state]}" data-tick="${segment.start}" data-dp="${dpId}" data-state="${segment.state}" data-agent="${segment.agentId ?? ""}"/>`
        );
      });
    }

    lines.push(`</svg>`);
    svg.outerHTML = lines.join("");
    const nextSvg = root.querySelector("[data-role='timeline']");
    nextSvg.addEventListener("click", (event) => {
      const rect = event.target.closest("[data-tick]");
      if (!rect) return;
      onSelectTick(Number(rect.dataset.tick));
    });
    attachTooltip(root, nextSvg, result);
  }

  function clearTooltip(root) {
    if (root.__dpaTooltip) root.__dpaTooltip.remove();
    root.__dpaTooltip = null;
  }

  function attachTooltip(root, svg, result) {
    clearTooltip(root);
    const remove = () => clearTooltip(root);
    svg.addEventListener("pointermove", (event) => {
      const rect = event.target.closest("[data-tick]");
      if (!rect) {
        remove();
        return;
      }
      const tick = result.ticks[Number(rect.dataset.tick)];
      const dp = tick.states[Number(rect.dataset.dp)];
      if (!root.__dpaTooltip) {
        root.__dpaTooltip = document.createElement("div");
        root.__dpaTooltip.className = "dpa-sim__tooltip";
        document.body.appendChild(root.__dpaTooltip);
      }
      const tooltip = root.__dpaTooltip;
      tooltip.innerHTML = `
        <strong>${STATE_LABELS[dp.state]} · DP ${dp.dpId}</strong><br>
        time ${formatSeconds(tick.time)} · tick ${tick.tick}<br>
        ${dp.waitReason ? `waiting on ${dp.waitReason}<br>` : ""}
        ${dp.agentId === null ? "no active agent" : `Agent ${dp.agentId}, round ${dp.round}`}<br>
        prompt ${formatTokens(dp.promptTokens)}, cached ${formatTokens(dp.cachedTokens)}<br>
        remaining P/D ${formatTokens(dp.prefillRemaining)} / ${formatTokens(dp.decodeRemaining)}<br>
        queue depth ${dp.queueDepth}
      `;
      tooltip.style.left = `${event.clientX + 12}px`;
      tooltip.style.top = `${event.clientY + 12}px`;
    });
    svg.addEventListener("pointerleave", remove);
    svg.addEventListener("pointerdown", remove);
  }

  function renderInspector(root, result, tickIndex) {
    const tick = result.ticks[Math.max(0, Math.min(tickIndex, result.ticks.length - 1))];
    const slider = root.querySelector("[data-role='tick-slider']");
    slider.max = String(Math.max(0, result.ticks.length - 1));
    slider.value = String(tick.tick);
    root.querySelector("[data-role='tick-label']").textContent = `Tick ${tick.tick} · ${formatSeconds(tick.time)}`;
    root.querySelector("[data-role='phase-label']").textContent = `Global phase: ${tick.phase === "idle" ? "Idle" : STATE_LABELS[tick.phase]}`;

    root.querySelector("[data-role='kv-grid']").innerHTML = tick.caches
      .map((cache) => renderDpCache(cache, result.config.kvCapacity))
      .join("");

    const eventBox = root.querySelector("[data-role='events']");
    if (tick.events.length === 0) {
      eventBox.innerHTML = `<div class="dpa-sim__empty">No KV miss, eviction, or kill events in this tick.</div>`;
    } else {
      eventBox.innerHTML = `<strong>Tick events</strong><ul>${tick.events.map((event) => `<li>${event.text}</li>`).join("")}</ul>`;
    }
  }

  function renderDpCache(cache, capacity) {
    const percent = capacity > 0 ? Math.min(100, (cache.usedTokens / capacity) * 100) : 0;
    const entries = cache.entries.length
      ? cache.entries
          .slice(0, 6)
          .map(
            (entry) =>
              `<li><span>Agent ${entry.agentId} r${entry.round} ${entry.status}</span><span>${formatTokens(entry.tokens)} · last ${entry.lastAccessTick}</span></li>`
          )
          .join("")
      : `<li><span>empty</span><span>0</span></li>`;
    return `
      <div class="dpa-sim__dp-card">
        <div class="dpa-sim__dp-head">
          <strong>DP ${cache.dpId}</strong>
          <span>${formatTokens(cache.usedTokens)} / ${formatTokens(capacity)}</span>
        </div>
        <div class="dpa-sim__bar"><div class="dpa-sim__bar-fill" style="width:${percent.toFixed(1)}%"></div></div>
        <ul class="dpa-sim__entries">${entries}</ul>
      </div>
    `;
  }

  function minimumWindowTicks(result) {
    return Math.min(20, Math.max(0, result.ticks.length - 1));
  }

  function tickFromPointer(result, track, clientX) {
    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    return Math.round(ratio * Math.max(0, result.ticks.length - 1));
  }

  function setTimelineWindow(result, start, end) {
    const maxTick = Math.max(0, result.ticks.length - 1);
    const minSpan = minimumWindowTicks(result);
    let nextStart = Math.max(0, Math.min(maxTick, start));
    let nextEnd = Math.max(0, Math.min(maxTick, end));
    if (nextEnd - nextStart < minSpan) {
      if (start !== result.viewStartTick) {
        nextStart = Math.max(0, nextEnd - minSpan);
      } else {
        nextEnd = Math.min(maxTick, nextStart + minSpan);
      }
    }
    result.viewStartTick = nextStart;
    result.viewEndTick = nextEnd;
  }

  function renderTimeWindow(root, result) {
    const maxTick = Math.max(1, result.ticks.length - 1);
    const start = result.viewStartTick ?? 0;
    const end = result.viewEndTick ?? Math.max(0, result.ticks.length - 1);
    const startPct = (start / maxTick) * 100;
    const endPct = (end / maxTick) * 100;
    const fill = root.querySelector("[data-role='window-fill']");
    const startHandle = root.querySelector("[data-handle='start']");
    const endHandle = root.querySelector("[data-handle='end']");
    fill.style.left = `${startPct}%`;
    fill.style.width = `${Math.max(0, endPct - startPct)}%`;
    startHandle.style.left = `${startPct}%`;
    endHandle.style.left = `${endPct}%`;
    root.querySelector("[data-role='window-start']").textContent = formatSeconds(result.ticks[start]?.time || 0);
    root.querySelector("[data-role='window-end']").textContent = formatSeconds((result.ticks[end]?.time || 0) + TICK_SECONDS);
  }

  function panTimelineWindow(result, deltaTicks) {
    const maxTick = Math.max(0, result.ticks.length - 1);
    const start = result.viewStartTick ?? 0;
    const end = result.viewEndTick ?? maxTick;
    const span = end - start;
    const nextStart = Math.max(0, Math.min(maxTick - span, start + deltaTicks));
    result.viewStartTick = nextStart;
    result.viewEndTick = nextStart + span;
  }

  function findEventTick(result, currentTick, direction) {
    for (let tick = currentTick + direction; tick >= 0 && tick < result.ticks.length; tick += direction) {
      if (result.ticks[tick].events.length > 0) return tick;
    }
    return currentTick;
  }

  function init(root) {
    let config = readConfig(root);
    renderShell(root, config);
    let result = null;
    let selectedTick = 0;
    let draggingWindow = null;

    const renderWindowedTimeline = () => {
      clearTooltip(root);
      renderTimeline(root, result, (tick) => {
        selectedTick = tick;
        renderInspector(root, result, selectedTick);
      });
      renderTimeWindow(root, result);
    };

    const updateWindowFromPointer = (clientX) => {
      if (!result) return;
      const track = root.querySelector("[data-role='window-track']");
      const tick = tickFromPointer(result, track, clientX);
      if (draggingWindow.type === "start") {
        setTimelineWindow(result, tick, result.viewEndTick);
      } else if (draggingWindow.type === "end") {
        setTimelineWindow(result, result.viewStartTick, tick);
      } else {
        const delta = tick - draggingWindow.pointerTick;
        const span = draggingWindow.endTick - draggingWindow.startTick;
        const maxStart = Math.max(0, result.ticks.length - 1 - span);
        const nextStart = Math.max(0, Math.min(maxStart, draggingWindow.startTick + delta));
        result.viewStartTick = nextStart;
        result.viewEndTick = nextStart + span;
      }
      renderWindowedTimeline();
    };

    const rerun = () => {
      config = readFormConfig(root, config);
      result = runSimulation(config);
      result.viewStartTick = 0;
      result.viewEndTick = Math.max(0, result.ticks.length - 1);
      selectedTick = Math.min(selectedTick, result.ticks.length - 1);
      renderMetrics(root, result);
      renderWindowedTimeline();
      renderInspector(root, result, selectedTick);
    };

    root.addEventListener("click", (event) => {
      const action = event.target.dataset.action;
      if (action === "run") rerun();
      if (action === "prev" && result) {
        selectedTick = findEventTick(result, selectedTick, -1);
        renderInspector(root, result, selectedTick);
      }
      if (action === "next" && result) {
        selectedTick = findEventTick(result, selectedTick, 1);
        renderInspector(root, result, selectedTick);
      }
    });

    root.addEventListener("input", (event) => {
      if (event.target.matches("[data-role='tick-slider']") && result) {
        selectedTick = Number(event.target.value);
        renderInspector(root, result, selectedTick);
      }
    });

    root.addEventListener("pointerdown", (event) => {
      const handle = event.target.closest("[data-handle]");
      const fill = event.target.closest("[data-role='window-fill']");
      if ((!handle && !fill) || !result) return;
      const track = root.querySelector("[data-role='window-track']");
      draggingWindow = {
        type: handle ? handle.dataset.handle : "pan",
        pointerTick: tickFromPointer(result, track, event.clientX),
        startTick: result.viewStartTick,
        endTick: result.viewEndTick
      };
      event.target.setPointerCapture(event.pointerId);
      updateWindowFromPointer(event.clientX);
    });

    root.addEventListener("pointermove", (event) => {
      if (!draggingWindow) return;
      updateWindowFromPointer(event.clientX);
    });

    root.addEventListener("pointerup", () => {
      draggingWindow = null;
    });

    root.addEventListener("pointercancel", () => {
      draggingWindow = null;
    });

    root.addEventListener("wheel", (event) => {
      clearTooltip(root);
      if (!result || !event.target.closest("[data-role='window-track'], .dpa-sim__timeline-wrap")) return;
      const span = (result.viewEndTick ?? 0) - (result.viewStartTick ?? 0);
      const direction = (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) > 0 ? 1 : -1;
      const step = Math.max(1, Math.round(span * 0.08));
      panTimelineWindow(result, direction * step);
      renderWindowedTimeline();
      event.preventDefault();
    }, { passive: false });

    window.addEventListener("scroll", () => clearTooltip(root), { passive: true, capture: true });
    window.addEventListener("resize", () => clearTooltip(root), { passive: true });
    window.addEventListener("blur", () => clearTooltip(root), { passive: true });

    rerun();
  }

  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll(".dpa-sim").forEach(init);
  });
})();
