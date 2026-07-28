import type { AppLocale } from '@/i18n/config/locales';
import type { DocsArticlePageModel } from '@/features/docs/shared/types';
import { docsBlockCatalog } from '../catalog';
import type { DocsContentBlockModel } from '../schema';
import { buildCodeExample } from './docs-code-example-utils';

// 根据 block 类型从目录中获取对应的内容块模型，默认为 defaultPayload，可以选择 examplePayload 进行展示
// 服务于样式实验室页面/style-lab，方便快速对比不同类型和变体的内容块样式 / 半保留结构

// 测试界面地址：http://localhost:3000/en/docs/style-lab

// 目前已实现block：heading、paragraph、list、checklist、callout、quote、divider、code、image
// 待实现block：table

// - 当前 block 范围：
//   'paragraph' | 'list' | 'checklist' | 'callout' | 'heading' | 'quote' | 'code' | 'divider' | 'image'
// - 当前已接入 style-lab：
//   heading、paragraph、list、checklist、callout、quote、divider、code、image
// - 当前主要用途：
//   1. 在接近真实 docs 正文外壳的环境里测试 block 样式
//   2. 逐条验证 block 的 variant、换行、间距和阅读节奏
//   3. 为未来 create 与 AI 选型提供可视化参考面
// - 下一阶段待补：
//   1. 行内标记系统：delete line、mark、code span、strong、em
//   2. 未完成 block：table
//   3. 未来可扩展：embed、timeline、interactive block
// - 重点观察项：
//   1. paragraph / list / checklist 在标准正文列宽下的换行稳定性
//   2. emphasis 变体是否足够明确，但不会破坏正文整体节奏
//   3. checklist 完成态的勾选框、删除线、降级字色是否清晰但不过重

// 已实现：代码块 section 后续不只验证“容器样式”，还要升级成“多语言代码展示实验面”。
// 这里的职责目标：
// 1. 给 docs block system 提供稳定的代码示例输入面
// 2. 验证不同语言在 light / dark 下的 token 配色是否可读
// 3. 验证长行、命令行、结构化数据、缩进代码在同一外壳里的表现差异
//
// 计划：
// 1. 保留当前 3 类代码测试：
//    - multiline code
//    - compact command
//    - long-line overflow
// 2. 新增语言覆盖测试：
//    - txt
//    - bash / cli
//    - html
//    - css
//    - javascript / typescript
//    - python
//    - c / cpp
//    - go
//    - sql
// 3. 每种语言至少保留一条“最能暴露排版问题”的样例：
//    - 关键字 + 字符串 + 注释
//    - 多级缩进
//    - 长行
//    - 命令列表
// 4. 未来如果接 syntax highlighting：
//    - style-lab 先成为第一落点
//    - 先验证 example 页面，再进入真实 docs 正文链
//    - 让 DocsCodeBlock 继续只负责 UI，不负责语言解析

// history: The catalog-backed fixture lookup remains sufficient for the retained Owner-only Style Lab.
// Deferred: expand inline-mark fixtures or formalize the lab specification only with a concrete regression-testing need.

function getBlock<TType extends DocsContentBlockModel['type']>(
  type: TType,
  example = false,
): Extract<DocsContentBlockModel, { type: TType }> {
  const item = docsBlockCatalog.find((entry) => entry.type === type);

  if (!item) {
    throw new Error(`Missing docs block catalog item for type "${type}".`);
  }

  return (example ? item.examplePayload : item.defaultPayload) as Extract<
    DocsContentBlockModel,
    { type: TType }
  >;
}

