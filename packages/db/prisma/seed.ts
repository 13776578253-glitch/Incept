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
      blocks: [
        {
          id: "overview-p-1",
          type: "paragraph",
          text: "A stable shell lets the docs system grow without redesigning each article from scratch.",
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
      ],
    },
    {
      id: "workflow",
      title: "From mock layout to production docs",
      blocks: [
        {
          id: "workflow-p-1",
          type: "paragraph",
          text: "The first production milestone should preserve the current reading experience while swapping mock data for database-backed queries.",
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
          id: "workflow",
          label: "Workflow",
          href: `/docs/${CANONICAL_REFERENCE_SLUG}#workflow`,
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
