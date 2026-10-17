import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { randomUUID } from 'node:crypto';
import { exportTokenData } from '../../adapters/local/imports/exporter';
import { ImportStore, readActiveBatches } from '../../adapters/local/imports/store';
import { loadImportedEvents } from '../../adapters/local/imports/layer';
import { hash } from '../../adapters/local/imports/identity';
import type { ImportReceipt } from '../../domain';
import { PHASE0_DEVICE, phase0Export, writePhase0Home } from './sync-agent-phase0';

const [mode, directory, sizeText] = process.argv.slice(2);
const size = Number(sizeText);
if (!directory || !Number.isSafeInteger(size) || size < 1 || size > 100_000) throw new Error('Invalid isolated benchmark arguments');
const storePath = join(directory, 'receiver.db');
if (mode === 'prepare-scan') {
  mkdirSync(directory, { recursive: true }); writePhase0Home(directory, size);
} else if (mode === 'prepare-store') {
  mkdirSync(directory, { recursive: true }); writePhase0Home(directory, 100);
  const bundle = phase0Export(directory), store = new ImportStore(storePath);
  try {
    store.transaction(() => {
      for (let i = 0; i < size; i++) {
        const receipt: ImportReceipt = { id: randomUUID(), deviceId: bundle.device.id, deviceLabel: bundle.device.label,
          exportId: bundle.exportId, checksum: bundle.checksum, importedAt: new Date().toISOString(), status: 'active',
          received: bundle.events.length, added: i === 0 ? bundle.events.length : 0, duplicateLocal: 0,
          duplicateImported: i === 0 ? 0 : bundle.events.length, addedTokens: i === 0 ? bundle.events.length * 130 : 0 };
        store.saveBatch({ receipt, bundle, mappings: {} }, hash({}));
      }
    });
  } finally { store.close(); }
} else {
  // A separate worker samples process-wide CPU while synchronous collectors block this thread.
  // Its overhead is included and explicitly reported; resourceUsage supplies kernel peak RSS.
  const sampler = new Worker(`
    const { parentPort } = require('node:worker_threads');
    let previous = process.cpuUsage(), time = performance.now(), peak = 0, samples = 0;
    function sample() {
      const now = performance.now(), cpu = process.cpuUsage();
      peak = Math.max(peak, (cpu.user - previous.user + cpu.system - previous.system) / ((now - time) * 10));
      previous = cpu; time = now; samples++;
    }
    const timer = setInterval(sample, 20);
    parentPort.on('message', () => { clearInterval(timer); if (performance.now() - time >= 10) sample(); parentPort.postMessage({ peak, samples }); });
    parentPort.postMessage('ready');
  `, { eval: true });
  await new Promise<void>(resolve => sampler.once('message', () => resolve()));
  const cpuStart = process.cpuUsage(), started = performance.now();
  let records = 0, bytes = 0, warnings = 0, activeBatches = 0;
  try {
    if (mode === 'scan' || mode === 'local-scan') {
      // Explicit device ID prevents exportTokenData from creating token-device.json.
      const bundle = exportTokenData({ home: mode === 'local-scan' ? homedir() : directory,
        deviceId: PHASE0_DEVICE, label: 'Benchmark only' });
      records = bundle.events.length; bytes = Buffer.byteLength(JSON.stringify(bundle)); warnings = bundle.warnings.length;
    } else if (mode === 'read-batches') {
      const batches = readActiveBatches(storePath); activeBatches = batches.length;
      records = batches.reduce((sum, batch) => sum + batch.bundle.events.length, 0);
    } else if (mode === 'load-imports') {
      const loaded = loadImportedEvents([], new Map(), {}, storePath); records = loaded.events.length; warnings = loaded.issues.length;
    } else throw new Error('Unknown benchmark mode');
    const wallMs = performance.now() - started, cpu = process.cpuUsage(cpuStart);
    const sampled = await new Promise<{ peak: number; samples: number }>(resolve => { sampler.once('message', resolve); sampler.postMessage('stop'); });
    const cpuMs = (cpu.user + cpu.system) / 1000;
    console.log(JSON.stringify({ mode, size, records, bytes, warnings, activeBatches, wallMs: +wallMs.toFixed(2),
      cpuMs: +cpuMs.toFixed(2), cpuAveragePercent: +(cpuMs / wallMs * 100).toFixed(2),
      cpuPeak20msPercent: sampled.samples ? +sampled.peak.toFixed(2) : null, samples: sampled.samples,
      peakRssMiB: +(process.resourceUsage().maxRSS / 1024).toFixed(2),
      fiveMinuteWallPercent: +(wallMs / 3000).toFixed(4), fiveMinuteCorePercent: +(cpuMs / 3000).toFixed(4) }));
  } catch {
    // Source exceptions can contain private filenames. Report only a fixed error code.
    console.log(JSON.stringify({ mode, size, error: 'BENCHMARK_COLLECTION_FAILED' })); process.exitCode = 1;
  } finally { await sampler.terminate(); }
}
