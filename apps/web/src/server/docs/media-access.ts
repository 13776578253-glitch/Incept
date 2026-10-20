import 'server-only';
import { prisma } from '@incept/db';
import { canAccessDocsArticle } from './access';
import type { DocsAccessRole } from '@/features/docs/shared/types';

// Only references in published, currently accessible content authorize a media URL.
export async function canReadDocsMedia(url: string, viewerRole: DocsAccessRole) {
  const rows = await prisma.$queryRaw<Array<{ articleRole: DocsAccessRole; collectionRole: DocsAccessRole | null;
    itemActive: boolean | null; collectionPublished: boolean }>>`
    SELECT DISTINCT d."accessRole"::text AS "articleRole", c."accessRole"::text AS "collectionRole",
      i."isActive" AS "itemActive", EXISTS (
        SELECT 1 FROM docs_collection_locales cl WHERE cl."collectionId" = c.id
        AND cl.locale = l.locale AND cl.status = 'published'
      ) AS "collectionPublished"
    FROM docs_document_locales l JOIN docs_documents d ON d.id = l."documentId"
    LEFT JOIN docs_collection_items i ON i."documentId" = d.id
    LEFT JOIN docs_collections c ON c.id = i."collectionId"
    WHERE l.status = 'published' AND jsonb_path_exists(l."bodyJson",
      '$.sections[*].blocks[*] ? (@.type == "image" && @.src == $url)', jsonb_build_object('url', ${url}::text), true)
  `;
  return rows.some(row => {
    return canAccessDocsArticle(viewerRole, row.articleRole) && (row.collectionRole === null || (
      row.itemActive && row.collectionPublished && canAccessDocsArticle(viewerRole, row.collectionRole)));
  });
}
