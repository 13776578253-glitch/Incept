import { describe, expect, it } from 'vitest';
import { searchSettingsItems } from '../settings-search-index';

describe('searchSettingsItems', () => {
  it('returns empty list for blank queries', () => {
    expect(searchSettingsItems('', 'zh', 'owner')).toEqual([]);
    expect(searchSettingsItems('   ', 'en', 'guest')).toEqual([]);
  });

  it('matches bilingual settings items across appearance, language, and music', () => {
    expect(searchSettingsItems('字号', 'zh', 'guest').map((item) => item.id)).toContain('appearance-font-size');
    expect(searchSettingsItems('倍速', 'zh', 'guest').map((item) => item.id)).toContain('music-rate-lock');
    expect(searchSettingsItems('latte', 'en', 'guest').map((item) => item.id)).toContain('appearance-preset');
    expect(searchSettingsItems('document language', 'en', 'guest').map((item) => item.id)).toContain('language-docs');
    expect(searchSettingsItems('强调色对比度', 'zh', 'guest').map((item) => item.id)).toContain('appearance-accent-contrast');
    expect(searchSettingsItems('图片缩放', 'zh', 'guest').map((item) => item.id)).toContain('appearance-docs-image-scale');
  });

  it('hides owner-only items for guests and guest-login items for owners', () => {
    expect(searchSettingsItems('曲库', 'zh', 'guest')).toEqual([]);
    expect(searchSettingsItems('授权码', 'zh', 'guest')).toEqual([]);
    expect(searchSettingsItems('路线图', 'zh', 'guest')).toEqual([]);

    expect(searchSettingsItems('曲库', 'zh', 'owner').map((item) => item.id)).toContain('music-libraries');
    expect(searchSettingsItems('授权码', 'zh', 'owner').map((item) => item.id)).toContain('account-grants');
    expect(searchSettingsItems('同步设备', 'zh', 'owner').map((item) => item.id)).toContain('account-devices');
    expect(searchSettingsItems('路线图', 'zh', 'owner').map((item) => item.id)).toContain('projects-list');
    expect(searchSettingsItems('Owner 登录', 'zh', 'owner')).toEqual([]);
  });
});
