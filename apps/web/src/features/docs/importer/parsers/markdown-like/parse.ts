import type {
  DocsCalloutVariant,
  DocsCodeVariant,
  DocsContentBlockModel,
  DocsParagraphInlineModel,
  DocsParagraphSpacing,
  DocsParagraphVariant,
} from '@/features/docs/block-system/schema';

import type {
  DocsAccessRole,
  DocsLayoutMode,
} from '@/features/docs/shared/types';

import type {
  DocsImportArticleSource,
  DocsImportKind,
} from '../../types';

import type { MarkdownLikeParseIssue } from './errors';
import { MarkdownLikeParseError } from './errors';

import {
  markdownLikeAllowedAccessRoles,
  markdownLikeAllowedCalloutTones,
  markdownLikeAllowedCalloutVariants,
  markdownLikeAllowedCodeVariants,
  markdownLikeAllowedDividerVariants,
  markdownLikeAllowedFrontmatterKeys,
  markdownLikeAllowedKinds,
  markdownLikeAllowedLayoutModes,
  markdownLikeAllowedParagraphSpacings,
  markdownLikeAllowedParagraphVariants,
  markdownLikeRequiredFrontmatterKeys,
} from './syntax';

type FrontmatterRecord = Record<string, string>;

type WorkingSection = {
  id: string;
  title: string;
  description?: string;
  blocks: DocsContentBlockModel[];
};

type ParseState = {
  lines: string[];
  issues: MarkdownLikeParseIssue[];
  sections: WorkingSection[];
  section?: WorkingSection;
  blockIndex: number;
  checklistItemIndex: number;
};

// 核心功能：解析 Markdown-like 和 转换成 DocsImportArticleSource

// 建议拆分
// TODO: 解析 Markdown-like 和 转换成 DocsImportArticleSource 可以拆分成两个阶段，先解析成中间结构，再转换成 DocsImportArticleSource

// parse.ts      只负责 raw text -> markdown-like AST
// to-source.ts  只负责 AST -> DocsImportArticleSource

function addIssue(
  issues: MarkdownLikeParseIssue[],
  line: number,
  code: MarkdownLikeParseIssue['code'],
  message: string,
) {
  issues.push({ code, line, message });
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[`'"()[\]{}]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section';
}

function unquote(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseFrontmatter(raw: string): {
  frontmatter: FrontmatterRecord;
  contentStartLine: number;
  issues: MarkdownLikeParseIssue[];
} {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const issues: MarkdownLikeParseIssue[] = [];

  if (lines[0]?.trim() !== '---') {
    addIssue(
      issues,
      1,
      'missing_frontmatter',
      'Markdown-like source must start with frontmatter delimited by ---.',
    );
    return { frontmatter: {}, contentStartLine: 1, issues };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === '---');

  if (endIndex === -1) {
    addIssue(
      issues,
      1,
      'invalid_frontmatter',
      'Frontmatter must be closed with ---.',
    );
    return { frontmatter: {}, contentStartLine: lines.length + 1, issues };
  }

  const frontmatter: FrontmatterRecord = {};

  for (let index = 1; index < endIndex; index += 1) {
    const line = lines[index];

    if (!line.trim()) {
      continue;
    }

    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);

    if (!match) {
      addIssue(
        issues,
        index + 1,
        'invalid_frontmatter',
        'Frontmatter fields must use key: value syntax.',
      );
      continue;
    }

    const [, key, value] = match;
    frontmatter[key] = unquote(value);
  }

  for (const key of Object.keys(frontmatter)) {
    if (!markdownLikeAllowedFrontmatterKeys.has(key)) {
      addIssue(
        issues,
        1,
        'unsupported_frontmatter_field',
        `Unsupported frontmatter field "${key}" in markdown-like v1.`,
      );
    }
  }

  for (const key of markdownLikeRequiredFrontmatterKeys) {
    if (!frontmatter[key]?.trim()) {
      addIssue(
        issues,
        1,
        'missing_frontmatter_field',
        `Frontmatter must provide a non-empty ${key}.`,
      );
    }
  }

  return {
    frontmatter,
    contentStartLine: endIndex + 2,
    issues,
  };
}

function parseAttributes(raw: string) {
  const attrs: Record<string, string> = {};
  const attrPattern = /([A-Za-z][A-Za-z0-9_-]*)=(?:"([^"]*)"|'([^']*)'|([^\s]+))/g;
  let match: RegExpExecArray | null;

  while ((match = attrPattern.exec(raw)) !== null) {
    attrs[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }

  return attrs;
}

function parseInlineContent(text: string): DocsParagraphInlineModel[] {
  const content: DocsParagraphInlineModel[] = [];
  const pattern = /(\[[^\]]+\]\([^)]+\)|`[^`]+`|==[^=]+==|~~[^~]+~~)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      content.push({
        type: 'text',
        text: text.slice(cursor, match.index),
      });
    }

    const token = match[0];

    if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

      if (linkMatch) {
        const href = linkMatch[2];
        content.push({
          type: 'link',
          label: linkMatch[1],
          href,
          external: /^https?:\/\//.test(href),
        });
      }
    } else if (token.startsWith('`')) {
      content.push({
        type: 'inlineCode',
        code: token.slice(1, -1),
      });
    } else if (token.startsWith('==')) {
      content.push({
        type: 'mark',
        text: token.slice(2, -2),
      });
    } else if (token.startsWith('~~')) {
      content.push({
        type: 'delete',
        text: token.slice(2, -2),
      });
    }

    cursor = match.index + token.length;
  }

  if (cursor < text.length) {
    content.push({
      type: 'text',
      text: text.slice(cursor),
    });
  }

  return content;
}

