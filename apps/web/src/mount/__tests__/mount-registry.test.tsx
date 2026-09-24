import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  RESERVED_SETTINGS_SECTION_IDS,
  collectFloatingOverlays,
  collectLayoutSlotContributions,
  collectProviderWrappers,
  collectSettingsSectionContributions,
  findSettingsSectionContribution,
  loadSettingsSectionContributionData,
  mountManifest,
  renderFloatingOverlays,
  renderLayoutSlot,
  renderProviderWrappers,
} from '../registry';
import { defineSettingsSectionContribution } from '../define';
import type {
  MountContribution,
  MountManifest,
  MountProviderDepth,
  SettingsSectionContribution,
  SettingsSectionServerLoader,
} from '../types';

// 类型测试：manifest 必须能表达两种包裹深度、overlay、layout slot、section + loader
type Expect<T extends true> = T;
type Extends<A, B> = A extends B ? true : false;

const TYPE_LEVEL_PROOF: [
  Expect<Extends<'provider-chain', MountProviderDepth>>,
  Expect<Extends<'root-layout', MountProviderDepth>>,
] = [true, true];

function ChainWrapper({ children }: { children: ReactNode }) {
  return <div data-testid="chain-wrapper">{children}</div>;
}

function RootWrapper({ children }: { children: ReactNode }) {
  return <div data-testid="root-wrapper">{children}</div>;
}

function Overlay() {
  return <div data-testid="overlay">overlay</div>;
}

function SlotContent() {
  return <div data-testid="slot-content">slot</div>;
}

// 示例贡献只存在于测试，不注册到生产
const TYPE_LEVEL_MANIFEST = {
  contributions: [
    {
      kind: 'providerWrapper',
      id: 'w-chain',
      depth: 'provider-chain',
      order: 10,
      wrap: ChainWrapper,
    },
    {
      kind: 'providerWrapper',
      id: 'w-root',
      depth: 'root-layout',
      order: 10,
      wrap: RootWrapper,
    },
    { kind: 'floatingOverlay', id: 'overlay', order: 10, overlay: Overlay },
    { kind: 'layoutSlot', id: 'slot', slot: 'shell-after', order: 10, render: SlotContent },
  ] satisfies MountContribution[],
  settingsSections: [
    defineSettingsSectionContribution<number>({
      id: 'demo-section',
      label: (locale) => (locale === 'zh' ? '示例分区' : 'Demo section'),
      visibility: 'public',
      order: 10,
      panel: ({ data }) => (
        <span data-testid="demo-panel">{data === null ? 'none' : data.toFixed(0)}</span>
      ),
    }),
  ],
} satisfies MountManifest;

// B1（R10 强制）：loader 只存在于服务端注册表类型，与分区按 id 配对
const TYPE_LEVEL_LOADERS = [
  { id: 'demo-section', serverLoader: async () => 42 },
] satisfies SettingsSectionServerLoader<number>[];

function manifestOf(
  contributions: MountContribution[],
  settingsSections: SettingsSectionContribution[] = [],
): MountManifest {
  return { contributions, settingsSections };
}

describe('mount manifest type level', () => {
  it('expresses both wrap depths, an overlay, a layout slot and a section with a loader', () => {
    expect(TYPE_LEVEL_PROOF).toEqual([true, true]);
    expect(TYPE_LEVEL_MANIFEST.contributions).toHaveLength(4);
    expect(TYPE_LEVEL_MANIFEST.settingsSections).toHaveLength(1);
    expect(TYPE_LEVEL_LOADERS).toHaveLength(1);
  });
});

