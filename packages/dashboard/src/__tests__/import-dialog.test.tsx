// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import type { ImportPreview, ImportReceipt } from '../domain';
import { ImportDialog } from '../react/imports/import-dialog';
import zh from '../messages/zh.json';
const preview: ImportPreview = { previewId: 'preview-one', expiresAt: '2027-01-01T00:00:00Z',
  device: { id: 'device', label: '电脑二', platform: 'win32' }, exportedAt: '2026-10-12T00:00:00Z', received: 2, added: 1,
  duplicateLocal: 1, duplicateImported: 0, conflicts: 0, addedTokens: 100,
  projects: [{ key: 'remote', name: '外部项目', records: 2, suggestedTarget: 'local' }], targets: [{ key: 'local', name: '本机项目' }],
  models: [{ name: 'raw-model', resolvedName: 'raw-model', records: 2, priced: false }], warnings: [] };
const receipt: ImportReceipt = { id: 'batch-one', deviceId: 'device', deviceLabel: '电脑二', exportId: 'export', checksum: 'hash',
  importedAt: '2026-10-12T00:00:00Z', status: 'active', received: 2, added: 1, duplicateLocal: 1, duplicateImported: 0, addedTokens: 100 };
const mockFetch = vi.fn();
const response = (payload: unknown) => Promise.resolve({ ok: true, json: async () => payload });
beforeEach(() => {
  // jsdom has no top-layer popover implementation
  Object.defineProperty(HTMLElement.prototype, 'showPopover', { configurable: true, value: function(this: HTMLElement) { this.style.display = 'block'; } });
  Object.defineProperty(HTMLElement.prototype, 'hidePopover', { configurable: true, value: function(this: HTMLElement) { this.style.display = 'none'; } });
  vi.stubGlobal('fetch', mockFetch);
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', { configurable: true, value: function(this: HTMLDialogElement) { this.open = true; } });
  mockFetch.mockImplementation((url: string) => response(url.endsWith('/preview') ? preview : url.endsWith('/commit') ? receipt : { history: [] }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetAllMocks(); });
function renderDialog(onImported = vi.fn()) {
  render(<NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}><ImportDialog onClose={vi.fn()} onImported={onImported} /></NextIntlClientProvider>);
  return onImported;
}
async function upload() {
  const file = new File(['{}'], 'tokens.json', { type: 'application/json' }); Object.defineProperty(file, 'text', { value: async () => '{}' });
  fireEvent.change(screen.getByLabelText('选择导出文件'), { target: { files: [file] } });
  await screen.findByText('模型与价格匹配');
}
describe('reviewable import UI', () => {
  it('locks page scrolling while open and restores existing styles on unmount', () => {
    document.documentElement.style.overflow = 'auto';
    document.body.style.overflow = 'scroll';
    const view = render(<NextIntlClientProvider locale="zh" timeZone="Asia/Singapore" messages={{ dashboard: zh }}><ImportDialog onClose={vi.fn()} onImported={vi.fn()} /></NextIntlClientProvider>);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(document.body.style.overflow).toBe('hidden');
    view.unmount();
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.body.style.overflow).toBe('scroll');
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
  });
  it('copies the entire rollback command including its batch identifier', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    mockFetch.mockImplementation(() => response({ history: [receipt] }));
    renderDialog();
    fireEvent.click(await screen.findByRole('button', { name: '复制批次 batch-one 的回退命令' }));
    await screen.findByText('命令已复制');
    expect(writeText).toHaveBeenCalledWith('corepack pnpm dashboard:imports rollback batch-one');
  });
  it('filters project choices and supports keyboard selection and Escape without changing the mapping', async () => {
    renderDialog(); await upload();
    const trigger = screen.getByRole('combobox', { name: '匹配项目 外部项目' });
    fireEvent.click(trigger);
    const search = screen.getByRole('textbox', { name: '搜索本机项目' });
    fireEvent.change(search, { target: { value: '不存在' } });
    expect(screen.queryByRole('option', { name: '本机项目 · 建议匹配' })).toBeNull();
    expect(screen.getByText('没有匹配的本机项目')).toBeDefined();
    fireEvent.keyDown(search, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.textContent).toContain('保留为设备独立项目');
    expect(document.activeElement).toBe(trigger);
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('textbox', { name: '搜索本机项目' }), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('option', { name: '保留为设备独立项目' }));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(screen.getByRole('option', { name: '本机项目 · 建议匹配' }));
  });
  it('requires revalidation after explicit project matching and displays the rollback command after importing', async () => {
    const refresh = renderDialog(); await upload();
    const select = screen.getByRole('combobox', { name: '匹配项目 外部项目' });
    expect(select.textContent).toContain('保留为设备独立项目');
    fireEvent.click(select);
    fireEvent.change(screen.getByRole('textbox', { name: '搜索本机项目' }), { target: { value: '本机' } });
    fireEvent.click(screen.getByRole('option', { name: '本机项目 · 建议匹配' }));
    expect((screen.getByRole('button', { name: '确认导入' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '重新校验' }));
    await waitFor(() => expect((screen.getByRole('button', { name: '确认导入' }) as HTMLButtonElement).disabled).toBe(false));
    expect(JSON.parse(mockFetch.mock.calls.filter(([url]) => url.endsWith('/preview')).at(-1)![1].body).mappings).toEqual({ remote: 'local' });
    mockFetch.mockImplementation((url: string) => response(url.endsWith('/commit') ? receipt : { history: [receipt] }));
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await screen.findByText('corepack pnpm dashboard:imports rollback batch-one');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: '已导入' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('disables confirmation for conflicts and allows unknown prices to be reviewed', async () => {
    mockFetch.mockImplementation((url: string) => response(url.endsWith('/preview') ? { ...preview, conflicts: 1 } : { history: [] }));
    renderDialog(); await upload();
    expect(screen.getByText('价格未知')).toBeDefined();
    expect((screen.getByRole('button', { name: '确认导入' }) as HTMLButtonElement).disabled).toBe(true);
  });
  it('verifies inline after 428 and resumes exactly the reviewed import once', async () => {
    let commits = 0;
    mockFetch.mockImplementation((url: string) => url.endsWith('/commit') && ++commits === 1
      ? Promise.resolve({ ok: false, status: 428, json: async () => ({ error: 'reauthentication_required' }) })
      : response(url.endsWith('/preview') ? preview : url.endsWith('/reauthenticate') ? { authenticated: true }
        : url.endsWith('/commit') ? receipt : { history: [] }));
    const refresh = renderDialog(); await upload();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await screen.findByRole('heading', { name: '验证身份' });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByText('reauthentication_required')).toBeNull();
    expect(screen.getByText('tokens.json')).toBeDefined();
    expect(screen.getByRole('combobox', { name: '匹配项目 外部项目' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'test-password' } });
    fireEvent.change(screen.getByLabelText('当前 TOTP'), { target: { value: '012345' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并导入' }));
    await screen.findByRole('button', { name: '已导入' });
    expect(commits).toBe(2);
    const commitsSent = mockFetch.mock.calls.filter(([url]) => url.endsWith('/commit'));
    expect(commitsSent.map(([, options]) => JSON.parse(options.body))).toEqual([{ previewId: 'preview-one' }, { previewId: 'preview-one' }]);
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/preview'))).toHaveLength(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('当前密码')).toBeNull();
  });
  it('keeps the review after failed verification or cancellation and clears submitted secrets', async () => {
    mockFetch.mockImplementation((url: string) => url.endsWith('/commit') || url.endsWith('/reauthenticate')
      ? Promise.resolve({ ok: false, status: url.endsWith('/commit') ? 428 : 401,
        json: async () => ({ error: url.endsWith('/commit') ? 'reauthentication_required' : 'invalid_credentials' }) })
      : response(url.endsWith('/preview') ? preview : { history: [] }));
    renderDialog(); await upload();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await screen.findByLabelText('当前密码');
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'test-password' } });
    fireEvent.change(screen.getByLabelText('当前 TOTP'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并导入' }));
    await screen.findByText('密码或动态码不正确，请重试');
    expect((screen.getByLabelText('当前密码') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('当前 TOTP') as HTMLInputElement).value).toBe('');
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/commit'))).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: '取消验证' }));
    expect(screen.queryByLabelText('当前密码')).toBeNull();
    expect((screen.getByRole('button', { name: '确认导入' }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText('tokens.json')).toBeDefined();
  });
  it('waits for user input if the resumed commit requires verification again', async () => {
    mockFetch.mockImplementation((url: string) => url.endsWith('/commit')
      ? Promise.resolve({ ok: false, status: 428, json: async () => ({ error: 'reauthentication_required' }) })
      : response(url.endsWith('/preview') ? preview : url.endsWith('/reauthenticate') ? { authenticated: true } : { history: [] }));
    renderDialog(); await upload();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await screen.findByLabelText('当前密码');
    fireEvent.change(screen.getByLabelText('当前密码'), { target: { value: 'test-password' } });
    fireEvent.change(screen.getByLabelText('当前 TOTP'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: '验证并导入' }));
    await waitFor(() => expect((screen.getByRole('button', { name: '取消验证' }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole('heading', { name: '验证身份' })).toBeDefined();
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/commit'))).toHaveLength(2);
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/reauthenticate'))).toHaveLength(1);
  });
  it('does not retry a commit with an unknown network outcome', async () => {
    mockFetch.mockImplementation((url: string) => url.endsWith('/commit') ? Promise.reject(new Error('Network interrupted'))
      : response(url.endsWith('/preview') ? preview : { history: [] }));
    const refresh = renderDialog(); await upload();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await screen.findByText('Network interrupted');
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/commit'))).toHaveLength(1);
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/reauthenticate'))).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '重新校验' })).toBeDefined();
  });
  it('only renders the latest ten history records', async () => {
    mockFetch.mockImplementation(() => response({ history: Array.from({ length: 12 }, (_, index) => ({ ...receipt, id: `batch-${index}` })) }));
    renderDialog();
    await screen.findByRole('button', { name: '复制批次 batch-0 的回退命令' });
    expect(screen.getAllByRole('article')).toHaveLength(10);
    expect(screen.queryByRole('button', { name: '复制批次 batch-10 的回退命令' })).toBeNull();
    expect(screen.getByText('仅显示最近 10 次导入')).toBeDefined();
  });
  it('keeps a successful receipt if refreshing history fails without submitting again', async () => {
    let reads = 0;
    mockFetch.mockImplementation((url: string) => url.endsWith('/preview') ? response(preview)
      : url.endsWith('/commit') ? response(receipt) : ++reads === 1 ? response({ history: [] }) : Promise.reject(new Error('History unavailable')));
    const refresh = renderDialog(); await upload();
    fireEvent.click(screen.getByRole('button', { name: '确认导入' }));
    await screen.findByText('History unavailable');
    expect((screen.getByRole('button', { name: '已导入' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '重新校验' })).toBeNull();
    expect(mockFetch.mock.calls.filter(([url]) => url.endsWith('/commit'))).toHaveLength(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
