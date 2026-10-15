import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const home = os.homedir();
const projectsRoot = path.join(home, '.commandcode', 'projects');

// Model base rates (Off-peak / standard catalog rates in USD per million tokens)
const MODEL_PRICES = {
  'deepseek/deepseek-v4.1-flash': {
    input: 0.15,
    output: 0.60,
    cacheRead: 0.003,
    cacheWrite: 0.0,
    peakMultiplier: 2.0, // Peak hours 2x
  },
  'xiaomi/mimo-v2.6-pro': {
    input: 0.435,
    output: 0.87,
    cacheRead: 0.0036,
    cacheWrite: 0.0,
    peakMultiplier: 2.0,
  },
};

/**
 * Check if a UTC date falls into Peak Hours:
 * - Only Monday to Friday (UTC day 1 to 5)
 * - Window 1: 01:00 - 04:00 UTC (09:00 - 12:00 UTC+8)
 * - Window 2: 06:00 - 10:00 UTC (14:00 - 18:00 UTC+8)
 */
function isPeakHour(date) {
  const utcDay = date.getUTCDay(); // 0 is Sunday, 6 is Saturday
  if (utcDay === 0 || utcDay === 6) return false;

  const utcHour = date.getUTCHours();
  const utcMin = date.getUTCMinutes();
  const utcTimeVal = utcHour + utcMin / 60;

  const inWindow1 = utcTimeVal >= 1.0 && utcTimeVal < 4.0;
  const inWindow2 = utcTimeVal >= 6.0 && utcTimeVal < 10.0;

  return inWindow1 || inWindow2;
}

// Collect all requests
const recentEvents = [];
const allHistoricalModels = {};

for (const p of fs.readdirSync(projectsRoot)) {
  const pPath = path.join(projectsRoot, p);
  if (!fs.statSync(pPath).isDirectory()) continue;

  for (const f of fs.readdirSync(pPath)) {
    if (!f.endsWith('.jsonl') || f.endsWith('.checkpoints.jsonl')) continue;
    const filePath = path.join(pPath, f);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (const [lineIdx, line] of lines.entries()) {
      if (!line.includes('"usage"')) continue;
      try {
        const obj = JSON.parse(line);
        if (!obj.usage || !obj.model) continue;

        const rawTs = obj.timestamp ?? obj.message?.meta?.createdAt;
        if (!rawTs) continue;
        const ts = typeof rawTs === 'number' ? rawTs : Date.parse(rawTs);
        const date = new Date(ts);

        const model = obj.model.trim();
        const rawInput = Number(obj.usage.inputTokens || 0);
        const cacheRead = Number(obj.usage.cacheReadTokens || 0);
        const cacheWrite = Number(obj.usage.cacheWriteTokens || 0);
        const output = Number(obj.usage.outputTokens || 0);
        const uncachedInput = Math.max(0, rawInput - cacheRead);
        const recordedCost = obj.usage.costUsd !== undefined ? Number(obj.usage.costUsd) : undefined;
        const peak = isPeakHour(date);

        // Historical aggregator
        if (!allHistoricalModels[model]) {
          allHistoricalModels[model] = {
            count: 0,
            peakCount: 0,
            offPeakCount: 0,
            rawInput: 0,
            cacheRead: 0,
            output: 0,
            recordedCost: 0,
            peakWeightedCost: 0,
          };
        }
        allHistoricalModels[model].count++;
        if (peak) allHistoricalModels[model].peakCount++;
        else allHistoricalModels[model].offPeakCount++;

        allHistoricalModels[model].rawInput += rawInput;
        allHistoricalModels[model].cacheRead += cacheRead;
        allHistoricalModels[model].output += output;
        if (recordedCost !== undefined) {
          allHistoricalModels[model].recordedCost += recordedCost;
          allHistoricalModels[model].peakWeightedCost += peak ? recordedCost * 2.0 : recordedCost;
        }

        // Check date in local time YYYY-MM-DD
        const localDateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

        if (['2026-10-13', '2026-10-14', '2026-10-15'].includes(localDateKey)) {
          const pricing = MODEL_PRICES[model] || { input: 0.15, output: 0.60, cacheRead: 0.003, cacheWrite: 0, peakMultiplier: 2.0 };

          // 1. 前端计费 (Recorded or formula with cache)
          const frontendCost = recordedCost !== undefined ? recordedCost : (
            (uncachedInput * pricing.input + output * pricing.output + cacheRead * pricing.cacheRead + cacheWrite * pricing.cacheWrite) / 1e6
          );

          // 2. 无缓存官方原价 (Full un-cached input + output)
          const noCacheOfficialCost = (rawInput * pricing.input + output * pricing.output) / 1e6;

          // 3. 云端实际配额扣除 (考虑 Peak 2x 加权)
          const peakMultiplier = peak ? pricing.peakMultiplier : 1.0;
          const cloudQuotaDeduction = frontendCost * peakMultiplier;

          // 4. 无缓存场景下的云端配额扣除
          const cloudQuotaNoCacheDeduction = noCacheOfficialCost * peakMultiplier;

          recentEvents.push({
            id: obj.id || `${f}:${lineIdx}`,
            timestampMs: ts,
            localTime: date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
            utcTime: date.toISOString(),
            localDateKey,
            model,
            rawInput,
            cacheRead,
            uncachedInput,
            output,
            isPeak: peak,
            peakMultiplier,
            frontendCost,
            noCacheOfficialCost,
            cloudQuotaDeduction,
            cloudQuotaNoCacheDeduction,
          });
        }
      } catch (err) {}
    }
  }
}

