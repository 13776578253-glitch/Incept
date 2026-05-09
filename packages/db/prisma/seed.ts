import {
  PrismaClient,
  DocAccessRole,
  DocKind,
  DocLayoutMode,
  DocStatus,
} from "../generated/client/index.js";

const prisma = new PrismaClient();

const CANONICAL_REFERENCE_SLUG = "document-shells";

const referenceBody = {
  sections: [
    {
      id: "overview",
      title: "Why a reusable document shell matters",
      description:
        "The shell is not cosmetic. It is the thing that lets the docs surface feel coherent as the library grows.",
      blocks: [
        {
          id: "overview-p-1",
          type: "paragraph",
          text: "A stable shell lets the docs system grow without redesigning each article from scratch.",
        },
        {
          id: "overview-p-2",
          type: "paragraph",
          text: "Once multiple article types begin to coexist, the shell becomes the contract between navigation, reading rhythm, metadata, and page-level behavior. If that contract stays unstable, each new piece of content forces another one-off visual decision.",
        },
        {
          id: "overview-list-1",
          type: "list",
          items: [
            "Sidebar pages can support guided knowledge structures.",
            "Content-only pages can stay lightweight for standalone articles.",
            "A shared right rail keeps heading navigation consistent.",
          ],
        },
        {
          id: "overview-callout-1",
          type: "callout",
          tone: "tip",
          title: "What the shell should solve",
          text: "A good document shell answers where the user is, how the page is organized, and what kind of reading mode they are currently in before the body text does any work.",
        },
      ],
    },
    {
      id: "layout-modes",
      title: "Two layout modes, one reading system",
      description:
        "The article system already supports sidebar and content-only modes. The shell should make those feel related rather than separate products.",
      blocks: [
        {
          id: "layout-modes-p-1",
          type: "paragraph",
          text: "Sidebar pages are best for structured references, guided reading, and content that benefits from a visible chapter map. Content-only pages are better for notes, essays, and standalone articles that should enter the page with less scaffolding.",
        },
        {
          id: "layout-modes-p-2",
          type: "paragraph",
          text: "The important design constraint is not to make these two modes visually identical. It is to make them feel like members of the same system, with shared spacing logic, typography, and heading behavior.",
        },
        {
          id: "layout-modes-list-1",
          type: "list",
          items: [
            "Sidebar mode should foreground orientation and section hierarchy.",
            "Content-only mode should foreground reading calm and lower interface noise.",
            "Both modes should preserve the same heading scale and paragraph rhythm.",
          ],
        },
      ],
    },
    {
      id: "navigation-contract",
      title: "Navigation has to behave like product structure",
      description:
        "The document shell is not only a content frame. It is also where route structure becomes legible to the reader.",
      blocks: [
        {
          id: "navigation-contract-p-1",
          type: "paragraph",
          text: "A docs system stops feeling improvised when global navigation, docs home, article routes, and local page navigation agree with one another. The shell is where those agreements become visible.",
        },
        {
          id: "navigation-contract-p-2",
          type: "paragraph",
          text: "This is why the difference between /docs, /docs/archive, and /docs/[slug] matters. Even before full content exists, the reader should sense which surface is a landing page, which one is a chronological library, and which one is a document detail route.",
        },
        {
          id: "navigation-contract-callout-1",
          type: "callout",
          tone: "note",
          title: "Navigation rule",
          text: "If route meaning is still blurry, the shell should not hide that ambiguity with decoration. It should make the distinction sharper.",
        },
      ],
    },
    {
      id: "workflow",
      title: "From mock layout to production docs",
      description:
        "The transition path matters because the shell is already carrying real UX even before the writing system is fully live.",
      blocks: [
        {
          id: "workflow-p-1",
          type: "paragraph",
          text: "The first production milestone should preserve the current reading experience while swapping mock data for database-backed queries.",
        },
        {
          id: "workflow-p-2",
          type: "paragraph",
          text: "That means the view model contract has to remain stable while the data source changes underneath it. UI components should not care whether content comes from mock files, Prisma queries, or a future editor pipeline.",
        },
        {
          id: "workflow-list-1",
          type: "list",
          items: [
            "Seed realistic article data early enough to pressure-test scrolling and layout.",
            "Move route loaders to database reads before starting create and publish flows.",
            "Keep permission logic simple at first so the shell can stabilize.",
          ],
        },
        {
          id: "workflow-callout-1",
          type: "callout",
          tone: "note",
          title: "Implementation note",
          text: "Store body content as JSON in v1, then normalize later only if the editor and search requirements demand it.",
        },
      ],
    },
    {
      id: "editorial-rhythm",
      title: "Editorial rhythm is part of the interface",
      description:
        "The page should feel readable before it feels feature-complete.",
      blocks: [
        {
          id: "editorial-rhythm-p-1",
          type: "paragraph",
          text: "The shell has to create a calm reading tempo across headings, paragraphs, lists, and callouts. If the spacing between those blocks is inconsistent, the reader starts processing interface noise instead of content structure.",
        },
        {
          id: "editorial-rhythm-p-2",
          type: "paragraph",
          text: "This also affects how docs home should relate to article pages. The archive does not need to mimic the detail shell, but both surfaces should share enough rhythm that moving between them does not feel like switching products.",
        },
        {
          id: "editorial-rhythm-callout-1",
          type: "callout",
          tone: "tip",
          title: "Practical test",
          text: "A good rhythm survives long paragraphs, locked entries, and section jumps without needing visual gimmicks to stay readable.",
        },
      ],
    },
    {
      id: "permissions",
      title: "Permissions should remain visible but soft",
      description:
        "Restricted content still has to communicate structure without turning the archive into a wall of closures.",
      blocks: [
        {
          id: "permissions-p-1",
          type: "paragraph",
          text: "The current archive keeps locked entries visible so readers can understand what kinds of material exist in the system. This is useful because access boundaries are part of the library's shape, not just an auth concern.",
        },
        {
          id: "permissions-p-2",
          type: "paragraph",
          text: "The shell should support that model by treating restricted content as discoverable but not enterable. The cues need to be clear, but they should not dominate the entire page.",
        },
        {
          id: "permissions-list-1",
          type: "list",
          items: [
            "Keep the title readable enough to preserve discoverability.",
            "Blur or mute the summary to communicate limited access.",
            "Use role labels consistently across home and detail surfaces.",
          ],
        },
      ],
    },
    {
      id: "next-steps",
      title: "What this article should help test next",
      description:
        "This page is a design probe as much as it is a sample reference article.",
      blocks: [
        {
          id: "next-steps-p-1",
          type: "paragraph",
          text: "Now that the shell can hold more content, the next useful tests are not only visual. They include sidebar density, outline stability near the end of the page, heading jump offsets, and how the shell behaves once mixed block types start arriving from real writing workflows.",
        },
        {
          id: "next-steps-p-2",
          type: "paragraph",
          text: "After that, the natural progression is to test authoring assumptions: what new block types are actually needed, what metadata belongs in article headers, and when JSON storage starts becoming a real editing constraint rather than a convenient bootstrap format.",
        },
        {
          id: "next-steps-callout-1",
          type: "callout",
          tone: "warning",
          title: "Do not optimize too early",
          text: "The shell should be tested with longer content, multiple article types, and real navigation depth before introducing heavier abstractions or editor-driven normalization.",
        },
      ],
    },
  ],
};

