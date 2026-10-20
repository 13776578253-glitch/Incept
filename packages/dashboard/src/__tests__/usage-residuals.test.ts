import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { zstdCompressSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';
import { beforeEach, afterEach, expect, it } from 'vitest';
import { collectCodexEvents } from '../adapters/local/collectors/codex';
import { collectIndexedAgentEvents } from '../adapters/local/collectors/aiusage';
import { collectAiusageAndRawAgentEvents } from '../adapters/local/collectors/agents';
import { summarizeUsageEvents } from '../adapters/local/aggregation/summarize';
import { publicDashboardSummary } from '../domain/public-summary';

let home = '';
const prices = new Map([['model', { inputPerMillion: 2, outputPerMillion: 10, cacheReadPerMillion: .2 }]]);
const tokens = (input: number, output = 0) => ({ input_tokens: input, output_tokens: output });
const entry = (minute: number, input: number, last?: number) => ({ timestamp: `2026-10-08T11:${String(minute).padStart(2,'0')}:00Z`,
  type:'event_msg', payload:{type:'token_count',info:{total_token_usage:tokens(input),last_token_usage:last===undefined?undefined:tokens(last)}} });
beforeEach(() => { home=mkdtempSync(join(tmpdir(),'incept-usage-residuals-')); });
afterEach(() => {
  if(!resolve(home).startsWith(join(resolve(tmpdir()),'incept-usage-residuals-'))) throw new Error('Unsafe fixture cleanup');
  rmSync(home,{recursive:true,force:true});
});
function rollout(name: string, entries: object[], compressed = false, session = 'session') {
  const dir=join(home,'.codex',compressed?'archived_sessions':'sessions'); mkdirSync(dir,{recursive:true});
  const content=[{type:'session_meta',payload:{id:session}},{type:'turn_context',payload:{model:'model'}},...entries]
    .map(value=>JSON.stringify(value)).join('\n');
  const path=join(dir,name+'.jsonl'+(compressed?'.zst':''));
  writeFileSync(path,compressed?zstdCompressSync(Buffer.from(content)):content); return path;
}
const collect = () => collectCodexEvents(home,prices,new Set());
const sum = (events: ReturnType<typeof collect>['events']) => events.reduce((n,e)=>n+e.inputTokens+e.outputTokens+e.cacheReadTokens+e.reasoningTokens,0);

it('counts only the last turn without a parent, labels missing history, and keeps later cumulative deltas', () => {
  rollout('orphan',[entry(0,28_617_837,295_127),entry(1,28_617_847,10)]);
  const result=collect();
  expect(sum(result.events)).toBe(295_137);
  expect(result.events.every(e=>e.historyIncomplete)).toBe(true);
  expect(result.sessionIntegrity).toEqual([expect.objectContaining({
    sessionId:'session',reason:'OPENING_PREFIX_MISSING',unattributedTokens:28_322_710,affectedRecords:1,
  })]);
  expect(result.errors).toHaveLength(0);
  const data=summarizeUsageEvents(result.events,home,prices,Date.now());
  expect(data.sessions[0].historyIncomplete).toBe(true);
  expect(publicDashboardSummary(data,true).sessions[0].historyIncomplete).toBe(true);
  expect(collect().events).toEqual(result.events);
});

it('uses an opening without last-turn data only as an undated anchor and removes uncertainty when earlier history is present', () => {
  rollout('tail',[entry(1,110)]);
  const incomplete=collect();
  expect(incomplete.events).toHaveLength(0);
  expect(incomplete.sessionIntegrity).toEqual([expect.objectContaining({
    sessionId:'session',reason:'OPENING_USAGE_UNCERTAIN',unattributedTokens:110,affectedRecords:1,
  })]);
  expect(incomplete.errors).toHaveLength(0);
  rollout('parent',[entry(0,100,100)]);
  expect(sum(collect().events)).toBe(110);
  expect(collect().events.every(e=>!e.historyIncomplete)).toBe(true);
  expect(collect().sessionIntegrity).toHaveLength(0);
});

it('keeps event identity, date, totals and costs unchanged when a normal rollout becomes a compressed archive', () => {
  const original=rollout('history',[entry(0,100,100),entry(1,120,20)]);
  const before=collect().events;
  const archive=join(home,'.codex','archived_sessions');mkdirSync(archive,{recursive:true});
  writeFileSync(join(archive,'history.jsonl.zst'),zstdCompressSync(readFileSync(original)));
  unlinkSync(original);
  const after=collect().events;
  const comparable=(events:typeof before)=>events.map(({sourceFile,...event})=>event);
  expect(comparable(after)).toEqual(comparable(before)); expect(sum(after)).toBe(120);
});

it('deduplicates plain and compressed copies and shares watermarks with later resumed files', () => {
  rollout('parent',[entry(0,100,100)]);
  rollout('copy',[entry(0,100,100)],true);
  rollout('resume',[entry(1,150,50)],true);
  expect(collect().events.map(e=>e.inputTokens)).toEqual([100,50]);
  expect(collect().events).toHaveLength(2);
});

it('reports a damaged compressed archive without discarding valid files', () => {
  rollout('valid',[entry(0,100,100)]);
  const dir=join(home,'.codex','archived_sessions');mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'broken.jsonl.zst'),'invalid compressed bytes');
  expect(sum(collect().events)).toBe(100);
  expect(collect().errors.some(e=>e.includes('could not be read'))).toBe(true);
});

