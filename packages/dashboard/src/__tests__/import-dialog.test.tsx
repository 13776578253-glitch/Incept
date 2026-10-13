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
});