function reportUnsupportedInlineSyntax(
  issues: MarkdownLikeParseIssue[],
  text: string,
  line: number,
) {
  if (/\*\*[^*]+\*\*/.test(text)) {
    addIssue(
      issues,
      line,
      'unsupported_syntax',
      'Bold syntax **text** is not supported in markdown-like v1.',
    );
  }

  if (/(^|[^*_])_[^_\s][^_]*_([^*_]|$)/.test(text) || /(^|[^*])\*[^*\s][^*]*\*([^*]|$)/.test(text)) {
    addIssue(
      issues,
      line,
      'unsupported_syntax',
      'Italic syntax is not supported in markdown-like v1.',
    );
  }
}

function makeBlockId(section: WorkingSection, state: ParseState, type: string, seed?: string) {
  state.blockIndex += 1;
  const readableSuffix = seed ? slugify(seed).slice(0, 36) : '';
  const stablePrefix = `${section.id}-${type}-${state.blockIndex}`;

  return readableSuffix ? `${stablePrefix}-${readableSuffix}` : stablePrefix;
}

function ensureSection(state: ParseState, line: number) {
  if (state.section) {
    return state.section;
  }

  addIssue(
    state.issues,
    line,
    'content_before_section',
    'Content blocks must appear after a # section heading.',
  );

  const section: WorkingSection = {
    id: 'untitled',
    title: 'Untitled',
    blocks: [],
  };
  state.section = section;
  state.sections.push(section);

  return section;
}

function pushParagraph(state: ParseState, text: string, line: number) {
  const attrsMatch = text.match(/^\{paragraph\s+([^}]+)\}\s*(.*)$/);
  const attrs = attrsMatch ? parseAttributes(attrsMatch[1]) : {};
  const paragraphText = attrsMatch ? attrsMatch[2] : text;

  if (attrs.variant && !markdownLikeAllowedParagraphVariants.has(attrs.variant)) {
    addIssue(
      state.issues,
      line,
      'unsupported_syntax',
      `Unsupported paragraph variant "${attrs.variant}".`,
    );
  }

  if (attrs.spacing && !markdownLikeAllowedParagraphSpacings.has(attrs.spacing)) {
    addIssue(
      state.issues,
      line,
      'unsupported_syntax',
      `Unsupported paragraph spacing "${attrs.spacing}".`,
    );
  }

  const section = ensureSection(state, line);
  const content = parseInlineContent(paragraphText);
  reportUnsupportedInlineSyntax(state.issues, paragraphText, line);

  section.blocks.push({
    id: makeBlockId(section, state, 'paragraph', paragraphText),
    type: 'paragraph',
    variant: (attrs.variant as DocsParagraphVariant | undefined) ?? 'default',
    spacing: (attrs.spacing as DocsParagraphSpacing | undefined) ?? 'default',
    content,
  });
}

