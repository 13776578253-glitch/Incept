import {expect,it} from 'vitest';
import type {SyncRecord} from '../../domain/sync';
import {normalizeCodexRecords} from '../../agent/codex-normalize';

const event=(timestampMs:number,inputTokens:number,cacheReadTokens:number,outputTokens:number,reasoningTokens:number):SyncRecord=>({
  event:{eventId:String(timestampMs),source:'codex',sessionId:'session-i',timestampMs,modelName:'gpt-5.5',projectKey:'p',projectName:'p',inputTokens,outputTokens,cacheReadTokens,cacheCreationTokens:0,reasoningTokens},
  envelopeHash:'',pointKey:String(timestampMs),
});

it('collapses duplicate cumulative snapshots and keeps a regressed branch on one monotonic local timeline',()=>{
  const records=[
    event(1,84_440,3_456,1_059,298),
    event(2,2_887,76_160,638,0),
    event(3,84_440,3_456,1_059,298),
  ];
  const raw=[
    {timestampMs:1,total:{input_tokens:2_072_719,cached_input_tokens:937_344,output_tokens:62_944,reasoning_output_tokens:24_378},last:{input_tokens:87_896,cached_input_tokens:3_456,output_tokens:1_059,reasoning_output_tokens:298}},
    {timestampMs:2,total:{input_tokens:2_063_870,cached_input_tokens:1_010_048,output_tokens:62_225,reasoning_output_tokens:24_080},last:{input_tokens:79_047,cached_input_tokens:76_160,output_tokens:638,reasoning_output_tokens:0}},
    {timestampMs:3,total:{input_tokens:2_072_719,cached_input_tokens:937_344,output_tokens:62_944,reasoning_output_tokens:24_378},last:{input_tokens:87_896,cached_input_tokens:3_456,output_tokens:1_059,reasoning_output_tokens:298}},
  ];
  const normalized=normalizeCodexRecords(records,raw);
  expect(normalized).toHaveLength(2);
  expect(normalized.map(r=>r.cumulative)).toEqual([
    {input:87_896,cache:3_456,output:1_357,reasoning:298},
    {input:166_943,cache:79_616,output:1_995,reasoning:298},
  ]);
  expect(normalized.map(r=>r.event.eventId)).toEqual(['1','2']);
});