const referenceSidebar = {
  groups: [
    {
      id: "foundations",
      label: "Foundations",
      defaultOpen: true,
      items: [
        { id: "overview", label: "Overview", href: `/docs/${CANONICAL_REFERENCE_SLUG}` },
        {
          id: "layout-modes",
          label: "Layout modes",
          href: `/docs/${CANONICAL_REFERENCE_SLUG}#layout-modes`,
        },
        {
          id: "navigation-contract",
          label: "Navigation contract",
          href: `/docs/${CANONICAL_REFERENCE_SLUG}#navigation-contract`,
        },
      ],
    },
    {
      id: "implementation",
      label: "Implementation",
      defaultOpen: true,
      items: [
        {
          id: "workflow",
          label: "Workflow",
          href: `/docs/${CANONICAL_REFERENCE_SLUG}#workflow`,
        },
        {
          id: "editorial-rhythm",
          label: "Editorial rhythm",
          href: `/docs/${CANONICAL_REFERENCE_SLUG}#editorial-rhythm`,
        },
        {
          id: "permissions",
          label: "Permissions",
          href: `/docs/${CANONICAL_REFERENCE_SLUG}#permissions`,
        },
      ],
    },
    {
      id: "validation",
      label: "Validation",
      defaultOpen: true,
      items: [
        {
          id: "next-steps",
          label: "Next steps",
          href: `/docs/${CANONICAL_REFERENCE_SLUG}#next-steps`,
        },
      ],
    },
  ],
};

