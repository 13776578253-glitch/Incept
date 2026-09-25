import type { Roadmap, RoadmapEntry } from '../domain';

// fixture 只允许存在于 testing/（决策条目 3）：这是 Gate 前唯一的数据源，全部是示例内容。
// 样本刻意覆盖极端：超长标题（卡片两行截断）、空列、双语长文本。T4 硬化：无计数样本。

export const fixtureRoadmaps: readonly Roadmap[] = [
  {
    key: 'sample-roadmap',
    name: { en: 'Roadmap', zh: '路线图' },
    columns: [
      { status: 'reviewing', label: { en: 'Backlog', zh: 'Backlog' } },
      { status: 'unstarted', label: { en: 'Next up', zh: 'Next up' } },
      { status: 'active', label: { en: 'In Progress', zh: 'In Progress' } },
      { status: 'completed', label: { en: 'Done', zh: 'Done' } },
    ],
  },
  {
    key: 'sample-atlas',
    name: { en: 'Atlas Board', zh: '图谱板' },
    columns: [
      { status: 'unstarted', label: { en: 'Planned', zh: 'Planned' } },
      { status: 'active', label: { en: 'Building', zh: 'Building' } },
      { status: 'completed', label: { en: 'Shipped', zh: 'Shipped' } },
    ],
  },
];

export const fixtureEntries: readonly RoadmapEntry[] = [
  {
    key: 'sample-01',
    roadmap: 'sample-roadmap',
    order: 10,
    status: 'reviewing',
    type: 'feature',
    priority: 'middle',
    title: { en: 'Interest-based reply method', zh: '基于兴趣点的回复策略' },
    summary: {
      en: 'Shape replies around what the reader cares about.',
      zh: '围绕读者关心的内容组织回复。',
    },
    detail: {
      en: 'The reply method anchors on interest points first, then adds one concrete example.',
      zh: '回复策略先锚定兴趣点，再补一个具体例子。',
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-10T00:00:00.000Z',
  },
  {
    key: 'sample-02',
    roadmap: 'sample-roadmap',
    order: 20,
    status: 'reviewing',
    type: 'improvement',
    priority: 'low',
    title: {
      en: 'A deliberately long title that has to survive two-line clamping on the card without its full text disappearing from the accessible name or the document structure',
      zh: '一个刻意加长的中文标题用于验证卡片两行截断行为并且确保完整标题不会在无障碍名称与文档结构里丢失',
    },
    summary: {
      en: 'Extreme sample: the clamp must not eat the text.',
      zh: '极端样本：截断不能吞掉文本。',
    },
  },
  {
    key: 'sample-03',
    roadmap: 'sample-roadmap',
    order: 30,
    status: 'unstarted',
    type: 'feature',
    priority: 'high',
    title: { en: 'Embedded memory system', zh: '内建长期记忆系统' },
    summary: {
      en: 'Queued next: long-term memory that stays with the conversation.',
      zh: '排在下一批：随对话留存的长期记忆。',
    },
    detail: {
      en: 'Scoped memory storage, one scope per conversation.',
      zh: '按会话划分作用域的记忆存储。',
    },
  },
  {
    key: 'sample-04',
    roadmap: 'sample-roadmap',
    order: 40,
    status: 'unstarted',
    type: 'improvement',
    priority: 'middle',
    title: { en: 'Workflow panel polish', zh: '工作流面板打磨' },
    summary: {
      en: 'Small quality pass over the workflow panel.',
      zh: '工作流面板的一轮小修。',
    },
  },
  {
    key: 'sample-05',
    roadmap: 'sample-roadmap',
    order: 50,
    status: 'active',
    type: 'feature',
    priority: 'high',
    title: { en: 'Local agent client', zh: '本地 Agent 客户端' },
    summary: {
      en: 'Being built: a desktop client for the local agent.',
      zh: '正在构建：本地 Agent 的桌面客户端。',
    },
  },
  {
    key: 'sample-06',
    roadmap: 'sample-roadmap',
    order: 60,
    status: 'active',
    type: 'maintenance',
    priority: 'none',
    title: { en: 'Runtime isolation groundwork', zh: '运行时隔离地基' },
    summary: {
      en: 'Isolation groundwork in progress.',
      zh: '隔离地基进行中。',
    },
    links: [
      {
        label: { en: 'Discussion', zh: '讨论' },
        href: 'https://example.com/discussion',
      },
    ],
  },
  {
    key: 'sample-07',
    roadmap: 'sample-roadmap',
    order: 70,
    status: 'completed',
    type: 'feature',
    priority: 'middle',
    title: { en: 'Context compression', zh: '上下文压缩' },
    summary: {
      en: 'Shipped: automatic and manual context compression.',
      zh: '已发布：手动与自动的上下文压缩。',
    },
  },
  {
    key: 'sample-08',
    roadmap: 'sample-roadmap',
    order: 80,
    status: 'completed',
    type: 'maintenance',
    priority: 'none',
    title: { en: 'Command panel cleanup', zh: '指令面板清理' },
    summary: {
      en: 'Shipped as a cleanup round.',
      zh: '作为清理一轮已发布。',
    },
  },
  {
    key: 'sample-09',
    roadmap: 'sample-atlas',
    order: 10,
    status: 'unstarted',
    type: 'feature',
    priority: 'high',
    title: { en: 'Bilingual title sample', zh: '双语标题样本' },
    summary: {
      en: 'Second board, own columns and names: the multi-roadmap axis.',
      zh: '第二块板自带列与命名：多 roadmap 轴。',
    },
  },
  {
    key: 'sample-10',
    roadmap: 'sample-atlas',
    order: 20,
    status: 'completed',
    type: 'improvement',
    priority: 'middle',
    title: { en: 'Keyword extraction pass', zh: '关键词提取一轮' },
    summary: {
      en: 'Shipped on this board only.',
      zh: '只在这块板上标记为已发布。',
    },
  },
];
