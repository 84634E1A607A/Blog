(function () {
  "use strict";

  const SPEED_OPTIONS = [1, 2.5, 5, 10, 25, 40, 100];
  const MAX_INTERNAL_STEPS = 1000000;
  const MAX_SNAPSHOTS = 1500;
  const CONVERGENCE_WINDOW_SECONDS = 0.25;
  const CONVERGENCE_HOLD_SECONDS = 0.5;
  const BBR_HIGH_GAIN = 2.885;
  const BBR_PROBE_GAINS = [1.25, 0.75, 1, 1, 1, 1, 1, 1];

  function clamp(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.max(min, Math.min(max, number));
  }

  function clampInt(value, min, max, fallback) {
    return Math.round(clamp(value, min, max, fallback));
  }

  function formatRate(value) {
    if (value >= 100) return `${value.toFixed(1)} Gbps`;
    if (value >= 10) return `${value.toFixed(2)} Gbps`;
    if (value >= 1) return `${value.toFixed(3)} Gbps`;
    return `${(value * 1000).toFixed(1)} Mbps`;
  }

  function formatAxisRate(value) {
    if (value >= 1) return `${value.toPrecision(3)} Gbps`;
    return `${(value * 1000).toPrecision(3)} Mbps`;
  }

  function formatPct(value) {
    return `${(value * 100).toFixed(1)}%`;
  }

  function formatTime(value) {
    if (value < 0.001) return `${(value * 1000000).toFixed(1)} µs`;
    if (value < 1) return `${(value * 1000).toFixed(value < 0.1 ? 2 : 1)} ms`;
    return `${value.toFixed(2)} s`;
  }

  function formatBytes(value) {
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(2)} MiB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${Math.round(value)} B`;
  }

  function relativeChange(a, b, floor) {
    return Math.abs(a - b) / Math.max(Math.abs(b), floor);
  }

  function jainFairness(values) {
    if (!values.length) return 1;
    const sum = values.reduce((total, value) => total + value, 0);
    const squares = values.reduce((total, value) => total + value * value, 0);
    if (squares <= 0) return 0;
    return (sum * sum) / (values.length * squares);
  }

  function mix32(value) {
    let x = value >>> 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }

  function streamHash(seed, streamId, salt) {
    return mix32((seed ^ salt ^ Math.imul(streamId + 1, 0x9e3779b1)) >>> 0);
  }

  function randomSeed() {
    if (globalThis.crypto && typeof globalThis.crypto.getRandomValues === "function") {
      const words = new Uint32Array(1);
      globalThis.crypto.getRandomValues(words);
      return words[0] || 1;
    }
    return Math.max(1, Math.floor(Math.random() * 0xffffffff)) >>> 0;
  }

  function normalizeSpeeds(values, count, fallback) {
    const source = Array.isArray(values) ? values : [];
    return Array.from({ length: count }, (_, index) => {
      const value = Number(source[index] ?? source[source.length - 1] ?? fallback);
      return SPEED_OPTIONS.includes(value) ? value : fallback;
    });
  }

  function normalizeConfig(input) {
    const nodeACount = clampInt(input.nodeACount, 1, 4, 2);
    const nodeBCount = clampInt(input.nodeBCount, 1, 4, 2);
    const seedText = String(input.seed ?? "").trim();
    const explicitSeed = seedText === "" ? null : clampInt(seedText, 1, 0xffffffff, 1) >>> 0;
    const cc = ["newreno", "cubic", "bbr"].includes(input.cc) ? input.cc : "cubic";
    const mtu = clampInt(input.mtu, 576, 16384, 9216);
    return {
      nodeACount,
      nodeBCount,
      nodeASpeeds: normalizeSpeeds(input.nodeASpeeds, nodeACount, 10),
      nodeBSpeeds: normalizeSpeeds(input.nodeBSpeeds, nodeBCount, 10),
      streamCount: clampInt(input.streamCount, 1, 32, 4),
      cc,
      maxTime: clamp(input.maxTime, 0.25, 30, 10),
      rttMs: clamp(input.rttMs, 0.01, 2, 0.05),
      bufferBdp: clamp(input.bufferBdp, 0.25, 8, 1),
      mtu,
      mss: Math.max(536, mtu - 40),
      seedInput: seedText,
      seed: explicitSeed ?? randomSeed(),
      stopOnConvergence: input.stopOnConvergence !== false
    };
  }

  function makeMappings(config) {
    return Array.from({ length: config.streamCount }, (_, streamId) => ({
      streamId,
      a: streamHash(config.seed, streamId, 0xa341316c) % config.nodeACount,
      b: streamHash(config.seed, streamId, 0xc8013ea4) % config.nodeBCount
    }));
  }

  function addEdge(graph, from, to, capacity) {
    const forward = { to, capacity, flow: 0, reverse: null };
    const reverse = { to: from, capacity: 0, flow: 0, reverse: forward };
    forward.reverse = reverse;
    graph[from].push(forward);
    graph[to].push(reverse);
  }

  function hashLimitedCeiling(config, mappings) {
    const source = 0;
    const aStart = 1;
    const bStart = aStart + config.nodeACount;
    const sink = bStart + config.nodeBCount;
    const graph = Array.from({ length: sink + 1 }, () => []);
    config.nodeASpeeds.forEach((speed, index) => addEdge(graph, source, aStart + index, speed));
    config.nodeBSpeeds.forEach((speed, index) => addEdge(graph, bStart + index, sink, speed));
    const pairs = new Set(mappings.map((mapping) => `${mapping.a}:${mapping.b}`));
    const infinite = config.nodeASpeeds.reduce((sum, speed) => sum + speed, 0) +
      config.nodeBSpeeds.reduce((sum, speed) => sum + speed, 0);
    pairs.forEach((pair) => {
      const [a, b] = pair.split(":").map(Number);
      addEdge(graph, aStart + a, bStart + b, infinite);
    });

    let total = 0;
    while (true) {
      const parent = Array(graph.length).fill(null);
      const queue = [source];
      parent[source] = { node: -1, edge: null };
      for (let cursor = 0; cursor < queue.length && parent[sink] === null; cursor += 1) {
        const node = queue[cursor];
        for (const edge of graph[node]) {
          if (parent[edge.to] !== null || edge.capacity - edge.flow <= 1e-9) continue;
          parent[edge.to] = { node, edge };
          queue.push(edge.to);
          if (edge.to === sink) break;
        }
      }
      if (parent[sink] === null) break;
      let amount = Infinity;
      for (let node = sink; node !== source; node = parent[node].node) {
        const edge = parent[node].edge;
        amount = Math.min(amount, edge.capacity - edge.flow);
      }
      for (let node = sink; node !== source; node = parent[node].node) {
        const edge = parent[node].edge;
        edge.flow += amount;
        edge.reverse.flow -= amount;
      }
      total += amount;
    }
    return total;
  }

  function createResources(speeds, mappingKey, mappings, config) {
    const baseRtt = config.rttMs / 1000;
    return speeds.map((speed, resourceId) => {
      const bytesPerSecond = speed * 1e9 / 8;
      return {
        id: resourceId,
        speed,
        bytesPerSecond,
        bufferBytes: Math.max(config.mss * 4, bytesPerSecond * baseRtt * config.bufferBdp),
        queueByFlow: new Float64Array(config.streamCount),
        flows: mappings.filter((mapping) => mapping[mappingKey] === resourceId).map((mapping) => mapping.streamId),
        totalQueued: 0
      };
    });
  }

  function processResources(resources, arrivals, dt) {
    const departed = new Float64Array(arrivals.length);
    const dropped = new Float64Array(arrivals.length);
    const utilization = new Float64Array(resources.length);
    const queuePct = new Float64Array(resources.length);

    resources.forEach((resource) => {
      let incoming = 0;
      resource.flows.forEach((flowId) => {
        incoming += arrivals[flowId];
      });
      const available = Math.max(0, resource.bufferBytes - resource.totalQueued);
      const acceptScale = incoming > available && incoming > 0 ? available / incoming : 1;
      resource.flows.forEach((flowId) => {
        const accepted = arrivals[flowId] * acceptScale;
        resource.queueByFlow[flowId] += accepted;
        dropped[flowId] += arrivals[flowId] - accepted;
      });
      resource.totalQueued += incoming * acceptScale;

      const service = Math.min(resource.totalQueued, resource.bytesPerSecond * dt);
      const queuedBeforeService = resource.totalQueued;
      if (service > 0 && queuedBeforeService > 0) {
        resource.flows.forEach((flowId) => {
          const share = resource.queueByFlow[flowId] / queuedBeforeService;
          const bytes = Math.min(resource.queueByFlow[flowId], service * share);
          resource.queueByFlow[flowId] -= bytes;
          departed[flowId] += bytes;
        });
      }
      resource.totalQueued = Math.max(0, queuedBeforeService - service);
      utilization[resource.id] = service / Math.max(1, resource.bytesPerSecond * dt);
      queuePct[resource.id] = resource.totalQueued / resource.bufferBytes;
    });

    return { departed, dropped, utilization, queuePct };
  }

  function createFlow(mapping, config) {
    const baseRtt = config.rttMs / 1000;
    const initialCwnd = 10 * config.mss;
    return {
      id: mapping.streamId,
      a: mapping.a,
      b: mapping.b,
      cwnd: initialCwnd,
      ssthresh: Infinity,
      rtt: baseRtt,
      delivered: 0,
      dropped: 0,
      offered: 0,
      currentRate: 0,
      state: "Slow start",
      cubicWMax: initialCwnd / config.mss,
      cubicEpoch: -1,
      cubicK: 0,
      bbrMode: "STARTUP",
      bbrBw: 0,
      bbrMinRtt: baseRtt,
      bbrFullBw: 0,
      bbrFullBwCount: 0,
      bbrCycle: 0,
      bbrCycleStarted: 0,
      bbrProbeRttStarted: -1,
      bbrLastProbeRtt: 0,
      bbrBwSamples: [],
      pacingRate: BBR_HIGH_GAIN * initialCwnd / baseRtt
    };
  }

  function flowSendBytes(flow, config, dt) {
    const windowRate = flow.cwnd / Math.max(flow.rtt, config.rttMs / 1000);
    const rate = config.cc === "bbr" ? Math.min(flow.pacingRate, windowRate) : windowRate;
    return Math.max(0, rate * dt);
  }

  function updateNewReno(flow, acked, dropped, config) {
    if (dropped > 0) {
      flow.ssthresh = Math.max(2 * config.mss, flow.cwnd * 0.5);
      flow.cwnd = flow.ssthresh;
      flow.state = "Fast recovery";
      return;
    }
    if (flow.cwnd < flow.ssthresh) {
      flow.cwnd += acked;
      flow.state = "Slow start";
    } else {
      flow.cwnd += config.mss * config.mss * acked / Math.max(flow.cwnd * config.mss, 1);
      flow.state = "Congestion avoidance";
    }
    flow.cwnd = Math.max(2 * config.mss, flow.cwnd);
  }

  function updateCubic(flow, acked, dropped, config, time) {
    const beta = 0.7;
    const cubicC = 0.4;
    if (dropped > 0) {
      flow.cubicWMax = flow.cwnd / config.mss;
      flow.cwnd = Math.max(2 * config.mss, flow.cwnd * beta);
      flow.ssthresh = flow.cwnd;
      flow.cubicEpoch = -1;
      flow.state = "Multiplicative decrease";
      return;
    }
    if (flow.cwnd < flow.ssthresh) {
      flow.cwnd += acked;
      flow.state = "Slow start";
      return;
    }
    if (flow.cubicEpoch < 0) {
      flow.cubicEpoch = time;
      flow.cubicK = Math.cbrt(flow.cubicWMax * (1 - beta) / cubicC);
    }
    const elapsed = Math.max(0, time - flow.cubicEpoch + flow.rtt);
    const targetSegments = cubicC * Math.pow(elapsed - flow.cubicK, 3) + flow.cubicWMax;
    const targetBytes = Math.max(2 * config.mss, targetSegments * config.mss);
    const cubicIncrement = Math.max(0, targetBytes - flow.cwnd) * acked / Math.max(flow.cwnd, 1);
    const alpha = 3 * (1 - beta) / (1 + beta);
    const renoIncrement = alpha * config.mss * acked / Math.max(flow.cwnd, 1);
    flow.cwnd += Math.max(cubicIncrement, renoIncrement);
    flow.cwnd = Math.max(2 * config.mss, flow.cwnd);
    flow.state = "CUBIC avoidance";
  }

  function bbrPathQueue(flow, resourcesA, resourcesB) {
    return resourcesA[flow.a].totalQueued + resourcesB[flow.b].totalQueued;
  }

  function updateBbr(flow, acked, dropped, config, time, dt, resourcesA, resourcesB) {
    const deliveryRate = acked / Math.max(dt, 1e-9);
    flow.bbrBwSamples.push({ time, value: deliveryRate });
    const filterWindow = Math.max(flow.bbrMinRtt * 10, dt * 10);
    while (flow.bbrBwSamples.length > 1 && flow.bbrBwSamples[0].time < time - filterWindow) {
      flow.bbrBwSamples.shift();
    }
    flow.bbrBw = Math.max(config.mss / flow.bbrMinRtt, ...flow.bbrBwSamples.map((sample) => sample.value));
    flow.bbrMinRtt = Math.min(flow.bbrMinRtt, flow.rtt);

    if (flow.bbrMode !== "PROBE_RTT" && time - flow.bbrLastProbeRtt >= 10) {
      flow.bbrMode = "PROBE_RTT";
      flow.bbrProbeRttStarted = time;
    }
    if (flow.bbrMode === "PROBE_RTT" && time - flow.bbrProbeRttStarted >= 0.2) {
      flow.bbrMode = "PROBE_BW";
      flow.bbrLastProbeRtt = time;
      flow.bbrCycleStarted = time;
      flow.bbrCycle = 0;
    }

    if (flow.bbrMode === "STARTUP") {
      if (flow.bbrFullBw === 0 || flow.bbrBw >= flow.bbrFullBw * 1.25) {
        flow.bbrFullBw = flow.bbrBw;
        flow.bbrFullBwCount = 0;
      } else {
        flow.bbrFullBwCount += Math.max(1, dt / Math.max(flow.bbrMinRtt, 1e-9));
      }
      if (flow.bbrFullBwCount >= 3) flow.bbrMode = "DRAIN";
    } else if (flow.bbrMode === "DRAIN") {
      const bdp = Math.max(config.mss * 4, flow.bbrBw * flow.bbrMinRtt);
      if (bbrPathQueue(flow, resourcesA, resourcesB) <= bdp * 0.05) {
        flow.bbrMode = "PROBE_BW";
        flow.bbrCycleStarted = time;
        flow.bbrCycle = 0;
      }
    } else if (flow.bbrMode === "PROBE_BW" && time - flow.bbrCycleStarted >= flow.bbrMinRtt) {
      const advances = Math.max(1, Math.floor((time - flow.bbrCycleStarted) / flow.bbrMinRtt));
      flow.bbrCycle = (flow.bbrCycle + advances) % BBR_PROBE_GAINS.length;
      flow.bbrCycleStarted = time;
    }

    let pacingGain = 1;
    let cwndGain = 2;
    if (flow.bbrMode === "STARTUP") pacingGain = BBR_HIGH_GAIN;
    if (flow.bbrMode === "DRAIN") pacingGain = 1 / BBR_HIGH_GAIN;
    if (flow.bbrMode === "PROBE_BW") pacingGain = BBR_PROBE_GAINS[flow.bbrCycle];
    if (flow.bbrMode === "PROBE_RTT") cwndGain = 0;

    const bdp = Math.max(4 * config.mss, flow.bbrBw * flow.bbrMinRtt);
    const targetCwnd = flow.bbrMode === "PROBE_RTT" ? 4 * config.mss : Math.max(4 * config.mss, cwndGain * bdp);
    if (flow.cwnd < targetCwnd) flow.cwnd = Math.min(targetCwnd, flow.cwnd + acked);
    else flow.cwnd = targetCwnd;
    if (dropped > 0) flow.cwnd = Math.max(4 * config.mss, flow.cwnd - Math.min(flow.cwnd * 0.3, dropped));
    flow.pacingRate = Math.max(config.mss / flow.bbrMinRtt, pacingGain * flow.bbrBw);
    flow.state = flow.bbrMode.replace("_", " ");
  }

  function updateController(flow, acked, dropped, config, time, dt, resourcesA, resourcesB) {
    if (config.cc === "newreno") updateNewReno(flow, acked, dropped, config);
    else if (config.cc === "cubic") updateCubic(flow, acked, dropped, config, time);
    else updateBbr(flow, acked, dropped, config, time, dt, resourcesA, resourcesB);
  }

  function leftInitialState(flow, cc) {
    if (cc === "bbr") return flow.bbrMode !== "STARTUP" && flow.bbrMode !== "DRAIN";
    return flow.state !== "Slow start";
  }

  function snapshot(time, flows, aResult, bResult, delivered, dropped) {
    return {
      time,
      aggregateRate: delivered.reduce((sum, bytes) => sum + bytes, 0) * 8,
      droppedBytes: dropped.reduce((sum, bytes) => sum + bytes, 0),
      flowDropped: Array.from(dropped),
      flowRates: Array.from(delivered, (bytes) => bytes * 8),
      cwnds: flows.map((flow) => flow.cwnd),
      rtts: flows.map((flow) => flow.rtt),
      states: flows.map((flow) => flow.state),
      aUtilization: Array.from(aResult.utilization),
      bUtilization: Array.from(bResult.utilization),
      aQueues: Array.from(aResult.queuePct),
      bQueues: Array.from(bResult.queuePct)
    };
  }

  function makeWindowAccumulator(config) {
    return {
      duration: 0,
      delivered: 0,
      flowDelivered: new Float64Array(config.streamCount),
      aUtilization: new Float64Array(config.nodeACount),
      bUtilization: new Float64Array(config.nodeBCount),
      queueNormalized: 0
    };
  }

  function windowMetrics(accumulator) {
    const duration = Math.max(accumulator.duration, 1e-9);
    return {
      goodput: accumulator.delivered * 8 / duration / 1e9,
      aUtilization: Array.from(accumulator.aUtilization, (value) => value / duration),
      bUtilization: Array.from(accumulator.bUtilization, (value) => value / duration),
      queueNormalized: accumulator.queueNormalized / duration,
      fairness: jainFairness(Array.from(accumulator.flowDelivered, (value) => value / duration))
    };
  }

  function hasConverged(previous, current, hashCeiling, flows, cc) {
    if (!previous || current.goodput < hashCeiling * 0.01) return false;
    if (!flows.every((flow) => leftInitialState(flow, cc))) return false;
    if (relativeChange(current.goodput, previous.goodput, Math.max(0.001, hashCeiling * 0.01)) > 0.005) return false;
    if (current.aUtilization.some((value, index) => Math.abs(value - previous.aUtilization[index]) > 0.005)) return false;
    if (current.bUtilization.some((value, index) => Math.abs(value - previous.bUtilization[index]) > 0.005)) return false;
    if (Math.abs(current.fairness - previous.fairness) > 0.005) return false;
    if (Math.abs(current.queueNormalized - previous.queueNormalized) > 0.005) return false;
    return true;
  }

  async function simulate(rawConfig, token, onProgress) {
    const config = normalizeConfig(rawConfig);
    const mappings = makeMappings(config);
    const physicalCeiling = Math.min(
      config.nodeASpeeds.reduce((sum, speed) => sum + speed, 0),
      config.nodeBSpeeds.reduce((sum, speed) => sum + speed, 0)
    );
    const hashCeiling = hashLimitedCeiling(config, mappings);
    const resourcesA = createResources(config.nodeASpeeds, "a", mappings, config);
    const resourcesB = createResources(config.nodeBSpeeds, "b", mappings, config);
    const flows = mappings.map((mapping) => createFlow(mapping, config));
    const baseRtt = config.rttMs / 1000;
    const dt = Math.max(baseRtt, config.maxTime / MAX_INTERNAL_STEPS);
    const maxSteps = Math.ceil(config.maxTime / dt);
    const recordEvery = Math.max(1, Math.ceil(maxSteps / MAX_SNAPSHOTS));
    const offered = new Float64Array(config.streamCount);
    const totalDelivered = new Float64Array(config.streamCount);
    let totalDropped = 0;
    let totalOffered = 0;
    let previousWindow = null;
    let stableFor = 0;
    let accumulator = makeWindowAccumulator(config);
    const samples = [];
    let actualTime = 0;
    let stopReason = "Time limit reached";
    let lastStepData = null;

    for (let step = 0; step < maxSteps; step += 1) {
      if (token && token.cancelled) throw new Error("SIMULATION_CANCELLED");
      const time = Math.min(config.maxTime, (step + 1) * dt);
      const stepDuration = time - actualTime;
      actualTime = time;

      flows.forEach((flow) => {
        offered[flow.id] = flowSendBytes(flow, config, stepDuration);
        flow.offered += offered[flow.id];
        totalOffered += offered[flow.id];
      });

      const aResult = processResources(resourcesA, offered, stepDuration);
      const bResult = processResources(resourcesB, aResult.departed, stepDuration);
      const stepDropped = new Float64Array(config.streamCount);

      flows.forEach((flow) => {
        const delivered = bResult.departed[flow.id];
        const dropped = aResult.dropped[flow.id] + bResult.dropped[flow.id];
        const queueDelay = resourcesA[flow.a].totalQueued / resourcesA[flow.a].bytesPerSecond +
          resourcesB[flow.b].totalQueued / resourcesB[flow.b].bytesPerSecond;
        flow.rtt = baseRtt + queueDelay;
        flow.delivered += delivered;
        flow.dropped += dropped;
        flow.currentRate = delivered * 8 / Math.max(stepDuration, 1e-9) / 1e9;
        totalDelivered[flow.id] += delivered;
        stepDropped[flow.id] = dropped;
        totalDropped += dropped;
        updateController(flow, delivered, dropped, config, time, stepDuration, resourcesA, resourcesB);
      });

      const stepDelivered = bResult.departed.reduce((sum, bytes) => sum + bytes, 0);
      accumulator.duration += stepDuration;
      accumulator.delivered += stepDelivered;
      bResult.departed.forEach((bytes, index) => {
        accumulator.flowDelivered[index] += bytes;
      });
      aResult.utilization.forEach((value, index) => {
        accumulator.aUtilization[index] += value * stepDuration;
      });
      bResult.utilization.forEach((value, index) => {
        accumulator.bUtilization[index] += value * stepDuration;
      });
      const totalBuffer = resourcesA.reduce((sum, resource) => sum + resource.bufferBytes, 0) +
        resourcesB.reduce((sum, resource) => sum + resource.bufferBytes, 0);
      const totalQueue = resourcesA.reduce((sum, resource) => sum + resource.totalQueued, 0) +
        resourcesB.reduce((sum, resource) => sum + resource.totalQueued, 0);
      accumulator.queueNormalized += (totalQueue / Math.max(1, totalBuffer)) * stepDuration;

      lastStepData = { time, aResult, bResult, delivered: bResult.departed, dropped: stepDropped };
      if (step % recordEvery === 0 || step === maxSteps - 1) {
        const item = snapshot(time, flows, aResult, bResult, bResult.departed, stepDropped);
        item.aggregateRate /= Math.max(stepDuration, 1e-9) * 1e9;
        item.flowRates = item.flowRates.map((bits) => bits / Math.max(stepDuration, 1e-9) / 1e9);
        samples.push(item);
      }

      if (accumulator.duration + 1e-12 >= CONVERGENCE_WINDOW_SECONDS) {
        const currentWindow = windowMetrics(accumulator);
        if (hasConverged(previousWindow, currentWindow, hashCeiling, flows, config.cc)) {
          stableFor += accumulator.duration;
        } else {
          stableFor = 0;
        }
        previousWindow = currentWindow;
        accumulator = makeWindowAccumulator(config);
        if (config.stopOnConvergence && stableFor + 1e-9 >= CONVERGENCE_HOLD_SECONDS) {
          stopReason = `Converged for ${Math.round(CONVERGENCE_HOLD_SECONDS * 1000)} ms`;
          break;
        }
      }

      if (step % 10000 === 0) {
        if (onProgress) onProgress(time / config.maxTime);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }

    if (lastStepData && (samples.length === 0 || samples[samples.length - 1].time < actualTime)) {
      const item = snapshot(
        actualTime,
        flows,
        lastStepData.aResult,
        lastStepData.bResult,
        lastStepData.delivered,
        lastStepData.dropped
      );
      item.aggregateRate /= Math.max(dt, 1e-9) * 1e9;
      item.flowRates = item.flowRates.map((bits) => bits / Math.max(dt, 1e-9) / 1e9);
      samples.push(item);
    }
    if (onProgress) onProgress(1);

    const flowAverageRates = Array.from(totalDelivered, (bytes) => bytes * 8 / Math.max(actualTime, 1e-9) / 1e9);
    const averageGoodput = flowAverageRates.reduce((sum, rate) => sum + rate, 0);
    return {
      config,
      mappings,
      flows,
      samples,
      summary: {
        physicalCeiling,
        hashCeiling,
        averageGoodput,
        efficiencyPhysical: averageGoodput / Math.max(physicalCeiling, 1e-9),
        efficiencyHash: averageGoodput / Math.max(hashCeiling, 1e-9),
        lossFraction: totalDropped / Math.max(totalOffered, 1),
        fairness: jainFairness(flowAverageRates),
        actualTime,
        stopReason,
        dt,
        steps: Math.ceil(actualTime / dt),
        flowAverageRates
      }
    };
  }

  function speedOptions(value) {
    return SPEED_OPTIONS.map((speed) => `<option value="${speed}"${speed === value ? " selected" : ""}>${speed} Gbps</option>`).join("");
  }

  function renderShell(root, config, instanceId) {
    root.innerHTML = `
      <div class="lacp-sim__panel">
        <div class="lacp-sim__title">
          <div>
            <h4>LACP iperf speed simulator</h4>
            <span>Node A → switch → Node B · layer 3+4 per-stream hashing</span>
          </div>
          <span class="lacp-sim__status lacp-sim__sr-only" data-role="status" role="status" aria-live="polite">Ready</span>
        </div>
        <div class="lacp-sim__nodes-config">
          <section class="lacp-sim__node-config">
            <div class="lacp-sim__section-head">
              <strong>Node A · sender</strong>
              <label>Members
                <input type="number" min="1" max="4" value="${config.nodeACount}" data-field="nodeACount" aria-label="Node A member count">
              </label>
            </div>
            <div class="lacp-sim__member-controls" data-role="node-a-members"></div>
          </section>
          <section class="lacp-sim__node-config">
            <div class="lacp-sim__section-head">
              <strong>Node B · receiver</strong>
              <label>Members
                <input type="number" min="1" max="4" value="${config.nodeBCount}" data-field="nodeBCount" aria-label="Node B member count">
              </label>
            </div>
            <div class="lacp-sim__member-controls" data-role="node-b-members"></div>
          </section>
        </div>
        <div class="lacp-sim__controls">
          <label class="lacp-sim__field">Parallel streams
            <input type="number" min="1" max="32" value="${config.streamCount}" data-field="streamCount">
          </label>
          <label class="lacp-sim__field">Congestion control
            <select data-field="cc">
              <option value="newreno">NewReno</option>
              <option value="cubic">CUBIC</option>
              <option value="bbr">Linux BBRv1</option>
            </select>
          </label>
          <label class="lacp-sim__field">Maximum time
            <span class="lacp-sim__unit"><input type="number" min="0.25" max="30" step="0.25" value="${config.maxTime}" data-field="maxTime"><span>s</span></span>
          </label>
          <label class="lacp-sim__check">
            <span class="lacp-sim__check-spacer" aria-hidden="true">&nbsp;</span>
            <span class="lacp-sim__check-control">
              <input type="checkbox" data-field="stopOnConvergence"${config.stopOnConvergence ? " checked" : ""}>
              <span>Stop on convergence</span>
            </span>
          </label>
        </div>
        <details class="lacp-sim__advanced">
          <summary>Advanced datacenter assumptions</summary>
          <div class="lacp-sim__controls">
            <label class="lacp-sim__field">Base RTT
              <span class="lacp-sim__unit"><input type="number" min="0.01" max="2" step="0.01" value="${config.rttMs}" data-field="rttMs"><span>ms</span></span>
            </label>
            <label class="lacp-sim__field">Buffer / member
              <span class="lacp-sim__unit"><input type="number" min="0.25" max="8" step="0.25" value="${config.bufferBdp}" data-field="bufferBdp"><span>BDP</span></span>
            </label>
            <label class="lacp-sim__field">MTU
              <span class="lacp-sim__unit"><input type="number" min="576" max="16384" step="1" value="${config.mtu}" data-field="mtu"><span>B</span></span>
            </label>
            <label class="lacp-sim__field">Hash seed
              <input type="text" inputmode="numeric" value="${config.seedInput}" placeholder="blank = random" data-field="seed">
            </label>
          </div>
        </details>
        <div class="lacp-sim__actions">
          <button type="button" data-action="run">Run simulation</button>
          <button type="button" data-action="swap">Swap A / B</button>
          <span class="lacp-sim__warning" data-role="mixed-warning"></span>
        </div>
        <div class="lacp-sim__progress" data-role="progress" hidden><span></span></div>
        <div class="lacp-sim__metrics" data-role="metrics"></div>
        <div class="lacp-sim__topology" data-role="topology"></div>
          <div class="lacp-sim__chart-panel">
          <div class="lacp-sim__chart-head">
            <strong>Throughput and congestion window</strong>
            <select data-role="stream-select" aria-label="Selected stream"></select>
          </div>
          <div class="lacp-sim__charts-scroll">
            <div class="lacp-sim__charts">
              <div class="lacp-sim__chart-wrap">
                <canvas data-role="chart-total" role="img" aria-label="Total throughput timeline"></canvas>
                <canvas data-role="time-cursor-total" aria-hidden="true"></canvas>
              </div>
              <div class="lacp-sim__chart-wrap">
                <canvas data-role="chart-streams" role="img" aria-label="All TCP stream throughput timeline"></canvas>
                <canvas data-role="time-cursor-streams" aria-hidden="true"></canvas>
              </div>
              <div class="lacp-sim__chart-wrap">
                <canvas data-role="chart-cwnd" role="img" aria-label="Selected stream congestion window timeline"></canvas>
                <canvas data-role="time-cursor-cwnd" aria-hidden="true"></canvas>
              </div>
            </div>
          </div>
          <div class="lacp-sim__time-controls">
            <button type="button" data-action="play" aria-label="Play timeline"><span class="lacp-sim__play-icon" aria-hidden="true"></span></button>
            <input id="${instanceId}-time" type="range" min="0" max="0" value="0" data-role="time-slider" aria-label="Select simulation time">
            <output for="${instanceId}-time" data-role="time-label">0 s</output>
          </div>
        </div>
        <div class="lacp-sim__inspector" data-role="inspector"></div>
      </div>
    `;
    root.querySelector("[data-field='cc']").value = config.cc;
    renderMemberControls(root, "a", config.nodeASpeeds);
    renderMemberControls(root, "b", config.nodeBSpeeds);
  }

  function renderMemberControls(root, side, speeds, replace = false) {
    const box = root.querySelector(`[data-role='node-${side}-members']`);
    const count = clampInt(root.querySelector(`[data-field='node${side.toUpperCase()}Count']`).value, 1, 4, 2);
    box.dataset.count = String(count);
    box.style.setProperty("--lacp-member-count", String(count));
    const previous = Array.from(box.querySelectorAll("select")).map((select) => Number(select.value));
    const values = Array.from({ length: count }, (_, index) => {
      if (replace) return speeds[index] ?? speeds[speeds.length - 1] ?? 10;
      return previous[index] ?? speeds[index] ?? speeds[speeds.length - 1] ?? 10;
    });
    box.innerHTML = values.map((value, index) => `
      <label>Link ${index + 1}
        <select data-speed-side="${side}" data-speed-index="${index}">${speedOptions(value)}</select>
      </label>
    `).join("");
  }

  function readFormConfig(root) {
    const field = (name) => root.querySelector(`[data-field='${name}']`);
    return {
      nodeACount: field("nodeACount").value,
      nodeBCount: field("nodeBCount").value,
      nodeASpeeds: Array.from(root.querySelectorAll("[data-speed-side='a']")).map((select) => Number(select.value)),
      nodeBSpeeds: Array.from(root.querySelectorAll("[data-speed-side='b']")).map((select) => Number(select.value)),
      streamCount: field("streamCount").value,
      cc: field("cc").value,
      maxTime: field("maxTime").value,
      rttMs: field("rttMs").value,
      bufferBdp: field("bufferBdp").value,
      mtu: field("mtu").value,
      seed: field("seed").value,
      stopOnConvergence: field("stopOnConvergence").checked
    };
  }

  function readDatasetConfig(root) {
    const parseSpeeds = (value, fallback) => String(value || fallback).split(",").map(Number);
    const nodeASpeeds = parseSpeeds(root.dataset.nodeA, "10,10");
    const nodeBSpeeds = parseSpeeds(root.dataset.nodeB, "10,10");
    return normalizeConfig({
      nodeACount: nodeASpeeds.length,
      nodeBCount: nodeBSpeeds.length,
      nodeASpeeds,
      nodeBSpeeds,
      streamCount: root.dataset.streams || 4,
      cc: root.dataset.cc || "cubic",
      maxTime: root.dataset.duration || 10,
      rttMs: root.dataset.rttMs || 0.05,
      bufferBdp: root.dataset.bufferBdp || 1,
      mtu: root.dataset.mtu || 9216,
      seed: root.dataset.seed || "",
      stopOnConvergence: root.dataset.stopOnConvergence !== "false"
    });
  }

  function renderWarning(root, config) {
    const mixed = new Set(config.nodeASpeeds).size > 1 || new Set(config.nodeBSpeeds).size > 1;
    root.querySelector("[data-role='mixed-warning']").textContent = mixed
      ? "Mixed member speeds are a hypothetical model; real 802.3ad aggregators normally require equal speed and duplex."
      : "";
  }

  function metric(label, value, title = "") {
    return `<div class="lacp-sim__metric"${title ? ` title="${title}"` : ""}><span>${label}</span><strong>${value}</strong></div>`;
  }

  function renderMetrics(root, result) {
    const summary = result.summary;
    root.querySelector("[data-role='metrics']").innerHTML = [
      metric("Average goodput", formatRate(summary.averageGoodput)),
      metric("Physical / hash ceiling", `${formatRate(summary.physicalCeiling)} / ${formatRate(summary.hashCeiling)}`),
      metric("Efficiency", `${formatPct(summary.efficiencyPhysical)} physical · ${formatPct(summary.efficiencyHash)} hash`),
      metric("Loss estimate", formatPct(summary.lossFraction)),
      metric("Jain fairness", summary.fairness.toFixed(4)),
      metric("Simulated", `${formatTime(summary.actualTime)} · ${summary.stopReason}`),
      metric("Effective seed", String(result.config.seed), "Copy this into Hash seed to reproduce the mapping"),
      metric("Model resolution", `${formatTime(summary.dt)} · ${summary.steps.toLocaleString()} steps`)
    ].join("");
  }

  function renderTopology(root, result, sample, selectedStream) {
    const pathCells = Array.from({ length: result.config.nodeACount }, () =>
      Array.from({ length: result.config.nodeBCount }, () => ({ streams: [], rate: 0 }))
    );
    result.mappings.forEach((mapping) => {
      const cell = pathCells[mapping.a][mapping.b];
      cell.streams.push(mapping.streamId);
      cell.rate += sample.flowRates[mapping.streamId] || 0;
    });

    const renderLinks = (side, speeds, utilization, queues) => `
      <div class="lacp-sim__node-card">
        <strong>Node ${side}</strong>
        ${speeds.map((speed, index) => `
          <div class="lacp-sim__link">
            <div><b>${side}${index + 1}</b><span>${speed} Gbps</span></div>
            <div class="lacp-sim__bar" title="${formatPct(utilization[index] || 0)} utilized; ${formatPct(queues[index] || 0)} queued">
              <span style="width:${Math.min(100, (utilization[index] || 0) * 100).toFixed(2)}%"></span>
              <i style="width:${Math.min(100, (queues[index] || 0) * 100).toFixed(2)}%"></i>
            </div>
          </div>
        `).join("")}
      </div>
    `;

    const matrix = `
      <div class="lacp-sim__switch-card">
        <strong>Switch hash paths</strong>
        <span>rows: Node A · columns: Node B</span>
        <div class="lacp-sim__path-grid" style="--lacp-cols:${result.config.nodeBCount}">
          ${pathCells.flatMap((row, a) => row.map((cell, b) => {
            const selected = cell.streams.includes(selectedStream);
            const first = cell.streams[0];
            return `<button type="button" class="${selected ? "is-selected" : ""}" ${first === undefined ? "disabled" : `data-select-stream="${first}"`} title="${cell.streams.length ? `Streams ${cell.streams.map((id) => id + 1).join(", ")}` : "No streams"}">
              <b>A${a + 1}→B${b + 1}</b>
              <span>${cell.streams.length} stream${cell.streams.length === 1 ? "" : "s"}</span>
              <em>${formatRate(cell.rate)}</em>
            </button>`;
          })).join("")}
        </div>
      </div>
    `;

    root.querySelector("[data-role='topology']").innerHTML =
      renderLinks("A", result.config.nodeASpeeds, sample.aUtilization, sample.aQueues) +
      matrix +
      renderLinks("B", result.config.nodeBSpeeds, sample.bUtilization, sample.bQueues);
  }

  function clearTooltip(root) {
    if (root.__lacpTooltip) root.__lacpTooltip.remove();
    root.__lacpTooltip = null;
  }

  function nearestSample(result, geometry, canvas, event) {
    const bounds = canvas.getBoundingClientRect();
    const localX = (event.clientX - bounds.left) * geometry.width / Math.max(1, bounds.width);
    const ratio = Math.max(0, Math.min(1, (localX - geometry.left) / geometry.plotWidth));
    const targetTime = ratio * result.summary.actualTime;
    let best = 0;
    let distance = Infinity;
    result.samples.forEach((sample, index) => {
      const next = Math.abs(sample.time - targetTime);
      if (next < distance) {
        distance = next;
        best = index;
      }
    });
    return best;
  }

  function renderChart(root, result, selectedStream, onSelectTime) {
    const width = 780;
    const left = 62;
    const right = 18;
    const plotWidth = width - left - right;
    const plotY = 30;
    const totalHeight = 74;
    const streamsHeight = 95;
    const cwndHeight = 58;
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    const setupCanvas = (role, height) => {
      const canvas = root.querySelector(`[data-role='${role}']`);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const context = canvas.getContext("2d");
      context.scale(ratio, ratio);
      return { canvas, context, height };
    };
    const totalChart = setupCanvas("chart-total", 116);
    const streamsChart = setupCanvas("chart-streams", 137);
    const cwndChart = setupCanvas("chart-cwnd", 112);
    const styles = getComputedStyle(root);
    const color = styles.color;
    const resolveCanvasColor = (value) => {
      const probe = document.createElement("span");
      probe.style.display = "none";
      probe.style.color = value.replaceAll("currentColor", color);
      root.appendChild(probe);
      const resolved = getComputedStyle(probe).color;
      probe.remove();
      return resolved;
    };
    const muted = resolveCanvasColor(styles.getPropertyValue("--lacp-muted").trim());
    const aggregateColor = styles.getPropertyValue("--lacp-aggregate").trim();
    const streamColor = styles.getPropertyValue("--lacp-stream").trim();
    const cwndColor = styles.getPropertyValue("--lacp-cwnd").trim();
    const lossColor = styles.getPropertyValue("--lacp-loss").trim();
    const lineColor = resolveCanvasColor(styles.getPropertyValue("--lacp-line").trim());
    const paddedRange = (values, fallbackSpan) => {
      const finite = values.filter(Number.isFinite);
      const minimum = Math.min(...finite);
      const maximum = Math.max(...finite);
      const span = maximum - minimum;
      const padding = span > 1e-9
        ? span * 0.1
        : Math.max(Math.abs(maximum) * 0.08, fallbackSpan);
      return {
        minimum: Math.max(0, minimum - padding),
        maximum: maximum + padding
      };
    };
    const aggregateRates = result.samples.map((sample) => sample.aggregateRate);
    const allStreamRates = result.samples.flatMap((sample) => sample.flowRates);
    const selectedCwnds = result.samples.map((sample) => sample.cwnds[selectedStream]);
    const totalRange = paddedRange([...aggregateRates, result.summary.hashCeiling], 0.001);
    const streamRange = paddedRange(allStreamRates, 0.001);
    const cwndRange = paddedRange(selectedCwnds, result.config.mss);
    const x = (time) => left + time / Math.max(result.summary.actualTime, 1e-9) * plotWidth;
    const scaledY = (value, range, y, height) =>
      y + height - (value - range.minimum) / Math.max(range.maximum - range.minimum, 1e-9) * height;
    const yTotal = (value) => scaledY(value, totalRange, plotY, totalHeight);
    const yStream = (value) => scaledY(value, streamRange, plotY, streamsHeight);
    const yCwnd = (value) => scaledY(value, cwndRange, plotY, cwndHeight);
    const drawFrame = (chart, range, plotHeight, formatter, title) => {
      const { context, height } = chart;
      context.clearRect(0, 0, width, height);
      context.font = `11px ${styles.fontFamily || "sans-serif"}`;
      context.fillStyle = muted || color;
      context.strokeStyle = lineColor;
      context.lineWidth = 1;
      [plotY, plotY + plotHeight].forEach((y) => {
        context.beginPath();
        context.moveTo(left, y);
        context.lineTo(width - right, y);
        context.stroke();
      });
      context.fillText(formatter(range.maximum), 8, plotY + 4);
      context.fillText(formatter(range.minimum), 8, plotY + plotHeight + 4);
      context.fillText(title, left, 16);
    };
    drawFrame(totalChart, totalRange, totalHeight, formatAxisRate, "Total throughput");
    drawFrame(streamsChart, streamRange, streamsHeight, formatAxisRate, "All stream throughput");
    drawFrame(cwndChart, cwndRange, cwndHeight, formatBytes, `Selected stream ${selectedStream + 1} cwnd`);
    cwndChart.context.fillStyle = muted || color;
    cwndChart.context.fillText("0 s", left, cwndChart.height - 8);
    cwndChart.context.fillText(formatTime(result.summary.actualTime), width - 74, cwndChart.height - 8);

    totalChart.context.save();
    totalChart.context.setLineDash([5, 4]);
    totalChart.context.strokeStyle = muted;
    totalChart.context.beginPath();
    totalChart.context.moveTo(left, yTotal(result.summary.hashCeiling));
    totalChart.context.lineTo(width - right, yTotal(result.summary.hashCeiling));
    totalChart.context.stroke();
    totalChart.context.restore();

    const draw = (context, values, y, stroke, lineWidth = 1.5) => {
      context.strokeStyle = stroke;
      context.lineWidth = lineWidth;
      context.beginPath();
      values.forEach((value, index) => {
        const px = x(result.samples[index].time);
        const py = y(value);
        if (index === 0) context.moveTo(px, py);
        else context.lineTo(px, py);
      });
      context.stroke();
    };
    draw(totalChart.context, aggregateRates, yTotal, aggregateColor, 2);

    streamsChart.context.save();
    streamsChart.context.globalAlpha = 0.42;
    result.flows.forEach((flow) => {
      if (flow.id === selectedStream) return;
      draw(
        streamsChart.context,
        result.samples.map((sample) => sample.flowRates[flow.id]),
        yStream,
        muted || color,
        1
      );
    });
    streamsChart.context.restore();
    draw(
      streamsChart.context,
      result.samples.map((sample) => sample.flowRates[selectedStream]),
      yStream,
      streamColor,
      2.5
    );
    draw(cwndChart.context, selectedCwnds, yCwnd, cwndColor, 1.5);

    streamsChart.context.strokeStyle = lossColor;
    streamsChart.context.globalAlpha = 0.65;
    result.samples.forEach((sample) => {
      if (sample.flowDropped[selectedStream] <= 0) return;
      const px = x(sample.time);
      streamsChart.context.beginPath();
      streamsChart.context.moveTo(px, plotY);
      streamsChart.context.lineTo(px, plotY + 6);
      streamsChart.context.stroke();
    });
    streamsChart.context.globalAlpha = 1;

    totalChart.context.fillStyle = aggregateColor;
    totalChart.context.fillRect(left + 94, 11, 10, 3);
    totalChart.context.fillStyle = muted || color;
    totalChart.context.fillText("aggregate", left + 108, 16);

    streamsChart.context.fillStyle = streamColor;
    streamsChart.context.fillRect(left + 124, 11, 12, 3);
    streamsChart.context.fillStyle = muted || color;
    streamsChart.context.fillText(`selected stream ${selectedStream + 1}`, left + 140, 16);
    streamsChart.context.fillStyle = lossColor;
    streamsChart.context.fillRect(left + 250, 11, 10, 3);
    streamsChart.context.fillStyle = muted || color;
    streamsChart.context.fillText("loss", left + 264, 16);

    cwndChart.context.fillStyle = cwndColor;
    cwndChart.context.fillRect(left + 142, 11, 12, 3);
    cwndChart.context.fillStyle = muted || color;
    cwndChart.context.fillText("cwnd", left + 158, 16);

    [totalChart, streamsChart, cwndChart].forEach(({ canvas }) => {
      canvas.__lacpGeometry = { width, left, plotWidth };
      canvas.onclick = (event) => onSelectTime(nearestSample(result, canvas.__lacpGeometry, canvas, event));
      canvas.onpointermove = (event) => {
        const index = nearestSample(result, canvas.__lacpGeometry, canvas, event);
        const sample = result.samples[index];
        if (!root.__lacpTooltip) {
          root.__lacpTooltip = document.createElement("div");
          root.__lacpTooltip.className = "lacp-sim__tooltip";
          document.body.appendChild(root.__lacpTooltip);
        }
        root.__lacpTooltip.innerHTML = `
          <strong>${formatTime(sample.time)}</strong><br>
          aggregate ${formatRate(sample.aggregateRate)}<br>
          stream ${selectedStream + 1}: ${formatRate(sample.flowRates[selectedStream])}<br>
          cwnd ${formatBytes(sample.cwnds[selectedStream])}<br>
          RTT ${formatTime(sample.rtts[selectedStream])}<br>
          state ${sample.states[selectedStream]}
        `;
        root.__lacpTooltip.style.left = `${event.clientX + 12}px`;
        root.__lacpTooltip.style.top = `${event.clientY + 12}px`;
      };
      canvas.onpointerleave = () => clearTooltip(root);
    });
  }

  function renderTimeCursor(root, result, sampleIndex) {
    const width = 780;
    const left = 62;
    const right = 18;
    const top = 30;
    const ratio = Math.max(1, globalThis.devicePixelRatio || 1);
    const sample = result.samples[sampleIndex];
    const x = left + sample.time / Math.max(result.summary.actualTime, 1e-9) * (width - left - right);
    const themeColor = getComputedStyle(root).getPropertyValue("--lacp-stream").trim();
    [
      ["time-cursor-total", 116, 104],
      ["time-cursor-streams", 137, 125],
      ["time-cursor-cwnd", 112, 88]
    ].forEach(([role, height, bottom]) => {
      const canvas = root.querySelector(`[data-role='${role}']`);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      const context = canvas.getContext("2d");
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      context.strokeStyle = themeColor;
      context.fillStyle = themeColor;
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x, top);
      context.lineTo(x, bottom);
      context.stroke();
      context.beginPath();
      context.moveTo(x - 4, top);
      context.lineTo(x + 4, top);
      context.lineTo(x, top + 6);
      context.closePath();
      context.fill();
    });
  }

  function renderInspector(root, result, sample, selectedStream) {
    const selected = result.flows[selectedStream];
    const mapping = result.mappings[selectedStream];
    root.querySelector("[data-role='inspector']").innerHTML = `
      <div class="lacp-sim__selected">
        <strong>Stream ${selectedStream + 1}</strong>
        <span>A${mapping.a + 1} → B${mapping.b + 1}</span>
        <span>${formatRate(sample.flowRates[selectedStream])}</span>
        <span>cwnd ${formatBytes(sample.cwnds[selectedStream])}</span>
        <span>RTT ${formatTime(sample.rtts[selectedStream])}</span>
        <span>${sample.states[selectedStream]}</span>
      </div>
      <div class="lacp-sim__table-wrap">
        <table>
          <thead><tr><th>Stream</th><th>Hash path</th><th>Average</th><th>At cursor</th><th>cwnd</th><th>RTT</th><th>Controller state</th><th>Dropped</th></tr></thead>
          <tbody>
            ${result.flows.map((flow) => `
              <tr class="${flow.id === selectedStream ? "is-selected" : ""}" data-select-stream="${flow.id}">
                <th>${flow.id + 1}</th>
                <td>A${flow.a + 1} → B${flow.b + 1}</td>
                <td>${formatRate(result.summary.flowAverageRates[flow.id])}</td>
                <td>${formatRate(sample.flowRates[flow.id])}</td>
                <td>${formatBytes(sample.cwnds[flow.id])}</td>
                <td>${formatTime(sample.rtts[flow.id])}</td>
                <td>${sample.states[flow.id]}</td>
                <td>${formatBytes(flow.dropped)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function init(root, index) {
    if (root.dataset.lacpInitialized === "true") return;
    root.dataset.lacpInitialized = "true";
    let config = readDatasetConfig(root);
    let result = null;
    let selectedStream = 0;
    let selectedSample = 0;
    let runToken = null;
    let playback = null;
    renderShell(root, config, `lacp-sim-${index + 1}`);
    const colorScheme = globalThis.matchMedia("(prefers-color-scheme: dark)");

    const stopPlayback = () => {
      if (playback) clearInterval(playback);
      playback = null;
      const button = root.querySelector("[data-action='play']");
      if (button) {
        button.classList.remove("is-playing");
        button.setAttribute("aria-label", "Play timeline");
      }
    };

    const renderSelection = () => {
      if (!result) return;
      selectedStream = Math.max(0, Math.min(selectedStream, result.config.streamCount - 1));
      selectedSample = Math.max(0, Math.min(selectedSample, result.samples.length - 1));
      const sample = result.samples[selectedSample];
      const slider = root.querySelector("[data-role='time-slider']");
      slider.max = String(Math.max(0, result.samples.length - 1));
      slider.value = String(selectedSample);
      root.querySelector("[data-role='time-label']").textContent = formatTime(sample.time);
      root.querySelector("[data-role='stream-select']").value = String(selectedStream);
      renderTimeCursor(root, result, selectedSample);
      renderTopology(root, result, sample, selectedStream);
      renderInspector(root, result, sample, selectedStream);
    };

    const renderResult = () => {
      const select = root.querySelector("[data-role='stream-select']");
      select.innerHTML = result.flows.map((flow) => `<option value="${flow.id}">Stream ${flow.id + 1} · A${flow.a + 1}→B${flow.b + 1}</option>`).join("");
      renderMetrics(root, result);
      renderWarning(root, result.config);
      renderChart(root, result, selectedStream, (sampleIndex) => {
        selectedSample = sampleIndex;
        renderSelection();
      });
      selectedSample = result.samples.length - 1;
      renderSelection();
    };

    colorScheme.addEventListener("change", () => {
      if (!result) return;
      globalThis.requestAnimationFrame(() => {
        renderChart(root, result, selectedStream, (sampleIndex) => {
          selectedSample = sampleIndex;
          renderSelection();
        });
        renderTimeCursor(root, result, selectedSample);
      });
    });

    const run = async () => {
      stopPlayback();
      clearTooltip(root);
      if (runToken) runToken.cancelled = true;
      runToken = { cancelled: false };
      const token = runToken;
      config = normalizeConfig(readFormConfig(root));
      renderWarning(root, config);
      const status = root.querySelector("[data-role='status']");
      const progress = root.querySelector("[data-role='progress']");
      progress.hidden = false;
      progress.querySelector("span").style.width = "0%";
      status.textContent = "Simulating…";
      root.querySelector("[data-action='run']").disabled = true;
      try {
        result = await simulate(config, token, (value) => {
          progress.querySelector("span").style.width = `${Math.min(100, value * 100).toFixed(1)}%`;
        });
        if (token.cancelled) return;
        status.textContent = result.summary.stopReason;
        renderResult();
      } catch (error) {
        if (error.message !== "SIMULATION_CANCELLED") {
          status.textContent = `Simulation failed: ${error.message}`;
          throw error;
        }
      } finally {
        if (runToken === token) {
          progress.hidden = true;
          root.querySelector("[data-action='run']").disabled = false;
        }
      }
    };

    root.addEventListener("input", (event) => {
      if (event.target.matches("[data-field='nodeACount']")) {
        renderMemberControls(root, "a", config.nodeASpeeds);
      }
      if (event.target.matches("[data-field='nodeBCount']")) {
        renderMemberControls(root, "b", config.nodeBSpeeds);
      }
      if (event.target.matches("[data-role='time-slider']") && result) {
        stopPlayback();
        selectedSample = Number(event.target.value);
        renderSelection();
      }
      if (event.target.matches("[data-role='stream-select']") && result) {
        selectedStream = Number(event.target.value);
        renderChart(root, result, selectedStream, (sampleIndex) => {
          selectedSample = sampleIndex;
          renderSelection();
        });
        renderSelection();
      }
    });

    root.addEventListener("click", (event) => {
      const actionButton = event.target.closest("[data-action]");
      const action = actionButton?.dataset.action;
      const streamTarget = event.target.closest("[data-select-stream]");
      if (streamTarget && result) {
        selectedStream = Number(streamTarget.dataset.selectStream);
        renderChart(root, result, selectedStream, (sampleIndex) => {
          selectedSample = sampleIndex;
          renderSelection();
        });
        renderSelection();
        return;
      }
      if (action === "run") run();
      if (action === "swap") {
        const aCount = root.querySelector("[data-field='nodeACount']");
        const bCount = root.querySelector("[data-field='nodeBCount']");
        const aSpeeds = Array.from(root.querySelectorAll("[data-speed-side='a']")).map((select) => Number(select.value));
        const bSpeeds = Array.from(root.querySelectorAll("[data-speed-side='b']")).map((select) => Number(select.value));
        [aCount.value, bCount.value] = [bCount.value, aCount.value];
        renderMemberControls(root, "a", bSpeeds, true);
        renderMemberControls(root, "b", aSpeeds, true);
      }
      if (action === "play" && result) {
        if (playback) {
          stopPlayback();
          return;
        }
        actionButton.classList.add("is-playing");
        actionButton.setAttribute("aria-label", "Pause timeline");
        playback = setInterval(() => {
          if (selectedSample >= result.samples.length - 1) selectedSample = 0;
          else selectedSample += 1;
          renderSelection();
        }, 80);
      }
    });

    globalThis.addEventListener("scroll", () => clearTooltip(root), { passive: true, capture: true });
    globalThis.addEventListener("resize", () => clearTooltip(root), { passive: true });
    globalThis.addEventListener("blur", () => clearTooltip(root), { passive: true });
    run();
  }

  function initAll() {
    document.querySelectorAll(".lacp-speed-sim").forEach(init);
  }

  globalThis.LacpSpeedSimulation = {
    normalizeConfig,
    makeMappings,
    hashLimitedCeiling,
    simulate
  };

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAll, { once: true });
    else initAll();
  }
})();