function parseList(state: ParseState, startIndex: number, ordered: boolean) {
  const section = ensureSection(state, startIndex + 1);
  const items: string[] = [];
  let index = startIndex;
  const pattern = ordered ? /^\s*\d+\.\s+(.+)$/ : /^\s*-\s+(.+)$/;

  while (index < state.lines.length) {
    const match = state.lines[index].match(pattern);

    if (!match || /^\s*-\s+\[[ xX]\]\s+/.test(state.lines[index])) {
      break;
    }

    items.push(match[1].trim());
    index += 1;
  }

  section.blocks.push({
    id: makeBlockId(section, state, 'list', items[0]),
    type: 'list',
    listStyle: ordered ? 'ordered' : 'unordered',
    variant: 'default',
    items,
  });

  return index;
}

function parseChecklist(state: ParseState, startIndex: number) {
  const section = ensureSection(state, startIndex + 1);
  const items = [];
  let index = startIndex;

  while (index < state.lines.length) {
    const match = state.lines[index].match(/^\s*-\s+\[([ xX])\]\s+(.+)$/);

    if (!match) {
      break;
    }

    state.checklistItemIndex += 1;
    items.push({
      id: `${section.id}-checklist-item-${state.checklistItemIndex}`,
      checked: match[1].toLowerCase() === 'x',
      text: match[2].trim(),
    });
    index += 1;
  }

  section.blocks.push({
    id: makeBlockId(section, state, 'checklist', items[0]?.text),
    type: 'checklist',
    variant: 'default',
    items,
  });

  return index;
}

function parseQuote(state: ParseState, startIndex: number) {
  const section = ensureSection(state, startIndex + 1);
  const lines = [];
  let index = startIndex;

  while (index < state.lines.length) {
    const match = state.lines[index].match(/^>\s?(.*)$/);

    if (!match) {
      break;
    }

    lines.push(match[1]);
    index += 1;
  }

  section.blocks.push({
    id: makeBlockId(section, state, 'quote', lines[0]),
    type: 'quote',
    text: lines.join('\n').trim(),
  });

  return index;
}

function parseCode(state: ParseState, startIndex: number) {
  const open = state.lines[startIndex];
  const match = open.match(/^```([A-Za-z0-9_-]*)?(.*)$/);
  const language = match?.[1] || 'text';
  const attrs = parseAttributes(match?.[2] ?? '');
  const codeLines = [];
  let index = startIndex + 1;

  while (index < state.lines.length && state.lines[index].trim() !== '```') {
    codeLines.push(state.lines[index]);
    index += 1;
  }

  if (index >= state.lines.length) {
    addIssue(
      state.issues,
      startIndex + 1,
      'unclosed_code_fence',
      'Code fence must be closed with ```.',
    );
    return state.lines.length;
  }

  if (attrs.variant && !markdownLikeAllowedCodeVariants.has(attrs.variant)) {
    addIssue(
      state.issues,
      startIndex + 1,
      'unsupported_syntax',
      `Unsupported code variant "${attrs.variant}".`,
    );
  }

  const section = ensureSection(state, startIndex + 1);
  section.blocks.push({
    id: makeBlockId(section, state, 'code', attrs.caption ?? language),
    type: 'code',
    language,
    caption: attrs.caption,
    variant: (attrs.variant as DocsCodeVariant | undefined) ?? 'block',
    code: codeLines.join('\n'),
  });

  return index + 1;
}

function parseCallout(state: ParseState, startIndex: number) {
  const open = state.lines[startIndex];
  const match = open.match(/^:::callout\s*(.*)$/);
  const attrs = parseAttributes(match?.[1] ?? '');
  const tone = attrs.tone ?? 'note';
  const variant = attrs.variant ?? 'default';
  const lines = [];
  let index = startIndex + 1;

  while (index < state.lines.length && state.lines[index].trim() !== ':::') {
    lines.push(state.lines[index]);
    index += 1;
  }

  if (index >= state.lines.length) {
    addIssue(
      state.issues,
      startIndex + 1,
      'unclosed_callout',
      'Callout must be closed with :::.',
    );
    return state.lines.length;
  }

  if (!markdownLikeAllowedCalloutTones.has(tone)) {
    addIssue(
      state.issues,
      startIndex + 1,
      'invalid_callout',
      `Unsupported callout tone "${tone}".`,
    );
  }

  if (!markdownLikeAllowedCalloutVariants.has(variant)) {
    addIssue(
      state.issues,
      startIndex + 1,
      'invalid_callout',
      `Unsupported callout variant "${variant}".`,
    );
  }

  const text = lines.join('\n').trim();

  if (!text) {
    addIssue(
      state.issues,
      startIndex + 1,
      'invalid_callout',
      'Callout must contain text.',
    );
  }

  const section = ensureSection(state, startIndex + 1);
  section.blocks.push({
    id: makeBlockId(section, state, 'callout', attrs.title ?? text),
    type: 'callout',
    tone: tone as 'note' | 'tip' | 'attention' | 'warning' | 'meta',
    title: attrs.title ?? 'Note',
    text,
    variant: variant as DocsCalloutVariant,
  });

  return index + 1;
}

