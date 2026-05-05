import type {
  MockAccessRole,
  MockDocsArticle,
  MockDocsArchiveGroup,
} from '@/lib/mock/shared/mock-types';

const accessRoleRank: Record<MockAccessRole, number> = {
  guest: 0,
  member: 1,
  pro: 2,
};

export function canAccessDocsArticle(
  viewerRole: MockAccessRole,
  requiredRole: MockAccessRole,
) {
  return accessRoleRank[viewerRole] >= accessRoleRank[requiredRole];
}

export type ResolvedMockDocsArticle = MockDocsArticle & {
  isAccessible: boolean;
};

export type ResolvedMockDocsArchiveGroup = Omit<
  MockDocsArchiveGroup,
  'articles'
> & {
  articles: ResolvedMockDocsArticle[];
};

export function resolveDocsArchiveAccess(
  groups: MockDocsArchiveGroup[],
  viewerRole: MockAccessRole,
): ResolvedMockDocsArchiveGroup[] {
  return groups.map((group) => ({
    ...group,
    articles: group.articles.map((article) => ({
      ...article,
      isAccessible: canAccessDocsArticle(viewerRole, article.requiredRole),
    })),
  }));
}
