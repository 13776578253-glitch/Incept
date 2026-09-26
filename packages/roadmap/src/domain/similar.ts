import type { RoadmapEntry } from './types';

// 方案 4-B：双语词元提取 + 多维特征加权 + 严格阈值门禁。
// 宁缺毋滥：绝不在没有相似条目时随机拿第一条凑数；无有效重合词则返回 null 彻底隐藏。

const CHINESE_STOP_WORDS = new Set([
  '的',
  '了',
  '和',
  '是',
  '就',
  '都',
  '而',
  '及',
  '与',
  '着',
  '或',
  '一个',
  '没有',
  '我们',
  '你们',
  '他们',
  '这个',
  '那个',
  '因为',
  '所以',
  '如果',
  '基于',
  '围绕',
  '进行',
  '提供',
  '支持',
]);

const ENGLISH_STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'are',
  'was',
  'were',
  'has',
  'have',
  'had',
  'been',
  'which',
  'will',
  'would',
  'should',
  'can',
  'could',
  'into',
  'onto',
  'about',
  'over',
  'base',
  'based',
]);

export function tokenizeBilingualText(text: string): Set<string> {
  const tokens = new Set<string>();
  if (!text) return tokens;

  // 1. 英文词元（小写，长度 >= 3，过滤停用词）
  const englishWords = text.toLowerCase().match(/[a-z0-9_-]{3,}/g);
  if (englishWords) {
    for (const word of englishWords) {
      if (!ENGLISH_STOP_WORDS.has(word)) {
        tokens.add(word);
      }
    }
  }

  // 2. 中文 2-gram 与 3-gram 词元切分
  const cjkChars = text.match(/[\u4e00-\u9fa5]/g);
  if (cjkChars && cjkChars.length >= 2) {
    for (let i = 0; i < cjkChars.length - 1; i++) {
      const biGram = cjkChars[i] + cjkChars[i + 1];
      if (!CHINESE_STOP_WORDS.has(biGram)) {
        tokens.add(biGram);
      }
      if (i < cjkChars.length - 2) {
        const triGram = biGram + cjkChars[i + 2];
        tokens.add(triGram);
      }
    }
  }

  return tokens;
}

export const MIN_SIMILARITY_SCORE = 10;

// 计算两张卡片的相似度得分：标题词元 (+10)、小结词元 (+3)、同分类 (+2)、同优先级 (+1)。
export function scoreSimilarity(target: RoadmapEntry, candidate: RoadmapEntry): number {
  if (target.key === candidate.key) return 0;

  let score = 0;

  const targetTitleTokens = tokenizeBilingualText(`${target.title.en} ${target.title.zh}`);
  const candidateTitleTokens = tokenizeBilingualText(`${candidate.title.en} ${candidate.title.zh}`);

  for (const token of targetTitleTokens) {
    if (candidateTitleTokens.has(token)) {
      score += 10;
    }
  }

  const targetSummaryTokens = tokenizeBilingualText(`${target.summary.en} ${target.summary.zh}`);
  const candidateSummaryTokens = tokenizeBilingualText(`${candidate.summary.en} ${candidate.summary.zh}`);

  for (const token of targetSummaryTokens) {
    if (candidateSummaryTokens.has(token)) {
      score += 3;
    }
  }

  // 仅在已有文本词元关联的前提下，同类别/同优先级锦上添花
  if (score > 0) {
    if (target.type === candidate.type) {
      score += 2;
    }
    if (target.priority === candidate.priority) {
      score += 1;
    }
  }

  return score;
}

// 寻找最相关的相似条目；若全场最高分低于最低阈值（默认 10 分，即至少命中 1 个标题核心词），则返回 null
export function findSimilarEntry(
  target: RoadmapEntry,
  allEntries: readonly RoadmapEntry[],
  minScore = MIN_SIMILARITY_SCORE,
): RoadmapEntry | null {
  let highestScore = 0;
  let bestCandidate: RoadmapEntry | null = null;

  for (const candidate of allEntries) {
    if (candidate.key === target.key) continue;

    const score = scoreSimilarity(target, candidate);
    if (score >= minScore && score > highestScore) {
      highestScore = score;
      bestCandidate = candidate;
    }
  }

  return bestCandidate;
}