function createMinimalBody(title: string, summary: string) {
  return {
    sections: [
      {
        id: "summary",
        title,
        blocks: [
          {
            id: "summary-p-1",
            type: "paragraph",
            text: summary,
          },
        ],
      },
    ],
  };
}

const docsSeedDocuments = [
  {
    id: 1,
    kind: DocKind.reference,
    layoutMode: DocLayoutMode.sidebar,
    accessRole: DocAccessRole.guest,
    locales: [
      {
        locale: "en",
        slug: CANONICAL_REFERENCE_SLUG,
        eyebrow: "Reference",
        title: "Building a reusable document shell for the docs surface",
        summary:
          "A test article for validating fixed navigation, a reading column, and an outline rail before the reference pattern becomes the default docs interface.",
        publishedAt: new Date("2026-04-28T10:00:00.000Z"),
        bodyJson: referenceBody,
        sidebarJson: referenceSidebar,
        seoTitle: "Building a reusable document shell for the docs surface",
        seoDescription:
          "A sample docs article used to validate the reusable shell.",
      },
      {
        locale: "zh",
        slug: CANONICAL_REFERENCE_SLUG,
        eyebrow: "参考",
        title: "为文档界面构建可复用的阅读壳层",
        summary:
          "用于验证固定导航、正文阅读列与右侧目录栏的一篇测试文章。",
        publishedAt: new Date("2026-04-28T10:00:00.000Z"),
        bodyJson: referenceBody,
        sidebarJson: referenceSidebar,
        seoTitle: "为文档界面构建可复用的阅读壳层",
        seoDescription: "用于验证标准化文档壳层的一篇示例文章。",
      },
    ],
  },
  {
    id: 2,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.member,
    locales: [
      {
        locale: "en",
        slug: "right-rail-rhythm-study",
        eyebrow: "Interface study",
        title: "Balancing right-rail metadata without breaking reading flow",
        summary:
          "Experiments around metadata density, summary length, and how much scaffolding a calm archive page can carry before it feels procedural.",
        publishedAt: new Date("2026-04-16T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Balancing right-rail metadata without breaking reading flow",
          "Experiments around metadata density, summary length, and how much scaffolding a calm archive page can carry before it feels procedural.",
        ),
      },
      {
        locale: "zh",
        slug: "right-rail-rhythm-study",
        eyebrow: "界面研究",
        title: "如何平衡右侧目录信息而不打断阅读流",
        summary:
          "围绕信息密度、摘要长度以及安静型归档页面能承载多少辅助结构的一组实验。",
        publishedAt: new Date("2026-04-16T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "如何平衡右侧目录信息而不打断阅读流",
          "围绕信息密度、摘要长度以及安静型归档页面能承载多少辅助结构的一组实验。",
        ),
      },
    ],
  },
  {
    id: 3,
    kind: DocKind.note,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.pro,
    locales: [
      {
        locale: "en",
        slug: "gated-drafts-and-release-boundaries",
        eyebrow: "Internal draft",
        title: "Gated drafts and release boundaries",
        summary:
          "A working document for deciding when drafts become visible in the archive and which editorial signals indicate restricted access.",
        publishedAt: new Date("2026-04-05T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Gated drafts and release boundaries",
          "A working document for deciding when drafts become visible in the archive and which editorial signals indicate restricted access.",
        ),
      },
      {
        locale: "zh",
        slug: "gated-drafts-and-release-boundaries",
        eyebrow: "内部草案",
        title: "受限草稿与发布边界",
        summary:
          "用于决定草稿何时在归档中可见，以及哪些编辑信号意味着内容需要被限制访问的工作文档。",
        publishedAt: new Date("2026-04-05T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "受限草稿与发布边界",
          "用于决定草稿何时在归档中可见，以及哪些编辑信号意味着内容需要被限制访问的工作文档。",
        ),
      },
    ],
  },
  {
    id: 4,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.guest,
    locales: [
      {
        locale: "en",
        slug: "navigation-review-as-product-surface",
        eyebrow: "Archive note",
        title: "Navigation review as a product surface",
        summary:
          "Archive notes from the pass where navigation stopped being scaffolding and started behaving like a durable product surface.",
        publishedAt: new Date("2025-12-19T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Navigation review as a product surface",
          "Archive notes from the pass where navigation stopped being scaffolding and started behaving like a durable product surface.",
        ),
      },
      {
        locale: "zh",
        slug: "navigation-review-as-product-surface",
        eyebrow: "归档笔记",
        title: "把导航评审当成产品界面",
        summary:
          "记录导航从脚手架转变为长期产品界面的那一轮归档观察。",
        publishedAt: new Date("2025-12-19T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "把导航评审当成产品界面",
          "记录导航从脚手架转变为长期产品界面的那一轮归档观察。",
        ),
      },
    ],
  },
  {
    id: 5,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.member,
    locales: [
      {
        locale: "en",
        slug: "interface-permissions-and-soft-locks",
        eyebrow: "Access memo",
        title: "Interface permissions and soft locks",
        summary:
          "Patterns for showing restricted knowledge without flattening the rest of the archive into anonymous placeholders.",
        publishedAt: new Date("2025-11-03T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Interface permissions and soft locks",
          "Patterns for showing restricted knowledge without flattening the rest of the archive into anonymous placeholders.",
        ),
      },
      {
        locale: "zh",
        slug: "interface-permissions-and-soft-locks",
        eyebrow: "权限备忘",
        title: "界面权限与柔性锁定",
        summary:
          "用于展示受限知识、同时避免把整段归档都压扁成匿名占位的一组模式。",
        publishedAt: new Date("2025-11-03T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "界面权限与柔性锁定",
          "用于展示受限知识、同时避免把整段归档都压扁成匿名占位的一组模式。",
        ),
      },
    ],
  },
  {
    id: 6,
    kind: DocKind.note,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.pro,
    locales: [
      {
        locale: "en",
        slug: "reference-taxonomy-for-shared-systems",
        eyebrow: "Planning draft",
        title: "Reference taxonomy for shared systems",
        summary:
          "A taxonomy pass for deciding what belongs in release notes, references, and archive writing once the documentation surface grows.",
        publishedAt: new Date("2025-09-14T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Reference taxonomy for shared systems",
          "A taxonomy pass for deciding what belongs in release notes, references, and archive writing once the documentation surface grows.",
        ),
      },
      {
        locale: "zh",
        slug: "reference-taxonomy-for-shared-systems",
        eyebrow: "规划草案",
        title: "共享系统的参考文档分类法",
        summary:
          "用于决定文档界面扩张后，哪些内容属于发布说明、参考文档与归档写作的一轮分类梳理。",
        publishedAt: new Date("2025-09-14T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "共享系统的参考文档分类法",
          "用于决定文档界面扩张后，哪些内容属于发布说明、参考文档与归档写作的一轮分类梳理。",
        ),
      },
    ],
  },
  {
    id: 7,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.guest,
    locales: [
      {
        locale: "en",
        slug: "release-notes-with-editorial-rhythm",
        eyebrow: "Release note",
        title: "Release notes with editorial rhythm",
        summary:
          "A pass on turning release notes into something readable enough to live beside essays and references without flattening tone.",
        publishedAt: new Date("2026-03-30T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Release notes with editorial rhythm",
          "A pass on turning release notes into something readable enough to live beside essays and references without flattening tone.",
        ),
      },
      {
        locale: "zh",
        slug: "release-notes-with-editorial-rhythm",
        eyebrow: "发布说明",
        title: "带有编辑节奏的发布说明",
        summary:
          "一轮关于如何让发布说明在不失去可读性的前提下，与随笔和参考文档并排共存的尝试。",
        publishedAt: new Date("2026-03-30T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "带有编辑节奏的发布说明",
          "一轮关于如何让发布说明在不失去可读性的前提下，与随笔和参考文档并排共存的尝试。",
        ),
      },
    ],
  },
  {
    id: 8,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.member,
    locales: [
      {
        locale: "en",
        slug: "archive-entry-density-and-scan-speed",
        eyebrow: "Archive study",
        title: "Archive entry density and scan speed",
        summary:
          "Testing how many cues a document row can carry before the archive starts feeling like a dashboard instead of a reading surface.",
        publishedAt: new Date("2026-03-18T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Archive entry density and scan speed",
          "Testing how many cues a document row can carry before the archive starts feeling like a dashboard instead of a reading surface.",
        ),
      },
      {
        locale: "zh",
        slug: "archive-entry-density-and-scan-speed",
        eyebrow: "归档研究",
        title: "归档条目密度与扫读速度",
        summary:
          "用于测试一条文档记录在变成仪表盘之前，究竟还能承载多少提示信息的一组实验。",
        publishedAt: new Date("2026-03-18T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "归档条目密度与扫读速度",
          "用于测试一条文档记录在变成仪表盘之前，究竟还能承载多少提示信息的一组实验。",
        ),
      },
    ],
  },
  {
    id: 9,
    kind: DocKind.note,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.pro,
    locales: [
      {
        locale: "en",
        slug: "private-taxonomy-for-unreleased-knowledge",
        eyebrow: "Private note",
        title: "Private taxonomy for unreleased knowledge",
        summary:
          "A restricted note about how unfinished research, drafts, and internal references should appear before they are publishable.",
        publishedAt: new Date("2026-02-27T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Private taxonomy for unreleased knowledge",
          "A restricted note about how unfinished research, drafts, and internal references should appear before they are publishable.",
        ),
      },
      {
        locale: "zh",
        slug: "private-taxonomy-for-unreleased-knowledge",
        eyebrow: "私密笔记",
        title: "未发布知识的内部分类法",
        summary:
          "一篇受限笔记，用于讨论未完成研究、草稿与内部参考在正式发布前应如何出现在文档结构里。",
        publishedAt: new Date("2026-02-27T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "未发布知识的内部分类法",
          "一篇受限笔记，用于讨论未完成研究、草稿与内部参考在正式发布前应如何出现在文档结构里。",
        ),
      },
    ],
  },
  {
    id: 10,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.guest,
    locales: [
      {
        locale: "en",
        slug: "document-headers-and-reading-entry-points",
        eyebrow: "Reading note",
        title: "Document headers and reading entry points",
        summary:
          "How much framing belongs above an article before the page stops feeling editorial and starts feeling productized.",
        publishedAt: new Date("2026-02-12T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Document headers and reading entry points",
          "How much framing belongs above an article before the page stops feeling editorial and starts feeling productized.",
        ),
      },
      {
        locale: "zh",
        slug: "document-headers-and-reading-entry-points",
        eyebrow: "阅读笔记",
        title: "文档标题区与阅读入口",
        summary:
          "关于一篇文章在进入正文之前，顶部到底应该承载多少框架信息的一轮梳理。",
        publishedAt: new Date("2026-02-12T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "文档标题区与阅读入口",
          "关于一篇文章在进入正文之前，顶部到底应该承载多少框架信息的一轮梳理。",
        ),
      },
    ],
  },
  {
    id: 11,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.member,
    locales: [
      {
        locale: "en",
        slug: "growing-a-library-without-dashboard-gravity",
        eyebrow: "Library memo",
        title: "Growing a library without dashboard gravity",
        summary:
          "Notes on how a docs surface can scale in count without inheriting the visual behavior of an operations console.",
        publishedAt: new Date("2026-01-24T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Growing a library without dashboard gravity",
          "Notes on how a docs surface can scale in count without inheriting the visual behavior of an operations console.",
        ),
      },
      {
        locale: "zh",
        slug: "growing-a-library-without-dashboard-gravity",
        eyebrow: "文库备忘",
        title: "如何扩展文库而不滑向仪表盘",
        summary:
          "记录文档界面在条目数量增长后，如何避免继承操作台视觉惯性的几条判断。",
        publishedAt: new Date("2026-01-24T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "如何扩展文库而不滑向仪表盘",
          "记录文档界面在条目数量增长后，如何避免继承操作台视觉惯性的几条判断。",
        ),
      },
    ],
  },
  {
    id: 12,
    kind: DocKind.note,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.pro,
    locales: [
      {
        locale: "en",
        slug: "soft-lock-language-and-reader-trust",
        eyebrow: "Internal memo",
        title: "Soft-lock language and reader trust",
        summary:
          "Restricted notes on which labels communicate access boundaries without making the archive feel hostile or opaque.",
        publishedAt: new Date("2025-10-02T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Soft-lock language and reader trust",
          "Restricted notes on which labels communicate access boundaries without making the archive feel hostile or opaque.",
        ),
      },
      {
        locale: "zh",
        slug: "soft-lock-language-and-reader-trust",
        eyebrow: "内部备忘",
        title: "柔性锁定文案与读者信任",
        summary:
          "一篇受限笔记，讨论哪些权限提示既能传达边界，又不会让归档页面显得生硬和封闭。",
        publishedAt: new Date("2025-10-02T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "柔性锁定文案与读者信任",
          "一篇受限笔记，讨论哪些权限提示既能传达边界，又不会让归档页面显得生硬和封闭。",
        ),
      },
    ],
  },
  {
    id: 13,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.guest,
    locales: [
      {
        locale: "en",
        slug: "long-form-archives-versus-reference-libraries",
        eyebrow: "Structure note",
        title: "Long-form archives versus reference libraries",
        summary:
          "A comparison of archive-driven publishing and reference-driven publishing once the docs surface begins to branch.",
        publishedAt: new Date("2025-08-20T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Long-form archives versus reference libraries",
          "A comparison of archive-driven publishing and reference-driven publishing once the docs surface begins to branch.",
        ),
      },
      {
        locale: "zh",
        slug: "long-form-archives-versus-reference-libraries",
        eyebrow: "结构笔记",
        title: "长文归档与参考文库的区别",
        summary:
          "比较归档型发布与参考型发布在文档界面开始分叉之后，会分别形成怎样的阅读结构。",
        publishedAt: new Date("2025-08-20T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "长文归档与参考文库的区别",
          "比较归档型发布与参考型发布在文档界面开始分叉之后，会分别形成怎样的阅读结构。",
        ),
      },
    ],
  },
  {
    id: 14,
    kind: DocKind.article,
    layoutMode: DocLayoutMode.contentOnly,
    accessRole: DocAccessRole.member,
    locales: [
      {
        locale: "en",
        slug: "sequencing-docs-home-before-editor-workflows",
        eyebrow: "Planning note",
        title: "Sequencing docs home before editor workflows",
        summary:
          "Why the archive and reading shell should stabilize before create, publish, and editor-facing workflows start expanding the system.",
        publishedAt: new Date("2025-07-11T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "Sequencing docs home before editor workflows",
          "Why the archive and reading shell should stabilize before create, publish, and editor-facing workflows start expanding the system.",
        ),
      },
      {
        locale: "zh",
        slug: "sequencing-docs-home-before-editor-workflows",
        eyebrow: "规划笔记",
        title: "先稳定 docs 首页，再扩编辑流",
        summary:
          "说明为什么应该先把归档首页与阅读壳层稳定下来，再扩 create、publish 和编辑端流程。",
        publishedAt: new Date("2025-07-11T10:00:00.000Z"),
        bodyJson: createMinimalBody(
          "先稳定 docs 首页，再扩编辑流",
          "说明为什么应该先把归档首页与阅读壳层稳定下来，再扩 create、publish 和编辑端流程。",
        ),
      },
    ],
  },
] as const;

