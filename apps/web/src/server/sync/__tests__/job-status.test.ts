import {describe,expect,it} from 'vitest';
import {jobStatus,JOB_TTL_MS,JOB_RUNNING_GRACE_MS,type JobCompletion} from '@incept/db/agent';

const base:JobCompletion={scanId:'00000000-0000-4000-8000-000000000000',collectedAt:new Date().toISOString(),issues:3,pending:0,review:40,batches:[],lineageHash:'a'.repeat(64)};

describe('Phase 5 hotfix job status',()=>{
  it('keeps a job TTL above a large capture+upload and a running grace above the TTL',()=>{
    expect(JOB_TTL_MS).toBeGreaterThanOrEqual(15*60_000);
    expect(JOB_RUNNING_GRACE_MS).toBeGreaterThan(JOB_TTL_MS);
  });
  it('historical backlog alone is completed_no_change and remains visible as reviewTotal',()=>{
    expect(jobStatus({...base,reviewTotal:40,reviewNew:0,held:0,warnings:3,blockingIssues:0},{changed:false,lineageHash:base.lineageHash})).toMatchObject({status:'completed_no_change',reviewTotal:40,reviewNew:0});
  });
  it('a new committed session is completed even with 40 old reviews',()=>{
    expect(jobStatus({...base,review:40,reviewTotal:40,reviewNew:0,held:0,warnings:3,blockingIssues:0,newTokens:18371},{changed:true,lineageHash:base.lineageHash})).toMatchObject({status:'completed',newTokens:18371});
  });
  it('a newly produced review or held successor is review_required',()=>{
    expect(jobStatus({...base,reviewTotal:41,reviewNew:1,held:0,blockingIssues:0},{changed:false,lineageHash:base.lineageHash}).status).toBe('review_required');
    expect(jobStatus({...base,reviewTotal:40,reviewNew:0,held:1,blockingIssues:0},{changed:false,lineageHash:base.lineageHash}).status).toBe('review_required');
  });
  it('warnings do not make a no-change refresh partial, but blocking issues do',()=>{
    expect(jobStatus({...base,reviewTotal:40,reviewNew:0,held:0,warnings:3,blockingIssues:0},{changed:false,lineageHash:base.lineageHash}).status).toBe('completed_no_change');
    expect(jobStatus({...base,reviewTotal:40,reviewNew:0,held:0,warnings:0,blockingIssues:1},{changed:false,lineageHash:base.lineageHash}).status).toBe('partial');
  });
  it('old clients without the split are accepted and still infer only new reviews',()=>{
    const old={...base,issues:3,reviewTotal:40};
    // Old clients cannot distinguish warnings from blocking issues; retain the
    // conservative partial status while ensuring the historical backlog alone
    // does not become a new review.
    expect(jobStatus(old,{changed:false,lineageHash:base.lineageHash},40).status).toBe('partial');
    expect(jobStatus({...old,issues:0},{changed:false,lineageHash:base.lineageHash},40).status).toBe('completed_no_change');
    expect(jobStatus({...old,issues:0,reviewTotal:41},{changed:false,lineageHash:base.lineageHash},40).status).toBe('review_required');
  });
  it('lineage mismatch still fails closed',()=>{
    expect(jobStatus({...base,reviewTotal:40,reviewNew:0,held:0,blockingIssues:0},{changed:false,lineageHash:'b'.repeat(64)}).status).toBe('review_required');
  });
});
