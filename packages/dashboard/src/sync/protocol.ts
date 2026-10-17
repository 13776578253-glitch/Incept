import type { SyncActor, SyncHeader, SyncRecord, SyncScope } from '../domain/sync';
type Work =
  | {op:'checkpoint';actor:SyncActor}
  | {op:'verify-job';device:string;batches:string[];since:number;actor:SyncActor}
  | {op:'device-summary';devices:string[];actor:SyncActor}
  | {op:'projection';range:import('../domain').UsageRange;home:string;minimumRevision:number;actor:SyncActor}
  | {op:'resolve';source:SyncScope['source'];sessionId:string;actor:SyncActor}
  | {op:'begin';header:SyncHeader;actor:SyncActor}
  | {op:'stage';device:string;batch:string;offset:number;records:SyncRecord[];actor:SyncActor}
  | {op:'commit'|'status';device:string;batch:string;actor:SyncActor}
  | {op:'register';scope:SyncScope;label:string;actor:SyncActor}
  | {op:'capacity'|'cleanup'|'reviews'|'maintain';actor:SyncActor}
  | {op:'migrate';sourcePath:string;maxBatches:number;actor:SyncActor}
  | {op:'adopt';header:SyncHeader;batch:string;actor:SyncActor};
export type SyncWork=Work & {allowedSources?:string[]};
export type CapacityPolicy={warnBytes:number;reviewBytes:number;warnFreeBytes:number;rejectFreeBytes:number;maxStoreBytes?:number;memoryPercent?:number;maxBatchRecords?:number};
export const DEFAULT_CAPACITY:CapacityPolicy={warnBytes:1024**3,reviewBytes:2*1024**3,warnFreeBytes:5*1024**3,rejectFreeBytes:2*1024**3,maxStoreBytes:4*1024**3,memoryPercent:85,maxBatchRecords:20000};
export class SyncTransportError extends Error {
  constructor(readonly code:string,readonly status=503,readonly retryAfter=2){super(code);}
}