// Sort by timestamp
recentEvents.sort((a, b) => a.timestampMs - b.timestampMs);

console.log('=== HISTORICAL MODEL TOTALS (All Time) ===');
for (const [m, data] of Object.entries(allHistoricalModels)) {
  const totalTokens = data.rawInput + data.output;
  console.log(`\nModel: ${m}`);
  console.log(`  Requests: ${data.count} (Peak: ${data.peakCount}, Off-Peak: ${data.offPeakCount}, Peak Ratio: ${((data.peakCount / data.count) * 100).toFixed(1)}%)`);
  console.log(`  Total Tokens: ${(totalTokens / 1e6).toFixed(2)}M (${(totalTokens / 1e9).toFixed(3)}B)`);
  console.log(`  Cache Read Tokens: ${(data.cacheRead / 1e6).toFixed(2)}M (${((data.cacheRead / (data.rawInput || 1)) * 100).toFixed(1)}% cache hit)`);
  console.log(`  Recorded Cost: $${data.recordedCost.toFixed(2)}`);
  console.log(`  Peak-Weighted Quota Estimate: $${data.peakWeightedCost.toFixed(2)} (Effective Multiplier: ${(data.peakWeightedCost / (data.recordedCost || 1)).toFixed(3)}x)`);
}

console.log('\n======================================================');
console.log('=== RECENT 3 DAYS SUMMARY (2026-10-13 to 2026-10-15) ===');
const dailyStats = {};

for (const ev of recentEvents) {
  const d = ev.localDateKey;
  if (!dailyStats[d]) {
    dailyStats[d] = {
      count: 0,
      peakCount: 0,
      offPeakCount: 0,
      totalTokens: 0,
      rawInput: 0,
      cacheRead: 0,
      uncachedInput: 0,
      output: 0,
      frontendCost: 0,
      noCacheOfficialCost: 0,
      cloudQuotaDeduction: 0,
    };
  }
  const s = dailyStats[d];
  s.count++;
  if (ev.isPeak) s.peakCount++;
  else s.offPeakCount++;

  s.totalTokens += ev.rawInput + ev.output;
  s.rawInput += ev.rawInput;
  s.cacheRead += ev.cacheRead;
  s.uncachedInput += ev.uncachedInput;
  s.output += ev.output;
  s.frontendCost += ev.frontendCost;
  s.noCacheOfficialCost += ev.noCacheOfficialCost;
  s.cloudQuotaDeduction += ev.cloudQuotaDeduction;
}

let total3Days = {
  count: 0,
  peakCount: 0,
  offPeakCount: 0,
  totalTokens: 0,
  frontendCost: 0,
  noCacheOfficialCost: 0,
  cloudQuotaDeduction: 0,
};

