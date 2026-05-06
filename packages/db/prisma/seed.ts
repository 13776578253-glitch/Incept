import { PrismaClient, DocAccessRole, DocKind, DocLayoutMode, DocStatus } from "../generated/client/index.js";

const prisma = new PrismaClient();

const articleBody = {
  sections: [
    {
      id: "overview",
      title: "Why a reusable document shell matters",
      blocks: [
        {
          id: "overview-p-1",
          type: "paragraph",
          text: "A stable shell lets the docs system grow without redesigning each article from scratch."
        },
        {
          id: "overview-list-1",
          type: "list",
          items: [
            "Sidebar pages can support guided knowledge structures.",
            "Content-only pages can stay lightweight for standalone articles.",
            "A shared right rail keeps heading navigation consistent."
          ]
        }
      ]
    },
    {
      id: "workflow",
      title: "From mock layout to production docs",
      blocks: [
        {
          id: "workflow-p-1",
          type: "paragraph",
          text: "The first production milestone should preserve the current reading experience while swapping mock data for database-backed queries."
        },
        {
          id: "workflow-callout-1",
          type: "callout",
          tone: "note",
          title: "Implementation note",
          text: "Store body content as JSON in v1, then normalize later only if the editor and search requirements demand it."
        }
      ]
    }
  ]
};

const articleSidebar = {
  groups: [
    {
      id: "foundations",
      label: "Foundations",
      defaultOpen: true,
      items: [
        { id: "overview", label: "Overview", href: "/docs/reference-shell" },
        { id: "workflow", label: "Workflow", href: "/docs/reference-shell#workflow" }
      ]
    }
  ]
};

async function main() {
  const systemUser = await prisma.user.upsert({
    where: { username: "system" },
    update: { role: "admin" },
    create: {
      username: "system",
      role: "admin"
    }
  });

  await prisma.docsDocument.upsert({
    where: { id: 1 },
    update: {
      kind: DocKind.reference,
      layoutMode: DocLayoutMode.sidebar,
      accessRole: DocAccessRole.guest,
      createdById: systemUser.id,
      locales: {
        deleteMany: {},
        create: [
          {
            locale: "en",
            slug: "reference-shell",
            eyebrow: "Reference",
            title: "Reference shell",
            summary: "A test article for the reusable docs reading layout.",
            status: DocStatus.published,
            publishedAt: new Date("2026-05-06T10:00:00.000Z"),
            bodyJson: articleBody,
            sidebarJson: articleSidebar,
            seoTitle: "Reference shell",
            seoDescription: "A sample docs article used to validate the reusable shell."
          },
          {
            locale: "zh",
            slug: "reference-shell",
            eyebrow: "参考",
            title: "参考文档壳层",
            summary: "用于验证复用型文档阅读界面的测试文章。",
            status: DocStatus.published,
            publishedAt: new Date("2026-05-06T10:00:00.000Z"),
            bodyJson: articleBody,
            sidebarJson: articleSidebar,
            seoTitle: "参考文档壳层",
            seoDescription: "用于验证标准化文档壳层的一篇示例文章。"
          }
        ]
      }
    },
    create: {
      id: 1,
      kind: DocKind.reference,
      layoutMode: DocLayoutMode.sidebar,
      accessRole: DocAccessRole.guest,
      createdById: systemUser.id,
      locales: {
        create: [
          {
            locale: "en",
            slug: "reference-shell",
            eyebrow: "Reference",
            title: "Reference shell",
            summary: "A test article for the reusable docs reading layout.",
            status: DocStatus.published,
            publishedAt: new Date("2026-05-06T10:00:00.000Z"),
            bodyJson: articleBody,
            sidebarJson: articleSidebar,
            seoTitle: "Reference shell",
            seoDescription: "A sample docs article used to validate the reusable shell."
          },
          {
            locale: "zh",
            slug: "reference-shell",
            eyebrow: "参考",
            title: "参考文档壳层",
            summary: "用于验证复用型文档阅读界面的测试文章。",
            status: DocStatus.published,
            publishedAt: new Date("2026-05-06T10:00:00.000Z"),
            bodyJson: articleBody,
            sidebarJson: articleSidebar,
            seoTitle: "参考文档壳层",
            seoDescription: "用于验证标准化文档壳层的一篇示例文章。"
          }
        ]
      }
    }
  });

  await prisma.docsDocument.upsert({
    where: { id: 2 },
    update: {
      kind: DocKind.article,
      layoutMode: DocLayoutMode.contentOnly,
      accessRole: DocAccessRole.member,
      createdById: systemUser.id
    },
    create: {
      id: 2,
      kind: DocKind.article,
      layoutMode: DocLayoutMode.contentOnly,
      accessRole: DocAccessRole.member,
      createdById: systemUser.id
    }
  });

  await prisma.docsDocument.upsert({
    where: { id: 3 },
    update: {
      kind: DocKind.note,
      layoutMode: DocLayoutMode.contentOnly,
      accessRole: DocAccessRole.pro,
      createdById: systemUser.id
    },
    create: {
      id: 3,
      kind: DocKind.note,
      layoutMode: DocLayoutMode.contentOnly,
      accessRole: DocAccessRole.pro,
      createdById: systemUser.id
    }
  });
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