// 生成样式实验室页面的数据模型，包含多个 section，每个 section 展示不同类型和变体的内容块，支持中英文两种语言
// 主要测试
export function getDocsBlockStyleLabPage(locale: AppLocale): DocsArticlePageModel {
  const isZh = locale === 'zh';

  const defaultHeading = getBlock('heading');
  const exampleHeading = getBlock('heading', true);

  const defaultParagraph = getBlock('paragraph');
  const exampleParagraph = getBlock('paragraph', true);

  const defaultList = getBlock('list');
  const exampleList = getBlock('list', true);

  const defaultChecklist = getBlock('checklist');
  const exampleChecklist = getBlock('checklist', true);

  const defaultCallout = getBlock('callout');
  const exampleCallout = getBlock('callout', true);

  const defaultQuote = getBlock('quote');

  const defaultDivider = getBlock('divider');
  const exampleDivider = getBlock('divider', true);

  const defaultCode = getBlock('code');
  const exampleCode = getBlock('code', true);

  const defaultImage = getBlock('image');
  const exampleImage = getBlock('image', true);

  return {

    // 基础页面信息 / 外层元数据 / 主要用于路由和页面结构，内容块数据在 sections 内定义
    id: 'docs-block-style-lab',
    slug: 'style-lab',
    routeType: 'collectionArticle',
    collectionSlug: 'style-lab',
    articleSlug: 'style-lab',
    layoutMode: 'sidebar',
    locale,

    eyebrow: isZh ? '格式目录' : 'Style lab',
    title: isZh ? '正文段落实验页' : 'Paragraph rendering lab',
    description: isZh
      ? '使用与真实 docs 文章更接近的外壳来验证标题块与段落块在标准阅读环境下的层级、换行与节奏。'
      : 'A shell-aligned lab page for validating headings and paragraphs inside the same reading environment used by real docs articles.',
    readingStats: {
      chineseCharacterCount: 0,
      wordCount: 0,
      writingUnits: 0,
      estimatedMinutes: 0,
    },

    // description: isZh
    //   ? '当前先只保留标题块测试，用于逐条验证 level 与 variant 的视觉结构。'
    //   : 'This page is currently narrowed to heading-only testing so level and variant can be reviewed one by one.',

    outlineLabel: isZh ? '本页目录' : 'On this page',
    sidebarGroups: [
      {
        id: 'collection-style-lab',
        label: isZh ? '正文样式实验' : 'Reading style lab',
        defaultOpen: true,
        items: [
          {
            id: 'style-lab',
            label: isZh ? '段落与标题实验' : 'Heading and paragraph lab',
            href: '/docs/style-lab',
            active: true,
          },
        ],
      },
    ],
    outline: [
      { id: 'headings', label: isZh ? '标题系统' : 'Heading system' },
      { id: 'paragraphs', label: isZh ? '段落系统' : 'Paragraph system' },
      { id: 'lists', label: isZh ? '列表系统' : 'List system' },
      { id: 'checklists', label: isZh ? '待办列表系统' : 'Checklist system' },
      { id: 'callouts', label: isZh ? '提示块系统' : 'Callout system' },
      { id: 'quotes', label: isZh ? '引用系统' : 'Quote system' },
      { id: 'dividers', label: isZh ? '分割线系统' : 'Divider system' },
      { id: 'codes', label: isZh ? '代码块系统' : 'Code block system' },
      { id: 'images', label: isZh ? '图片系统' : 'Image system' },
    ],

   /*
   * 内容块数据，按照 section 进行分组，每个 section 包含一个标题和多个内容块，内容块的数据结构根据类型不同而不同
   * section.title / 顶层小节标题
   * page
      -> sections[]
        -> blocks[]
          - type: 'paragraph' | 'list' | 'callout' | 'heading' | 'quote' | 'code' | 'divider' | 'image'
   */
    sections: [
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'headings',
        title: isZh ? '标题系统' : 'Heading system',

        // description: isZh
        //   ? '比较 section 标题与正文内部 heading block 的层级关系。'
        //   : 'Compare section titles with body-level heading block hierarchy.',

        blocks: [
          {
            ...exampleHeading,
            id: 'heading-display-l1',
            level: 1,
            variant: 'display',
            text: isZh ? '标题 1' : 'Display heading level 1',
          },
          {
            ...defaultHeading,
            id: 'heading-default-l2',
            level: 2,
            variant: 'default',
            text: isZh ? '标题 2' : 'Default heading level 2',
          },
          {
            ...exampleHeading,
            id: 'heading-compact-l3',
            level: 3,
            variant: 'compact',
            text: isZh ? '标题 3' : 'Compact heading level 3',
          },
          {
            ...exampleHeading,
            id: 'heading-subtle-l4',
            level: 4,
            variant: 'subtle',
            text: isZh ? '标题 4' : 'Subtle heading level 4',
          },
        ],
      },
      { 
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'paragraphs',
        title: isZh ? '段落系统' : 'Paragraph system',

        blocks: [
          // 同时用于测试段落内 链接/删除线/高亮等行内标记的样式
          // 强化段落
          {
            ...exampleParagraph,
            id: 'paragraph-lead-relaxed',
            variant: 'lead',
            spacing: 'relaxed',
            text: isZh
              ? '这是 lead 段落，用来测试段落在更强存在感和更松行距下的阅读节奏。它不追求信息密度，而是先帮助我们观察段落开场时的呼吸感。'
              : 'This lead paragraph tests how a paragraph opens with more presence and a more relaxed line rhythm. It is intentionally calm so we can judge the opening cadence before we judge the styling details.',
          },
          // 标准段落 
          {
            ...defaultParagraph,
            id: 'paragraph-default-measure',
            variant: 'default',
            spacing: 'default',
            content: isZh
              ? [
                  {
                    type: 'text',
                    text: '这是标准正文段落，用来观察默认字色和默认行距是否足够稳定。这里额外插入一个',
                  },
                  {
                    type: 'link',
                    label: '网址跳转',
                    href: 'https://openai.com',
                    external: true,
                  },
                  {
                    type: 'text',
                    text: '，用来验证段落内部的链接跳转是否能够自然地融入正文，而不是像单独按钮那样破坏阅读节奏。',
                  },
                ]
              : [
                  {
                    type: 'text',
                    text: 'This standard paragraph checks the default body tone and line rhythm, while also inserting an',
                  },
                  {
                    type: 'link',
                    label: 'inline URL jump',
                    href: 'https://openai.com',
                    external: true,
                  },
                  {
                    type: 'text',
                    text: 'to verify that links can live inside prose naturally instead of reading like a detached action button.',
                  },
                ],
          },
          // 大行距标准段落
          {
            ...defaultParagraph,
            id: 'paragraph-default-relaxed',
            variant: 'default',
            spacing: 'relaxed',
            text: isZh
              ? '这是默认正文加 relaxed 行距的测试，用来判断在长解释段中，是否需要比标准段更松一点的呼吸空间。如果它显得更适合阅读，我们再决定是否把 relaxed 作为部分长文段落的常用选项。'
              : 'This paragraph keeps the default body voice but switches to relaxed spacing. It helps us judge whether longer explanatory passages need more breathing room than the standard body rhythm provides.',
          },
          // 弱化段落
          {
            ...defaultParagraph,
            id: 'paragraph-muted-default',
            variant: 'muted',
            spacing: 'default',
            text: isZh
              ? '这是 muted 段落，用来测试较弱信息层级的说明文字，便于观察补充说明、注释段或次级说明在正文体系中的存在感。'
              : 'This muted paragraph is meant for secondary explanation so we can judge how support text, side reasoning, or lower-priority notes sit inside the broader prose system.',
          },
          {
            ...defaultParagraph,
            id: 'paragraph-inline-marks',
            variant: 'default',
            spacing: 'default',
            content: isZh
              ? [
                  {
                    type: 'text',
                    text: '这一段专门测试段落内的行内标记能力，例如把',
                  },
                  {
                    type: 'mark',
                    text: '当前重点',
                  },
                  {
                    type: 'text',
                    text: '直接高亮出来，把',
                  },
                  {
                    type: 'delete',
                    text: '旧写法或已废弃表述',
                  },
                  {
                    type: 'text',
                    text: '保留在句内，同时继续插入一个',
                  },
                  {
                    type: 'inlineCode',
                    code: 'layoutMode',
                  },
                  {
                    type: 'text',
                    text: ' 字段名，并继续插入一个',
                  },
                  {
                    type: 'link',
                    label: '参考链接',
                    href: 'https://openai.com',
                    external: true,
                  },
                  {
                    type: 'text',
                    text: '，这样就能在不拆成额外 block 的前提下测试真实正文里的局部强调与修订痕迹。',
                  },
                ]
              : [
                  {
                    type: 'text',
                    text: 'This paragraph is dedicated to inline review patterns so we can ',
                  },
                  {
                    type: 'mark',
                    text: 'highlight the current emphasis',
                  },
                  {
                    type: 'text',
                    text: ', keep a ',
                  },
                  {
                    type: 'delete',
                    text: 'deprecated phrasing',
                  },
                  {
                    type: 'text',
                    text: ', mention the field ',
                  },
                  {
                    type: 'inlineCode',
                    code: 'layoutMode',
                  },
                  {
                    type: 'text',
                    text: ', and still place a ',
                  },
                  {
                    type: 'link',
                    label: 'reference link',
                    href: 'https://openai.com',
                    external: true,
                  },
                  {
                    type: 'text',
                    text: ' inline without breaking the surrounding prose into separate blocks.',
                  },
                ],
          },
          {
            ...defaultParagraph,
            id: 'paragraph-inline-code',
            variant: 'default',
            spacing: 'default',
            content: isZh
              ? [
                  {
                    type: 'text',
                    text: '这一段单独测试行内代码，用来确认像 ',
                  },
                  {
                    type: 'inlineCode',
                    code: 'pnpm dev',
                  },
                  {
                    type: 'text',
                    text: '、',
                  },
                  {
                    type: 'inlineCode',
                    code: '/en/docs/style-lab',
                  },
                  {
                    type: 'text',
                    text: '、',
                  },
                  {
                    type: 'inlineCode',
                    code: 'DocsParagraphInlineModel',
                  },
                  {
                    type: 'text',
                    text: ' 这类命令、路径和类型名在正文句子里出现时，是否既能被快速识别，又不会像小按钮一样破坏阅读节奏。',
                  },
                ]
              : [
                  {
                    type: 'text',
                    text: 'This paragraph isolates inline code so we can test whether tokens like ',
                  },
                  {
                    type: 'inlineCode',
                    code: 'pnpm dev',
                  },
                  {
                    type: 'text',
                    text: ', ',
                  },
                  {
                    type: 'inlineCode',
                    code: '/en/docs/style-lab',
                  },
                  {
                    type: 'text',
                    text: ', and ',
                  },
                  {
                    type: 'inlineCode',
                    code: 'DocsParagraphInlineModel',
                  },
                  {
                    type: 'text',
                    text: ' stay quickly recognizable inside prose without turning into little detached buttons.',
                  },
                ],
          },
          
        ],
      },
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'lists',
        title: isZh ? '列表系统' : 'List system',

        blocks: [
          // 强调项目符号列表 / 强调无序列表
          {
            ...exampleList,
            id: 'list-unordered-emphasis',
            listStyle: 'unordered',
            variant: 'emphasis',
            items: isZh
              ? [
                  '强调无序列表先测试更强文字存在感下，项目符号和正文之间的关系是否仍然干净。',
                  '第二项继续保留较长内容，用来观察强调样式下的换行是否会让悬挂缩进显得过重。',
                  '第三项用于确认强调列表在真实正文外壳里更像重点提炼，而不是普通正文的简单重复。',
                ]
              : [
                  'This emphasized unordered list checks whether stronger list text still keeps a clean relationship between the marker and the reading column.',
                  'The second item stays intentionally long so we can inspect whether wrapping under the emphasis style makes the hanging indent feel too heavy.',
                  'The third item confirms that an emphasized list reads like distilled emphasis inside the real article shell rather than like ordinary body copy.',
                ],
          },
          // 项目符号列表 / 无序列表
          {
            ...defaultList,
            id: 'list-unordered-default',
            listStyle: 'unordered',
            variant: 'default',
            items: isZh
              ? [
                  '无序列表先测试标准正文环境下的左缩进、项目符号位置和每条内容的呼吸节奏。',
                  '第二项故意写得更长一点，用来观察当列表项换行时，第二行是否能保持稳定的悬挂缩进。',
                  '第三项保留中等长度，方便横向比较不同项之间的垂直间距和视觉连续性。',
                ]
              : [
                  'An unordered list first tests the baseline indentation, bullet position, and reading rhythm inside the standard docs shell.',
                  'The second item is intentionally longer so we can inspect whether wrapped lines keep a stable hanging indent under the same bullet.',
                  'The third item keeps a medium length to compare vertical spacing and visual continuity across list rows.',
                ],
          },
          // 强调有序列表
          {
            ...exampleList,
            id: 'list-ordered-emphasis-long',
            listStyle: 'ordered',
            variant: 'emphasis',
            items: isZh
              ? [
                  '第一项用于确认编号列表在强调态下，数字标记不会比正文内容更抢视觉重心。',
                  '第二项故意拉长句子，重点观察当编号项跨到第二行时，行首位置和编号宽度是否仍然稳定。',
                  '第三项作为收尾，用来判断强调编号列表在步骤说明之外，是否也适合承担更高优先级的信息整理。',
                ]
              : [
                  'The first step confirms that an emphasized ordered list does not let the numeric marker steal too much visual weight from the actual content.',
                  'The second step is deliberately longer so we can inspect whether the wrapped line start and marker width still feel stable under the stronger list treatment.',
                  'The third step checks whether an emphasized ordered list can carry higher-priority synthesis, not only procedural instructions.',
                ],
          },
          // 有序列表
          {
            ...exampleList,
            id: 'list-ordered-steps',
            listStyle: 'ordered',
            variant: 'default',
            items: isZh
              ? [
                  '先确认编号、文本起始位和正文列宽之间的关系是否稳定。',
                  '再观察第二项在较长内容下的换行位置，避免数字编号把正文挤得过窄。',
                  '最后确认第三项在真实阅读壳层下，列表是否仍然保持平静、清晰的步骤感。',
                ]
              : [
                  'First confirm that the marker, text start position, and prose column width remain stable together.',
                  'Then inspect how a longer second step wraps so the numeric marker does not squeeze the actual reading column too aggressively.',
                  'Finally confirm that the ordered list still feels calm and readable inside the real article shell rather than like a cramped checklist.',
                ],
          },
          
        ],
      },
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'checklists',
        title: isZh ? '待办列表系统' : 'Checklist system',

        blocks: [
          // 标准待办列表 / 混合完成态
          {
            ...defaultChecklist,
            id: 'checklist-default-mixed',
            variant: 'default',
            items: isZh
              ? [
                  {
                    id: 'checklist-default-mixed-1',
                    text: '先看未完成项在标准正文环境下，复选框、文本起始位和整行呼吸节奏是否足够稳定。',
                    checked: false,
                  },
                  {
                    id: 'checklist-default-mixed-2',
                    text: '再观察第二项在较长内容下的换行位置，确认第二行不会滑到复选框下方。',
                    checked: false,
                  },
                  {
                    id: 'checklist-default-mixed-3',
                    text: '最后保留一条已完成项，用来验证勾选标记、降级字色和删除线在标准态里是否清楚但不过重。',
                    checked: true,
                  },
                ]
              : [
                  {
                    id: 'checklist-default-mixed-1',
                    text: 'Start by checking whether the unchecked row keeps a stable relationship between the checkbox, text start, and overall reading rhythm inside the standard docs shell.',
                    checked: false,
                  },
                  {
                    id: 'checklist-default-mixed-2',
                    text: 'Then use a longer second row to confirm that wrapped lines stay aligned to the text column instead of slipping underneath the checkbox.',
                    checked: false,
                  },
                  {
                    id: 'checklist-default-mixed-3',
                    text: 'Keep one completed row here as well so the checked mark, lowered text presence, and strike-through can be reviewed in the default treatment.',
                    checked: true,
                  },
                ],
          },
          // 标准待办列表 / 全完成态
          {
            ...defaultChecklist,
            id: 'checklist-default-complete',
            variant: 'default',
            items: isZh
              ? [
                  {
                    id: 'checklist-default-complete-1',
                    text: '这一组标准完成态用于观察多个已完成项目连续出现时，整体是否仍然轻而清晰。',
                    checked: true,
                  },
                  {
                    id: 'checklist-default-complete-2',
                    text: '第二项保留较长文本，用来确认完成态下删除线不会让长句阅读变得过脏。',
                    checked: true,
                  },
                ]
              : [
                  {
                    id: 'checklist-default-complete-1',
                    text: 'This default completed-state group checks whether multiple finished tasks in sequence still feel light and readable.',
                    checked: true,
                  },
                  {
                    id: 'checklist-default-complete-2',
                    text: 'The second line stays longer so we can confirm that the strike-through treatment does not make completed long-form rows feel muddy.',
                    checked: true,
                  },
                ],
          },
          // 强调待办列表 / 混合完成态
          {
            ...exampleChecklist,
            id: 'checklist-emphasis-mixed',
            variant: 'emphasis',
            items: isZh
              ? [
                  {
                    id: 'checklist-emphasis-mixed-1',
                    text: '强调态先测试未完成项在更强文字存在感下，复选框和正文列之间是否仍然保持稳定关系。',
                    checked: false,
                  },
                  {
                    id: 'checklist-emphasis-mixed-2',
                    text: '第二项继续保持较长内容，重点观察强调态下的换行和悬挂缩进会不会显得过满。',
                    checked: false,
                  },
                  {
                    id: 'checklist-emphasis-mixed-3',
                    text: '最后保留一条已完成项，确认强调态下完成标记依旧清楚，但不会压过未完成项的主阅读重心。',
                    checked: true,
                  },
                ]
              : [
                  {
                    id: 'checklist-emphasis-mixed-1',
                    text: 'The emphasis treatment first checks whether unchecked rows still keep a stable relationship between the checkbox and the prose column under stronger typography.',
                    checked: false,
                  },
                  {
                    id: 'checklist-emphasis-mixed-2',
                    text: 'The second row stays intentionally long so we can inspect whether emphasis makes wrapping and hanging alignment feel too dense.',
                    checked: false,
                  },
                  {
                    id: 'checklist-emphasis-mixed-3',
                    text: 'Keep one finished row here too so the stronger checklist style can still show completion clearly without overpowering the active tasks.',
                    checked: true,
                  },
                ],
          },
          // 强调待办列表 / 全完成态
          {
            ...exampleChecklist,
            id: 'checklist-emphasis-complete',
            variant: 'emphasis',
            items: isZh
              ? [
                  {
                    id: 'checklist-emphasis-complete-1',
                    text: '这组强调完成态用于确认更强字重和更亮标记下，完成项不会变成视觉噪音。',
                    checked: true,
                  },
                  {
                    id: 'checklist-emphasis-complete-2',
                    text: '第二项继续保持较长句子，便于测试强调完成态在连续长文本里是否仍有稳定的节奏。',
                    checked: true,
                  },
                ]
              : [
                  {
                    id: 'checklist-emphasis-complete-1',
                    text: 'This emphasized completed-state group checks whether brighter markers and stronger text still avoid turning finished tasks into visual noise.',
                    checked: true,
                  },
                  {
                    id: 'checklist-emphasis-complete-2',
                    text: 'The second row remains longer so we can test whether the emphasized completed treatment still preserves rhythm across consecutive long task lines.',
                    checked: true,
                  },
                ],
          },
        ],
      },
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'callouts',
        title: isZh ? '提示块系统' : 'Callout system',

        blocks: [
          // 标准 note 提示块
          {
            ...defaultCallout,
            id: 'callout-note-default',
            tone: 'note',
            variant: 'default',
            title: isZh ? '标准说明' : 'Default note',
            text: isZh
              ? '这一组先测试默认 note 提示块在标准正文环境下的边框、背景和标题层级是否足够清楚，但不会破坏正文节奏。'
              : 'This first sample checks whether the default note callout keeps its border, surface, and title hierarchy clear inside the standard docs shell without breaking the prose rhythm.',
          },
          // 柔和 tip 提示块1 / 教学型 / 淡绿色
          {
            ...exampleCallout,
            id: 'callout-tip-soft',
            tone: 'tip',
            variant: 'soft',
            title: isZh ? '教学提示' : 'Teaching tip',
            text: isZh
              ? '这里重点观察绿色 soft tip 是否更适合承载偏教学型的辅助提示，例如如何阅读、如何操作或如何理解当前段落结构。'
              : 'This sample checks whether the green soft tip works better for teaching-oriented guidance such as how to read, navigate, or interpret the surrounding content.',
          },
          // 柔和 tip 提示块2 / 解释型 / 淡蓝色
          {
            ...exampleCallout,
            id: 'callout-tip-context',
            tone: 'tip',
            variant: 'context',
            title: isZh ? '解释提示' : 'Context tip',
            text: isZh
              ? '这一组淡蓝色 tip 用于偏解释型的辅助说明，例如补充上下文、解释术语、说明来源，而不是直接教用户做什么。'
              : 'This pale-blue tip is meant for explanatory context such as clarifying terms, adding background, or describing provenance rather than directly teaching the reader what to do.',
          },
          // attention 提示块 / 轻提醒
          {
            ...defaultCallout,
            id: 'callout-attention-default',
            tone: 'attention',
            variant: 'default',
            title: isZh ? '注意提示' : 'Attention tip',
            text: isZh
              ? 'attention tip 用于温和地提醒用户关注某个说明、限制或前提条件，它需要清楚，但不应像真正警告那样制造风险压力。'
              : 'The attention tip is meant for mild guidance, caveats, or conditions that should be noticed clearly without creating the stronger pressure of a true warning surface.',
          },
          // warning 提示块 / 警告
          {
            ...defaultCallout,
            id: 'callout-warning-strong',
            tone: 'warning',
            variant: 'default',
            title: isZh ? '风险警告' : 'Warning state',
            text: isZh
              ? '真正的 warning 用于明确风险、错误后果或不建议的操作，它应该比 attention 更重、更直接，但仍保持可读而不是情绪化。'
              : 'A true warning is reserved for explicit risk, likely failure, or discouraged behavior. It should feel stronger and more direct than attention while still remaining readable rather than theatrical.',
          },
          // 全局提示块 / 淡紫色
          {
            ...defaultCallout,
            id: 'callout-meta-default',
            tone: 'meta',
            variant: 'default',
            title: isZh ? '全局提醒' : 'Reading metadata',
            text: isZh
              ? '这一组淡紫色提示适合承载全文级信息，例如预计阅读时间、适配语言、是否支持 TTS 语音，或其他进入正文前应先知道的全局说明。'
              : 'This pale-violet callout is meant for page-level metadata such as reading time, supported languages, TTS availability, or other whole-article context the reader should know before diving in.',
          },
        ],
      },
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'quotes',
        title: isZh ? '引用系统' : 'Quote system',

        blocks: [
          // 标准引用 / 带出处
          {
            ...defaultQuote,
            id: 'quote-default-attributed',
            text: isZh
              ? '标准引用先用于测试最基础的引文结构，重点观察左侧竖线、正文列宽内的换行，以及引用文字与正文之间是否足够区分但不过分跳脱。'
              : 'The default quote first checks the most basic quotation structure, focusing on the left rule, wrapping inside the prose column, and whether quoted text separates itself from body copy without feeling too theatrical.',
            attribution: isZh ? '引用出处 / 默认态' : 'Quote source / default state',
          },
          // 标准引用 / 无出处
          {
            ...defaultQuote,
            id: 'quote-default-plain',
            text: isZh
              ? '这一条不带出处，用来确认当引用只是强调一句判断或摘录一句原话时，组件本身不会因为缺少 figcaption 而显得结构不完整。'
              : 'This unattributed quote confirms that the component still feels structurally complete when it is only isolating a sentence or a judgment rather than citing a named source.',
            attribution: undefined,
          },
        ],
      },
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'dividers',
        title: isZh ? '分割线系统' : 'Divider system',

        blocks: [
          // 标准分割线 / 标准间距
          {
            ...defaultParagraph,
            id: 'divider-default-intro',
            variant: 'default',
            spacing: 'default',
            text: isZh
              ? '这一段放在标准分割线之前，用来观察正文在进入一个轻度内容断点前的阅读节奏。这里重点不是文字本身，而是分割线插入前后的呼吸感是否自然。'
              : 'This paragraph sits before the default divider so we can judge the reading rhythm right before a light content break. The focus here is not the copy itself but whether the transition into the divider feels natural.',
          },
          // locate
          {
            ...defaultDivider,
            id: 'divider-default-line',
            variant: 'default',
          },
          {
            ...defaultParagraph,
            id: 'divider-default-outro',
            variant: 'default',
            spacing: 'default',
            text: isZh
              ? '标准分割线之后接一段较弱说明，用来确认默认分割线是否只承担节奏切分，而不会把上下两段硬生生切成两个互不相干的板块。'
              : 'A muted paragraph follows the default divider so we can confirm that the standard treatment creates separation in rhythm without severing the surrounding copy into two disconnected slabs.',
          },
          // spacious 分割线 / 间隔更大
          {
            ...exampleParagraph,
            id: 'divider-spacious-intro',
            variant: 'default',
            spacing: 'relaxed',
            text: isZh
              ? '这一段放在 spacious 分割线之前，用来测试当页面需要更强转场时，较大留白是否真的有必要，以及它会不会让正文节奏显得过松。'
              : 'This lead paragraph introduces the spacious divider so we can test whether a stronger transition really benefits from more white space or whether it starts to loosen the prose rhythm too much.',
          },
          // locate
          {
            ...exampleDivider,
            id: 'divider-spacious-line',
            variant: 'spacious',
          },
          {
            ...defaultParagraph,
            id: 'divider-spacious-outro',
            variant: 'default',
            spacing: 'relaxed',
            text: isZh
              ? 'spacious 分割线后的这一段用于观察更强分隔是否更适合章节内的大转场，例如从概念解释切入示例、从主叙述切到操作步骤，或者从正文切到补充材料。'
              : 'This paragraph follows the spacious divider so we can judge whether the stronger break better suits larger internal transitions, such as moving from concept framing into an example, from narrative into steps, or from the main flow into supporting material.',
          },
        ],
      },
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'codes',
        title: isZh ? '代码块系统' : 'Code block system',

        blocks: [
          // 标准代码块 / 多行示例
          {
            ...defaultCode,
            id: 'code-block-default',
            variant: 'block',
            language: 'ts',
            caption: isZh ? '标准代码块 / TypeScript 多行示例' : 'Default block / multiline TypeScript sample',
            code: buildCodeExample([
              'type DocsBlock = {',
              '  id: string;',
              "  type: 'paragraph' | 'callout' | 'code';",
              '};',
              '',
              'export function isRenderableBlock(block: DocsBlock) {',
              "  return block.type !== 'callout';",
              '}',
            ]),
          },
          // 紧凑代码块 / 命令示例
          {
            ...exampleCode,
            id: 'code-compact-command',
            variant: 'compact',
            language: 'bash',
            caption: isZh ? '紧凑代码块 / 命令行示例' : 'Compact block / command example',
            code: buildCodeExample([
              'pnpm db:deploy',
              'pnpm db:generate',
              'pnpm db:seed',
            ]),
          },
          // 标准代码块 / 长行横向滚动测试
          {
            ...defaultCode,
            id: 'code-block-long-line',
            variant: 'block',
            language: 'json',
            caption: isZh ? '长行测试 / 用于观察横向滚动与边距' : 'Long-line check / horizontal overflow and spacing',
            code: buildCodeExample([
              '{"collectionSlug":"document-shells","articleSlug":"shell-foundations","layoutMode":"sidebar","accessRole":"public","outlineLabel":"On this page","testingGoal":"verify horizontal scrolling without breaking the reading shell"}',
            ]),
          },
        ],
      },
      {
        // 作为右侧导航定位和内容展示的锚点，id 需要与 outline 中的 id 对应
        id: 'images',
        title: isZh ? '图片系统' : 'Image system',

        blocks: [
          {
            ...defaultImage,
            id: 'image-default-preview',
            caption: isZh
              ? '标准图片块，用来验证独立图片内容在正文壳层里的排版、边框和说明文字节奏。'
              : 'Default image block used to validate standalone visual content, framing, and caption rhythm inside the docs shell.',
          },
          {
            ...exampleImage,
            id: 'image-example-preview',
            caption: isZh
              ? '第二张图片用于比较另一类视觉参考在同一正文结构下的表现，方便后续接真实截图或设计稿。'
              : 'The second image block compares another visual reference style so we can later swap in real screenshots or design captures.',
          },
        ],
      },
    ],
  };
}