function parseImage(state: ParseState, line: string, lineNumber: number) {
  const match = line.match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]+)")?\)$/);

  if (!match) {
    addIssue(
      state.issues,
      lineNumber,
      'invalid_image',
      'Image syntax must be ![alt](src "optional caption").',
    );
    return;
  }

  const [, alt, src, caption] = match;

  if (!alt.trim() || !src.trim()) {
    addIssue(
      state.issues,
      lineNumber,
      'invalid_image',
      'Image must provide non-empty alt text and src.',
    );
  }

  const section = ensureSection(state, lineNumber);
  section.blocks.push({
    id: makeBlockId(section, state, 'image', alt || src),
    type: 'image',
    src,
    alt,
    caption,
  });
}

function parseDivider(state: ParseState, line: string, lineNumber: number) {
  const attrsMatch = line.match(/^---\s*\{([^}]+)\}\s*$/);
  const attrs = attrsMatch ? parseAttributes(attrsMatch[1]) : {};

  if (attrs.variant && !markdownLikeAllowedDividerVariants.has(attrs.variant)) {
    addIssue(
      state.issues,
      lineNumber,
      'unsupported_syntax',
      `Unsupported divider variant "${attrs.variant}".`,
    );
  }

  const section = ensureSection(state, lineNumber);
  section.blocks.push({
    id: makeBlockId(section, state, 'divider'),
    type: 'divider',
    variant: (attrs.variant as 'default' | 'spacious' | undefined) ?? 'default',
  });
}

