import { createHighlighter } from 'shiki';
import { docsCodePalettes, type DocsCodePalette } from './palette';

const docsHighlightLanguages = [
  'bash',
  'c',
  'cpp',
  'css',
  'go',
  'html',
  'javascript',
  'json',
  'jsx',
  'markdown',
  'powershell',
  'python',
  'sql',
  'tsx',
  'typescript',
  'yaml',
] as const;

type DocsHighlightLanguage = (typeof docsHighlightLanguages)[number];

const languageAliases: Record<string, DocsHighlightLanguage> = {
  bash: 'bash',
  c: 'c',
  cpp: 'cpp',
  'c++': 'cpp',
  css: 'css',
  go: 'go',
  html: 'html',
  js: 'javascript',
  javascript: 'javascript',
  json: 'json',
  jsx: 'jsx',
  markdown: 'markdown',
  md: 'markdown',
  powershell: 'powershell',
  ps: 'powershell',
  ps1: 'powershell',
  pwsh: 'powershell',
  py: 'python',
  python: 'python',
  sh: 'bash',
  shell: 'bash',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  yaml: 'yaml',
  yml: 'yaml',
};

type DocsCodeStyle = Record<string, string>;

export type DocsHighlightedCode = {
  lines: Array<
    Array<{
      content: string;
      style: DocsCodeStyle;
    }>
  >;
  style: DocsCodeStyle;
};

let highlighterPromise: ReturnType<typeof createHighlighter> | undefined;

function getDocsCodeHighlighter() {
  highlighterPromise ??= createHighlighter({
    themes: [
      'light-plus',
      'dark-plus',
      'github-light',
      'github-dark',
      'vitesse-light',
      'vitesse-dark',
      'rose-pine-dawn',
    ],
    langs: [...docsHighlightLanguages],
  });

  return highlighterPromise;
}

function toStyleRecord(
  value: string,
  lightCustomProperty: '--shiki-light' | '--shiki-light-bg',
) {
  const [baseValue, ...customProperties] = value.split(';');
  const style: DocsCodeStyle = {
    [lightCustomProperty]: baseValue,
  };

  for (const customProperty of customProperties) {
    const separatorIndex = customProperty.indexOf(':');
    if (separatorIndex === -1) {
      continue;
    }

    style[customProperty.slice(0, separatorIndex)] = customProperty.slice(separatorIndex + 1);
  }

  return style;
}

export function normalizeDocsCodeLanguage(language: string): DocsHighlightLanguage | null {
  return languageAliases[language.trim().toLowerCase()] ?? null;
}

export async function highlightDocsCode(
  code: string,
  language: string,
  palette: DocsCodePalette = 'vscode',
): Promise<DocsHighlightedCode | null> {
  const normalizedLanguage = normalizeDocsCodeLanguage(language);

  if (!normalizedLanguage) {
    return null;
  }

  const highlighter = await getDocsCodeHighlighter();
  const selectedPalette = docsCodePalettes[palette];
  const highlighted = highlighter.codeToTokens(code, {
    lang: normalizedLanguage,
    themes: {
      light: selectedPalette.light,
      dark: selectedPalette.dark,
      warm: selectedPalette.warm,
    },
  });

  return {
    lines: highlighted.tokens.map((line) =>
      line.map((token) => ({
        content: token.content,
        style: token.htmlStyle ?? {},
      })),
    ),
    style: {
      ...toStyleRecord(highlighted.fg ?? '#111827', '--shiki-light'),
      ...toStyleRecord(highlighted.bg ?? '#ffffff', '--shiki-light-bg'),
    },
  };
}
