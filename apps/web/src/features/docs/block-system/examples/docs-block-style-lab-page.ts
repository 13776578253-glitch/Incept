import type { AppLocale } from '@/i18n/config/locales';
import type { DocsArticlePageModel } from '@/features/docs/shared/types';
import { docsBlockCatalog } from '../catalog';
import type { DocsContentBlockModel } from '../schema';

// 根据 block 类型从目录中获取对应的内容块模型，默认为 defaultPayload，可以选择 examplePayload 进行展示
// 服务于样式实验室页面/style-lab，方便快速对比不同类型和变体的内容块样式 / 半保留结构

// 测试界面地址：http://localhost:3000/en/docs/style-lab

// TODO: 目前这种通过目录获取内容块的方式比较 hacky，后续可以考虑更直接地在样式实验室页面中定义需要展示的内容块数据
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

  return {

    // 基础页面信息 / 外层元数据 / 主要用于路由和页面结构，内容块数据在 sections 内定义
    id: 'docs-block-style-lab',
    slug: 'style-lab',
    routeType: 'singleArticle',
    layoutMode: 'contentOnly',

    eyebrow: isZh ? '格式目录' : 'Style lab',
    title: isZh ? '测试页面' : 'Test page',

    // description: isZh
    //   ? '当前先只保留标题块测试，用于逐条验证 level 与 variant 的视觉结构。'
    //   : 'This page is currently narrowed to heading-only testing so level and variant can be reviewed one by one.',

    outlineLabel: isZh ? '本页目录' : 'On this page',
    sidebarGroups: [],
    outline: [
      { id: 'headings', label: isZh ? '标题系统' : 'Heading system' },
      { id: 'paragraphs', label: isZh ? '段落系统' : 'Paragraph system' },
    ],

   /*
   * 内容块数据，按照 section 进行分组，每个 section 包含一个标题和多个内容块，内容块的数据结构根据类型不同而不同
   * section.title / 顶层小节标题
   * page
      -> sections[]
        -> blocks[]
          - type: 'paragraph' | 'list' | 'callout' | 'heading' | 'quote' | 'code' | 'divider'
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
          // 强化段落
          {
            ...exampleParagraph,
            id: 'paragraph-lead-wide',
            variant: 'lead',
            width: 'wide',
            spacing: 'relaxed',
            text: isZh
              ? '这是 lead 段落，用来测试段落在更强存在感、更宽测度和更松行距下的阅读节奏。它不追求信息密度，而是先帮助我们观察段落开场时的呼吸感。'
              : 'This lead paragraph tests how a paragraph opens with more presence, a wider measure, and relaxed line rhythm. It is intentionally calm so we can judge the opening cadence before we judge the styling details.',
          },
          // 标准段落
          {
            ...defaultParagraph,
            id: 'paragraph-default-measure',
            variant: 'default',
            width: 'default',
            spacing: 'default',
            text: isZh
              ? '这是标准正文段落，用来观察默认测度、默认字色和默认行距是否足够稳定。后续如果正文大量出现，这一型会成为最核心的基线。'
              : 'This standard paragraph is the baseline check for default measure, default text color, and default line height. If long-form docs grow from here, this is the paragraph shape that will carry most of the reading load.',
          },
          // 大行距标准段落
          {
            ...defaultParagraph,
            id: 'paragraph-default-relaxed',
            variant: 'default',
            width: 'default',
            spacing: 'relaxed',
            text: isZh
              ? '这是默认正文加 relaxed 行距的测试，用来判断在长解释段中，是否需要比标准段更松一点的呼吸空间。如果它显得更适合阅读，我们再决定是否把 relaxed 作为部分长文段落的常用选项。'
              : 'This paragraph keeps the default body voice but switches to relaxed spacing. It helps us judge whether longer explanatory passages need more breathing room than the standard body rhythm provides.',
          },
          // 弱化段落
          {
            ...defaultParagraph,
            id: 'paragraph-muted-narrow',
            variant: 'muted',
            width: 'narrow',
            spacing: 'default',
            text: isZh
              ? '这是 muted 段落，用来测试较弱信息层级的说明文字。这里同时配合较窄测度，便于观察补充说明、注释段或次级说明在正文体系中的存在感。'
              : 'This muted paragraph is meant for secondary explanation. It uses a narrower measure so we can judge how support text, side reasoning, or lower-priority notes sit inside the broader prose system.',
          },
          
        ],
      },
    ],
  };
}