describe('mount registry', () => {
  // 2026-09-23（Phase 7）：music 于挂载收编注册进生产清单，原「registers nothing in production」断言随收编改写
  it('registers the music contributions in production', () => {
    expect(mountManifest.contributions).toHaveLength(3);
    expect(mountManifest.settingsSections).toHaveLength(1);
    expect(mountManifest.settingsSections[0].id).toBe('music');
    // 回归锁：分区说明文案随收编迁移自内置 music-schema（主分支 description 字面量），侧栏依赖它渲染
    expect(mountManifest.settingsSections[0].description?.('zh')).toBe('播放器偏好与曲库');
    expect(mountManifest.settingsSections[0].description?.('en')).toBe(
      'Player preferences and libraries.',
    );
    expect(RESERVED_SETTINGS_SECTION_IDS).toEqual([
      'appearance',
      'language',
      'account',
      'ai',
    ]);
  });

  it('collects provider wrappers per depth and sorts them by order', () => {
    const manifest = manifestOf([
      { kind: 'providerWrapper', id: 'late-chain', depth: 'provider-chain', order: 20, wrap: ChainWrapper },
      { kind: 'providerWrapper', id: 'root', depth: 'root-layout', order: 5, wrap: RootWrapper },
      { kind: 'providerWrapper', id: 'early-chain', depth: 'provider-chain', order: 10, wrap: ChainWrapper },
    ]);

    expect(collectProviderWrappers(manifest, 'provider-chain').map((item) => item.id)).toEqual([
      'early-chain',
      'late-chain',
    ]);
    expect(collectProviderWrappers(manifest, 'root-layout').map((item) => item.id)).toEqual([
      'root',
    ]);
  });

  it('renders provider wrappers with the smallest order outermost', () => {
    const manifest = manifestOf([
      { kind: 'providerWrapper', id: 'inner', depth: 'provider-chain', order: 20, wrap: ChainWrapper },
      { kind: 'providerWrapper', id: 'outer', depth: 'provider-chain', order: 10, wrap: RootWrapper },
    ]);

    render(
      <div data-testid="host">
        {renderProviderWrappers(manifest, 'provider-chain', <span data-testid="core">core</span>)}
      </div>,
    );

    expect(screen.getByTestId('root-wrapper')).toContainElement(screen.getByTestId('chain-wrapper'));
    expect(screen.getByTestId('chain-wrapper')).toContainElement(screen.getByTestId('core'));
  });

  it('renders floating overlays and only the matching layout slot', () => {
    const manifest = manifestOf([
      { kind: 'floatingOverlay', id: 'overlay', order: 10, overlay: Overlay },
      { kind: 'layoutSlot', id: 'slot', slot: 'shell-after', order: 10, render: SlotContent },
    ]);

    const { rerender } = render(
      <div data-testid="host">
        {renderFloatingOverlays(manifest)}
        {renderLayoutSlot(manifest, 'shell-after')}
      </div>,
    );

    expect(screen.getByTestId('overlay')).toBeInTheDocument();
    expect(screen.getByTestId('slot-content')).toBeInTheDocument();

    rerender(
      <div data-testid="host">
        {renderFloatingOverlays(manifest)}
        {renderLayoutSlot(manifest, 'other-slot')}
      </div>,
    );

    expect(screen.getByTestId('overlay')).toBeInTheDocument();
    expect(screen.queryByTestId('slot-content')).toBeNull();
  });

  it('rejects reserved and duplicate settings section ids', () => {
    const reserved = manifestOf(
      [],
      [
        {
          id: 'account',
          label: () => 'account',
          visibility: 'public',
          order: 10,
          panel: () => null,
        },
      ],
    );
    const duplicate = manifestOf(
      [],
      [
        { id: 'demo', label: () => 'demo', visibility: 'public', order: 10, panel: () => null },
        { id: 'demo', label: () => 'demo', visibility: 'public', order: 20, panel: () => null },
      ],
    );

    expect(() => collectSettingsSectionContributions(reserved)).toThrow(/reserved/);
    expect(() => collectSettingsSectionContributions(duplicate)).toThrow(/registered twice/);
  });

  it('collects and finds settings sections by order', () => {
    const manifest = manifestOf(
      [],
      [
        { id: 'late', label: () => 'late', visibility: 'public', order: 20, panel: () => null },
        { id: 'early', label: () => 'early', visibility: 'public', order: 10, panel: () => null },
      ],
    );

    expect(collectSettingsSectionContributions(manifest).map((item) => item.id)).toEqual([
      'early',
      'late',
    ]);
    expect(findSettingsSectionContribution(manifest, 'early')?.id).toBe('early');
    expect(findSettingsSectionContribution(manifest, 'missing')).toBeUndefined();
  });

  it('gates server loaders behind the owner check', async () => {
    const loader = vi.fn(async () => ({ tracks: 1 }));
    const loaders: SettingsSectionServerLoader[] = [{ id: 'demo', serverLoader: loader }];

    await expect(loadSettingsSectionContributionData(loaders, false)).resolves.toEqual({
      demo: null,
    });
    expect(loader).not.toHaveBeenCalled();

    await expect(loadSettingsSectionContributionData(loaders, true)).resolves.toEqual({
      demo: { tracks: 1 },
    });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('renders a contributed panel with its loader data', () => {
    const manifest = manifestOf(
      [],
      [
        defineSettingsSectionContribution<number>({
          id: 'demo-section',
          label: () => 'demo',
          visibility: 'public',
          order: 10,
          panel: ({ data }) => (
            <span data-testid="demo-panel">{data === null ? 'none' : data.toFixed(0)}</span>
          ),
        }),
      ],
    );
    const contribution = findSettingsSectionContribution(manifest, 'demo-section');

    expect(contribution).toBeDefined();
    if (!contribution) {
      return;
    }

    const Panel = contribution.panel;

    render(<Panel data={null} />);
    expect(screen.getByTestId('demo-panel')).toHaveTextContent('none');

    render(<Panel data={7} />);
    expect(screen.getAllByTestId('demo-panel')[1]).toHaveTextContent('7');
  });
});
