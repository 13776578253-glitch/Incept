import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';

import { AtlasHub } from '../atlas-hub';
import type { AtlasCardModel } from '../../atlas-registry';

const items: AtlasCardModel[] = [
  {
    key: 'architecture',
    label: '架构',
    description: '项目与其数据的组织方式。',
    note: '计划：绘制六层边界。',
    href: '/zh/atlas/architecture',
  },
  {
    key: 'keywords',
    label: '关键词',
    description: '一篇文档或合集的主题词。',
    note: '计划：对已发布内容做关键词提取。',
    href: '/zh/atlas/keywords',
  },
];

function renderHub(overrides: Partial<Parameters<typeof AtlasHub>[0]> = {}) {
  return render(
    <AtlasHub
      items={items}
      eyebrow="图谱"
      title="把项目画成几张图"
      description="这里的每一项都为同一个项目画一张图。"
      note={{ title: '两张图，同一个对象', description: '这里不列回放。' }}
      {...overrides}
    />,
  );
}

it('renders a card per map', () => {
  renderHub();

  expect(screen.getAllByRole('link')).toHaveLength(items.length);
  expect(screen.getByRole('link', { name: /架构/ })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /关键词/ })).toBeInTheDocument();
});

it('keeps the roadmap surface out of the Atlas map catalog', async () => {
  const { atlasEntries } = await import('../../atlas-registry');

  expect(atlasEntries.map((entry) => entry.key)).toEqual(['architecture', 'keywords']);
  expect(atlasEntries.some((entry) => entry.path === '/atlas/roadmap')).toBe(false);
});

it('links each card to its own atlas route', () => {
  renderHub();

  expect(screen.getByRole('link', { name: /架构/ })).toHaveAttribute(
    'href',
    '/zh/atlas/architecture',
  );
  expect(screen.getByRole('link', { name: /关键词/ })).toHaveAttribute(
    'href',
    '/zh/atlas/keywords',
  );
});

it('shows the plan note on each card, so undrawn maps are not read as ready', () => {
  renderHub();

  expect(screen.getByText('计划：绘制六层边界。')).toBeInTheDocument();
  expect(screen.getByText('计划：对已发布内容做关键词提取。')).toBeInTheDocument();
});

it('renders the section heading and the closing note', () => {
  renderHub();

  expect(screen.getByRole('heading', { name: '把项目画成几张图' })).toBeInTheDocument();
  expect(screen.getByText('两张图，同一个对象')).toBeInTheDocument();
  expect(screen.getByText('这里不列回放。')).toBeInTheDocument();
});

it('renders only the maps it is given', () => {
  renderHub({ items: [items[0]] });

  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.queryByRole('link', { name: /路线图/ })).not.toBeInTheDocument();
});
