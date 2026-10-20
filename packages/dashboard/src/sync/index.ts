// Node-only, authenticated callers supply trusted actors; not a browser export.
export {SyncExecutor,findSyncWorker} from './executor';
export {SyncTransportError,isSyncTransportError,DEFAULT_CAPACITY} from './protocol';
export {importStorePath} from '../adapters/local/imports/store';
export {readRpcSecret} from './secrets';
export type {SyncWork,CapacityPolicy} from './protocol';
export type {SyncActor,SyncHeader,SyncRecord,SyncScope} from '../domain/sync';
