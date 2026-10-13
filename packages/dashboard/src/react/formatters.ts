import { dashboardDate } from '../domain';

export function formatCompactTokens(value: number): string {
  if(value >= 1_000_000_000) {
    return `${(value / 1_000_000_000).toFixed(2)}B`;
  }
  if(value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(2)}M`;
  }
  if(value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }
  return value.toLocaleString('en-US');
}

export function formatFullNumber(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export function formatUsd(value: number, digits = 2): string {
  return `$${value.toFixed(digits)}`;
}

export function formatPercent(ratio: number, digits = 1): string {
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatShortDate(isoOrDate: string): string {
  if(!isoOrDate) return '—';
  if(isoOrDate.length === 10) return isoOrDate.slice(5);
  const timestamp = Date.parse(isoOrDate);
  return Number.isFinite(timestamp) ? dashboardDate(timestamp) : '—';
}

export function formatDateTimeShort(iso: string): string {
  if(!iso) return '—';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return '—';
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}

export function formatDuration(minutes: number): string {
  if(minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function formatKnownCost(cost: number, missingPricing?: boolean): string {
  return missingPricing ? (cost > 0 ? formatUsd(cost) + ' + ?' : '—') : formatUsd(cost);
}