function index() {
  const dir=join(home,'.aiusage');mkdirSync(dir,{recursive:true});const db=new DatabaseSync(join(dir,'cache.db'));
  db.exec('CREATE TABLE records (ts INTEGER, tool TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, cache_read_tokens INTEGER, cache_write_tokens INTEGER, thinking_tokens INTEGER, cost REAL, session_id TEXT, source_file TEXT, cwd TEXT)');
  const insert=db.prepare('INSERT INTO records VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  return { db, add:(file:string,cost:number,session='session')=>insert.run(Date.parse('2026-10-08T11:00:00Z'),'codex','model',100,0,60,0,0,cost,session,file,'') };
}

it('uses a stable event identity across file and cost drift, and rebuilds the same full snapshot on repeat', () => {
  const {db,add}=index();add('original.jsonl',1);db.close();
  const first=collectIndexedAgentEvents(home,prices);
  const db2=new DatabaseSync(join(home,'.aiusage','cache.db'));
  db2.exec("INSERT INTO records SELECT ts,tool,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,2,session_id,'renamed.jsonl',cwd FROM records");db2.close();
  const second=collectIndexedAgentEvents(home,prices);
  expect(second.events).toHaveLength(1);
  expect(second.events[0].eventId).toBe(first.events[0].eventId);
  expect(second.events[0].sourceFiles).toEqual(['original.jsonl','renamed.jsonl']);
  expect(sum(second.events)).toBe(sum(first.events));
  expect(collectIndexedAgentEvents(home,prices).events).toEqual(second.events);
});

it('does not collapse indistinguishable anonymous sessions from different source files', () => {
  const {db,add}=index();add('one.jsonl',1,'');add('two.jsonl',1,'');db.close();
  expect(collectIndexedAgentEvents(home,prices).events).toHaveLength(2);
});

it('excludes indexed aliases when a compressed native file already covers the event', () => {
  rollout('native',[entry(0,100,100)],true,'native-session');
  const {db,add}=index();add('missing/path/native.jsonl',1,'index-alias');add('another/native.jsonl.zst',2,'index-alias');db.close();
  const result=collectAiusageAndRawAgentEvents(home,prices);
  expect(result.fallbackEvents).toHaveLength(0);
  expect(sum(result.events)).toBe(100);
});

it('retains unknown-price tokens but excludes the recorded Codex cost from every aggregation', () => {
  const {db,add}=index();add('one.jsonl',100);db.close();
  const result=collectIndexedAgentEvents(home,new Map());
  const data=summarizeUsageEvents(result.events,home,new Map(),Date.now());
  expect(data.costs.totalCost).toBe(0);expect(data.totals.totalTokens).toBe(100);
  expect(data.costs.unpricedTokens).toBe(100);expect(data.costs.tokenCoverageRate).toBe(0);
  expect(result.errors).toHaveLength(1);
});

it('retains a valid non-Codex recorded cost when an earlier duplicate had no recorded price', () => {
  const {db,add}=index();add('one.jsonl',0);
  db.exec("UPDATE records SET tool='gemini'; INSERT INTO records SELECT ts,tool,model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,thinking_tokens,7.77,session_id,source_file,cwd FROM records");
  db.close();
  const result=collectIndexedAgentEvents(home,new Map());
  expect(result.events).toHaveLength(1);
  expect(result.events[0]).toMatchObject({cost:7.77,costSource:'recorded',missingPricing:false});
});
