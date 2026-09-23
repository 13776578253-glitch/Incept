// 图谱的单一注册表。
// 总览页的卡片与子页面标题都以此为准，新增图谱只改这里一处。
// path 是无 locale 前缀的站内路由；labelKey / descriptionKey / noteKey 指向 atlas namespace。

// 回放不在此列：它是听内容的方式，而不是阅读项目的方式，改由导航直通设置页。
type AtlasItemKey = 'architecture' | 'roadmap' | 'keywords';

export type AtlasEntry = {
  key: AtlasItemKey;
  path: string;
  labelKey: `items.${AtlasItemKey}.label`;
  descriptionKey: `items.${AtlasItemKey}.description`;
  noteKey: `items.${AtlasItemKey}.note`;
};

export const atlasEntries: readonly AtlasEntry[] = [
  {
    key: 'architecture',
    path: '/atlas/architecture',
    labelKey: 'items.architecture.label',
    descriptionKey: 'items.architecture.description',
    noteKey: 'items.architecture.note',
  },
  {
    key: 'roadmap',
    path: '/atlas/roadmap',
    labelKey: 'items.roadmap.label',
    descriptionKey: 'items.roadmap.description',
    noteKey: 'items.roadmap.note',
  },
  {
    key: 'keywords',
    path: '/atlas/keywords',
    labelKey: 'items.keywords.label',
    descriptionKey: 'items.keywords.description',
    noteKey: 'items.keywords.note',
  },
] as const;

// 卡片与注册表之间的中间结构，由 feature 入口用 t() 填充
export type AtlasCardModel = {
  key: string;
  label: string;
  description: string;
  note: string;
  href: string;
};
