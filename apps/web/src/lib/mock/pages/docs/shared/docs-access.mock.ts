// This file contains utility functions and types for determining access to documentation articles based on the viewer's role.
import type {
  MockAccessRole,
  MockDocsArticle,
  MockDocsArchiveGroup,
} from '@/lib/mock/shared/mock-types';

// Define a ranking for access roles to determine if a viewer can access a given article
const accessRoleRank: Record<MockAccessRole, number> = {
  guest: 0,
  member: 1,
  pro: 2,
};

// Function to check if a viewer with a certain role can access an article that requires a specific role
export function canAccessDocsArticle(
  viewerRole: MockAccessRole,
  requiredRole: MockAccessRole,
) {
  return accessRoleRank[viewerRole] >= accessRoleRank[requiredRole];
}

// Types for resolved articles and archive groups that include access information
export type ResolvedMockDocsArticle = MockDocsArticle & {
  isAccessible: boolean;
  href?: string;
};

// Resolved archive group that includes articles with access information, used for rendering the documentation archive page with appropriate access controls.
export type ResolvedMockDocsArchiveGroup = Omit<
  MockDocsArchiveGroup,
  'articles'
> & {
  articles: ResolvedMockDocsArticle[];
};

// Function to resolve access for all articles in the archive groups based on the viewer's role, returning a new structure that indicates which articles are accessible.
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
