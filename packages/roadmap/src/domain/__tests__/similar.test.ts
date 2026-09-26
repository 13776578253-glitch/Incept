import { describe, expect, it } from 'vitest';

import { findSimilarEntry, scoreSimilarity, tokenizeBilingualText } from '../similar';
import type { RoadmapEntry } from '../types';

const baseEntry1: RoadmapEntry = {
  key: 'audio-compression',
  roadmap: 'roadmap',
  order: 0,
  status: 'active',
  type: 'feature',
  priority: 'high',
  title: { en: 'Audio Context Compression', zh: '音频上下文压缩' },
  summary: { en: 'Compress audio frames for lower bandwidth', zh: '压缩音频帧以降低带宽占用' },
};

const baseEntry2: RoadmapEntry = {
  key: 'audio-stream-cache',
  roadmap: 'roadmap',
  order: 1,
  status: 'reviewing',
  type: 'feature',
  priority: 'middle',
  title: { en: 'Audio Stream Cache', zh: '音频流本地缓存' },
  summary: { en: 'Cache decoded audio packets locally', zh: '本地缓存解码后的音频数据包' },
};

const baseEntry3: RoadmapEntry = {
  key: 'reply-strategy',
  roadmap: 'roadmap',
  order: 2,
  status: 'reviewing',
  type: 'feature',
  priority: 'middle',
  title: { en: 'Interest-based reply method', zh: '基于兴趣点的回复策略' },
  summary: { en: 'Organize responses around user interests', zh: '围绕读者关心的内容组织回复' },
};

describe('tokenizeBilingualText', () => {
  it('extracts english keywords and chinese n-grams while stripping stop words', () => {
    const tokens = tokenizeBilingualText('Audio Context Compression 音频上下文压缩');
    expect(tokens.has('audio')).toBe(true);
    expect(tokens.has('context')).toBe(true);
    expect(tokens.has('compression')).toBe(true);
    expect(tokens.has('音频')).toBe(true);
    expect(tokens.has('上下文')).toBe(true);
    expect(tokens.has('压缩')).toBe(true);
  });
});

describe('scoreSimilarity & findSimilarEntry (Scheme 4-B)', () => {
  it('gives high score to entries with overlapping title tokens', () => {
    const score = scoreSimilarity(baseEntry1, baseEntry2);
    // Both contain 'audio' / '音频' (+10) and same type (+2)
    expect(score).toBeGreaterThanOrEqual(10);
  });

  it('matches the related entry when score exceeds threshold', () => {
    const similar = findSimilarEntry(baseEntry1, [baseEntry1, baseEntry2, baseEntry3]);
    expect(similar?.key).toBe('audio-stream-cache');
  });

  it('returns null and does NOT blindly fallback to arbitrary entries when no related keywords exist', () => {
    // baseEntry3 (reply-strategy) has no common tokens with audio-compression
    const similar = findSimilarEntry(baseEntry3, [baseEntry1, baseEntry3]);
    expect(similar).toBeNull();
  });
});