for (const [d, s] of Object.entries(dailyStats)) {
  console.log(`\n--- Date: ${d} ---`);
  console.log(`  Requests: ${s.count} (Peak: ${s.peakCount}, Off-Peak: ${s.offPeakCount}, Peak Ratio: ${((s.peakCount / s.count) * 100).toFixed(1)}%)`);
  console.log(`  Tokens: ${(s.totalTokens / 1e6).toFixed(2)}M (Raw Input: ${(s.rawInput / 1e6).toFixed(2)}M, Cache Read: ${(s.cacheRead / 1e6).toFixed(2)}M, Output: ${(s.output / 1e3).toFixed(1)}k)`);
  console.log(`  Cache Hit Rate: ${((s.cacheRead / (s.rawInput || 1)) * 100).toFixed(2)}%`);
  console.log(`  [1] 前端计费 (Dashboard Actual): $${s.frontendCost.toFixed(4)}`);
  console.log(`  [2] 无缓存官方原价 (No Cache List Price): $${s.noCacheOfficialCost.toFixed(4)} (放大 ${(s.noCacheOfficialCost / s.frontendCost).toFixed(1)} 倍)`);
  console.log(`  [3] 云端实际配额扣除 (Cloud Quota with Peak 2x): $${s.cloudQuotaDeduction.toFixed(4)} (加权倍数: ${(s.cloudQuotaDeduction / s.frontendCost).toFixed(3)}x)`);

  total3Days.count += s.count;
  total3Days.peakCount += s.peakCount;
  total3Days.offPeakCount += s.offPeakCount;
  total3Days.totalTokens += s.totalTokens;
  total3Days.frontendCost += s.frontendCost;
  total3Days.noCacheOfficialCost += s.noCacheOfficialCost;
  total3Days.cloudQuotaDeduction += s.cloudQuotaDeduction;
}

console.log('\n======================================================');
console.log('=== 3-DAY AGGREGATE RECONCILIATION RESULT ===');
console.log(`Total Requests: ${total3Days.count} (Peak: ${total3Days.peakCount}, Off-Peak: ${total3Days.offPeakCount})`);
console.log(`Total Tokens: ${(total3Days.totalTokens / 1e6).toFixed(2)}M`);
console.log(`[1] 前端计费总计 (Frontend Recorded): $${total3Days.frontendCost.toFixed(4)} (约 $${total3Days.frontendCost.toFixed(2)})`);
console.log(`[2] 无缓存官方原价总计 (No Cache Cost): $${total3Days.noCacheOfficialCost.toFixed(4)}`);
console.log(`[3] 云端配额扣除预估 (Cloud Quota Deducted): $${total3Days.cloudQuotaDeduction.toFixed(4)}`);
console.log(`Cloud vs Frontend Ratio: ${(total3Days.cloudQuotaDeduction / total3Days.frontendCost).toFixed(4)}x`);
console.log(`Go Plan $10 Monthly Limit Used: ${(total3Days.cloudQuotaDeduction / 10 * 100).toFixed(2)}% (vs Cloud UI displayed 22%)`);
console.log('======================================================');

// Print detailed sample of requests around transition times
console.log('\n=== SAMPLE HOURLY DISTRIBUTION (UTC & Local) ===');
const hourly = {};
for (const ev of recentEvents) {
  const d = new Date(ev.timestampMs);
  const hourKey = `${ev.localDateKey} ${String(d.getHours()).padStart(2, '0')}:00 (UTC ${String(d.getUTCHours()).padStart(2, '0')}:00)`;
  if (!hourly[hourKey]) hourly[hourKey] = { count: 0, peak: ev.isPeak, tokens: 0, frontendCost: 0, quota: 0 };
  hourly[hourKey].count++;
  hourly[hourKey].tokens += ev.rawInput + ev.output;
  hourly[hourKey].frontendCost += ev.frontendCost;
  hourly[hourKey].quota += ev.cloudQuotaDeduction;
}

for (const [h, v] of Object.entries(hourly)) {
  console.log(`${h} | ${v.peak ? 'PEAK (2x) ' : 'OFF-PEAK '} | Reqs: ${String(v.count).padStart(3)} | Tokens: ${(v.tokens / 1e6).toFixed(2).padStart(5)}M | Frontend: $${v.frontendCost.toFixed(4)} | Quota: $${v.quota.toFixed(4)}`);
}