function parseContent(rawContent: string, contentStartLine: number, initialIssues: MarkdownLikeParseIssue[]) {
  const state: ParseState = {
    lines: rawContent.split('\n'),
    issues: [...initialIssues],
    sections: [],
    blockIndex: 0,
    checklistItemIndex: 0,
  };

  let index = 0;

  while (index < state.lines.length) {
    const rawLine = state.lines[index];
    const line = rawLine.trim();
    const lineNumber = contentStartLine + index;

    if (!line) {
      index += 1;
      continue;
    }

    if (/^<[^>]+>/.test(line)) {
      addIssue(
        state.issues,
        lineNumber,
        'unsupported_html',
        'Raw HTML is not supported in markdown-like docs sources.',
      );
      index += 1;
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      addIssue(
        state.issues,
        lineNumber,
        'unsupported_syntax',
        'Markdown tables are not supported in markdown-like v1.',
      );
      index += 1;
      continue;
    }

    const sectionMatch = line.match(/^#\s+(.+)$/);

    if (sectionMatch) {
      const title = sectionMatch[1].trim();
      const section: WorkingSection = {
        id: slugify(title),
        title,
        blocks: [],
      };
      state.section = section;
      state.sections.push(section);
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{2,4})\s+(.+)$/);

    if (headingMatch) {
      const section = ensureSection(state, lineNumber);
      const text = headingMatch[2].trim();
      section.blocks.push({
        id: makeBlockId(section, state, 'heading', text),
        type: 'heading',
        level: headingMatch[1].length as 2 | 3 | 4,
        text,
        variant: 'default',
      });
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      index = parseCode(state, index);
      continue;
    }

    if (line.startsWith(':::callout')) {
      index = parseCallout(state, index);
      continue;
    }

    if (line.startsWith(':::')) {
      addIssue(
        state.issues,
        lineNumber,
        'unsupported_syntax',
        'Only :::callout containers are supported in markdown-like v1.',
      );
      index += 1;
      continue;
    }

    if (/^\s*-\s+\[[ xX]\]\s+/.test(rawLine)) {
      index = parseChecklist(state, index);
      continue;
    }

    if (/^\s*-\s+/.test(rawLine)) {
      index = parseList(state, index, false);
      continue;
    }

    if (/^\s*\d+\.\s+/.test(rawLine)) {
      index = parseList(state, index, true);
      continue;
    }

    if (line.startsWith('>')) {
      index = parseQuote(state, index);
      continue;
    }

    if (line === '---' || /^---\s*\{/.test(line)) {
      parseDivider(state, line, lineNumber);
      index += 1;
      continue;
    }

    if (line.startsWith('![')) {
      parseImage(state, line, lineNumber);
      index += 1;
      continue;
    }

    const paragraphLines = [line];
    index += 1;

    while (index < state.lines.length) {
      const next = state.lines[index].trim();

      if (
        !next ||
        /^#{1,4}\s+/.test(next) ||
        next.startsWith('```') ||
        next.startsWith(':::') ||
        next.startsWith('>') ||
        /^\s*-\s+/.test(state.lines[index]) ||
        /^\s*\d+\.\s+/.test(state.lines[index]) ||
        next === '---' ||
        /^---\s*\{/.test(next) ||
        next.startsWith('![') ||
        /^<[^>]+>/.test(next) ||
        /^\|.*\|$/.test(next)
      ) {
        break;
      }

      paragraphLines.push(next);
      index += 1;
    }

    pushParagraph(state, paragraphLines.join(' '), lineNumber);
  }

  for (const section of state.sections) {
    if (section.blocks.length === 0) {
      addIssue(
        state.issues,
        contentStartLine,
        'empty_section',
        `Section "${section.title}" must contain at least one content block.`,
      );
    }
  }

  return {
    sections: state.sections,
    issues: state.issues,
  };
}

function buildSource(frontmatter: FrontmatterRecord, sections: WorkingSection[]): DocsImportArticleSource {
  return {
    meta: {
      documentKey: frontmatter.documentKey,
      locale: frontmatter.locale as DocsImportArticleSource['meta']['locale'],
      routeType: 'singleArticle',
      kind: (frontmatter.kind as DocsImportKind | undefined) ?? 'article',
      layoutMode: (frontmatter.layoutMode as DocsLayoutMode | undefined) ?? 'contentOnly',
      accessRole: (frontmatter.accessRole as DocsAccessRole | undefined) ?? 'guest',
      slug: frontmatter.slug,
      title: frontmatter.title,
      summary: frontmatter.summary,
      eyebrow: frontmatter.eyebrow,
      seoTitle: frontmatter.seoTitle,
      seoDescription: frontmatter.seoDescription,
      publishedAt: frontmatter.publishedAt,
    },
    body: {
      sections,
    },
  };
}

function validateFrontmatterValues(frontmatter: FrontmatterRecord, issues: MarkdownLikeParseIssue[]) {
  if (frontmatter.routeType && frontmatter.routeType !== 'singleArticle') {
    addIssue(
      issues,
      1,
      'unsupported_route_type',
      'Markdown-like v1 only supports routeType: singleArticle.',
    );
  }

  if (frontmatter.kind && !markdownLikeAllowedKinds.has(frontmatter.kind)) {
    addIssue(issues, 1, 'invalid_frontmatter', `Unsupported kind "${frontmatter.kind}".`);
  }

  if (frontmatter.layoutMode && !markdownLikeAllowedLayoutModes.has(frontmatter.layoutMode)) {
    addIssue(
      issues,
      1,
      'invalid_frontmatter',
      'Markdown-like v1 only supports layoutMode: contentOnly.',
    );
  }

  if (frontmatter.accessRole && !markdownLikeAllowedAccessRoles.has(frontmatter.accessRole)) {
    addIssue(
      issues,
      1,
      'invalid_frontmatter',
      `Unsupported accessRole "${frontmatter.accessRole}".`,
    );
  }
}

export function parseMarkdownLikeDocsSource(raw: string): DocsImportArticleSource {
  const { frontmatter, contentStartLine, issues } = parseFrontmatter(raw);
  validateFrontmatterValues(frontmatter, issues);

  const content = raw.replace(/\r\n/g, '\n').split('\n').slice(contentStartLine - 1).join('\n');
  const parsedContent = parseContent(content, contentStartLine, issues);

  if (parsedContent.issues.length > 0) {
    throw new MarkdownLikeParseError(parsedContent.issues);
  }

  return buildSource(frontmatter, parsedContent.sections);
}
