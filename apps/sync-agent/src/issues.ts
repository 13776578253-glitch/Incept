import {TRANSFER_SOURCES,type TransferSource} from '../../../packages/dashboard/src/domain';

const warningCodes = new Set(['EMPTY_USAGE_SKIPPED','UNKNOWN_OPENING','SESSION_ISOLATED','INTERVAL_ISOLATED','ISOLATED_ORIGIN_RETAINED','SEALED_ORIGIN_RETAINED','HELD_ORIGIN_RETAINED']);

export type ClassifiedIssues = {warnings: string[]; blocking: string[]};

// Collector warnings are advisory. A source that is not in the device policy is
// never allowed to affect this device's result, even if its collector reports an
// error before capture filtering.
export function classifyIssues(issues: string[], allowed: TransferSource[]): ClassifiedIssues {
  const warnings: string[] = [], blocking: string[] = [];
  for (const issue of issues) {
    const separator = issue.lastIndexOf(':');
    const source = separator > 0 ? issue.slice(0, separator) : '';
    const code = separator > 0 ? issue.slice(separator + 1) : issue;
    const known=TRANSFER_SOURCES.includes(source as TransferSource);
    if(known&&!allowed.includes(source as TransferSource)) continue;
    if (warningCodes.has(code)) warnings.push(issue);
    else blocking.push(issue);
  }
  return {warnings, blocking};
}
