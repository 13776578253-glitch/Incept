import type { SyncActor, SyncHeader, SyncRecord } from '../../../../domain/sync';
import { SYNC_LIMITS, requireSync, sequenceHash } from './contract';
import { SyncStore } from './store';

// Private in-process boundary. No HTTP route, env switch, default DB or credential.
export class SyncService extends SyncStore {
  ingest(header: SyncHeader, records: SyncRecord[], actor: SyncActor, options: Parameters<SyncStore['commit']>[3] = {}) {
    requireSync(records.length === header.manifest.recordCount && sequenceHash(records) === header.manifest.sequenceHash,'SEQUENCE_HASH_MISMATCH');
    const begun = this.begin(header,actor); if (begun.receipt) return begun.receipt;
    let offset=begun.nextOffset;
    while(offset<records.length) {
      const page:SyncRecord[]=[];let bytes=2;
      while(offset+page.length<records.length&&page.length<SYNC_LIMITS.pageRecords) {
        const record=records[offset+page.length],size=Buffer.byteLength(JSON.stringify(record))+(page.length?1:0);
        if(bytes+size>SYNC_LIMITS.pageBytes)break;page.push(record);bytes+=size;
      }
      requireSync(page.length,'PAGE_BYTE_LIMIT');this.stage(header.manifest.scope.deviceId,header.batchId,offset,page,actor);offset+=page.length;
    }
    return this.commit(header.manifest.scope.deviceId,header.batchId,actor,options);
  }
  snapshotVersion() { return { dataRevision: this.revision() }; }
  snapshotIsCurrent(version: { dataRevision: number }) { return version.dataRevision === this.revision(); }
}
