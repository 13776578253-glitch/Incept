import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@incept/dashboard/adapters', () => ({ loadTokenDashboardData: mocks.load }));
import { dashboardUsageGet } from '@incept/dashboard/next';

beforeEach(() => { mocks.load.mockReset(); });
describe('usage refresh endpoint', () => {
  it('defaults to the same thirty-day window as the page', async () => {
    mocks.load.mockResolvedValue({ range: '30d' });
    const result = await dashboardUsageGet(new Request('http://localhost/api/dashboard/usage'));
    expect(mocks.load).toHaveBeenCalledWith({ range: '30d', force: false });
    expect(await result.json()).toEqual({ range: '30d' });
  });
  it('validates the range without reading sources', async () => {
    const result = await dashboardUsageGet(new Request('http://localhost/api/dashboard/usage?range=invalid'));
    expect(result.status).toBe(400);
    expect(mocks.load).not.toHaveBeenCalled();
  });
  it('passes manual refresh and the shared window and prevents HTTP caching', async () => {
    mocks.load.mockResolvedValue({ range: '7d' });
    const result = await dashboardUsageGet(new Request('http://localhost/api/dashboard/usage?range=7d&refresh=1'));
    expect(mocks.load).toHaveBeenCalledWith({ range: '7d', force: true });
    expect(result.headers.get('cache-control')).toBe('no-store');
    expect(await result.json()).toEqual({ range: '7d' });
  });
  it('returns a retryable error without exposing source details', async () => {
    mocks.load.mockRejectedValue(new Error('private filesystem path'));
    const result = await dashboardUsageGet(new Request('http://localhost/api/dashboard/usage'));
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain('private filesystem');
  });
});
