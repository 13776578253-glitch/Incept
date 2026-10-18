import {hash} from '../adapters/local/imports/identity';
import type {SyncCounters,SyncRecord} from '../domain/sync';

export type RawCodexCounter={timestampMs:number;total?:Record<string,number>;last?:Record<string,number>};

const regresses=(total:Record<string,number>,previous:Record<string,number>)=>Object.keys(total).some(key=>total[key]<(previous[key]??0));
const count=(total:Record<string,number>):SyncCounters=>({input:total.input_tokens??0,cache:total.cached_input_tokens??0,output:total.output_tokens??0,reasoning:total.reasoning_output_tokens??0});
const eventCount=(event:SyncRecord['event']):SyncCounters=>({input:event.inputTokens+event.cacheReadTokens,cache:event.cacheReadTokens,output:event.outputTokens+event.reasoningTokens,reasoning:event.reasoningTokens});
const add=(left:SyncCounters,right:SyncCounters):SyncCounters=>({input:left.input+right.input,cache:left.cache+right.cache,output:left.output+right.output,reasoning:left.reasoning+right.reasoning});
const same=(a:SyncCounters,b:SyncCounters)=>a.input===b.input&&a.cache===b.cache&&a.output===b.output&&a.reasoning===b.reasoning;

// Rebuild Codex counters as a monotonic local epoch. The raw total is used as
// evidence and for duplicate detection, but never copied when it contradicts
// the event delta. A repeated total+last snapshot is a duplicate, not usage.
export function normalizeCodexRecords(records:SyncRecord[],raw:RawCodexCounter[]):SyncRecord[]{
  const byTimestamp=new Map<number,RawCodexCounter>();
  for(const row of raw)if(row.total)byTimestamp.set(row.timestampMs,row);
  const seen=new Set<string>(),out:SyncRecord[]=[];let previousRaw:SyncCounters|undefined,synthetic:SyncCounters|undefined;
  for(let index=0;index<records.length;index++){
    const record=records[index],event=record.event,row=byTimestamp.get(event.timestampMs),rawTotal=row?.total?count(row.total):undefined,rawLast=row?.last?count(row.last):undefined;
    if(rawTotal&&rawLast){
      const signature=hash([rawTotal,rawLast]);
      if(seen.has(signature))continue;
      seen.add(signature);
    }
    // If the raw total regresses but a later sample returns to the prior total,
    // the sample is a late duplicate/fork snapshot. Include its measured event
    // once on the local timeline instead of copying the regressed cumulative.
    const delta=eventCount(event);
    const transient=!!(rawTotal&&previousRaw&&regresses(rawTotal as unknown as Record<string,number>,previousRaw as unknown as Record<string,number>)
      && raw.slice(index+1).some(next=>next.total&&!regresses(next.total,{input_tokens:previousRaw!.input,cached_input_tokens:previousRaw!.cache,output_tokens:previousRaw!.output,reasoning_output_tokens:previousRaw!.reasoning})));
    synthetic=synthetic?add(synthetic,delta):delta;
    if(!transient){record.cumulative=synthetic;}
    else record.cumulative=synthetic;
    if(!same(record.cumulative!,delta)&&!previousRaw)record.cumulative=delta;
    out.push(record);
    if(rawTotal)previousRaw=rawTotal;
  }
  // The same invariant as contract.ts, checked before the record leaves capture.
  let prior:SyncCounters|undefined;
  for(const record of out){
    const total=record.cumulative,event=record.event;
    if(!total||total.cache>total.input||total.reasoning>total.output)throw Error('CODEX_COUNTER_INVALID');
    if(prior&&Object.keys(total).some(key=>total[key as keyof SyncCounters]<prior![key as keyof SyncCounters]))throw Error('CODEX_COUNTER_INVALID');
    const delta={input:total.input-(prior?.input??0),cache:total.cache-(prior?.cache??0),output:total.output-(prior?.output??0),reasoning:total.reasoning-(prior?.reasoning??0)};
    if(event.inputTokens!==delta.input-delta.cache||event.cacheReadTokens!==delta.cache||event.outputTokens!==delta.output-delta.reasoning||event.reasoningTokens!==delta.reasoning||event.cacheCreationTokens!==0)throw Error('CODEX_COUNTER_INVALID');
    prior=total;
  }
  return out;
}