function toLocaleCreateInput(
  localeRow: (typeof docsSeedDocuments)[number]["locales"][number],
) {
  return {
    locale: localeRow.locale,
    slug: localeRow.slug,
    eyebrow: localeRow.eyebrow,
    title: localeRow.title,
    summary: localeRow.summary,
    status: DocStatus.published,
    publishedAt: localeRow.publishedAt,
    bodyJson: localeRow.bodyJson,
    ...("sidebarJson" in localeRow ? { sidebarJson: localeRow.sidebarJson } : {}),
    ...("seoTitle" in localeRow ? { seoTitle: localeRow.seoTitle } : {}),
    ...("seoDescription" in localeRow
      ? { seoDescription: localeRow.seoDescription }
      : {}),
  };
}

async function main() {
  const systemUser = await prisma.user.upsert({
    where: { username: "system" },
    update: { role: "admin" },
    create: {
      username: "system",
      role: "admin",
    },
  });

  for (const document of docsSeedDocuments) {
    await prisma.docsDocument.upsert({
      where: { id: document.id },
      update: {
        kind: document.kind,
        layoutMode: document.layoutMode,
        accessRole: document.accessRole,
        createdById: systemUser.id,
        locales: {
          deleteMany: {},
          create: document.locales.map(toLocaleCreateInput),
        },
      },
      create: {
        id: document.id,
        kind: document.kind,
        layoutMode: document.layoutMode,
        accessRole: document.accessRole,
        createdById: systemUser.id,
        locales: {
          create: document.locales.map(toLocaleCreateInput),
        },
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
