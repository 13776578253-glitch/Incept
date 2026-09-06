import type { DocsContentBlockModel } from '@/features/docs/block-system';
import type { DocsOutlineItemModel } from './types';

type OutlineSectionSource = {
  id: string;
  title: string;
  blocks: DocsContentBlockModel[];
};

/**
 * Keep sections as the top-level outline and nest body headings by their
 * Markdown-like level. The stored section and block IDs are never changed.
 */
export function buildDocsOutline(
  sections: OutlineSectionSource[],
): DocsOutlineItemModel[] {
  return sections.map((section) => {
    const sectionItem: DocsOutlineItemModel = {
      id: section.id,
      label: section.title,
    };
    const headingStack: DocsOutlineItemModel[] = [];

    for (const block of section.blocks) {
      if (block.type !== 'heading') {
        continue;
      }

      const heading: DocsOutlineItemModel = {
        id: block.id,
        label: block.text,
        level: block.level,
      };

      while (
        headingStack.length > 0 &&
        (headingStack.at(-1)?.level ?? 0) >= block.level
      ) {
        headingStack.pop();
      }

      const parent = headingStack.at(-1);
      if (parent) {
        parent.children ??= [];
        parent.children.push(heading);
      } else {
        sectionItem.children ??= [];
        sectionItem.children.push(heading);
      }

      headingStack.push(heading);
    }

    return sectionItem;
  });
}
